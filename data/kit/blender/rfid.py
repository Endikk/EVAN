"""
Atelier imprimantes et RFID du kit : établi de préparation des étiquettes RFID et de réparation des imprimantes
thermiques posées chez les clients.

  blender --background --factory-startup --python data/kit/blender/rfid.py -- [--apercu <dossier>] [--vues a,b]

La disposition reprend celle de l'ancien modèle, que le reste de l'application connaît : plan de travail à 0,925 m,
imprimante encodeuse à gauche du centre (bobine d'étiquettes sur l'axe x = -0,41, z = 1,13), étiquettes qui sortent
vers +X à hauteur de 1,0 m jusqu'à l'antenne de contrôle, terminal de lecture devant, poste informatique à droite.
Ce qui change : l'antenne devient un tunnel de contrôle traversé par la bande, la bande finit sur un enrouleur, une
deuxième imprimante en réparation occupe le bout gauche, et le panneau du fond devient un panneau perforé d'outillage
surmonté d'une étagère de bobines et de rubans. Machine type, proportions approximatives, sans logo ni marque.
"""
import math
import os
import sys

import bmesh
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as c  # noqa: E402

MACHINE = 'rfid'
Z_PLAN = 0.925  # dessus du tapis antistatique, où tout est posé
Z_BANDE = 1.0  # sortie des étiquettes, à travers le tunnel jusqu'à l'enrouleur
LAIZE = 0.11  # étiquettes de 100 mm sur leur support
X_ETABLI = (-1.10, 1.20)
Y_ETABLI = (-0.375, 0.375)
Y_PANNEAU = 0.35  # face avant du panneau perforé

# Imprimante industrielle : compartiment média côté opérateur (-Y) fermé par un capot à fenêtre, électronique derrière
# la paroi centrale. L'avant (sortie des étiquettes, afficheur) regarde +X, dans le sens de la bande.
L_IMP = 0.39
Y_CAPOT, Y_PAROI, Y_DOS_IMP = -0.105, 0.07, 0.165
Z_CAPOT_BAS, Z_HAUT_IMP = 0.975, 1.29
X_ENCODEUSE = -0.545  # arrière de l'imprimante encodeuse : sa bobine tombe sur l'axe de l'ancien modèle
X_REPARATION = -1.02

X_GUIDE = 0.21  # barre de guidage, depuis l'arrière de l'imprimante : la bande y devient horizontale
ROULEAU_IMPRESSION = 'Rouleau d’impression de l’imprimante'

X_ENROULEUR = 0.46
R_ENROULEE = 0.055


def matieres():
    P = c.palette()
    P.update(
        hetre=c.matiere('multiplis_hetre', '#c49a6c', 0.0, 0.55),
        tapis=c.matiere('tapis_antistatique', '#55686f', 0.0, 0.8),
        carton=c.matiere('carton_mandrin', '#a67b4e', 0.0, 0.8),
        carton_ondule=c.matiere('carton_ondule', '#b48b5c', 0.0, 0.85),
        adhesif=c.matiere('adhesif_kraft', '#c9a571', 0.0, 0.5),
        ruban=c.matiere('ruban_transfert', '#1b1c1e', 0.4, 0.3),
        circuit=c.matiere('circuit_imprime', '#2e5b3c', 0.0, 0.45),
        lcd=c.matiere('afficheur', '#1f5a7a', 0.0, 0.3, emission='#2f86b8', force=0.7),
        lcd_eteint=c.matiere('afficheur_eteint', '#16191c', 0.0, 0.2),
        lcd_multimetre=c.matiere('afficheur_multimetre', '#a9b5a1', 0.0, 0.4),
        diffuseur=c.matiere('diffuseur_led', '#f4f2ea', 0.0, 0.3, emission='#f4f2ea', force=0.6),
        bac=c.matiere('bac_polypropylene', '#58646e', 0.0, 0.5),
        reseau=c.matiere('cable_reseau', '#8c969d', 0.0, 0.5),
        led_verte=c.matiere('led_verte', '#2bd46f', 0.0, 0.3, emission='#2bd46f', force=1.2),
        vert=c.matiere('voyant_vert', '#27c46a', 0.0, 0.3),
        orange=c.matiere('voyant_orange', '#ff9a1a', 0.0, 0.3),
        rouge=c.matiere('voyant_rouge', '#ff3a2e', 0.0, 0.3),
        flanc_etiquettes=c.matiere('flanc_etiquettes', '#ffffff', 0.0, 0.7, image='bobine_etiquettes_flanc.png'),
        flanc_mandrin=c.matiere('flanc_mandrin', '#ffffff', 0.0, 0.8, image='mandrin_carton.png'),
        bord_etiquettes=c.matiere('bord_etiquettes', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        bande=c.matiere('bande_decoupee', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        ecran=c.matiere('ecran_encodage', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8, image='rfid_ecran.png'),
    )
    return P


# --- Outils (repris de ctp.py et sheeter.py) -------------------------------------------------------------------


def plan_image(nom, largeur, hauteur, centre, mat, parent=None, rotation=(0, 0, 0)):
    """Écran : plan texturé dans le plan XZ, coins dans le sens trigonométrique, donc tourné vers -Y."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    coins = [(-largeur / 2, -hauteur / 2), (largeur / 2, -hauteur / 2), (largeur / 2, hauteur / 2),
             (-largeur / 2, hauteur / 2)]
    f = bm.faces.new([bm.verts.new((u, 0, v)) for u, v in coins])
    for loop, (u, v) in zip(f.loops, coins):
        loop[uv].uv = (u / largeur + 0.5, v / hauteur + 0.5)
    return c._objet(nom, bm, mat, parent, centre, rotation, None, 0)


def profil_x(nom, points_yz, longueur, x, mat, parent=None, chanfrein=None):
    """Profil dessiné en coupe (y, z), extrudé le long de X : bacs, consoles d'étagère."""
    o = c.profil(nom, points_yz, longueur, 0.0, mat, parent, chanfrein)
    # Un quart de tour autour de Z envoie l'abscisse du profil sur Y et l'extrusion sur X.
    o.rotation_euler = (0, 0, math.pi / 2)
    o.location = (x, 0, 0)
    return o


def tube(nom, a, b, rayon, mat, parent=None, segments=None, chanfrein=None):
    """Cylindre tendu entre deux points : manches de pince, tige de tournevis couché."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = c.cylindre(nom, rayon, d.length, (a + b) / 2, mat, 'Z', parent, segments=segments, chanfrein=chanfrein)
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    return o


def sur_face(centre, rotation, local):
    """Point d'une pièce tournée, donné dans son repère."""
    return tuple(Vector(centre) + Euler(rotation).to_matrix() @ Vector(local))


def pied_reglable(nom, x, y, g, P, hauteur=0.06):
    """Vérin de mise à niveau : patin caoutchouc, tige filetée, écrou de blocage."""
    c.cylindre(f'{nom}_patin', 0.03, 0.012, (x, y, 0.006), P['caoutchouc'], 'Z', g, segments=12, chanfrein=0)
    c.cylindre(f'{nom}_tige', 0.009, hauteur - 0.012, (x, y, 0.012 + (hauteur - 0.012) / 2), P['acier'], 'Z', g,
               segments=8, chanfrein=0)
    c.cylindre(f'{nom}_ecrou', 0.018, 0.012, (x, y, hauteur * 0.6), P['acier'], 'Z', g, segments=6, chanfrein=0)


def grille(nom, centre, largeur, hauteur, normale, g, P, lames=5):
    """Grille d'aération en persiennes sur une face de normale ±X ou ±Y."""
    x, y, z = centre
    s = 1 if normale[0] == '+' else -1
    sur_y = normale[1] == 'Y'
    fond = (largeur, 0.004, hauteur) if sur_y else (0.004, largeur, hauteur)
    lame = (largeur * 0.92, 0.008, 0.006) if sur_y else (0.008, largeur * 0.92, 0.006)
    dec = (0, s * 0.002, 0) if sur_y else (s * 0.002, 0, 0)
    c.boite(f'{nom}_fond', fond, (x + dec[0], y + dec[1], z), P['plastique_noir'], g, chanfrein=0)
    for k in range(lames):
        zk = z - hauteur / 2 + hauteur * (k + 0.5) / lames
        c.boite(f'{nom}_lame_{k}', lame, (x + 2.5 * dec[0], y + 2.5 * dec[1], zk), P['graphite'], g, chanfrein=0)


def trous(nom, x0, x1, z0, z1, y, pas, cote, mat, g):
    """
    Perforations carrées d'un panneau d'outillage, en un seul maillage de petits carrés sombres posés devant la tôle :
    700 trous coûtent 1 400 triangles, quand des perçages vrais en coûteraient dix fois plus.
    """
    bm = bmesh.new()
    h = cote / 2
    nx, nz = int((x1 - x0) / pas) + 1, int((z1 - z0) / pas) + 1
    for i in range(nx):
        for k in range(nz):
            x, z = x0 + i * pas, z0 + k * pas
            # Coins dans le sens trigonométrique vus de l'avant : la face regarde -Y.
            bm.faces.new([bm.verts.new((x - h, y, z - h)), bm.verts.new((x + h, y, z - h)),
                          bm.verts.new((x + h, y, z + h)), bm.verts.new((x - h, y, z + h))])
    return c._objet(nom, bm, mat, g, (0, 0, 0), (0, 0, 0), 0, 1)


# --- Imprimante thermique industrielle -------------------------------------------------------------------------


def imprimante(nom, x0, g, P, chargee):
    """
    Imprimante à transfert thermique avec encodeur RFID. `chargee` : bobine et ruban en place, capot fermé (poste
    d'encodage) ; sinon capot levé, tête relevée, compartiment vide (poste de réparation).
    """
    x1 = x0 + L_IMP
    xm = (x0 + x1) / 2
    y0, yc, y1 = Y_CAPOT, Y_PAROI, Y_DOS_IMP
    zb, zt = Z_CAPOT_BAS, Z_HAUT_IMP

    # Rouleaux en premier : dans le poste d'encodage, ils reprennent rotatif_1 (bobine), rotatif_2 (mandrin) et
    # rotatif_3 (ruban) de l'ancien modèle.
    xr, zr = x0 + 0.135, 1.13
    if chargee:
        bob = c.bobine(c.suivant('rotatif'), 0.085, LAIZE, (xr, 0, zr), P['bord_etiquettes'], P['flanc_etiquettes'],
                       'Y', g, pas_u=c.PAS_ETIQUETTE)
        c.rotatif(bob, 0.085, sous_la_bande=False)
        man = c.bobine(c.suivant('rotatif'), 0.038, LAIZE + 0.004, (xr, 0, zr), P['carton'], P['flanc_mandrin'], 'Y',
                       g, 24)
        c.rotatif(man, 0.085, sous_la_bande=False)
        for k, (xs, zs, rs) in enumerate(((x0 + 0.215, 1.235, 0.032), (x0 + 0.31, 1.19, 0.04))):
            rub = c.bobine(c.suivant('rotatif'), rs, LAIZE, (xs, 0, zs), P['ruban'], P['ruban'], 'Y', g, 20)
            c.rotatif(rub, rs, sous_la_bande=k == 1)
            noyau = c.cylindre(f'{nom}_mandrin_ruban_{k}', 0.0135, LAIZE + 0.006, (xs, 0, zs), P['carton'], 'Y',
                               segments=12, chanfrein=0)
            c.attacher(noyau, rub)
        # Rouleau d'impression, sous la tête, tangent aux étiquettes : diamètre du catalogue.
        d = c.diametre_catalogue(MACHINE, ROULEAU_IMPRESSION)
        pl = c.cylindre(c.suivant('rotatif'), d / 2000, 0.12, (x0 + 0.355, 0, Z_BANDE - d / 2000), P['caoutchouc'],
                        'Y', g, segments=16)
        c.rotatif(pl, d / 2000, sous_la_bande=True)
        c.cylindre_catalogue(pl, ROULEAU_IMPRESSION, d)
        # Ruban encreur : du dévidoir sous la tête, puis remonté vers l'enrouleur de ruban.
        for k, (a, b) in enumerate((((x0 + 0.231, 1.207), (x0 + 0.282, 1.006)),
                                    ((x0 + 0.282, 1.006), (x0 + 0.37, 1.006)),
                                    ((x0 + 0.37, 1.006), (x0 + 0.35, 1.19)))):
            c.bande(f'{nom}_ruban_{k + 1}', a, b, LAIZE, P['ruban'], g, role=False)
    else:
        c.cylindre(f'{nom}_rouleau_impression', 0.0125, 0.12, (x0 + 0.355, 0, Z_BANDE - 0.0125), P['caoutchouc'],
                   'Y', g, segments=16)

    # Patins, embase, carter de l'électronique, parois du compartiment média.
    for i, (xp, yp) in enumerate(((x0 + 0.03, y0 + 0.03), (x1 - 0.03, y0 + 0.03), (x0 + 0.03, y1 - 0.03),
                                  (x1 - 0.03, y1 - 0.03))):
        c.cylindre(f'{nom}_patin_{i}', 0.014, 0.01, (xp, yp, Z_PLAN + 0.005), P['caoutchouc'], 'Z', g, segments=10,
                   chanfrein=0)
    c.boite(f'{nom}_embase', (L_IMP, y1 - y0, 0.04), (xm, (y0 + y1) / 2, 0.955), P['graphite'], g)
    c.boite(f'{nom}_carter', (L_IMP, y1 - yc, zt - zb), (xm, (yc + y1) / 2, (zb + zt) / 2), P['tole_sombre'], g)
    yi = y0 + 0.012
    c.boite(f'{nom}_fond', (0.012, yc - yi, zt - zb - 0.014), (x0 + 0.006, (yi + yc) / 2, (zb + zt - 0.014) / 2),
            P['tole_sombre'], g)
    c.boite(f'{nom}_bandeau', (0.012, yc - yi, zt - 0.014 - 1.035), (x1 - 0.006, (yi + yc) / 2, (1.035 + zt - 0.014) / 2),
            P['tole_sombre'], g)
    c.boite(f'{nom}_paroi', (L_IMP - 0.04, 0.006, zt - zb - 0.03), (xm, yc - 0.003, (zb + zt) / 2 - 0.006), P['galva'],
            g)

    # Porte-bobine, axes de ruban, barre de guidage, module d'encodage RFID sous le trajet, tête d'impression.
    c.cylindre(f'{nom}_porte_bobine', 0.012, yc + 0.07, (xr, (yc - 0.07) / 2, zr), P['acier'], 'Y', g, segments=12)
    c.cylindre(f'{nom}_porte_bobine_bout', 0.016, 0.012, (xr, -0.074, zr), P['jaune_securite'], 'Y', g, segments=12)
    c.boite(f'{nom}_guide_bobine', (0.022, 0.005, 0.09), (xr, -0.064, zr - 0.04), P['jaune_securite'], g)
    for k, (xs, zs) in enumerate(((x0 + 0.215, 1.235), (x0 + 0.31, 1.19))):
        c.cylindre(f'{nom}_axe_ruban_{k}', 0.011, yc + 0.064, (xs, (yc - 0.064) / 2, zs), P['acier'], 'Y', g,
                   segments=12)
        c.cylindre(f'{nom}_bague_ruban_{k}', 0.02, 0.008, (xs, yc - 0.01, zs), P['jaune_securite'], 'Y', g, segments=16)
    c.cylindre(f'{nom}_barre_guide', 0.006, 0.13, (x0 + X_GUIDE, 0.0, Z_BANDE - 0.006), P['chrome'], 'Y', g, segments=10)
    if chargee:
        # Module d'encodage RFID sous le trajet, antenne vers les étiquettes : il écrit la puce, relit l'EPC et règle
        # la puissance RF. Sonde de la tête thermique entrée par l'avant du bloc de tête.
        c.capteur('capteur_encodeur', 'lecteur', (x0 + 0.28, 0.0, 0.993), g, P, 1, ['echecs', 'puissance_rf'], '+Z')
        c.tuyau(f'{nom}_encodeur_cable', [(x0 + 0.30, 0.06, 0.975), (x0 + 0.32, 0.064, 0.985), (x0 + 0.33, yc - 0.006, 1.0)],
                0.003, P['plastique_noir'], g)
        c.capteur('capteur_tete', 'sonde', (x0 + 0.315, -0.045, 1.032), g, P, 1, 'temperature_tete', '+Y')
    else:
        c.boite(f'{nom}_encodeur', (0.07, 0.11, 0.014), (x0 + 0.28, 0.0, 0.985), P['circuit'], g)
    tete = c.vide(f'{nom}_tete', (x0 + 0.29, 0, 1.055), g)
    c.boite(f'{nom}_tete_bloc', (0.07, yc + 0.06, 0.045), (0.035, (yc - 0.06) / 2, -0.0235), P['graphite'], tete)
    c.boite(f'{nom}_tete_levier', (0.012, 0.01, 0.05), (0.05, -0.065, -0.005), P['jaune_securite'], tete)
    if not chargee:
        # Tête relevée pour la changer : elle bascule autour de son arrière.
        tete.rotation_euler = (0, math.radians(-28), 0)

    # Avant : barre de coupe au-dessus de la sortie, afficheur et touches sur le carter.
    c.boite(f'{nom}_barre_coupe', (0.005, 0.13, 0.007), (x1 + 0.0025, 0.0, Z_BANDE + 0.0045), P['chrome'], g,
            chanfrein=0)
    c.boite(f'{nom}_facade', (0.003, 0.085, 0.13), (x1 + 0.0015, 0.1175, 1.20), P['graphite'], g, chanfrein=0)
    c.boite(f'{nom}_afficheur', (0.002, 0.068, 0.042), (x1 + 0.0035, 0.1175, 1.235),
            P['lcd'] if chargee else P['lcd_eteint'], g, chanfrein=0)
    for k, yb in enumerate((0.09, 0.1175, 0.145)):
        c.bouton(f'{nom}_touche_{k}', (x1 + 0.003, yb, 1.17), P['vert_bouton'] if k == 1 else P['plastique_noir'], g,
                 P, '+X')
    # Arrière : interrupteur, prise secteur, ports réseau et USB, grille de ventilation.
    xa = x0 - 0.002
    c.boite(f'{nom}_prise_secteur', (0.004, 0.032, 0.026), (xa, 0.13, 0.995), P['plastique_noir'], g, chanfrein=0)
    c.boite(f'{nom}_interrupteur', (0.007, 0.016, 0.024), (xa - 0.001, 0.092, 0.995), P['plastique_noir'], g,
            chanfrein=0)
    c.boite(f'{nom}_port_reseau', (0.004, 0.018, 0.016), (xa, 0.135, 1.04), P['galva'], g, chanfrein=0)
    c.boite(f'{nom}_port_usb', (0.004, 0.014, 0.007), (xa, 0.10, 1.04), P['galva'], g, chanfrein=0)
    grille(f'{nom}_grille', (x0, 0.1175, 1.17), 0.07, 0.10, '-X', g, P)
    # Câbles : secteur vers le bloc de prises, réseau vers le commutateur.
    c.tuyau(f'{nom}_cable_secteur', [(xa - 0.004, 0.13, 0.995), (x0 - 0.04, 0.16, 0.945), (x0 - 0.03, 0.27, 0.929),
                                     (x0 + 0.06, 0.305, 0.94), (x0 + 0.065, 0.312, 0.975)], 0.004,
            P['plastique_noir'], g)

    # Capot du compartiment média : dessus fixe, porte latérale à grande fenêtre sur charnières verticales à
    # l'arrière. Ouverte, elle se range à angle droit et laisse voir tout le compartiment, sans toucher l'étagère.
    c.boite(f'{nom}_capot_dessus', (L_IMP, yc - y0, 0.014), (xm, (y0 + yc) / 2, zt - 0.007), P['tole'], g)
    for k, zk in enumerate((1.03, 1.23)):
        c.cylindre(f'{nom}_gond_{k}', 0.006, 0.03, (x0 + 0.004, y0 - 0.002, zk), P['graphite'], 'Z', g, segments=8,
                   chanfrein=0)
    charniere = c.vide(f'{nom}_charniere', (x0 + 0.004, y0 - 0.002, (zb + zt) / 2), g)
    flanc = c.profil(f'{nom}_capot_flanc', c.rectangle_arrondi(x0 + 0.002, zb, x1 - 0.002, zt - 0.013, 0.012), 0.01,
                     y0 + 0.005, P['tole'])
    outil = c.profil(f'{nom}_capot_outil', c.rectangle_arrondi(x0 + 0.035, 1.006, x1 - 0.045, zt - 0.04, 0.018), 0.04,
                     y0 + 0.005, None, chanfrein=0)
    c.percer(flanc, outil)
    pieces = [
        flanc,
        c.boite(f'{nom}_vitre', (L_IMP - 0.07, 0.003, zt - 1.036), ((x0 + x1 - 0.01) / 2, y0 + 0.006, (1.006 + zt - 0.04) / 2),
                P['verre'], chanfrein=0),
        c.boite(f'{nom}_capot_prise', (0.06, 0.006, 0.012), (x1 - 0.07, y0 - 0.003, zt - 0.03), P['plastique_noir'],
                chanfrein=0),
        c.texte(f'{nom}_marque_rfid', 'RFID', 0.016, (x0 + 0.06, y0 - 0.0006, 0.99), P['tole_sombre']),
    ]
    for p in pieces:
        c.attacher(p, charniere)
    if not chargee:
        charniere.rotation_euler = (0, 0, math.radians(-100))
    return charniere


def encodeuse(racine, P):
    """Poste d'encodage : l'imprimante encodeuse, chargée, qui imprime et écrit la puce de chaque étiquette."""
    g = c.vide('imprimante', parent=racine)
    imprimante('imp1', X_ENCODEUSE, g, P, chargee=True)
    return g


def reparation(racine, P):
    """Imprimante rapportée d'un client, capot levé, tête déposée sur le tapis, multimètre branché."""
    g = c.vide('reparation', parent=racine)
    x0 = X_REPARATION
    imprimante('imp2', x0, g, P, chargee=False)
    c.pictogramme_danger('imp2_danger', (x0 + 0.33, Y_PAROI - 0.0065, 1.13), g, P, taille=0.03)
    # Étiquette de consignation sur l'embase.
    c.boite('imp2_consigne', (0.08, 0.002, 0.03), (x0 + 0.11, Y_CAPOT - 0.001, 0.955), P['rouge_arret'], g, chanfrein=0)
    c.texte('imp2_consigne_texte', 'HORS SERVICE', 0.0085, (x0 + 0.11, Y_CAPOT - 0.0024, 0.955), P['papier'], g)
    # Tête d'impression de rechange : radiateur, ligne de points, nappe.
    xt, yt = -0.86, -0.27
    c.boite('tete_rechange', (0.12, 0.03, 0.012), (xt, yt, Z_PLAN + 0.006), P['acier'], g)
    c.boite('tete_rechange_ligne', (0.11, 0.004, 0.003), (xt, yt - 0.012, Z_PLAN + 0.0135), P['plastique_noir'], g,
            chanfrein=0)
    c.boite('tete_rechange_nappe', (0.05, 0.05, 0.0012), (xt + 0.02, yt + 0.04, Z_PLAN + 0.0006), P['jaune_securite'], g,
            chanfrein=0)
    # Tournevis couché et stylo de nettoyage.
    c.cylindre('tournevis_manche', 0.011, 0.09, (-0.74, -0.31, Z_PLAN + 0.011), P['rouge_arret'], 'X', g, segments=8)
    c.cylindre('tournevis_tige', 0.0025, 0.10, (-0.645, -0.31, Z_PLAN + 0.011), P['chrome'], 'X', g, segments=6,
               chanfrein=0)
    c.cylindre('stylo_nettoyage', 0.006, 0.13, (-0.95, -0.20, Z_PLAN + 0.006), P['tole'], 'X', g, segments=8)
    # Multimètre et ses pointes de touche, entrées dans l'imprimante par la sortie des étiquettes.
    pivot = c.vide('multimetre', (-0.565, -0.25, Z_PLAN), g)
    pivot.rotation_euler = (0, 0, math.radians(8))
    c.boite('multimetre_corps', (0.08, 0.15, 0.032), (0, 0, 0.016), P['jaune_securite'], pivot)
    c.boite('multimetre_face', (0.068, 0.13, 0.004), (0, 0, 0.033), P['plastique_noir'], pivot, chanfrein=0)
    c.boite('multimetre_afficheur', (0.05, 0.032, 0.002), (0, 0.036, 0.0355), P['lcd_multimetre'], pivot, chanfrein=0)
    c.cylindre('multimetre_selecteur', 0.018, 0.008, (0, -0.02, 0.038), P['graphite'], 'Z', pivot, segments=12)
    for s, mat in ((-1, P['rouge_arret']), (1, P['plastique_noir'])):
        c.tuyau(f'multimetre_cordon_{s}', [(-0.565 + s * 0.015, -0.32, Z_PLAN + 0.03), (-0.58 + s * 0.02, -0.36, 0.93),
                                           (-0.61 + s * 0.01, -0.22, 0.929), (-0.615, -0.06, 0.96),
                                           (-0.66, s * 0.02, Z_BANDE)], 0.0025, mat, g)
    return g


# --- Établi ----------------------------------------------------------------------------------------------------


def etabli(racine, P):
    """Établi d'atelier : piètement acier, plateau multiplis, tapis antistatique, caisson suspendu, tablette basse."""
    g = c.vide('etabli', parent=racine)
    x0, x1 = X_ETABLI
    y0, y1 = Y_ETABLI
    xm = (x0 + x1) / 2
    c.boite('plateau', (x1 - x0, y1 - y0, 0.037), (xm, 0, 0.9035), P['hetre'], g)
    c.boite('tapis', (2.22, 0.67, 0.003), (0.05, -0.015, 0.9235), P['tapis'], g, chanfrein=0.0012)
    # Bouton de mise à la terre du tapis et bracelet antistatique.
    c.cylindre('tapis_terre', 0.008, 0.005, (-1.035, -0.325, Z_PLAN + 0.0025), P['chrome'], 'Z', g, segments=10,
               chanfrein=0)
    c.tuyau('bracelet_cordon', [(-1.035, -0.325, Z_PLAN + 0.004), (-1.02, -0.28, Z_PLAN + 0.004),
                                (-1.04, -0.22, Z_PLAN + 0.004), (-1.0, -0.18, Z_PLAN + 0.004)], 0.0025, P['plastique_noir'],
            g, resolution=3)
    c.anneau('bracelet', 0.03, 0.026, 0.012, (-0.97, -0.17, Z_PLAN + 0.006), P['plastique_noir'], 'Z', g, segments=16)
    # Piètement : pieds en tube carré sur vérins, traverses de côté, ceinture arrière, longerons de la tablette.
    for i, xp in enumerate((-1.045, 1.145)):
        for yp in (-0.32, 0.32):
            c.boite(f'pied_{i}_{yp}', (0.05, 0.05, 0.835), (xp, yp, 0.4675), P['tole_sombre'], g)
            pied_reglable(f'verin_{i}_{yp}', xp, yp, g, P)
        c.boite(f'traverse_haute_{i}', (0.04, 0.59, 0.05), (xp, 0, 0.86), P['tole_sombre'], g)
        c.boite(f'traverse_basse_{i}', (0.04, 0.59, 0.04), (xp, 0, 0.12), P['tole_sombre'], g)
    c.boite('ceinture_arriere', (2.14, 0.03, 0.07), (0.05, 0.33, 0.85), P['tole_sombre'], g)
    c.boite('ceinture_avant', (1.64, 0.02, 0.04), (0.30, -0.33, 0.865), P['tole_sombre'], g)
    for s in (-1, 1):
        c.boite(f'longeron_{s}', (2.14, 0.03, 0.03), (0.05, s * 0.31, 0.225), P['tole_sombre'], g)
    c.boite('tablette', (2.14, 0.62, 0.02), (0.05, 0, 0.245), P['tole'], g)
    # Caisson suspendu à trois tiroirs, sous le poste de réparation.
    c.boite('caisson', (0.50, 0.62, 0.325), (-0.77, -0.02, 0.7225), P['tole_sombre'], g)
    for k, (za, zh) in enumerate(((0.799, 0.879), (0.693, 0.793), (0.567, 0.687))):
        zc = (za + zh) / 2
        c.boite(f'tiroir_{k}', (0.48, 0.018, zh - za), (-0.77, -0.339, zc), P['tole'], g)
        c.boite(f'tiroir_poignee_{k}', (0.40, 0.02, 0.014), (-0.77, -0.356, zh - 0.016), P['inox'], g)
        c.boite(f'tiroir_porte_etiquette_{k}', (0.07, 0.003, 0.026), (-0.93, -0.3495, zc - 0.012), P['inox'], g,
                chanfrein=0)
        c.boite(f'tiroir_etiquette_{k}', (0.06, 0.002, 0.018), (-0.93, -0.3515, zc - 0.012), P['papier'], g,
                chanfrein=0)
    return g


def panneau(racine, P):
    """
    Superstructure : montants, panneau perforé, étagère sur consoles, réglette lumineuse dessous, bloc de prises
    avec arrêt d'urgence du poste.
    """
    g = c.vide('panneau', parent=racine)
    for i, xp in enumerate((-1.08, 1.18)):
        c.boite(f'montant_{i}', (0.04, 0.04, 0.738), (xp, 0.355, 1.291), P['tole_sombre'], g)
        c.boite(f'montant_bouchon_{i}', (0.044, 0.044, 0.006), (xp, 0.355, 1.663), P['plastique_noir'], g, chanfrein=0)
    c.boite('panneau_perfore', (2.22, 0.01, 0.50), (0.05, Y_PANNEAU + 0.005, 1.19), P['tole'], g)
    trous('panneau_trous', -1.035, 1.14, 0.965, 1.42, Y_PANNEAU - 0.0005, 0.038, 0.009, P['plastique_noir'], g)
    # Étagère en tôle pliée : fond, bord tombé, trois consoles.
    c.boite('etagere', (2.22, 0.24, 0.015), (0.05, 0.24, 1.4525), P['tole'], g)
    c.boite('etagere_bord', (2.22, 0.012, 0.04), (0.05, 0.126, 1.44), P['tole'], g)
    for i, xc in enumerate((-1.05, 0.05, 1.15)):
        profil_x(f'console_{i}', [(0.35, 1.445), (0.35, 1.31), (0.15, 1.445)], 0.008, xc, P['tole_sombre'], g)
    c.pictogramme_danger('etagere_danger', (-0.95, 0.1195, 1.44), g, P, taille=0.034)
    # Réglette LED sous l'étagère.
    c.boite('reglette', (1.90, 0.06, 0.022), (0.05, 0.27, 1.433), P['galva'], g)
    c.boite('reglette_diffuseur', (1.88, 0.045, 0.004), (0.05, 0.27, 1.4205), P['diffuseur'], g, chanfrein=0)
    # Bloc de prises au pied du panneau.
    c.boite('prises', (1.40, 0.035, 0.05), (-0.25, 0.3325, 0.975), P['galva'], g)
    for k, xs in enumerate((-0.88, -0.74, -0.60, -0.46, -0.32, -0.18, -0.04, 0.10, 0.24)):
        c.cylindre(f'prise_{k}', 0.017, 0.004, (xs, 0.3135, 0.975), P['tole'], 'Y', g, segments=16, chanfrein=0)
        for s in (-1, 1):
            c.cylindre(f'prise_{k}_alveole_{s}', 0.003, 0.002, (xs + s * 0.0095, 0.311, 0.975), P['plastique_noir'],
                       'Y', g, segments=6, chanfrein=0)
    c.boite('prises_interrupteur', (0.02, 0.006, 0.03), (0.36, 0.3135, 0.975), P['rouge_arret'], g, chanfrein=0)
    c.boite('coffret_au', (0.08, 0.035, 0.08), (0.51, 0.3325, 0.99), P['jaune_securite'], g)
    c.arret_urgence('poste_au', (0.51, 0.315, 0.99), g, P)
    return g


def outillage(racine, P):
    """Panneau d'outillage : bacs à bec au-dessus des imprimantes, tournevis, pinces, réglet, adhésif, câble."""
    g = c.vide('outillage', parent=racine)
    yb = Y_PANNEAU
    # Bacs à bec suspendus à un rail.
    c.boite('rail_bacs', (0.94, 0.012, 0.02), (-0.575, yb - 0.006, 1.405), P['acier'], g)
    pente = math.atan2(0.045, 0.09)
    for i in range(8):
        xb = -0.99 + i * 0.118
        z0 = 1.30
        profil_x(f'bac_{i}', [(yb, z0), (yb, z0 + 0.10), (yb - 0.03, z0 + 0.10), (yb - 0.12, z0 + 0.055),
                              (yb - 0.13, z0 + 0.055), (yb - 0.13, z0)], 0.105, xb, P['bac'], g)
        # Ouverture du bac, sombre, sur la pente.
        c.boite(f'bac_{i}_ouverture', (0.085, 0.08, 0.002), (xb, yb - 0.075 - 0.001, z0 + 0.0775 + 0.002),
                P['plastique_noir'], g, chanfrein=0, rotation=(pente, 0, 0))
        c.boite(f'bac_{i}_etiquette', (0.05, 0.002, 0.018), (xb, yb - 0.131, z0 + 0.03), P['papier'], g, chanfrein=0)
    # Tournevis sur leur support.
    c.boite('support_tournevis', (0.21, 0.045, 0.014), (0.0, yb - 0.0225, 1.30), P['graphite'], g)
    for k in range(5):
        xk = -0.08 + k * 0.04
        c.cylindre(f'tournevis_{k}_manche', 0.011, 0.085, (xk, yb - 0.025, 1.35), [P['rouge_arret'],
                   P['jaune_securite']][k % 2], 'Z', g, segments=8)
        c.cylindre(f'tournevis_{k}_tige', 0.0028, 0.09 + 0.02 * (k % 3), (xk, yb - 0.025, 1.245 - 0.01 * (k % 3)),
                   P['chrome'], 'Z', g, segments=6, chanfrein=0)
    # Deux pinces sur crochets.
    for k, xp in enumerate((0.17, 0.25)):
        y = yb - 0.012
        c.cylindre(f'crochet_pince_{k}', 0.003, 0.03, (xp, yb - 0.015, 1.35), P['acier'], 'Y', g, segments=6,
                   chanfrein=0)
        c.boite(f'pince_{k}_mors', (0.018, 0.01, 0.055), (xp, y, 1.315), P['acier'], g, chanfrein=0.002)
        for s in (-1, 1):
            tube(f'pince_{k}_manche_{s}', (xp + s * 0.004, y, 1.29), (xp + s * 0.026, y, 1.16), 0.006,
                 P['rouge_arret'] if k == 0 else P['jaune_securite'], g, segments=8, chanfrein=0)
    # Réglet, rouleau d'adhésif, couronne de câble.
    c.boite('reglet', (0.028, 0.003, 0.30), (0.31, yb - 0.004, 1.25), P['inox'], g, chanfrein=0)
    c.cylindre('crochet_adhesif', 0.003, 0.04, (0.36, yb - 0.02, 1.40), P['acier'], 'Y', g, segments=6, chanfrein=0)
    c.anneau('adhesif', 0.036, 0.026, 0.05, (0.36, yb - 0.03, 1.375), P['jaune_securite'], 'Y', g, segments=20)
    return g


def etagere(racine, P):
    """Réserve sur l'étagère et la tablette : bobines d'étiquettes, rubans transfert, cartons, boîtes de rubans."""
    g = c.vide('reserve', parent=racine)
    zs = 1.46
    # Bobines d'étiquettes debout, flanc vers l'opérateur.
    for k, xb in enumerate((-0.98, -0.82, -0.66, -0.50)):
        r = 0.075 - 0.01 * (k % 2)
        c.bobine(f'stock_bobine_{k}', r, 0.10, (xb, 0.25, zs + r), P['papier'], P['flanc_etiquettes'], 'Y', g)
        c.bobine(f'stock_bobine_{k}_mandrin', 0.038, 0.104, (xb, 0.25, zs + r), P['carton'], P['flanc_mandrin'], 'Y',
                 g, 20)
    # Rubans transfert debout, sur mandrin de 25 mm.
    for k, xb in enumerate((-0.30, -0.20, -0.10, 0.00, 0.10)):
        c.cylindre(f'stock_ruban_{k}', 0.04, LAIZE, (xb, 0.25, zs + 0.04), P['ruban'], 'Y', g, segments=20)
        c.cylindre(f'stock_ruban_{k}_mandrin', 0.0135, LAIZE + 0.006, (xb, 0.25, zs + 0.04), P['carton'], 'Y', g,
                   segments=12, chanfrein=0)
    # Cartons d'inlays.
    for k, xb in enumerate((0.33, 0.57)):
        c.boite(f'stock_carton_{k}', (0.22, 0.20, 0.12), (xb, 0.25, zs + 0.06), P['carton_ondule'], g)
        c.boite(f'stock_carton_{k}_adhesif', (0.05, 0.202, 0.003), (xb, 0.25, zs + 0.1205), P['adhesif'], g,
                chanfrein=0)
        c.boite(f'stock_carton_{k}_etiquette', (0.08, 0.002, 0.05), (xb, 0.149, zs + 0.06), P['papier'], g,
                chanfrein=0)
    # Bobines couchées en piles, flanc dessus.
    for k, xb in enumerate((0.82, 1.02)):
        for j in range(2):
            z = zs + 0.05 + j * 0.10
            c.bobine(f'pile_bobine_{k}_{j}', 0.075, 0.098, (xb, 0.25, z), P['papier'], P['flanc_etiquettes'], 'Z', g)
            c.bobine(f'pile_bobine_{k}_{j}_mandrin', 0.038, 0.1, (xb, 0.25, z), P['carton'], P['flanc_mandrin'], 'Z',
                     g, 20)
    # Tablette basse : cartons de bobines, carton d'imprimante, boîtes de rubans.
    zt = 0.255
    for k, (xb, taille) in enumerate(((-0.80, (0.34, 0.42, 0.24)), (-0.38, (0.30, 0.40, 0.20)),
                                      (0.05, (0.40, 0.50, 0.30)), (0.48, (0.24, 0.30, 0.10)))):
        c.boite(f'carton_{k}', taille, (xb, 0.0, zt + taille[2] / 2), P['carton_ondule'], g)
        c.boite(f'carton_{k}_adhesif', (0.05, taille[1] + 0.002, 0.003), (xb, 0.0, zt + taille[2] + 0.0005),
                P['adhesif'], g, chanfrein=0)
        c.boite(f'carton_{k}_etiquette', (0.09, 0.002, 0.06), (xb, -taille[1] / 2 - 0.001, zt + taille[2] * 0.6),
                P['papier'], g, chanfrein=0)
    c.boite('carton_4', (0.24, 0.30, 0.10), (0.48, 0.01, zt + 0.15), P['carton_ondule'], g, rotation=(0, 0, 0.06))
    return g


# --- Contrôle, enroulement, terminal, poste informatique -------------------------------------------------------


def antenne(racine, P):
    """
    Tunnel de contrôle : la bande le traverse par une fente, une antenne relit chaque puce encodée. Lecteur RFID
    derrière, relié par deux câbles coaxiaux.
    """
    g = c.vide('antenne', parent=racine)
    xm, L = 0.20, 0.28
    c.boite('tunnel_embase', (L + 0.02, 0.22, 0.01), (xm, 0, Z_PLAN + 0.005), P['graphite'], g)
    c.boite('tunnel_bas', (L, 0.20, 0.055), (xm, 0, 0.9625), P['tole'], g)
    c.boite('tunnel_haut', (L, 0.20, 0.06), (xm, 0, 1.042), P['tole'], g)
    for s in (-1, 1):
        c.boite(f'tunnel_joue_{s}', (L, 0.025, 0.026), (xm, s * 0.0875, 1.001), P['tole'], g, chanfrein=0)
    # Fente gainée de noir : on voit qu'elle traverse.
    c.boite('tunnel_radome', (L - 0.004, 0.15, 0.003), (xm, 0, 0.9915), P['plastique_noir'], g, chanfrein=0)
    c.boite('tunnel_plafond', (L - 0.004, 0.15, 0.003), (xm, 0, 1.0105), P['plastique_noir'], g, chanfrein=0)
    for nom, xc in (('entree', xm - L / 2), ('sortie', xm + L / 2)):
        for s in (-1, 1):
            c.boite(f'tunnel_{nom}_levre_{s}', (0.006, 0.20, 0.008), (xc, 0, Z_BANDE + s * 0.016), P['plastique_noir'],
                    g, chanfrein=0)
    c.texte('tunnel_marque', 'RFID', 0.022, (xm - 0.06, -0.1006, 1.042), P['tole_sombre'], g)
    for k, (xl, mat) in enumerate(((0.30, P['led_verte']), (0.28, P['orange']))):
        c.cylindre(f'tunnel_led_{k}', 0.005, 0.004, (xl, -0.07, 1.074), mat, 'Z', g, segments=10, chanfrein=0)
    # Lecteur RFID de contrôle derrière le tunnel : il compte les puces relues sur celles qui passent.
    c.capteur('capteur_lecture', 'lecteur', (xm, 0.235, Z_PLAN + 0.03), g, P, 2, 'taux_lecture', '+Z')
    for s in (-1, 1):
        c.cylindre(f'tunnel_connecteur_{s}', 0.007, 0.012, (xm + s * 0.06, 0.106, 0.96), P['galva'], 'Y', g,
                   segments=10, chanfrein=0)
        c.tuyau(f'tunnel_coax_{s}', [(xm + s * 0.06, 0.112, 0.96), (xm + s * 0.07, 0.15, 0.945),
                                     (xm + s * 0.05, 0.176, 0.94)], 0.0035, P['plastique_noir'], g)
    c.tuyau('lecteur_cable_secteur', [(xm + 0.06, 0.25, 0.94), (xm + 0.11, 0.27, 0.93), (0.10 + 0.0, 0.30, 0.94),
                                      (0.10, 0.31, 0.975)], 0.0035, P['plastique_noir'], g)
    return g


def enrouleur(racine, P):
    """Enrouleur de table : flasque, moteur, arbre, bobine d'étiquettes encodées et contrôlées."""
    g = c.vide('enrouleur', parent=racine)
    xr, zr = X_ENROULEUR, Z_BANDE + R_ENROULEE
    bob = c.bobine(c.suivant('rotatif'), R_ENROULEE, LAIZE, (xr, 0, zr), P['bord_etiquettes'], P['flanc_etiquettes'],
                   'Y', g, pas_u=c.PAS_ETIQUETTE)
    c.rotatif(bob, R_ENROULEE, sous_la_bande=False)
    man = c.bobine(c.suivant('rotatif'), 0.038, LAIZE + 0.004, (xr, 0, zr), P['carton'], P['flanc_mandrin'], 'Y', g,
                   24)
    c.rotatif(man, R_ENROULEE, sous_la_bande=False)
    c.boite('enr_embase', (0.15, 0.25, 0.015), (xr, 0.025, Z_PLAN + 0.0075), P['graphite'], g)
    c.boite('enr_flasque', (0.15, 0.014, 0.21), (xr, 0.093, 0.94 + 0.105), P['tole'], g)
    c.boite('enr_moteur', (0.10, 0.07, 0.15), (xr, 0.135, 1.015), P['tole_sombre'], g)
    c.cylindre('enr_disque', 0.08, 0.004, (xr, 0.084, zr), P['galva'], 'Y', g)
    c.cylindre('enr_arbre', 0.016, 0.165, (xr, 0.0, zr), P['acier'], 'Y', g, segments=12)
    c.cylindre('enr_molette', 0.02, 0.014, (xr, -0.089, zr), P['chrome'], 'Y', g, segments=8)
    c.boite('enr_commande', (0.06, 0.03, 0.035), (xr, -0.085, Z_PLAN + 0.015 + 0.0175), P['tole_sombre'], g)
    c.cylindre('enr_potentiometre', 0.008, 0.01, (xr - 0.012, -0.085, 0.98), P['plastique_noir'], 'Z', g, segments=10,
               chanfrein=0)
    c.boite('enr_inverseur', (0.008, 0.008, 0.012), (xr + 0.015, -0.085, 0.981), P['chrome'], g, chanfrein=0)
    # Fourche de comptage à l'entrée de l'enrouleur : chaque étiquette encodée et contrôlée qui passe est comptée.
    c.capteur('capteur_comptage', 'fourche', (0.37, -0.02, Z_BANDE), g, P, 3, 'cadence', '+Y')
    tube('fourche_support', (0.37, -0.08, Z_BANDE - 0.035), (0.39, -0.08, Z_PLAN + 0.015), 0.005, P['acier'], g,
         segments=8, chanfrein=0)
    c.tuyau('enr_cable', [(xr, 0.17, 0.99), (xr - 0.05, 0.22, 0.94), (0.30, 0.29, 0.93), (0.24, 0.31, 0.975)], 0.004,
            P['plastique_noir'], g)
    return g


def terminal(racine, P):
    """Terminal de lecture portable (clavier, écran, tête RFID) debout dans son socle de charge."""
    g = c.vide('terminal', parent=racine)
    x, y = 0.45, -0.26
    c.boite('terminal_socle', (0.10, 0.15, 0.025), (x, y, Z_PLAN + 0.0125), P['tole_sombre'], g)
    c.cylindre('terminal_socle_led', 0.003, 0.003, (x + 0.035, y - 0.0755, Z_PLAN + 0.016), P['led_verte'], 'Y', g,
               segments=8, chanfrein=0)
    inclinaison = (math.radians(-18), 0, 0)
    pivot = c.vide('terminal_pivot', (x, y + 0.025, Z_PLAN + 0.025), g)
    pivot.rotation_euler = inclinaison
    c.boite('terminal_berceau', (0.095, 0.05, 0.06), (0, 0.005, 0.03), P['tole_sombre'], pivot)
    c.boite('terminal_corps', (0.072, 0.03, 0.19), (0, -0.002, 0.105), P['plastique_noir'], pivot)
    c.boite('terminal_ecran', (0.058, 0.002, 0.07), (0, -0.0175, 0.155), P['lcd'], pivot, chanfrein=0)
    for i in range(3):
        for k in range(4):
            c.boite(f'terminal_touche_{i}_{k}', (0.014, 0.003, 0.009), (-0.019 + 0.019 * i, -0.0175, 0.045 + 0.016 * k),
                    P['graphite'], pivot, chanfrein=0)
    c.boite('terminal_tete_rfid', (0.085, 0.07, 0.05), (0, 0.012, 0.225), P['graphite'], pivot)
    c.boite('terminal_tete_face', (0.075, 0.003, 0.04), (0, -0.0245, 0.225), P['plastique_noir'], pivot, chanfrein=0)
    c.tuyau('terminal_cable', [(x, y + 0.075, Z_PLAN + 0.006), (x + 0.06, y + 0.14, Z_PLAN + 0.004),
                               (x + 0.09, 0.10, Z_PLAN + 0.004), (0.60, 0.28, Z_PLAN + 0.004),
                               (0.70, 0.27, Z_PLAN + 0.012)], 0.003, P['plastique_noir'], g)
    return g


def poste(racine, P):
    """Poste du logiciel d'étiquetage : écran (ecran_ihm), clavier, souris, commutateur réseau, unité centrale."""
    g = c.vide('poste', parent=racine)
    xm = 0.975
    pivot = c.vide('moniteur', (xm, 0.16, 1.20), g)
    pivot.rotation_euler = (math.radians(-6), 0, 0)
    c.boite('moniteur_coque', (0.50, 0.03, 0.315), (0, 0, 0), P['plastique_noir'], pivot)
    e = plan_image('ecran_ihm', 0.48, 0.30, (0, -0.0155, 0.004), P['ecran'], pivot)
    e['role'] = 'ecran'
    c.boite('moniteur_dos', (0.28, 0.035, 0.18), (0, 0.03, 0.0), P['plastique_noir'], pivot)
    c.boite('moniteur_cou', (0.05, 0.03, 0.20), (xm, 0.205, 1.04), P['graphite'], g)
    c.boite('moniteur_pied', (0.24, 0.19, 0.012), (xm, 0.19, Z_PLAN + 0.006), P['graphite'], g)
    c.tuyau('moniteur_cable', [(xm + 0.01, 0.22, 1.12), (xm - 0.02, 0.24, 0.98), (0.88, 0.30, 0.93),
                               (0.84, 0.30, Z_PLAN - 0.002)], 0.004, P['plastique_noir'], g)
    c.anneau('passe_cable', 0.03, 0.022, 0.006, (0.83, 0.30, Z_PLAN - 0.001), P['plastique_noir'], 'Z', g, segments=16)
    c.tuyau('unite_centrale_cable', [(0.83, 0.30, 0.88), (0.85, 0.29, 0.75), (0.95, 0.23, 0.62)], 0.005,
            P['plastique_noir'], g)
    # Clavier compact, touche par touche.
    xc, yc = 0.83, -0.14
    c.boite('clavier', (0.36, 0.13, 0.018), (xc, yc, Z_PLAN + 0.009), P['plastique_noir'], g)
    for r in range(5):
        n = 13
        for k in range(n):
            c.boite(f'touche_{r}_{k}', (0.022, 0.019, 0.007), (xc - 0.162 + k * 0.027, yc - 0.048 + r * 0.023,
                                                               Z_PLAN + 0.0215), P['graphite'], g, chanfrein=0)
    c.tuyau('clavier_cable', [(xc, yc + 0.066, Z_PLAN + 0.006), (xc + 0.03, 0.02, Z_PLAN + 0.004),
                              (xm - 0.06, 0.11, Z_PLAN + 0.004)], 0.0025, P['plastique_noir'], g)
    c.boite('tapis_souris', (0.17, 0.15, 0.003), (1.10, -0.14, Z_PLAN + 0.0015), P['plastique_noir'], g, chanfrein=0)
    c.boite('souris', (0.06, 0.10, 0.025), (1.10, -0.14, Z_PLAN + 0.015), P['graphite'], g, chanfrein=0.008)
    # Commutateur réseau : imprimante, lecteur, colonne et unité centrale y sont reliés.
    c.boite('commutateur', (0.16, 0.10, 0.03), (0.70, 0.27, Z_PLAN + 0.015), P['tole_sombre'], g)
    for k in range(6):
        c.boite(f'commutateur_port_{k}', (0.014, 0.002, 0.011), (0.645 + 0.022 * k, 0.219, Z_PLAN + 0.014),
                P['plastique_noir'], g, chanfrein=0)
        c.boite(f'commutateur_led_{k}', (0.004, 0.002, 0.003), (0.645 + 0.022 * k, 0.219, Z_PLAN + 0.025),
                P['led_verte'], g, chanfrein=0)
    for nom, pts in (
        ('imp1', [(X_ENCODEUSE - 0.006, 0.135, 1.04), (X_ENCODEUSE - 0.04, 0.2, 0.98), (X_ENCODEUSE + 0.02, 0.295, 0.929),
                  (0.30, 0.298, 0.929), (0.58, 0.26, 0.929), (0.62, 0.25, Z_PLAN + 0.012)]),
        ('lecteur', [(0.26, 0.22, 0.94), (0.32, 0.26, 0.929), (0.55, 0.24, 0.929), (0.62, 0.235, Z_PLAN + 0.012)]),
        ('poste', [(0.78, 0.25, Z_PLAN + 0.012), (0.81, 0.27, 0.929), (0.83, 0.295, Z_PLAN - 0.002)]),
    ):
        c.tuyau(f'reseau_{nom}', pts, 0.003, P['reseau'], g)
    # Unité centrale sur la tablette basse.
    c.boite('unite_centrale', (0.19, 0.42, 0.40), (0.98, 0.0, 0.455), P['plastique_noir'], g)
    c.cylindre('unite_centrale_bouton', 0.008, 0.004, (0.98, -0.211, 0.62), P['chrome'], 'Y', g, segments=10,
               chanfrein=0)
    c.cylindre('unite_centrale_led', 0.003, 0.004, (1.01, -0.211, 0.62), P['led_verte'], 'Y', g, segments=8,
               chanfrein=0)
    for k in range(3):
        c.boite(f'unite_centrale_aeration_{k}', (0.12, 0.003, 0.008), (0.98, -0.2105, 0.32 + 0.02 * k),
                P['graphite'], g, chanfrein=0)
    return g


def coffret_automate(racine, P):
    """
    Coffret d'entrées-sorties accroché au panneau, porte vitrée : l'automate relaie au logiciel d'étiquetage le comptage
    de la fourche, pilote la colonne lumineuse et tient le compteur des erreurs de données variables.
    """
    g = c.vide('coffret', parent=racine)
    xm, zm, y0, y1 = 0.555, 1.25, 0.24, Y_PANNEAU
    lx, lz = 0.34, 0.16
    for nom, taille, centre in (
        ('haut', (lx, y1 - y0, 0.01), (xm, (y0 + y1) / 2, zm + lz / 2 - 0.005)),
        ('bas', (lx, y1 - y0, 0.01), (xm, (y0 + y1) / 2, zm - lz / 2 + 0.005)),
        ('gauche', (0.01, y1 - y0, lz), (xm - lx / 2 + 0.005, (y0 + y1) / 2, zm)),
        ('droite', (0.01, y1 - y0, lz), (xm + lx / 2 - 0.005, (y0 + y1) / 2, zm)),
        ('fond', (lx, 0.006, lz), (xm, y1 - 0.003, zm)),
    ):
        c.boite(f'coffret_{nom}', taille, centre, P['tole'], g, chanfrein=0.002)
    c.boite('coffret_vitre', (lx - 0.02, 0.003, lz - 0.02), (xm, y0 + 0.0015, zm), P['verre'], g, chanfrein=0)
    c.boite('coffret_serrure', (0.012, 0.006, 0.03), (xm + lx / 2 - 0.02, y0 - 0.002, zm), P['plastique_noir'], g,
            chanfrein=0)
    c.capteur('capteur_automate', 'automate', (xm, 0.255, zm), g, P, 3, 'erreurs_donnees')
    c.tuyau('coffret_cable', [(xm - 0.12, 0.30, zm - lz / 2), (xm - 0.13, 0.31, 1.0), (0.45, 0.26, 0.932),
                              (0.60, 0.255, 0.929), (0.62, 0.26, Z_PLAN + 0.012)], 0.004, P['reseau'], g)
    return g


def colonne_lumineuse(racine, P):
    """Colonne lumineuse sur une potence fixée au montant droit : l'état du poste se lit depuis l'allée."""
    g = c.vide('colonne_lumineuse', parent=racine)
    x, y, zb = 1.285, 0.355, 1.304
    c.boite('potence', (0.13, 0.04, 0.008), (1.265, y, zb - 0.004), P['tole_sombre'], g, chanfrein=0.002)
    c.boite('potence_renfort', (0.006, 0.03, 0.06), (1.205, y, zb - 0.038), P['tole_sombre'], g, chanfrein=0)
    c.cylindre('colonne_pied', 0.03, 0.015, (x, y, zb + 0.0075), P['graphite'], 'Z', g)
    c.cylindre('colonne_mat', 0.012, 0.05, (x, y, zb + 0.04), P['acier'], 'Z', g)
    c.cylindre('colonne_douille', 0.032, 0.012, (x, y, zb + 0.071), P['plastique_noir'], 'Z', g)
    zd = zb + 0.077
    for nom, dz, mat, etat in (('voyant_vert', 0.027, P['vert'], 'marche'),
                               ('voyant_orange', 0.0855, P['orange'], 'attention'),
                               ('voyant_rouge', 0.144, P['rouge'], 'arret')):
        v = c.cylindre(nom, 0.032, 0.054, (x, y, zd + dz), mat, 'Z', g, None, chanfrein=0.002)
        v['role'] = 'voyant'
        v['etat'] = etat
    for i, dz in enumerate((0.05625, 0.11475)):
        c.cylindre(f'colonne_bague_{i}', 0.0325, 0.004, (x, y, zd + dz), P['plastique_noir'], 'Z', g, None,
                   chanfrein=0.0005)
    c.cylindre('colonne_chapeau', 0.032, 0.02, (x, y, zd + 0.181), P['plastique_noir'], 'Z', g)
    c.tuyau('colonne_cable', [(x, y + 0.02, zb - 0.002), (1.24, 0.385, zb - 0.05), (1.215, 0.38, 1.1),
                              (1.205, 0.37, 0.93)], 0.004, P['plastique_noir'], g)
    return g


def bandes(racine, P):
    """Chemin des étiquettes : de la bobine sous la tête, puis droit à travers le tunnel jusqu'à l'enrouleur."""
    g = c.vide('bande', parent=racine)
    x0 = X_ENCODEUSE
    c.bande('bande_1', (x0 + X_GUIDE, Z_BANDE), (X_ENROULEUR, Z_BANDE), LAIZE, P['bande'], g)
    c.bande('bande_2', (x0 + 0.135, 1.045), (x0 + X_GUIDE, Z_BANDE), LAIZE, P['bande'], g)
    return g


def socle(racine, P):
    """Dalle et marquage au sol de l'ancien modèle, aux mêmes cotes."""
    g = c.vide('socle', parent=racine)
    dalle = c.boite('socle_1', (3.15, 1.75, 0.07), (0.075, -0.125, -0.035), P['sol'], g, chanfrein=0.012)
    dalle['role'] = 'socle'
    traits = [
        ((2.87, 0.034, 0.002), (0.075, 0.61, 0.001)),
        ((2.87, 0.034, 0.002), (0.075, -0.86, 0.001)),
        ((0.036, 1.47, 0.002), (-1.36, -0.125, 0.001)),
        ((0.036, 1.47, 0.002), (1.51, -0.125, 0.001)),
    ]
    for i, (taille, centre) in enumerate(traits):
        t = c.boite(f'socle_{i + 2}', taille, centre, P['marquage'], g, chanfrein=0)
        t['role'] = 'socle'
    return g


# --- Assemblage ------------------------------------------------------------------------------------------------


def construire():
    P = matieres()
    fiche = c.kit_machine(MACHINE)
    racine = c.vide(MACHINE, props={'machine': fiche['nom'], 'fiabilite': 'Déduit', 'unite': 'metre',
                                    'axeHaut': 'Y'})
    groupes = [
        encodeuse(racine, P),  # en premier : sa bobine, son mandrin et son ruban reprennent rotatif_1 à 3
        enrouleur(racine, P),
        reparation(racine, P),
        etabli(racine, P),
        panneau(racine, P),
        outillage(racine, P),
        etagere(racine, P),
        antenne(racine, P),
        terminal(racine, P),
        poste(racine, P),
        coffret_automate(racine, P),
        colonne_lumineuse(racine, P),
    ]
    bandes(racine, P)
    g_socle = socle(racine, P)
    ombre = c.ombre_au_sol('socle_6', -1.45, 1.60, -0.95, 0.70, 0.003, largeur_px=512)
    ombre['role'] = 'socle'
    ombre.parent = g_socle
    c.points_diagnostic(
        [(p['numero'], p['nom'], c.depuis_gltf(p['position'])) for p in fiche['points_diagnostic']], racine)
    c.reperes([(r['texte'], c.depuis_gltf(r['position'])) for r in fiche['reperes']], racine)
    return racine, groupes


def vues(objets):
    v = c.vues_par_defaut(objets)
    v['encodage'] = dict(position=(-0.75, -1.0, 1.45), cible=(-0.05, 0.0, 1.03), focale=42)
    v['reparation'] = dict(position=(-1.35, -0.95, 1.55), cible=(-0.80, 0.0, 1.08), focale=42)
    v['poste'] = dict(position=(0.35, -1.05, 1.45), cible=(0.80, 0.05, 1.05), focale=40)
    v['panneau'] = dict(position=(-0.2, -1.3, 1.6), cible=(-0.2, 0.3, 1.3), focale=35)
    return v


if __name__ == '__main__':
    args = c.arguments(MACHINE)
    c.scene_vide(MACHINE)
    racine, groupes = construire()
    cadrages = vues(list(c.collection().objects))  # avant la fusion, qui supprime des objets
    c.enregistrer(args, groupes)
    if args.apercu:
        c.studio()
        c.rendre(args.apercu, MACHINE, cadrages, args.vues)
