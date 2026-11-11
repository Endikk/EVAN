"""
Feuilleteuse de planches A4 du kit : la bobine d'étiquettes déjà découpées est tirée par un groupe de traction, coupée
en travers à la longueur d'une planche par un tambour à lame, puis les planches filent sur un convoyeur à courroies
jusqu'à l'empileur. Les piles taquées partent en cartons sur la palette.

  blender --background --factory-startup --python data/kit/blender/sheeter.py -- [--apercu <dossier>] [--vues a,b]

La disposition reprend celle de l'ancien modèle, que le reste de l'application connaît : bande à 0,98 m, mêmes axes de
rouleaux (dérouleur à x = -2,05, traction à -1,25, coupe à -0,85, poulies du convoyeur à -0,5 et 0,54), pile à 0,80,
palette à 1,55, pupitre devant le bâti de coupe, mêmes points de diagnostic et repères (lus dans machines.json), même
emprise au sol (MODEL_FOOTPRINT de domain/catalog.ts). Machine type, sans constructeur identifié : proportions d'une
feuilleteuse compacte pour planches d'étiquettes, sans logo ni livrée de marque.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as c  # noqa: E402

MACHINE = 'sheeter'
Z_BANDE = 0.98
LAIZE = 0.22  # laize de la bande d'étiquettes : une planche A4 couchée (210 mm) plus les bords
X_BOBINE, Z_BOBINE, R_BOBINE = -2.05, 0.88, 0.30
X_ENTREE = -1.50
X_TRACTION = -1.25
X_COUPE = -0.85
X_CONV = (-0.50, 0.54)  # poulies de queue et de tête du convoyeur
Z_POULIE = 0.94
# Diamètres des cylindres du catalogue (data/catalog.json) : l'analyse des défauts répétitifs en déduit le pas d'un
# défaut, le modèle doit donc les porter tels quels.
R_ENTREE = c.diametre_catalogue('sheeter', 'Rouleau de renvoi') / 2000
R_TRACTION = c.diametre_catalogue('sheeter', 'Rouleaux d’entraînement') / 2000
# Développement 297 mm : un tour de tambour, une planche A4.
R_TAMBOUR = c.diametre_catalogue('sheeter', 'Cylindre porte-couteau (coupe A4)') / 2000
R_POULIE = c.diametre_catalogue('sheeter', 'Rouleau du convoyeur') / 2000
X_PILE = 0.80
Z_TABLE = 0.62  # dessus de la table élévatrice de l'empileur
Z_PILE = 0.82  # dessus de la pile
# Bâti de coupe : armoire électrique en bas, deux flasques qui portent rouleaux et tambour au-dessus.
BATI = (-1.43, -0.57, -0.41, 0.41)
Z_PLATEAU = 0.805
Y_FLASQUE = 0.215  # milieu des flasques, de part et d'autre de la bande
EP_FLASQUE = 0.03
X_FLASQUE = (-1.42, -0.60)
Z_FLASQUE = 1.15
# Une planche A4 couchée fait 297 mm dans le sens de la bande. Le convoyeur va plus vite que la bande pour ouvrir un
# vide de 33 mm entre deux planches : une planche et son vide font 0,33 m, au même nombre de planches par seconde.
LONG_PLANCHE = 0.297
PERIODE_PLANCHES = 0.33
V_CONVOYEUR = round(c.VITESSE_BANDE * PERIODE_PLANCHES / LONG_PLANCHE, 4)


def matieres():
    P = c.palette()
    P.update(
        carton=c.matiere('carton_mandrin', '#a67b4e', 0.0, 0.8),
        carton_ondule=c.matiere('carton_ondule', '#b98e5c', 0.0, 0.85),
        adhesif=c.matiere('ruban_adhesif', '#9c7448', 0.0, 0.82),
        bois=c.matiere('bois_palette', '#b39064', 0.0, 0.86),
        vert=c.matiere('voyant_vert', '#27c46a', 0.0, 0.3),
        orange=c.matiere('voyant_orange', '#ff9a1a', 0.0, 0.3),
        rouge=c.matiere('voyant_rouge', '#ff3a2e', 0.0, 0.3),
        flanc_mandrin=c.matiere('flanc_mandrin', '#ffffff', 0.0, 0.8, image='mandrin_carton.png'),
        flanc_etiquettes=c.matiere('flanc_etiquettes', '#ffffff', 0.0, 0.7, image='bobine_etiquettes_flanc.png'),
        bord_etiquettes=c.matiere('bord_etiquettes', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        bande_decoupee=c.matiere('bande_decoupee', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        # Même image pour les planches qui défilent (le vide entre deux planches est transparent) et pour le dessus de
        # la pile (seule la planche y est plaquée).
        planches=c.matiere('planches_convoyeur', '#ffffff', 0.0, 0.6, image='sheeter_planches.png', masque=True),
        planche=c.matiere('planche_a4', '#ffffff', 0.0, 0.6, image='sheeter_planches.png'),
        ecran=c.matiere('ecran_feuilleteuse', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                        image='sheeter_ecran.png'),
    )
    return P


# --- Pièces répétées -------------------------------------------------------------------------------------------


def barre(nom, taille, centre, mat, g, rotation=(0, 0, 0)):
    """Tube ou profilé : un seul chanfrein de 2 mm, les arrondis doubles coûteraient des triangles pour rien."""
    return c.boite(nom, taille, centre, mat, g, chanfrein=0.002, rotation=rotation, segments=1)


def pied(nom, x, y, g, P, z_haut=0.04):
    """Pied réglable : tige filetée et semelle en caoutchouc sous le bâti."""
    c.cylindre(f'{nom}_tige', 0.011, z_haut - 0.01, (x, y, 0.01 + (z_haut - 0.01) / 2), P['acier'], 'Z', g,
               segments=6, chanfrein=0)
    c.cylindre(f'{nom}_semelle', 0.03, 0.012, (x, y, 0.006), P['caoutchouc'], 'Z', g, segments=12, chanfrein=0)


def face_x(nom, contenu, taille, centre, mat, g, signe=-1):
    """Inscription peinte sur une face tournée vers -X (ou +X), lisible de ce côté."""
    return c.texte(nom, contenu, taille, centre, mat, g, rotation=(math.pi / 2, 0, signe * math.pi / 2))


def picto_x(nom, position, g, P, taille=0.04, signe=-1):
    """Pictogramme collé sur une face tournée vers ∓X, pointe en haut (l'orientation '-X' de commun le coucherait)."""
    pivot = c.pictogramme_danger(nom, position, g, P, taille)
    pivot.rotation_euler = (math.pi / 2, 0, signe * math.pi / 2)
    return pivot


def palier(nom, x, z, g, P, rayon, cote=-1, bride=None):
    """Palier vissé sur la face extérieure d'une flasque : bride carrée, couvercle rond, quatre vis."""
    y = cote * (Y_FLASQUE + EP_FLASQUE / 2)
    b = bride or rayon * 2.6
    c.boite(f'{nom}_bride', (b, 0.016, b), (x, y + cote * 0.008, z), P['graphite'], g, chanfrein=0.003)
    c.cylindre(f'{nom}_couvercle', rayon, 0.014, (x, y + cote * 0.023, z), P['tole_sombre'], 'Y', g, segments=20)
    for i, (dx, dz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        c.vis(f'{nom}_vis{i}', (x + dx * b * 0.36, y + cote * 0.016, z + dz * b * 0.36), g, P['acier'],
              '-Y' if cote < 0 else '+Y', rayon=0.005)


def servomoteur(nom, x, z, g, P, rayon=0.05, longueur=0.16):
    """Servomoteur au dos de la flasque arrière, dans l'axe du rouleau qu'il entraîne, câble vers le plateau."""
    y0 = Y_FLASQUE + EP_FLASQUE / 2
    c.boite(f'{nom}_bride', (rayon * 2.3, 0.02, rayon * 2.3), (x, y0 + 0.01, z), P['graphite'], g, chanfrein=0.003)
    c.cylindre(nom, rayon, longueur, (x, y0 + 0.02 + longueur / 2, z), P['graphite'], 'Y', g, segments=20)
    c.cylindre(f'{nom}_capot', rayon * 0.8, 0.02, (x, y0 + 0.03 + longueur, z), P['tole_sombre'], 'Y', g,
               segments=20, chanfrein=0)
    yc = y0 + 0.02 + longueur * 0.6
    c.boite(f'{nom}_connecteur', (0.04, 0.05, 0.03), (x, yc, z + rayon + 0.012), P['plastique_noir'], g)
    c.tuyau(f'{nom}_cable', [(x, yc + 0.01, z + rayon + 0.025), (x + 0.04, yc + 0.05, z + rayon),
                            (x + 0.06, yc + 0.06, Z_PLATEAU + 0.08), (x + 0.06, yc + 0.06, Z_PLATEAU)], 0.006,
            P['plastique_noir'], g)


def porte(nom, x0, x1, z0, z1, y, g, P, grille=True):
    """Porte d'armoire en façade : panneau, poignée à clé, grille d'aération en bas."""
    xm = (x0 + x1) / 2
    c.boite(nom, (x1 - x0, 0.008, z1 - z0), (xm, y - 0.004, (z0 + z1) / 2), P['tole'], g, chanfrein=0.003)
    c.boite(f'{nom}_poignee', (0.016, 0.022, 0.10), (x1 - 0.045, y - 0.019, (z0 + z1) / 2 + 0.05), P['plastique_noir'],
            g, chanfrein=0.003)
    c.cylindre(f'{nom}_serrure', 0.009, 0.008, (x1 - 0.045, y - 0.012, (z0 + z1) / 2 - 0.03), P['chrome'], 'Y', g,
               segments=10, chanfrein=0)
    if grille:
        lg = min(0.24, (x1 - x0) * 0.6)
        c.boite(f'{nom}_grille', (lg, 0.004, 0.09), (xm, y - 0.010, z0 + 0.09), P['graphite'], g, chanfrein=0)
        for j in range(5):
            c.boite(f'{nom}_lame_{j}', (lg - 0.01, 0.006, 0.006), (xm, y - 0.013, z0 + 0.057 + j * 0.0165),
                    P['tole_sombre'], g, chanfrein=0)


# --- Postes ----------------------------------------------------------------------------------------------------


def porte_vitree(nom, x0, x1, z0, z1, y, g, P):
    """
    Porte d'armoire à hublot : l'automate se lit à travers. La caisse est creusée derrière (platine de montage,
    goulotte, disjoncteurs), l'automate y porte les deux mesures du pupitre : cadence comptée et alarmes actives.
    """
    caisse = next(o for o in g.children if o.name == 'bati_caisse')
    zb, cadre = z0 + 0.17, 0.04
    outil = c.boite(f'{nom}_niche', (x1 - x0 - 0.06, 0.24, z1 - zb), ((x0 + x1) / 2, y, (zb + z1) / 2 - 0.01), None,
                    chanfrein=0)
    c.percer(caisse, outil)
    xm, ye = (x0 + x1) / 2, y - 0.004
    c.boite(f'{nom}_bas', (x1 - x0, 0.008, zb - z0), (xm, ye, (z0 + zb) / 2), P['tole'], g, chanfrein=0.003)
    for i, xc in enumerate((x0 + cadre / 2, x1 - cadre / 2)):
        c.boite(f'{nom}_montant_{i}', (cadre, 0.008, z1 - zb), (xc, ye, (zb + z1) / 2), P['tole'], g, chanfrein=0.002)
    c.boite(f'{nom}_haut', (x1 - x0 - 2 * cadre, 0.008, cadre), (xm, ye, z1 - cadre / 2), P['tole'], g, chanfrein=0.002)
    c.boite(f'{nom}_vitre', (x1 - x0 - 2 * cadre + 0.004, 0.004, z1 - zb - cadre + 0.004), (xm, ye, (zb + z1 - cadre) / 2),
            P['verre'], g, chanfrein=0)
    c.boite(f'{nom}_poignee', (0.016, 0.022, 0.10), (x1 - 0.02, y - 0.019, zb + 0.08), P['plastique_noir'], g,
            chanfrein=0.003)
    c.boite(f'{nom}_grille', (0.24, 0.004, 0.09), (xm, y - 0.010, z0 + 0.085), P['graphite'], g, chanfrein=0)
    for j in range(5):
        c.boite(f'{nom}_lame_{j}', (0.23, 0.006, 0.006), (xm, y - 0.013, z0 + 0.052 + j * 0.0165), P['tole_sombre'], g,
                chanfrein=0)
    # Intérieur : platine galvanisée au fond de la niche, goulotte, rangée de disjoncteurs, automate sur rail.
    yf = y + 0.12  # fond de la niche
    c.boite(f'{nom}_platine', (x1 - x0 - 0.08, 0.004, z1 - zb - 0.04), (xm, yf - 0.003, (zb + z1) / 2 - 0.01),
            P['galva'], g, chanfrein=0)
    c.boite(f'{nom}_goulotte', (x1 - x0 - 0.10, 0.05, 0.04), (xm, yf - 0.03, z1 - 0.08), P['graphite'], g,
            chanfrein=0.002)
    for i in range(7):
        c.boite(f'{nom}_disjoncteur_{i}', (0.018, 0.07, 0.08), (xm - 0.12 + i * 0.04, yf - 0.04, zb + 0.08),
                P['papier'], g, chanfrein=0.002)
    c.capteur('bati_automate', 'automate', (xm, yf - 0.09, (zb + z1) / 2 + 0.03), g, P, 4, ('vitesse', 'alarmes'))


def socle(racine, P):
    g = c.vide('socle', parent=racine)
    x0, x1, y0, y1 = -2.55, 2.05, -1.10, 0.80
    dalle = c.boite('socle_1', (x1 - x0, y1 - y0, 0.07), ((x0 + x1) / 2, (y0 + y1) / 2, -0.035), P['sol'], g,
                    chanfrein=0.012)
    dalle['role'] = 'socle'
    # Marquage au sol de la zone machine, aux mêmes cotes que l'ancien modèle.
    lx0, lx1, ly0, ly1, e = -2.41, 1.91, -0.96, 0.66, 0.035
    traits = [
        ((lx1 - lx0, e, 0.002), ((lx0 + lx1) / 2, ly1, 0.001)),
        ((lx1 - lx0, e, 0.002), ((lx0 + lx1) / 2, ly0, 0.001)),
        ((e, ly1 - ly0, 0.002), (lx0, (ly0 + ly1) / 2, 0.001)),
        ((e, ly1 - ly0, 0.002), (lx1, (ly0 + ly1) / 2, 0.001)),
    ]
    for i, (taille, centre) in enumerate(traits):
        t = c.boite(f'socle_{i + 2}', taille, centre, P['marquage'], g, chanfrein=0)
        t['role'] = 'socle'
    return g


def derouleur(racine, P):
    """Dérouleur : colonne en porte-à-faux, arbre expansible, frein à poudre au dos, capteur de diamètre au-dessus."""
    g = c.vide('derouleur', parent=racine)
    x, z = X_BOBINE, Z_BOBINE
    c.boite('derouleur_embase', (0.50, 0.88, 0.07), (x, 0.0, 0.065), P['tole_sombre'], g)
    for i, (dx, yv) in enumerate(((-0.2, -0.38), (0.2, -0.38), (-0.2, 0.38), (0.2, 0.38))):
        pied(f'derouleur_pied_{i}', x + dx, yv, g, P, 0.03)
    c.boite('derouleur_colonne', (0.30, 0.16, 1.00), (x, 0.38, 0.60), P['tole'], g)
    c.boite('derouleur_plinthe', (0.306, 0.166, 0.08), (x, 0.38, 0.14), P['tole_sombre'], g, chanfrein=0.004)
    c.boite('derouleur_chapeau', (0.32, 0.18, 0.025), (x, 0.38, 1.1125), P['tole_sombre'], g)
    # Arbre expansible : palier sur la colonne, bague de butée derrière la bobine, valve de gonflage au bout.
    c.cylindre('derouleur_palier', 0.075, 0.025, (x, 0.2875, z), P['tole_sombre'], 'Y', g)
    c.cylindre('derouleur_arbre', 0.032, 0.44, (x, 0.055, z), P['acier'], 'Y', g)
    c.anneau('derouleur_butee', 0.078, 0.032, 0.02, (x, 0.135, z), P['chrome'], 'Y', g)
    c.cylindre('derouleur_ecrou', 0.042, 0.03, (x, -0.18, z), P['tole_sombre'], 'Y', g)
    c.cylindre('derouleur_valve', 0.012, 0.03, (x, -0.21, z), P['chrome'], 'Y', g, segments=8)
    bob = c.bobine(c.suivant('rotatif'), R_BOBINE, LAIZE, (x, 0, z), P['bord_etiquettes'], P['flanc_etiquettes'], 'Y',
                   g, None, pas_u=c.PAS_ETIQUETTE)
    c.rotatif(bob, R_BOBINE, sous_la_bande=True)
    noyau = c.bobine(c.suivant('rotatif'), 0.05, LAIZE + 0.008, (x, 0, z), P['carton'], P['flanc_mandrin'], 'Y', g, 32)
    c.rotatif(noyau, R_BOBINE, sous_la_bande=True)
    # Frein à poudre au dos de la colonne : la tension de bande se règle sur lui, selon le diamètre restant.
    c.cylindre('derouleur_frein', 0.09, 0.08, (x, 0.50, z), P['graphite'], 'Y', g, segments=24)
    c.cylindre('derouleur_frein_capot', 0.06, 0.02, (x, 0.55, z), P['tole_sombre'], 'Y', g, segments=20)
    c.tuyau('derouleur_frein_cable', [(x + 0.06, 0.52, z - 0.06), (x + 0.12, 0.52, z - 0.2), (x + 0.13, 0.50, 0.3),
                                      (x + 0.13, 0.47, 0.12)], 0.006, P['plastique_noir'], g)
    # Capteur de diamètre à ultrasons, sur potence, visant le dessus de la bobine.
    xs = x - 0.10
    barre('derouleur_potence', (0.03, 0.03, 0.22), (xs, 0.34, 1.235), P['graphite'], g)
    barre('derouleur_bras', (0.03, 0.36, 0.03), (xs, 0.175, 1.33), P['graphite'], g)
    c.capteur('derouleur_diametre', 'ultrasons', (xs, 0.0, 1.25), g, P, 1, 'diametre', normale='-Z')
    c.tuyau('derouleur_capteur_cable', [(xs, 0.0, 1.36), (xs, 0.03, 1.375), (xs + 0.03, 0.2, 1.36),
                                        (xs + 0.03, 0.34, 1.35)], 0.005, P['plastique_noir'], g)
    # Commandes locales sur le flanc gauche : arrêt d'urgence, serrage de l'arbre, frein.
    xf = x - 0.151
    c.arret_urgence('derouleur_au', (xf, 0.38, 0.98), g, P, '-X')
    c.bouton('derouleur_serrage', (xf, 0.34, 0.86), P['plastique_noir'], g, P, '-X')
    c.bouton('derouleur_frein_bouton', (xf, 0.42, 0.86), P['vert_bouton'], g, P, '-X')
    face_x('derouleur_numero', '1', 0.07, (xf - 0.0008, 0.38, 0.70), P['tole_sombre'], g)
    picto_x('derouleur_danger', (xf, 0.38, 0.55), g, P, 0.05)
    return g


def bati(racine, P):
    """Bâti de coupe : armoire électrique, plateau, deux flasques reliées par des entretoises."""
    g = c.vide('bati', parent=racine)
    x0, x1, y0, y1 = BATI
    xm = (x0 + x1) / 2
    c.boite('bati_caisse', (x1 - x0, y1 - y0, 0.68), (xm, 0, 0.44), P['tole'], g)
    c.boite('bati_plinthe', (x1 - x0 - 0.02, y1 - y0 - 0.02, 0.06), (xm, 0, 0.07), P['tole_sombre'], g,
            chanfrein=0.004)
    c.boite('bati_plateau', (x1 - x0 + 0.02, y1 - y0 + 0.02, 0.025), (xm, 0, Z_PLATEAU - 0.0125), P['tole_sombre'], g)
    for i, (xp, yp) in enumerate(((x0 + 0.07, y0 + 0.07), (x1 - 0.07, y0 + 0.07), (x0 + 0.07, y1 - 0.07),
                                  (x1 - 0.07, y1 - 0.07))):
        pied(f'bati_pied_{i}', xp, yp, g, P)
    # Façade : deux portes ; dos : une porte. L'armoire tient l'automate et les variateurs.
    porte_vitree('bati_porte_g', x0 + 0.015, xm - 0.005, 0.13, 0.75, y0, g, P)
    porte('bati_porte_d', xm + 0.005, x1 - 0.015, 0.13, 0.75, y0, g, P)
    c.boite('bati_porte_dos', (x1 - x0 - 0.03, 0.008, 0.62), (xm, y1 + 0.004, 0.44), P['tole'], g, chanfrein=0.003)
    c.boite('bati_dos_grille', (0.30, 0.004, 0.12), (xm, y1 + 0.009, 0.25), P['graphite'], g, chanfrein=0)
    c.boite('bati_plaque', (0.09, 0.002, 0.05), (x1 - 0.12, y0 - 0.009, 0.70), P['inox'], g, chanfrein=0)
    # Sectionneur général sur le flanc gauche : platine jaune, poignée rouge.
    c.boite('bati_sectionneur', (0.008, 0.10, 0.10), (x0 - 0.004, 0.18, 0.60), P['jaune_securite'], g, chanfrein=0.002)
    c.cylindre('bati_sectionneur_axe', 0.02, 0.02, (x0 - 0.018, 0.18, 0.60), P['rouge_arret'], 'X', g, segments=16,
               chanfrein=0)
    c.boite('bati_sectionneur_poignee', (0.02, 0.022, 0.085), (x0 - 0.035, 0.18, 0.60), P['rouge_arret'], g,
            chanfrein=0.003, rotation=(math.radians(-35), 0, 0))
    # Flasques : dessous droit sur le plateau, dessus arrondi.
    r = 0.035
    fx0, fx1 = X_FLASQUE
    pts = [(fx0, Z_PLATEAU), (fx1, Z_PLATEAU)] + c.arc(fx1 - r, Z_FLASQUE - r, r, 0, 90) + c.arc(
        fx0 + r, Z_FLASQUE - r, r, 90, 180)
    for cote, nom in ((-1, 'avant'), (1, 'arriere')):
        c.profil(f'bati_flasque_{nom}', pts, EP_FLASQUE, cote * Y_FLASQUE, P['tole_sombre'], g)
    # Entretoises entre flasques, têtes de vis sur la face avant.
    for i, (xe, ze) in enumerate(((fx0 + 0.04, 0.86), (fx1 - 0.04, 0.86), (-1.05, 1.11), (fx0 + 0.04, 1.11))):
        c.cylindre(f'bati_entretoise_{i}', 0.014, 2 * Y_FLASQUE, (xe, 0, ze), P['acier'], 'Y', g, segments=12)
        c.vis(f'bati_entretoise_vis_{i}', (xe, -Y_FLASQUE - EP_FLASQUE / 2, ze), g, P['acier'], rayon=0.009)
    # Goulottes de sol vers le dérouleur et vers le convoyeur et l'empileur.
    c.boite('bati_goulotte_entree', (0.40, 0.10, 0.025), (-1.64, 0.30, 0.0125), P['graphite'], g, chanfrein=0.008)
    c.boite('bati_goulotte_sortie', (1.14, 0.10, 0.025), (0.01, 0.30, 0.0125), P['graphite'], g, chanfrein=0.008)
    return g


def entree(racine, P):
    """Entrée du bâti : rouleau de mesure de tension sur cellules de charge, bagues de guidage, capteur de bord."""
    g = c.vide('entree', parent=racine)
    x, zr = X_ENTREE, Z_BANDE - R_ENTREE - 0.0005
    for cote in (-1, 1):
        barre(f'entree_console_{cote}', (0.16, 0.02, 0.09), (x + 0.065, cote * Y_FLASQUE, zr), P['tole_sombre'], g)
        # Chaque palier du rouleau repose sur une cellule de charge, vissée au flanc de la console : leur somme donne
        # la tension de bande.
        yc = cote * (Y_FLASQUE + 0.025)
        c.capteur(f'entree_tension_{cote}', 'charge', (x, yc, zr - 0.026), g, P, 1, 'tension', normale='+Z')
        c.boite(f'entree_palier_{cote}', (0.05, 0.03, 0.05), (x, yc, zr), P['graphite'], g, chanfrein=0.003)
        c.cylindre(f'entree_couvercle_{cote}', 0.016, 0.01, (x, yc + cote * 0.02, zr), P['acier'], 'Y', g,
                   segments=12, chanfrein=0)
    c.cylindre('entree_arbre', 0.012, 2 * (Y_FLASQUE + 0.03), (x, 0, zr), P['acier'], 'Y', g, segments=12, chanfrein=0)
    rouleau = c.cylindre(c.suivant('rotatif'), R_ENTREE, 0.39, (x, 0, zr), P['chrome'], 'Y', g)
    c.rotatif(rouleau, R_ENTREE, sous_la_bande=True)
    c.cylindre_catalogue(rouleau, 'Rouleau de renvoi', R_ENTREE * 2000)
    for s in (-1, 1):
        bague = c.anneau(f'entree_bague_{s}', R_ENTREE + 0.014, R_ENTREE, 0.012, (x, s * (LAIZE / 2 + 0.008), zr),
                         P['tole_sombre'], 'Y')
        c.attacher(bague, rouleau)
    # Capteur de bord de bande en fourche, côté conducteur, fixé à la console.
    xc, yb = x + 0.06, -LAIZE / 2
    c.boite('entree_capteur', (0.03, 0.03, 0.07), (xc, yb - 0.03, Z_BANDE), P['plastique_noir'], g, chanfrein=0.003)
    for s in (-1, 1):
        c.boite(f'entree_bec_{s}', (0.025, 0.04, 0.01), (xc, yb - 0.005, Z_BANDE + s * 0.016), P['plastique_noir'], g,
                chanfrein=0)
    # Tige entre la console et le dos du capteur.
    c.cylindre('entree_capteur_tige', 0.006, 0.05, (xc, -0.18, Z_BANDE), P['acier'], 'Y', g, segments=8, chanfrein=0)
    c.tuyau('entree_cable', [(x + 0.04, -Y_FLASQUE - 0.025, zr - 0.044), (x + 0.06, -Y_FLASQUE - 0.06, zr - 0.08),
                             (x + 0.06, -Y_FLASQUE - 0.05, Z_PLATEAU + 0.02)], 0.005, P['plastique_noir'], g)
    return g


def traction(racine, P):
    """Groupe de traction : rouleau chromé entraîné sous la bande, presseur caoutchouté dessus, serré par deux vérins."""
    g = c.vide('traction', parent=racine)
    x = X_TRACTION
    r = R_TRACTION
    z_bas, z_haut = Z_BANDE - r - 0.001, Z_BANDE + r + 0.001
    bas = c.cylindre(c.suivant('rotatif'), r, 0.38, (x, 0, z_bas), P['chrome'], 'Y', g)
    c.rotatif(bas, r, sous_la_bande=True)
    haut = c.cylindre(c.suivant('rotatif'), r, 0.30, (x, 0, z_haut), P['caoutchouc'], 'Y', g)
    c.rotatif(haut, r, sous_la_bande=False)
    for rouleau in (bas, haut):
        c.cylindre_catalogue(rouleau, 'Rouleaux d’entraînement', r * 2000)
    c.cylindre('traction_arbre_presseur', 0.014, 2 * Y_FLASQUE, (x, 0, z_haut), P['acier'], 'Y', g, segments=12)
    c.cylindre('traction_arbre_entraine', 0.016, 2 * Y_FLASQUE, (x, 0, z_bas), P['acier'], 'Y', g, segments=12)
    palier('traction_palier_bas', x, z_bas, g, P, 0.026)
    for cote in (-1, 1):
        yf = cote * (Y_FLASQUE + EP_FLASQUE / 2)
        # Coulisseau du presseur et vérin pneumatique qui l'appuie sur la bande.
        c.boite(f'traction_coulisseau_{cote}', (0.06, 0.02, 0.05), (x, yf + cote * 0.01, z_haut), P['graphite'], g,
                chanfrein=0.003)
        c.cylindre(f'traction_verin_{cote}', 0.017, 0.075, (x, yf + cote * 0.022, 1.095), P['inox'], 'Z', g,
                   segments=16)
        c.cylindre(f'traction_tige_{cote}', 0.006, 0.04, (x, yf + cote * 0.022, 1.045), P['chrome'], 'Z', g,
                   segments=8, chanfrein=0)
        c.cylindre(f'traction_raccord_{cote}', 0.005, 0.016, (x - 0.02, yf + cote * 0.022, 1.12), P['acier'], 'X', g,
                   segments=8, chanfrein=0)
    c.tuyau('traction_air', [(x - 0.028, -Y_FLASQUE - 0.037, 1.12), (x - 0.08, -Y_FLASQUE - 0.04, 1.10),
                             (x - 0.12, -Y_FLASQUE - 0.04, 0.92), (x - 0.13, -Y_FLASQUE - 0.035, Z_PLATEAU)], 0.004,
            P['plastique_noir'], g)
    # Levier d'ouverture du presseur, pour engager la bande.
    c.boite('traction_levier', (0.012, 0.012, 0.11), (x + 0.045, -Y_FLASQUE - 0.045, 1.07), P['chrome'], g,
            chanfrein=0.002, rotation=(0, math.radians(25), 0))
    c.cylindre('traction_levier_boule', 0.012, 0.02, (x + 0.068, -Y_FLASQUE - 0.045, 1.12), P['plastique_noir'], 'Z',
               g, segments=12, chanfrein=0)
    servomoteur('traction_servo', x, z_bas, g, P, rayon=0.045, longueur=0.14)
    return g


def coupe(racine, P):
    """
    Coupe transversale : tambour porte-lame au-dessus de la bande, contre-lame fixe dessous sur son sommier, cellule de
    repérage avant la coupe, tôle de sortie vers le convoyeur, carter transparent verrouillé au-dessus.
    """
    g = c.vide('coupe', parent=racine)
    # La lame dépasse de 2 mm du tambour et affleure la bande au point bas, sur la contre-lame.
    x, zt = X_COUPE, Z_BANDE + R_TAMBOUR + 0.0025
    tambour = c.cylindre(c.suivant('rotatif'), R_TAMBOUR, 0.34, (x, 0, zt), P['acier'], 'Y', g)
    c.rotatif(tambour, R_TAMBOUR, sous_la_bande=False)
    c.cylindre_catalogue(tambour, 'Cylindre porte-couteau (coupe A4)', R_TAMBOUR * 2000)
    a = math.radians(35)
    rl = R_TAMBOUR + 0.002 - 0.006
    for nom, rayon, taille, mat, da in (('lame', rl, (0.012, 0.30, 0.005), P['chrome'], 0.0),
                                        ('serre_lame', R_TAMBOUR - 0.006, (0.012, 0.31, 0.014), P['graphite'],
                                         math.radians(-12))):
        piece = c.boite(f'coupe_{nom}', taille, (x + rayon * math.cos(a + da), 0, zt + rayon * math.sin(a + da)), mat,
                        chanfrein=0.001, rotation=(0, -(a + da), 0))
        c.attacher(piece, tambour)
    for s in (-1, 1):
        joue = c.cylindre(f'coupe_joue_{s}', R_TAMBOUR + 0.004, 0.014, (x, s * 0.177, zt), P['tole_sombre'], 'Y',
                          segments=32)
        c.attacher(joue, tambour)
    c.cylindre('coupe_arbre', 0.024, 2 * Y_FLASQUE, (x, 0, zt), P['acier'], 'Y', g, segments=16)
    palier('coupe_palier', x, zt, g, P, 0.034, bride=0.10)
    # Codeur en bout d'arbre : il compte les coupes, d'où l'usure du couteau (coupes depuis l'affûtage).
    c.capteur('coupe_codeur', 'codeur', (x, -Y_FLASQUE - EP_FLASQUE / 2 - 0.03, zt), g, P, 2, 'usure_couteau',
              normale='+Y')
    # Contre-lame : lame fixe d'acier trempé, réglée par vis sur un sommier tenu entre les flasques.
    c.boite('coupe_sommier', (0.08, 2 * Y_FLASQUE - EP_FLASQUE, 0.07), (x + 0.04, 0, 0.92), P['tole_sombre'], g)
    c.boite('coupe_contre_lame', (0.03, 0.30, 0.022), (x + 0.015, 0, 0.967), P['chrome'], g, chanfrein=0.001)
    for i in range(4):
        c.vis(f'coupe_reglage_{i}', (x + 0.06, -0.12 + 0.08 * i, 0.955), g, P['acier'], '+Z', rayon=0.005)
    for dz in (-0.02, 0.02):
        c.vis(f'coupe_sommier_vis_{dz}', (x + 0.04, -Y_FLASQUE - EP_FLASQUE / 2, 0.92 + dz), g, P['acier'], rayon=0.007)
    c.boite('coupe_tole_sortie', (0.285, 0.26, 0.006), (-0.6775, 0, 0.969), P['inox'], g, chanfrein=0.001)
    # Cellule de repérage : lit le pas des étiquettes pour caler la coupe entre deux rangées.
    xr = -1.05
    # Elle mesure aussi, avec le codeur, la longueur réelle de chaque planche.
    c.capteur('coupe_reperage', 'cellule', (xr, -0.07, 1.012), g, P, 2, 'longueur', normale='-Z')
    c.cylindre('coupe_cellule_tige', 0.006, 0.054, (xr, -0.07, 1.083), P['acier'], 'Z', g, segments=8, chanfrein=0)
    barre('coupe_cellule_support', (0.02, 0.10, 0.012), (xr, -0.05, 1.11), P['graphite'], g)
    servomoteur('coupe_servo', x, zt, g, P, rayon=0.055, longueur=0.17)
    # Marquage du poste et danger de coupe sur la flasque avant.
    yf = -Y_FLASQUE - EP_FLASQUE / 2
    c.texte('coupe_numero', '2', 0.06, (x + 0.15, yf - 0.0008, 1.08), P['tole'], g)
    c.pictogramme_danger('coupe_danger', (x - 0.13, yf, 1.08), g, P, 0.045)
    c.arret_urgence('coupe_au', (X_FLASQUE[1] - 0.06, yf, 0.88), g, P)
    carter(g, P)
    return g


def carter(g, P):
    """Carter de protection en polycarbonate sur cadre en profilés, charnières au dos, interrupteur de sécurité."""
    x0, x1 = X_FLASQUE
    y = Y_FLASQUE + EP_FLASQUE / 2
    z0, z1 = Z_FLASQUE, 1.32
    xm, L, e = (x0 + x1) / 2, x1 - x0, 0.02
    for s in (-1, 1):
        barre(f'carter_long_bas_{s}', (L, e, e), (xm, s * (y - e / 2), z0 + e / 2), P['graphite'], g)
        barre(f'carter_long_haut_{s}', (L, e, e), (xm, s * (y - e / 2), z1 - e / 2), P['graphite'], g)
        xb = x0 + e / 2 if s < 0 else x1 - e / 2
        barre(f'carter_trav_haut_{s}', (e, 2 * y - 2 * e, e), (xb, 0, z1 - e / 2), P['graphite'], g)
        for t in (-1, 1):
            barre(f'carter_montant_{s}_{t}', (e, e, z1 - z0 - 2 * e), (xb, t * (y - e / 2), (z0 + z1) / 2),
                  P['graphite'], g)
    ep = 0.005
    c.boite('carter_toit', (L - 2 * e, 2 * y - 2 * e, ep), (xm, 0, z1 - e / 2), P['verre'], g, chanfrein=0)
    for s in (-1, 1):
        c.boite(f'carter_face_{s}', (L - 2 * e, ep, z1 - z0 - 2 * e), (xm, s * (y - e / 2), (z0 + z1) / 2), P['verre'],
                g, chanfrein=0)
        xb = x0 + e / 2 if s < 0 else x1 - e / 2
        c.boite(f'carter_bout_{s}', (ep, 2 * y - 2 * e, z1 - z0 - 2 * e), (xb, 0, (z0 + z1) / 2), P['verre'], g,
                chanfrein=0)
        # Bouts du bâti sous le carter : tôle sous la bande, polycarbonate au-dessus, une fente pour la bande.
        c.boite(f'carter_fente_bas_{s}', (ep, 2 * Y_FLASQUE - EP_FLASQUE, 0.13), (xb, 0, Z_PLATEAU + 0.075),
                P['tole_sombre'], g, chanfrein=0)
        c.boite(f'carter_fente_haut_{s}', (ep, 2 * Y_FLASQUE - EP_FLASQUE, Z_FLASQUE - 1.01), (xb, 0, (1.01 + z0) / 2),
                P['verre'], g, chanfrein=0)
    for i, xc in enumerate((x0 + 0.15, x1 - 0.15)):
        c.cylindre(f'carter_charniere_{i}', 0.011, 0.06, (xc, y + 0.008, z1 - 0.01), P['acier'], 'X', g, segments=12,
                   chanfrein=0)
    # Poignée de levée en façade et interrupteur de sécurité qui coupe la machine carter ouvert.
    for dx in (-0.08, 0.08):
        c.boite(f'carter_poignee_pied_{dx}', (0.012, 0.03, 0.012), (xm + dx, -y - 0.015, z1 - 0.06), P['chrome'], g,
                chanfrein=0.001)
    c.boite('carter_poignee', (0.18, 0.012, 0.014), (xm, -y - 0.033, z1 - 0.06), P['chrome'], g, chanfrein=0.002)
    c.boite('carter_securite', (0.03, 0.03, 0.06), (x1 - 0.05, -y - 0.016, z0 - 0.045), P['jaune_securite'], g,
            chanfrein=0.003)
    c.boite('carter_securite_clef', (0.012, 0.02, 0.03), (x1 - 0.05, -y - 0.016, z0 + 0.005), P['acier'], g,
            chanfrein=0.001)


def convoyeur(racine, P):
    """Convoyeur à quatre courroies : il sort les planches plus vite que la bande, détecte les doubles et compte."""
    g = c.vide('convoyeur', parent=racine)
    xq, xt = X_CONV
    x0, x1 = xq - 0.035, xt + 0.035
    xm = (x0 + x1) / 2
    yl = 0.165
    for s in (-1, 1):
        barre(f'conv_longeron_{s}', (x1 - x0, 0.02, 0.06), (xm, s * yl, 0.935), P['tole_sombre'], g)
    for xp in X_CONV:
        p = c.cylindre(c.suivant('rotatif'), R_POULIE, 0.31, (xp, 0, Z_POULIE), P['acier'], 'Y', g)
        c.rotatif(p, R_POULIE, sous_la_bande=True)
        # Les courroies vont à la vitesse des planches, pas à celle de la bande.
        p['vitesseRadS'] = round(-V_CONVOYEUR / R_POULIE, 3)
        c.cylindre_catalogue(p, 'Rouleau du convoyeur', R_POULIE * 2000)
        for s in (-1, 1):
            c.cylindre(f'conv_palier_{xp}_{s}', 0.02, 0.014, (xp, s * (yl + 0.017), Z_POULIE), P['graphite'], 'Y', g,
                       segments=12, chanfrein=0)
    rc = R_POULIE + 0.0005
    stade = c.arc(xt, Z_POULIE, rc, -90, 90) + c.arc(xq, Z_POULIE, rc, 90, 270)
    for i, yb in enumerate((-0.084, -0.028, 0.028, 0.084)):
        c.profil(f'conv_courroie_{i}', stade, 0.034, yb, P['caoutchouc'], g, chanfrein=0.002)
    # Piétement en tubes carrés, traverses basses, pieds réglables.
    for xp in (-0.45, 0.50):
        for s in (-1, 1):
            barre(f'conv_pied_{xp}_{s}', (0.035, 0.035, 0.875), (xp, s * yl, 0.4675), P['graphite'], g)
            pied(f'conv_pied_reglable_{xp}_{s}', xp, s * yl, g, P, 0.03)
        barre(f'conv_traverse_{xp}', (0.03, 2 * yl - 0.035, 0.03), (xp, 0, 0.30), P['graphite'], g)
    for s in (-1, 1):
        barre(f'conv_lisse_{s}', (0.915, 0.03, 0.03), (0.025, s * yl, 0.30), P['graphite'], g)
    # Motoréducteur de la poulie de tête, côté opposé au conducteur.
    yr = yl + 0.045
    c.boite('conv_reducteur', (0.08, 0.06, 0.09), (xt, yr, Z_POULIE), P['graphite'], g, chanfrein=0.004)
    c.cylindre('conv_moteur', 0.036, 0.15, (xt - 0.115, yr, Z_POULIE), P['graphite'], 'X', g, segments=20)
    c.cylindre('conv_moteur_capot', 0.03, 0.02, (xt - 0.2, yr, Z_POULIE), P['tole_sombre'], 'X', g, segments=20,
               chanfrein=0)
    c.boite('conv_bornier', (0.05, 0.045, 0.03), (xt - 0.10, yr, Z_POULIE + 0.048), P['plastique_noir'], g)
    # Portique de contrôle : détecteur de double feuille à ultrasons et cellule de comptage.
    xp = 0.0
    for s in (-1, 1):
        barre(f'conv_portique_montant_{s}', (0.025, 0.02, 0.17), (xp, s * (yl + 0.02), 1.005), P['graphite'], g)
    barre('conv_portique_traverse', (0.03, 2 * yl + 0.06, 0.025), (xp, 0, 1.08), P['graphite'], g)
    # Le détecteur de doubles traverse les planches aux ultrasons ; la cellule les compte (doubles par heure).
    c.capteur('conv_double_feuille', 'ultrasons', (xp, -0.05, 1.0), g, P, 3, 'doubles', normale='-Z')
    c.capteur('conv_comptage', 'cellule', (xp, 0.05, 1.022), g, P, 3, 'doubles', normale='-Z')
    c.tuyau('conv_portique_cable', [(xp, -0.05, 1.11), (xp + 0.02, 0.0, 1.105), (xp + 0.02, 0.2, 1.095),
                                    (xp + 0.02, 0.21, 0.97)], 0.005, P['plastique_noir'], g)
    c.texte('conv_numero', '3', 0.045, (xt - 0.10, -yl - 0.0108, 0.935), P['tole'], g)
    return g


def empileur(racine, P):
    """
    Empileur : table élévatrice qui descend à mesure que la pile monte, butée frontale où la planche vient taper,
    taquets latéraux et arrière qui alignent la pile, barrière immatérielle sur l'ouverture de façade.
    """
    g = c.vide('empileur', parent=racine)
    xa, xb = 0.595, 1.025  # montants d'entrée et de sortie
    yf, yd = -0.185, 0.18  # montants avant, dos
    xm = (xa + xb) / 2
    c.boite('emp_embase', (0.48, 0.42, 0.03), (xm, 0, 0.035), P['tole_sombre'], g)
    for i, (xp, yp) in enumerate(((xa, -0.17), (xb, -0.17), (xa, 0.17), (xb, 0.17))):
        pied(f'emp_pied_{i}', xp, yp, g, P, 0.02)
    c.boite('emp_dos', (xb - xa + 0.03, 0.015, 1.03), (xm, yd + 0.0075, 0.565), P['tole'], g)
    for xp in (xa, xb):
        # Montants de façade : émetteur et récepteur de la barrière immatérielle.
        barre(f'emp_barriere_{xp}', (0.03, 0.03, 0.90), (xp, yf, 0.50), P['graphite'], g)
        c.boite(f'emp_barriere_tete_{xp}', (0.032, 0.032, 0.03), (xp, yf, 0.965), P['jaune_securite'], g,
                chanfrein=0.003)
        barre(f'emp_montant_{xp}', (0.03, 0.03, 0.10), (xp, yf, 1.03), P['graphite'], g)
        barre(f'emp_cote_{xp}', (0.03, yd - yf, 0.03), (xp, (yf + yd) / 2, 1.065), P['graphite'], g)
    barre('emp_traverse_haut', (xb - xa, 0.03, 0.03), (xm, yf, 1.065), P['graphite'], g)
    barre('emp_traverse_taquet', (xb - xa - 0.03, 0.025, 0.025), (xm, yf, 0.905), P['graphite'], g)
    # Table élévatrice sur chariot, guidée par deux rails sur le dos, motoréducteur derrière.
    c.boite('emp_table', (0.33, 0.25, 0.015), (X_PILE, 0, Z_TABLE - 0.0075), P['inox'], g, chanfrein=0.002)
    for xr in (X_PILE - 0.10, X_PILE + 0.10):
        barre(f'emp_rail_{xr}', (0.02, 0.012, 0.86), (xr, yd - 0.006, 0.52), P['acier'], g)
        barre(f'emp_bras_{xr}', (0.03, 0.28, 0.03), (xr, yd - 0.15, Z_TABLE - 0.03), P['graphite'], g)
    c.boite('emp_chariot', (0.26, 0.03, 0.08), (X_PILE, yd - 0.02, Z_TABLE - 0.03), P['graphite'], g)
    c.cylindre('emp_moteur', 0.04, 0.14, (X_PILE, yd + 0.06, 0.16), P['graphite'], 'Z', g, segments=20)
    c.boite('emp_reducteur', (0.10, 0.07, 0.07), (X_PILE, yd + 0.05, 0.27), P['graphite'], g, chanfrein=0.004)
    # La pile : tranche de papier, planche du dessus plaquée.
    hp = Z_PILE - Z_TABLE
    c.boite('emp_pile', (LONG_PLANCHE, 0.21, hp), (X_PILE, 0, Z_TABLE + hp / 2), P['papier'], g, chanfrein=0.0015)
    dessus_de_pile(g, P)
    # Butée frontale où la planche lancée vient s'arrêter, réglable au format sur la traverse haute.
    xbt = X_PILE + LONG_PLANCHE / 2 + 0.008
    c.boite('emp_butee', (0.01, 0.25, 0.42), (xbt + 0.005, 0, 0.84), P['inox'], g, chanfrein=0.002)
    for s in (-1, 1):
        barre(f'emp_butee_patte_{s}', (xb - xbt, 0.02, 0.02), ((xb + xbt) / 2 + 0.005, s * 0.10, 1.04), P['acier'], g)
    # Taquet arrière (batteur) et taquets latéraux, poussés par vérins : ils tapent la pile à chaque planche.
    c.boite('emp_taquet_arriere', (0.008, 0.20, 0.13), (X_PILE - LONG_PLANCHE / 2 - 0.006, 0, 0.84), P['inox'], g,
            chanfrein=0.001)
    c.cylindre('emp_verin_arriere', 0.015, 0.06, (xa + 0.012, 0, 0.88), P['inox'], 'X', g, segments=16)
    barre('emp_traverse_entree', (0.025, yd - yf - 0.03, 0.025), (xa, 0, 0.86), P['graphite'], g)
    for s, yv in ((-1, yf + 0.02), (1, yd - 0.02)):
        yt = s * 0.113
        c.boite(f'emp_taquet_{s}', (0.22, 0.006, 0.15), (X_PILE, yt, 0.86), P['inox'], g, chanfrein=0.001)
        c.cylindre(f'emp_verin_{s}', 0.016, 0.05, (X_PILE, (yt + yv) / 2 + s * 0.012, 0.905), P['inox'], 'Y', g,
                   segments=16)
        c.cylindre(f'emp_tige_{s}', 0.005, 0.03, (X_PILE, yt + s * 0.015, 0.905), P['chrome'], 'Y', g, segments=8,
                   chanfrein=0)
    # Hauteur de pile : sonde à ultrasons au-dessus de la pile, sur une potence tenue au dos.
    xh = X_PILE + 0.10
    c.capteur('emp_hauteur_pile', 'ultrasons', (xh, 0.0, 1.0), g, P, 3, 'hauteur_pile', normale='-Z')
    barre('emp_potence_hauteur', (0.025, yd + 0.02, 0.025), (xh, (yd - 0.02) / 2, 1.065), P['graphite'], g)
    # Boîtier de commande sur le montant de sortie : arrêt d'urgence, montée et descente de la table.
    xc = xb + 0.06
    c.boite('emp_boitier', (0.07, 0.05, 0.13), (xc, yf, 0.80), P['graphite'], g, chanfrein=0.004)
    c.arret_urgence('emp_au', (xc, yf - 0.025, 0.835), g, P)
    c.bouton('emp_monter', (xc - 0.015, yf - 0.025, 0.765), P['plastique_noir'], g, P)
    c.bouton('emp_descendre', (xc + 0.015, yf - 0.025, 0.765), P['vert_bouton'], g, P)
    c.pictogramme_danger('emp_danger', (xm, yf - 0.0155, 1.065), g, P, 0.026)
    return g


def dessus_de_pile(g, P):
    """Planche du dessus de la pile : plan texturé tourné vers le haut, la planche seule (sans le vide qui la suit)."""
    import bmesh

    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    w, h = LONG_PLANCHE, 0.21
    coins = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    f = bm.faces.new([bm.verts.new((u, v, 0)) for u, v in coins])
    for loop, (u, v) in zip(f.loops, coins):
        loop[uv].uv = ((u / w + 0.5) * LONG_PLANCHE / PERIODE_PLANCHES, v / h + 0.5)
    return c._objet('emp_planche_dessus', bm, P['planche'], g, (X_PILE, 0, Z_PILE + 0.0004), (0, 0, 0), None, 0)


def palette(racine, P):
    """Palette de cartons de planches prêtes à partir : demi-palette sur dés, deux rangs de quatre cartons."""
    g = c.vide('palette', parent=racine)
    x0, x1, y0, y1 = 1.15, 1.95, -0.30, 0.30
    xm = (x0 + x1) / 2
    for i, yv in enumerate((y0 + 0.05, 0.0, y1 - 0.05)):
        c.boite(f'pal_semelle_{i}', (x1 - x0, 0.10, 0.02), (xm, yv, 0.01), P['bois'], g, chanfrein=0.003)
        for j, xv in enumerate((x0 + 0.05, xm, x1 - 0.05)):
            c.boite(f'pal_de_{i}_{j}', (0.10, 0.10, 0.08), (xv, yv, 0.06), P['bois'], g, chanfrein=0.003)
    for j in range(5):
        xv = x0 + 0.05 + (x1 - x0 - 0.10) * j / 4
        c.boite(f'pal_planche_{j}', (0.10, y1 - y0, 0.02), (xv, 0, 0.11), P['bois'], g, chanfrein=0.003)
    # Cartons, légèrement décalés comme posés à la main ; ruban sur le dessus, étiquette d'expédition en façade.
    lx, ly, lz = 0.37, 0.28, 0.15
    decalage = [(0.004, -0.003), (-0.003, 0.002), (0.002, 0.004), (-0.004, -0.002)]
    for rang in range(2):
        zc = 0.12 + lz / 2 + rang * lz
        for k, (xv, yv) in enumerate(((xm - lx / 2, -ly / 2), (xm + lx / 2, -ly / 2), (xm - lx / 2, ly / 2),
                                      (xm + lx / 2, ly / 2))):
            dx, dy = decalage[(k + rang) % 4]
            cx, cy = xv + dx - 0.002 * math.copysign(1, xv - xm), yv + dy - 0.002 * math.copysign(1, yv)
            c.boite(f'pal_carton_{rang}_{k}', (lx - 0.006, ly - 0.006, lz - 0.002), (cx, cy, zc), P['carton_ondule'],
                    g, chanfrein=0.004)
            if rang == 1:
                c.boite(f'pal_ruban_{k}', (lx - 0.004, 0.05, 0.002), (cx, cy, zc + lz / 2), P['adhesif'], g,
                        chanfrein=0)
            if yv < 0:
                c.boite(f'pal_etiquette_{rang}_{k}', (0.10, 0.002, 0.07), (cx + 0.08, cy - ly / 2 + 0.002, zc + 0.02),
                        P['papier'], g, chanfrein=0)
    return g


def pupitre(racine, P):
    """Pupitre sur colonne devant le bâti de coupe : écran tactile incliné, boutons, arrêt d'urgence."""
    import bmesh

    g = c.vide('pupitre', parent=racine)
    x, y = -1.0, -0.60
    inclinaison = math.radians(-8)
    c.boite('pup_embase', (0.34, 0.30, 0.02), (x, y, 0.01), P['tole_sombre'], g)
    c.cylindre('pup_colonne', 0.032, 1.04, (x, y + 0.02, 0.54), P['graphite'], 'Z', g)
    c.boite('pup_rotule', (0.08, 0.06, 0.08), (x, y + 0.025, 1.08), P['graphite'], g)
    c.boite('pup_tete', (0.52, 0.055, 0.34), (x, y + 0.005, 1.28), P['tole_sombre'], g, rotation=(inclinaison, 0, 0))
    c.boite('pup_commandes', (0.30, 0.07, 0.05), (x, y, 1.0), P['graphite'], g)
    c.arret_urgence('pup_au', (x + 0.09, y, 1.025), g, P, '+Z')
    c.bouton('pup_marche', (x - 0.03, y, 1.025), P['vert_bouton'], g, P, '+Z')
    c.bouton('pup_arret', (x - 0.08, y, 1.025), P['plastique_noir'], g, P, '+Z')
    # Gaine du câble vers l'armoire, au ras du sol.
    c.tuyau('pup_gaine', [(x, y + 0.04, 0.16), (x, y + 0.08, 0.05), (x, y + 0.15, 0.04), (x, BATI[2] - 0.005, 0.12)],
            0.014, P['plastique_noir'], g)
    # Écran : plan texturé tourné vers l'avant, posé sur la tête inclinée.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    w, h = 0.46, 0.288
    coins = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    f = bm.faces.new([bm.verts.new((u, 0, v)) for u, v in coins])
    for loop, (u, v) in zip(f.loops, coins):
        loop[uv].uv = (u / w + 0.5, v / h + 0.5)
    e = c._objet('ecran_ihm', bm, P['ecran'], g, (0, 0, 0), (0, 0, 0), None, 0)
    e.rotation_euler = (inclinaison, 0, 0)
    e.location = (x, y - 0.0235, 1.28)
    e['role'] = 'ecran'
    return g


def colonne_lumineuse(racine, P):
    """Colonne lumineuse sur le plateau, derrière le carter : visible de tout l'atelier, sous la hauteur permise."""
    g = c.vide('colonne_lumineuse', parent=racine)
    x, y = -1.38, 0.33
    c.cylindre('colonne_pied', 0.03, 0.015, (x, y, Z_PLATEAU + 0.0075), P['graphite'], 'Z', g)
    c.cylindre('colonne_mat', 0.012, 0.49, (x, y, Z_PLATEAU + 0.015 + 0.245), P['acier'], 'Z', g)
    c.cylindre('colonne_douille', 0.032, 0.012, (x, y, 1.316), P['plastique_noir'], 'Z', g)
    for nom, zv, mat, etat in (('voyant_vert', 1.346, P['vert'], 'marche'),
                               ('voyant_orange', 1.398, P['orange'], 'attention'),
                               ('voyant_rouge', 1.450, P['rouge'], 'arret')):
        v = c.cylindre(nom, 0.032, 0.048, (x, y, zv), mat, 'Z', g, None, chanfrein=0.002)
        v['role'] = 'voyant'
        v['etat'] = etat
    for i, zv in enumerate((1.372, 1.424)):
        c.cylindre(f'colonne_bague_{i}', 0.0325, 0.004, (x, y, zv), P['plastique_noir'], 'Z', g, None, chanfrein=0.0005)
    c.cylindre('colonne_chapeau', 0.032, 0.02, (x, y, 1.484), P['plastique_noir'], 'Z', g)
    return g


def bandes(racine, P):
    """
    Chemin de bande : de la bobine au rouleau d'entrée (départ tangent au rouleau d'étiquettes), de l'entrée à la
    lame, puis les planches coupées sur le convoyeur, jusqu'au-dessus de la pile.
    """
    g = c.vide('bande', parent=racine)
    # Point où la bande quitte la bobine : tangente menée du rouleau d'entrée au cercle de la bobine.
    dx, dz = X_ENTREE - X_BOBINE, Z_BANDE - Z_BOBINE
    d = math.hypot(dx, dz)
    ang = math.atan2(dz, dx) + math.acos(R_BOBINE / d)
    depart = (X_BOBINE + R_BOBINE * math.cos(ang), Z_BOBINE + R_BOBINE * math.sin(ang) + 0.002)
    c.bande('bande_1', depart, (X_ENTREE, Z_BANDE), LAIZE, P['bande_decoupee'], g)
    c.bande('bande_2', (X_ENTREE, Z_BANDE), (X_COUPE, Z_BANDE), LAIZE, P['bande_decoupee'], g)
    # Planches : une image par période de 0,33 m (planche et vide), au lieu d'une par étiquette de 0,11 m.
    p = c.bande('bande_3', (X_COUPE + 0.005, 0.979), (X_CONV[1] + 0.025, 0.9715), 0.21, P['planches'], g)
    k = c.PAS_ETIQUETTE / PERIODE_PLANCHES
    for boucle in p.data.uv_layers.active.data:
        boucle.uv = (boucle.uv[0] * k, boucle.uv[1])
    p['pasEtiquetteM'] = PERIODE_PLANCHES
    p['vitesseMS'] = V_CONVOYEUR
    return g


# --- Assemblage ------------------------------------------------------------------------------------------------


def construire():
    P = matieres()
    fiche = c.kit_machine(MACHINE)
    racine = c.vide(MACHINE, props={'machine': fiche['nom'], 'fiabilite': 'Déduit', 'unite': 'metre',
                                    'axeHaut': 'Y'})
    groupes = [
        derouleur(racine, P),
        bati(racine, P),
        entree(racine, P),
        traction(racine, P),
        coupe(racine, P),
        convoyeur(racine, P),
        empileur(racine, P),
        palette(racine, P),
        pupitre(racine, P),
        colonne_lumineuse(racine, P),
    ]
    bandes(racine, P)
    g_socle = socle(racine, P)
    ombre = c.ombre_au_sol('socle_6', -2.48, 1.98, -1.03, 0.73, 0.003, largeur_px=768)
    ombre['role'] = 'socle'
    ombre.parent = g_socle
    c.points_diagnostic(
        [(p['numero'], p['nom'], c.depuis_gltf(p['position'])) for p in fiche['points_diagnostic']], racine)
    c.reperes([(r['texte'], c.depuis_gltf(r['position'])) for r in fiche['reperes']], racine)
    return racine, groupes


def vues(objets):
    v = c.vues_par_defaut(objets)
    v['coupe'] = dict(position=(-0.35, -0.72, 1.78), cible=(-0.98, 0, 1.0), focale=38)
    v['tambour'] = dict(position=(-0.42, -0.42, 1.22), cible=(-0.88, 0, 1.0), focale=40)
    v['armoire'] = dict(position=(-1.0, -1.2, 0.85), cible=(-1.2, -0.35, 0.52), focale=40)
    v['entree'] = dict(position=(-1.8, -0.75, 1.25), cible=(-1.45, 0, 0.95), focale=40)
    v['empileur'] = dict(position=(0.15, -1.1, 1.45), cible=(0.75, 0, 0.85), focale=45)
    v['derouleur'] = dict(position=(-2.9, -1.3, 1.5), cible=(-1.9, 0, 0.9), focale=40)
    v['dos'] = dict(position=(-0.6, 1.6, 1.6), cible=(-0.9, 0, 0.95), focale=40)
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
