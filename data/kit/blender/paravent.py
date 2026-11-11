"""
Ligne paravent du kit : étiquettes pliées en zigzag pour les imprimantes en continu.

  blender --background --factory-startup --python data/kit/blender/paravent.py -- [--apercu <dossier>] [--vues a,b]

La bobine imprimée se déroule, le groupe de traction l'entraîne sous la cellule de repérage, le groupe de perforation
transversale (cylindre à quatre lames contre un contre-cylindre lisse) la perfore entre chaque étiquette. Le plieur la
laisse descendre dans une goulotte oscillante : le balancier, mené par une manivelle et sa bielle, la pose en zigzag sur
un plateau, et deux arbres à palettes rabattent chaque pli. L'opérateur met les paquets en cartons sur la table de
sortie.

Disposition reprise de l'ancien modèle, que le reste de l'application connaît : dérouleur à -2,4 (axe à 0,9),
perforation à -1,42 (cylindres à 1,07 et 0,929), rouleau de sortie à -0,92, plieur centré sur -0,25 (rouleaux à 1,0),
cartons à 0,95 ; mêmes points de diagnostic et repères (lus dans machines.json), même emprise au sol
(MODEL_FOOTPRINT). Machine type, proportions approximatives, sans logo ni marque.
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as c  # noqa: E402

MACHINE = 'paravent'
LAIZE = 0.42
X_DER, Z_DER, R_BOBINE = -2.4, 0.9, 0.32
# Rouleau de renvoi du dérouleur, au diamètre du catalogue, sur cellule de charge : il mesure la tension de bande.
X_RENVOI, Z_RENVOI = -2.10, 1.20
R_RENVOI = c.diametre_catalogue(MACHINE, 'Rouleau de renvoi') / 2000
X_TRAC, R_TRAC, R_PRESSEUR = -1.64, 0.04, 0.035
# Cylindres de perforation au développement du catalogue (12 pouces, la longueur d'un pli). L'axe du perforateur garde
# sa hauteur (le point de diagnostic est dessus) : la pince, donc toute la bande jusqu'au plieur, descend sous lui.
X_PERF, Z_PERF = -1.42, 1.07
R_PERF = c.diametre_catalogue(MACHINE, 'Cylindre perforateur') / 2000
R_CONTRE = c.diametre_catalogue(MACHINE, 'Contre-cylindre de perforation') / 2000
Z_BANDE = Z_PERF - R_PERF  # pince de la traction et des cylindres de perforation
Z_CONTRE = Z_BANDE - R_CONTRE
LAMES = 3  # une perforation toutes les 101,6 mm : trois étiquettes par pli
PAS_PERFO = 2 * math.pi * R_PERF / LAMES
X_SORTIE, Z_SORTIE, R_SORTIE = -0.92, 1.035, 0.035
Y_FLASQUE, EP_FLASQUE = 0.335, 0.04  # flasques avant et arrière des groupes, de part et d'autre de la bande
X_BATI = (-1.745, -0.755)  # armoire qui porte traction, perforation et sortie
# Plieur : mur arrière qui porte les arbres en porte-à-faux, cadre vitré devant.
X_PLIEUR = (-0.675, 0.175)
Y_MUR = 0.38  # face avant du mur arrière du plieur
X_ENTREE, Z_ENTREE = -0.5, 1.0
R_ENTREE = c.diametre_catalogue(MACHINE, 'Rouleaux d’entraînement du pliage') / 2000
PIVOT = (-0.25, 1.0)  # axe du balancier et de son rouleau de tête
R_TETE = 0.03
LONG_BALANCIER = 0.29
BASCULE = math.radians(12)  # balancier figé en bout de course, goulotte vers +X
X_MANIVELLE, Z_MANIVELLE = 0.0, 1.0
# Pile : un pli par tour du perforateur (trois étiquettes), la largeur de la bande, sur le plateau.
PILE = (-0.25 - 1.5 * PAS_PERFO, -0.25 + 1.5 * PAS_PERFO, -0.21, 0.21, 0.29, 0.584)
Z_PALETTES = 0.625
X_PALETTES = (-0.465, -0.035)
# Une manivelle pose deux plis par tour ; chaque arbre à palettes reçoit un pli par tour de manivelle, trois palettes.
DUREE_TOUR = 2 * (PILE[1] - PILE[0]) / c.VITESSE_BANDE
W_MANIVELLE = round(2 * math.pi / DUREE_TOUR, 3)
W_PALETTES = round(2 * math.pi / 3 / DUREE_TOUR, 3)


def tangente(c1, r1, c2, r2):
    """
    Brin de bande tendu d'un rouleau (c1, r1) au suivant (c2, r2), enroulé dans le sens horaire vu de face (par-dessus
    quand la bande va vers +X). Un rayon nul fait d'un centre un point de passage (pince).
    """
    dx, dz = c2[0] - c1[0], c2[1] - c1[1]
    a = math.atan2(dz, dx) + math.acos((r1 - r2) / math.hypot(dx, dz))
    n = (math.cos(a), math.sin(a))
    return (c1[0] + r1 * n[0], c1[1] + r1 * n[1]), (c2[0] + r2 * n[0], c2[1] + r2 * n[1])


# Brin du renvoi à la pince de traction : la fourche de bord de bande se pose dessus.
BRIN_ENTREE = tangente((X_RENVOI, Z_RENVOI), R_RENVOI, (X_TRAC, Z_BANDE), 0)


def matieres():
    P = c.palette()
    P.update(
        carton=c.matiere('carton_mandrin', '#a67b4e', 0.0, 0.8),
        emballage=c.matiere('carton_emballage', '#b48a58', 0.0, 0.85),
        adhesif=c.matiere('ruban_adhesif', '#c9a46a', 0.0, 0.35),
        lentille=c.matiere('lentille_cellule', '#ff5a1c', 0.0, 0.3),
        vert=c.matiere('voyant_vert', '#27c46a', 0.0, 0.3),
        orange=c.matiere('voyant_orange', '#ff9a1a', 0.0, 0.3),
        rouge=c.matiere('voyant_rouge', '#ff3a2e', 0.0, 0.3),
        flanc_papier=c.matiere('flanc_papier', '#ffffff', 0.0, 0.8, image='bobine_papier_flanc.png'),
        flanc_mandrin=c.matiere('flanc_mandrin', '#ffffff', 0.0, 0.8, image='mandrin_carton.png'),
        manometre=c.matiere('cadran_manometre', '#ffffff', 0.0, 0.3, image='manometre.png'),
        # Chaque bande défile en décalant sa texture : le bord de la bobine et la pile ont leur propre matière.
        bord_imprime=c.matiere('bord_bobine_imprimee', '#ffffff', 0.0, 0.5, image='bande_imprimee.png'),
        bande_imprimee=c.matiere('bande_imprimee', '#ffffff', 0.0, 0.5, image='bande_imprimee.png'),
        bande_perforee=c.matiere('bande_perforee', '#ffffff', 0.0, 0.5, image='paravent_bande_perforee.png'),
        pile_dessus=c.matiere('pile_dessus', '#ffffff', 0.0, 0.6, image='paravent_bande_perforee.png'),
        pile_tranche=c.matiere('pile_tranche', '#ffffff', 0.0, 0.85, image='paravent_tranche.png'),
        ecran=c.matiere('ecran_paravent', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                        image='paravent_ecran.png'),
    )
    return P


# --- Outils propres à la ligne ---------------------------------------------------------------------------------


def barre(nom, p1, p2, y, section, mat, g, chanfrein=None):
    """Pièce droite entre deux points (x, z) du plan de face : bras, bielle. `section` : (épaisseur en Y, largeur)."""
    dx, dz = p2[0] - p1[0], p2[1] - p1[1]
    return c.boite(nom, (math.hypot(dx, dz), section[0], section[1]), ((p1[0] + p2[0]) / 2, y, (p1[1] + p2[1]) / 2),
                   mat, g, chanfrein=chanfrein, rotation=(0, -math.atan2(dz, dx), 0))


def rayonnant(nom, centre, rayon, angle, taille, mat, parent, chanfrein=0):
    """Pièce posée sur le pourtour d'un arbre (lame, palette) : `taille` = (radial, long de Y, tangentiel)."""
    x, y, z = centre
    return c.boite(nom, taille, (x + rayon * math.cos(angle), y, z + rayon * math.sin(angle)), mat, parent,
                   chanfrein=chanfrein, rotation=(0, -angle, 0))


def sur_balancier(u, w=0.0):
    """Point du balancier à `u` sous le pivot le long de son axe, décalé de `w` en travers (vers +X au repos)."""
    return (PIVOT[0] + w * math.cos(BASCULE) + u * math.sin(BASCULE),
            PIVOT[1] - u * math.cos(BASCULE) + w * math.sin(BASCULE))


def face_x(nom, contenu, taille, centre, mat, g, signe=-1):
    """Inscription peinte sur une face tournée vers -X (ou +X), lisible de ce côté (repris de sheeter.py)."""
    return c.texte(nom, contenu, taille, centre, mat, g, rotation=(math.pi / 2, 0, signe * math.pi / 2))


def picto_x(nom, position, g, P, taille=0.04, signe=-1):
    """Pictogramme collé sur une face tournée vers ∓X, pointe en haut (l'orientation '-X' de commun le coucherait)."""
    pivot = c.pictogramme_danger(nom, position, g, P, taille)
    pivot.rotation_euler = (math.pi / 2, 0, signe * math.pi / 2)
    return pivot


def pied(nom, x, y, g, P, z_haut=0.06):
    """Pied réglable : tige filetée, contre-écrou sous le bâti, semelle caoutchouc au sol."""
    c.cylindre(f'{nom}_tige', 0.011, z_haut - 0.02, (x, y, 0.02 + (z_haut - 0.02) / 2), P['acier'], 'Z', g, segments=8)
    c.cylindre(f'{nom}_ecrou', 0.02, 0.012, (x, y, z_haut - 0.012), P['acier'], 'Z', g, segments=6, chanfrein=0)
    c.cylindre(f'{nom}_semelle', 0.034, 0.02, (x, y, 0.01), P['caoutchouc'], 'Z', g, segments=12, chanfrein=0)


def flasque(nom, x0, x1, z0, z1, g, P, cote, rayon=0.035):
    """Flasque de groupe, coins hauts arrondis, de part et d'autre de la bande (cote -1 : avant, +1 : arrière)."""
    pts = [(x0, z0), (x1, z0)] + c.arc(x1 - rayon, z1 - rayon, rayon, 0, 90) + c.arc(x0 + rayon, z1 - rayon, rayon,
                                                                                     90, 180)
    return c.profil(nom, pts, EP_FLASQUE, cote * Y_FLASQUE, P['tole_sombre'], g)


def palier(nom, x, z, g, P, rayon=0.045, cotes=(-1, 1)):
    """Couvercles de palier sur les faces extérieures des flasques (`cotes`), à l'entrée d'un arbre."""
    for cote in cotes:
        y = cote * (Y_FLASQUE + EP_FLASQUE / 2 + 0.01)
        c.cylindre(f'{nom}_{cote}', rayon, 0.02, (x, y, z), P['graphite'], 'Y', g, segments=20)
        c.cylindre(f'{nom}_graisseur_{cote}', 0.006, 0.012, (x, y + cote * 0.016, z + rayon * 0.55), P['acier'], 'Y',
                   g, segments=6, chanfrein=0)


def arbre_traversant(nom, x, z, rayon, g, P):
    """Tourillon fixe d'un cylindre entre ses deux paliers (le corps tournant est un rotatif à part)."""
    longueur = 2 * (Y_FLASQUE + EP_FLASQUE / 2)
    c.cylindre(nom, rayon, longueur, (x, 0, z), P['acier'], 'Y', g, segments=12)


def servomoteur(nom, x, z, g, P, rayon=0.048, longueur=0.15, y0=Y_FLASQUE + EP_FLASQUE / 2):
    """Servomoteur au dos de la flasque arrière (`y0` : face où il est bridé), dans l'axe du cylindre qu'il mène."""
    c.boite(f'{nom}_bride', (rayon * 2.3, 0.02, rayon * 2.3), (x, y0 + 0.01, z), P['graphite'], g, chanfrein=0.003)
    c.cylindre(nom, rayon, longueur, (x, y0 + 0.02 + longueur / 2, z), P['graphite'], 'Y', g, segments=20)
    c.cylindre(f'{nom}_capot', rayon * 0.8, 0.02, (x, y0 + 0.03 + longueur, z), P['tole_sombre'], 'Y', g, segments=20,
               chanfrein=0)
    c.boite(f'{nom}_connecteur', (0.045, 0.05, 0.03), (x, y0 + 0.06, z + rayon + 0.012), P['plastique_noir'], g)
    c.tuyau(f'{nom}_cable', [(x, y0 + 0.07, z + rayon + 0.03), (x + 0.06, y0 + 0.11, z + rayon + 0.02),
                             (x + 0.12, 0.43, 0.95), (x + 0.12, 0.40, 0.86)], 0.007, P['plastique_noir'], g)


def paquet(nom, boite, mat_dessus, mat_tranche, parent, pas=0.08, pas_u=PAS_PERFO):
    """
    Pile de paravent : dessus imprimé (U le long des plis, une unité par étiquette, V en travers), tranches rayées de
    ses feuillets. `boite` = (x0, x1, y0, y1, z0, z1).
    """
    x0, x1, y0, y1, z0, z1 = boite
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    v = {(i, j, k): bm.verts.new((x, y, z)) for i, x in enumerate((x0, x1)) for j, y in enumerate((y0, y1))
         for k, z in enumerate((z0, z1))}
    faces = (
        ([(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], 0, lambda p: ((p.x - x0) / pas_u, (p.y - y0) / (y1 - y0))),
        ([(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)], 1, lambda p: (p.x / pas, p.y / pas)),
        ([(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], 1, lambda p: ((p.x - x0) / pas, (p.z - z0) / pas)),
        ([(1, 1, 0), (0, 1, 0), (0, 1, 1), (1, 1, 1)], 1, lambda p: ((x1 - p.x) / pas, (p.z - z0) / pas)),
        ([(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)], 1, lambda p: ((y1 - p.y) / pas, (p.z - z0) / pas)),
        ([(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], 1, lambda p: ((p.y - y0) / pas, (p.z - z0) / pas)),
    )
    for coins, index, plaquage in faces:
        f = bm.faces.new([v[k] for k in coins])
        f.material_index = index
        for loop in f.loops:
            loop[uv].uv = plaquage(loop.vert.co)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = c._objet(nom, bm, None, parent, (0, 0, 0), (0, 0, 0), None, 0)
    obj.data.materials.append(mat_dessus)
    obj.data.materials.append(mat_tranche)
    return obj


# --- Postes ----------------------------------------------------------------------------------------------------


def socle(racine, P):
    g = c.vide('socle', parent=racine)
    x0, x1, y0, y1 = -3.0, 1.75, -1.25, 0.85
    dalle = c.boite('socle_1', (x1 - x0, y1 - y0, 0.07), ((x0 + x1) / 2, (y0 + y1) / 2, -0.035), P['sol'], g,
                    chanfrein=0.012)
    dalle['role'] = 'socle'
    # Marquage au sol de la zone machine, aux cotes de l'ancien modèle.
    lx0, lx1, ly0, ly1, e = -2.86, 1.61, -1.11, 0.71, 0.035
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
    """Dérouleur en porte-à-faux : colonne arrière, arbre expansible, flasque de butée, frein au dos."""
    g = c.vide('derouleur', parent=racine)
    x, z = X_DER, Z_DER
    c.boite('der_embase', (0.52, 0.94, 0.07), (x, 0.0, 0.095), P['tole_sombre'], g)
    for px in (x - 0.21, x + 0.21):
        for py in (-0.41, 0.41):
            pied(f'der_pied_{px}_{py}', px, py, g, P)
    c.boite('der_colonne', (0.30, 0.16, 1.07), (x, 0.40, 0.665), P['tole'], g)
    c.boite('der_plinthe', (0.306, 0.166, 0.09), (x, 0.40, 0.175), P['tole_sombre'], g, chanfrein=0.004)
    c.boite('der_chapeau', (0.32, 0.18, 0.03), (x, 0.40, 1.215), P['tole_sombre'], g)
    # Arbre expansible : il tient le mandrin sans le traverser jusqu'au bout, valve de gonflage à l'avant.
    c.cylindre('der_arbre', 0.03, 0.57, (x, 0.035, z), P['acier'], 'Y', g)
    c.cylindre('der_embout', 0.042, 0.03, (x, -0.255, z), P['tole_sombre'], 'Y', g)
    c.cylindre('der_valve', 0.008, 0.02, (x, -0.28, z + 0.02), P['chrome'], 'Y', g, segments=8)
    c.cylindre('der_butee', 0.13, 0.025, (x, 0.235, z), P['tole_sombre'], 'Y', g, segments=32)
    c.cylindre('der_moyeu', 0.06, 0.07, (x, 0.285, z), P['graphite'], 'Y', g, segments=20)
    # Frein pneumatique au dos de la colonne, son flexible d'air et le régulateur à manomètre côté opérateur.
    c.cylindre('der_frein', 0.09, 0.10, (x, 0.53, z), P['graphite'], 'Y', g, segments=24)
    c.cylindre('der_frein_capot', 0.07, 0.03, (x, 0.595, z), P['tole_sombre'], 'Y', g, segments=24)
    c.tuyau('der_flexible', [(x - 0.05, 0.56, z - 0.08), (x - 0.12, 0.56, z - 0.2), (x - 0.16, 0.45, 0.72),
                             (x - 0.155, 0.42, 0.70)], 0.006, P['plastique_noir'], g)
    c.boite('der_regulateur', (0.03, 0.08, 0.11), (x - 0.165, 0.42, 0.70), P['graphite'], g)
    c.bobine('der_manometre', 0.028, 0.025, (x - 0.19, 0.42, 0.72), P['chrome'], P['manometre'], 'X', g, 24)
    c.arret_urgence('der_au', (x - 0.151, 0.40, 1.04), g, P, '-X')
    picto_x('der_danger', (x - 0.151, 0.40, 0.90), g, P, taille=0.05)
    face_x('der_numero', '1', 0.06, (x - 0.1508, 0.40, 1.14), P['tole_sombre'], g)
    bob = c.bobine(c.suivant('rotatif'), R_BOBINE, LAIZE, (x, 0, z), P['bord_imprime'], P['flanc_papier'], 'Y', g,
                   pas_u=c.PAS_ETIQUETTE)
    c.rotatif(bob, R_BOBINE, sous_la_bande=True)
    noyau = c.bobine(c.suivant('rotatif'), 0.055, LAIZE + 0.008, (x, 0, z), P['carton'], P['flanc_mandrin'], 'Y', g, 24)
    c.rotatif(noyau, R_BOBINE, sous_la_bande=True)
    # Rouleau de renvoi en porte-à-faux sur un bras de la colonne ; son palier repose sur la cellule de charge.
    renvoi = c.cylindre(c.suivant('rotatif'), R_RENVOI, 0.50, (X_RENVOI, 0, Z_RENVOI), P['chrome'], 'Y', g)
    c.rotatif(renvoi, R_RENVOI, sous_la_bande=True)
    c.cylindre_catalogue(renvoi, 'Rouleau de renvoi', R_RENVOI * 2000)
    c.boite('der_bras_renvoi', (X_RENVOI - (x + 0.15) + 0.06, 0.08, 0.05), ((x + 0.15 + X_RENVOI + 0.06) / 2, 0.36,
                                                                         Z_RENVOI - 0.075), P['tole_sombre'], g)
    c.cylindre('der_arbre_renvoi', 0.014, 0.58, (X_RENVOI, 0.04, Z_RENVOI), P['acier'], 'Y', g, segments=12)
    c.boite('der_palier_renvoi', (0.07, 0.05, 0.06), (X_RENVOI, 0.30, Z_RENVOI), P['graphite'], g)
    c.capteur('der_tension', 'charge', (X_RENVOI, 0.30, Z_RENVOI - 0.03), g, P, 1, 'tension', '+Z')
    # Mesure du diamètre : capteur à ultrasons visant le dessus de la bobine, sur une potence fixée au chapeau.
    zu = Z_DER + R_BOBINE + 0.15
    c.boite('der_potence_mat', (0.025, 0.025, 0.26), (x, 0.40, 1.36), P['acier'], g)
    c.boite('der_potence_bras', (0.025, 0.43, 0.025), (x, 0.195, 1.4775), P['acier'], g)
    c.boite('der_potence_bride', (0.05, 0.03, 0.03), (x, 0.0, 1.475), P['graphite'], g)
    c.capteur('der_diametre', 'ultrasons', (x, 0.0, zu), g, P, 1, 'diametre', '-Z')
    return g


def bati(racine, P):
    """Armoire sous les groupes : portes, poignées, grilles, sectionneur, coffret de l'automate, pieds."""
    g = c.vide('bati', parent=racine)
    x0, x1 = X_BATI
    xm, L = (x0 + x1) / 2, x1 - x0
    c.boite('bati_armoire', (L, 0.84, 0.72), (xm, 0, 0.48), P['tole'], g)
    c.boite('bati_dessus', (L + 0.01, 0.85, 0.02), (xm, 0, 0.85), P['tole_sombre'], g)
    c.boite('bati_plinthe', (L - 0.04, 0.80, 0.06), (xm, 0, 0.09), P['tole_sombre'], g, chanfrein=0.004)
    for i, px in enumerate((x0 + 0.05, xm, x1 - 0.05)):
        for py in (-0.36, 0.36):
            pied(f'bati_pied_{i}_{py}', px, py, g, P)
    for i, (a, b) in enumerate(((x0 + 0.01, xm - 0.005), (xm + 0.005, x1 - 0.01))):
        xp = (a + b) / 2
        c.boite(f'bati_porte_{i + 1}', (b - a, 0.01, 0.66), (xp, -0.425, 0.48), P['tole'], g)
        xg = b - 0.04 if i == 0 else a + 0.04
        c.boite(f'bati_poignee_{i + 1}', (0.016, 0.024, 0.12), (xg, -0.44, 0.56), P['chrome'], g)
        c.boite(f'bati_grille_{i + 1}', (0.24, 0.004, 0.10), (xp, -0.4315, 0.24), P['graphite'], g, chanfrein=0)
        for j in range(5):
            c.boite(f'bati_lame_{i + 1}_{j}', (0.23, 0.006, 0.006), (xp, -0.434, 0.204 + j * 0.018), P['tole_sombre'], g,
                    chanfrein=0)
    # Sectionneur général sur le flanc gauche : platine jaune, poignée rouge.
    c.boite('bati_sectionneur', (0.006, 0.11, 0.11), (x0 - 0.003, -0.20, 0.66), P['jaune_securite'], g, chanfrein=0)
    c.boite('bati_sectionneur_poignee', (0.03, 0.022, 0.085), (x0 - 0.02, -0.20, 0.66), P['rouge_arret'], g,
            rotation=(math.radians(35), 0, 0))
    # Coffret de commande vitré sur le flanc gauche : l'automate de la ligne (vitesse, alarmes) se voit derrière la vitre.
    yc0, yc1, zc0, zc1, e = 0.02, 0.40, 0.40, 0.68, 0.012
    ycm, zcm = (yc0 + yc1) / 2, (zc0 + zc1) / 2
    for nom, taille, centre in (
        ('haut', (0.13, yc1 - yc0, e), (x0 - 0.065, ycm, zc1 - e / 2)),
        ('bas', (0.13, yc1 - yc0, e), (x0 - 0.065, ycm, zc0 + e / 2)),
        ('gauche', (0.13, e, zc1 - zc0 - 2 * e), (x0 - 0.065, yc0 + e / 2, zcm)),
        ('droite', (0.13, e, zc1 - zc0 - 2 * e), (x0 - 0.065, yc1 - e / 2, zcm)),
    ):
        c.boite(f'bati_coffret_{nom}', taille, centre, P['tole_sombre'], g, chanfrein=0.002)
    interieur = (yc1 - yc0 - 2 * e, zc1 - zc0 - 2 * e)
    c.boite('bati_coffret_fond', (0.004, *interieur), (x0 - 0.002, ycm, zcm), P['galva'], g, chanfrein=0)
    c.boite('bati_coffret_vitre', (0.006, *interieur), (x0 - 0.125, ycm, zcm), P['verre'], g, chanfrein=0)
    c.boite('bati_coffret_serrure', (0.012, 0.02, 0.03), (x0 - 0.134, yc0 + 0.03, zcm), P['chrome'], g, chanfrein=0)
    c.capteur('bati_automate', 'automate', (x0 - 0.09, ycm, zcm), g, P, 4, ['vitesse', 'alarmes'], '-X')
    # Boîte à boutons du groupe : marche, marche par à-coups, arrêt d'urgence.
    c.boite('bati_boitier', (0.12, 0.03, 0.15), (x1 - 0.10, -0.445, 0.72), P['graphite'], g)
    c.arret_urgence('bati_au', (x1 - 0.10, -0.46, 0.755), g, P)
    c.bouton('bati_marche', (x1 - 0.13, -0.46, 0.685), P['vert_bouton'], g, P)
    c.bouton('bati_impulsion', (x1 - 0.07, -0.46, 0.685), P['plastique_noir'], g, P)
    return g


def traction(racine, P):
    """Groupe de traction : rouleau entraîneur chromé sous la bande, presseur caoutchouc serré par deux vérins."""
    g = c.vide('traction', parent=racine)
    x = X_TRAC
    for cote in (-1, 1):
        flasque(f'trac_flasque_{cote}', x - 0.09, x + 0.09, 0.86, 1.15, g, P, cote)
    c.texte('trac_numero', '2', 0.05, (x - 0.045, -Y_FLASQUE - EP_FLASQUE / 2 - 0.0008, 1.105), P['tole'], g)
    z_bas = Z_BANDE - R_TRAC
    z_haut = Z_BANDE + R_PRESSEUR
    entraineur = c.cylindre(c.suivant('rotatif'), R_TRAC, 0.60, (x, 0, z_bas), P['chrome'], 'Y', g)
    c.rotatif(entraineur, R_TRAC, sous_la_bande=True)
    presseur = c.cylindre(c.suivant('rotatif'), R_PRESSEUR, 0.50, (x, 0, z_haut), P['caoutchouc'], 'Y', g)
    c.rotatif(presseur, R_PRESSEUR, sous_la_bande=False)
    arbre_traversant('trac_arbre_bas', x, z_bas, 0.016, g, P)
    arbre_traversant('trac_arbre_haut', x, z_haut, 0.012, g, P)
    palier('trac_palier_bas', x, z_bas, g, P, 0.038)
    # Vérins de serrage du presseur, posés sur les flasques, et leurs flexibles d'air.
    for cote in (-1, 1):
        y = cote * Y_FLASQUE
        c.boite(f'trac_chape_{cote}', (0.06, 0.05, 0.025), (x, y, 1.1625), P['graphite'], g)
        c.cylindre(f'trac_verin_{cote}', 0.02, 0.11, (x, y, 1.23), P['inox'], 'Z', g, segments=16)
        c.cylindre(f'trac_verin_fond_{cote}', 0.024, 0.016, (x, y, 1.293), P['graphite'], 'Z', g, segments=16,
                   chanfrein=0)
        c.tuyau(f'trac_air_{cote}', [(x + 0.02, y, 1.28), (x + 0.07, y, 1.27), (x + 0.10, y + cote * 0.04, 0.95),
                                     (x + 0.10, y + cote * 0.04, 0.86)], 0.005, P['plastique_noir'], g)
    # Capteur de bord de bande en fourche, à l'entrée.
    (xa, za), (xb_, zb_) = BRIN_ENTREE
    zb = za + (zb_ - za) * ((x - 0.115) - xa) / (xb_ - xa)
    c.boite('trac_guide_capteur', (0.04, 0.03, 0.07), (x - 0.115, -0.245, zb), P['plastique_noir'], g)
    c.boite('trac_guide_bec_haut', (0.035, 0.05, 0.01), (x - 0.115, -0.215, zb + 0.017), P['plastique_noir'], g)
    c.boite('trac_guide_bec_bas', (0.035, 0.05, 0.01), (x - 0.115, -0.215, zb - 0.017), P['plastique_noir'], g)
    c.cylindre('trac_guide_support', 0.007, 0.16, (x - 0.115, -0.245, 0.93), P['acier'], 'Z', g)
    servomoteur('trac_servo', x, z_bas, g, P, rayon=0.042, longueur=0.13)
    return g


def perforation(racine, P):
    """
    Groupe de perforation transversale : cylindre porte-lames (quatre lames, une par étiquette) contre un
    contre-cylindre trempé, bagues d'appui, vis de pression à volants, carter d'engrenages et servomoteur au dos,
    cellule de repérage avant la pince, capot en polycarbonate sur le tout. Les cylindres sont en porte-à-faux sur la
    flasque arrière : la flasque avant, ouverte d'une fenêtre, laisse sortir le porte-lames pour changer les lames.
    """
    g = c.vide('perforation', parent=racine)
    x = X_PERF
    flasque('perf_flasque_1', x - 0.13, x + 0.31, 0.86, 1.21, g, P, 1, 0.04)
    avant = flasque('perf_flasque_-1', x - 0.13, x + 0.31, 0.86, 1.21, g, P, -1, 0.04)
    outil = c.profil('perf_fenetre', c.rectangle_arrondi(x - 0.085, Z_CONTRE - R_CONTRE - 0.02, x + 0.085,
                                                         Z_PERF + R_PERF + 0.03, 0.025), EP_FLASQUE * 4,
                     -Y_FLASQUE, None, chanfrein=0)
    c.percer(avant, outil)
    yf = -Y_FLASQUE - EP_FLASQUE / 2
    c.texte('perf_numero', '3', 0.05, (x - 0.07, yf - 0.0008, 1.16), P['tole'], g)
    c.pictogramme_danger('perf_danger', (x + 0.10, yf - 0.001, 1.15), g, P, taille=0.05)
    # Cylindre perforateur : les lames, serrées par leur lardon, dépassent de 4 mm.
    perf = c.cylindre(c.suivant('rotatif'), R_PERF, 0.60, (x, 0, Z_PERF), P['acier'], 'Y', g)
    c.rotatif(perf, R_PERF, sous_la_bande=False)
    c.cylindre_catalogue(perf, 'Cylindre perforateur', R_PERF * 2000)
    for k in range(LAMES):
        a = math.radians(35 + 360 / LAMES * k)
        lame = rayonnant(f'perf_lame_{k}', (x, 0, Z_PERF), R_PERF - 0.004, a, (0.016, 0.46, 0.003), P['chrome'], None)
        lardon = rayonnant(f'perf_lardon_{k}', (x, 0, Z_PERF), R_PERF - 0.002, a + 0.14, (0.006, 0.48, 0.016),
                           P['graphite'], None)
        c.attacher(lame, perf)
        c.attacher(lardon, perf)
    contre = c.cylindre(c.suivant('rotatif'), R_CONTRE, 0.60, (x, 0, Z_CONTRE), P['chrome'], 'Y', g)
    c.rotatif(contre, R_CONTRE, sous_la_bande=True)
    c.cylindre_catalogue(contre, 'Contre-cylindre de perforation', R_CONTRE * 2000)
    for cyl, zc, r in ((perf, Z_PERF, R_PERF), (contre, Z_CONTRE, R_CONTRE)):
        for s in (-1, 1):
            bague = c.anneau(f'{cyl.name}_bague_{s}', r + 0.0005, r * 0.7, 0.02, (x, s * 0.275, zc), P['inox'], 'Y',
                             segments=24)
            c.attacher(bague, cyl)
        # Bout avant, vu par la fenêtre : flasque d'extrémité et écrou de serrage, qui tournent avec le cylindre.
        for nom, rb, ep, yb, mat, seg in (('bout', r * 0.78, 0.008, -0.304, P['tole_sombre'], None),
                                         ('ecrou', 0.016, 0.012, -0.314, P['acier'], 6)):
            piece = c.cylindre(f'{cyl.name}_{nom}', rb, ep, (x, yb, zc), mat, 'Y', segments=seg)
            c.attacher(piece, cyl)
        c.cylindre(f'perf_tourillon_{zc}', 0.025, Y_FLASQUE + EP_FLASQUE / 2 - 0.30,
                   (x, (Y_FLASQUE + EP_FLASQUE / 2 + 0.30) / 2, zc), P['acier'], 'Y', g, segments=12)
        palier(f'perf_palier_{zc}', x, zc, g, P, 0.05, cotes=(1,))
    # Vis de pression du cylindre perforateur, à volant, sur chaque flasque.
    for cote in (-1, 1):
        y = cote * Y_FLASQUE
        c.boite(f'perf_ecrou_pression_{cote}', (0.07, 0.05, 0.03), (x, y, 1.225), P['graphite'], g)
        c.cylindre(f'perf_vis_{cote}', 0.012, 0.06, (x, y, 1.265), P['acier'], 'Z', g)
        c.anneau(f'perf_volant_{cote}', 0.045, 0.037, 0.01, (x, y, 1.29), P['chrome'], 'Z', g, segments=24)
        for a in range(3):
            ang = math.radians(90 + 120 * a)
            c.boite(f'perf_rayon_{cote}_{a}', (0.04, 0.007, 0.005),
                    (x + 0.021 * math.cos(ang), y + 0.021 * math.sin(ang), 1.29), P['chrome'], g, chanfrein=0,
                    rotation=(0, 0, ang))
        c.cylindre(f'perf_moyeu_{cote}', 0.01, 0.018, (x, y, 1.29), P['chrome'], 'Z', g)
    # Carter d'engrenages au dos : les deux cylindres y sont calés l'un sur l'autre, le servomoteur mène le perforateur.
    y0 = Y_FLASQUE + EP_FLASQUE / 2
    c.profil('perf_carter_engrenages', c.rectangle_arrondi(x - 0.10, 0.87, x + 0.10, 1.16, 0.05), 0.06, y0 + 0.03,
             P['tole'], g)
    servomoteur('perf_servo', x, Z_PERF, g, P, y0=y0 + 0.06)
    # Codeur au dos du servomoteur : les tours du porte-lames comptés donnent l'usure des lames.
    c.capteur('perf_codeur', 'codeur', (x, y0 + 0.06 + 0.19, Z_PERF), g, P, 2, 'usure_perforateur', '-Y')
    # Cellule de repérage : elle lit la marque imprimée avant la pince et recale la phase des lames.
    xc = x - 0.10
    zc = Z_BANDE + 0.03
    c.cylindre('perf_barre_cellule', 0.008, 2 * Y_FLASQUE - EP_FLASQUE, (xc, 0, zc + 0.053), P['acier'], 'Y', g)
    c.capteur('perf_cellule', 'cellule', (xc, -0.14, zc), g, P, 2, 'decalage', '-Z')
    c.tuyau('perf_cellule_cable', [(xc, -0.14, zc + 0.045), (xc, -0.10, zc + 0.065), (xc, 0.10, zc + 0.065),
                                   (xc, 0.30, zc + 0.03)], 0.004, P['plastique_noir'], g)
    # Capot de protection : polycarbonate sur cadre anthracite, charnières au dos, poignée et sécurité de capot.
    cx0, cx1, cz0, cz1, r = X_BATI[0] + 0.005, x + 0.325, 0.86, 1.33, 0.08
    pts = [(cx0, cz0), (cx1, cz0)] + c.arc(cx1 - r, cz1 - r, r, 0, 90) + c.arc(cx0 + r, cz1 - r, r, 90, 180)
    c.profil('perf_capot', pts, 0.79, 0.0, P['verre'], g)
    for cote in (-1, 1):
        c.boite(f'perf_capot_cadre_{cote}', (cx1 - cx0, 0.02, 0.03), ((cx0 + cx1) / 2, cote * 0.395, cz0 + 0.025),
                P['tole_sombre'], g)
    c.boite('perf_capot_poignee', (0.22, 0.02, 0.018), ((cx0 + cx1) / 2, -0.425, 0.93), P['chrome'], g)
    for s in (-1, 1):
        c.boite(f'perf_capot_patte_{s}', (0.016, 0.03, 0.03), ((cx0 + cx1) / 2 + s * 0.1, -0.41, 0.93), P['chrome'], g)
        c.cylindre(f'perf_charniere_{s}', 0.012, 0.06, ((cx0 + cx1) / 2 + s * 0.2, 0.40, cz1 - 0.05), P['graphite'],
                   'X', g, segments=12, chanfrein=0)
    c.boite('perf_securite_capot', (0.05, 0.03, 0.04), (cx1 - 0.06, 0.41, cz0 + 0.06), P['jaune_securite'], g)
    return g


def sortie(racine, P):
    """Rouleau de sortie et son presseur : ils tirent la bande perforée vers le plieur sans la faire flotter."""
    g = c.vide('sortie', parent=racine)
    x = X_SORTIE
    for cote in (-1, 1):
        flasque(f'sortie_flasque_{cote}', x - 0.07, x + 0.07, 0.86, 1.15, g, P, cote, 0.03)
    rouleau = c.cylindre(c.suivant('rotatif'), R_SORTIE, 0.60, (x, 0, Z_SORTIE), P['chrome'], 'Y', g)
    c.rotatif(rouleau, R_SORTIE, sous_la_bande=True)
    z_p = Z_SORTIE + R_SORTIE + 0.025
    presseur = c.cylindre(c.suivant('rotatif'), 0.025, 0.46, (x, 0, z_p), P['caoutchouc'], 'Y', g)
    c.rotatif(presseur, 0.025, sous_la_bande=False)
    arbre_traversant('sortie_arbre', x, Z_SORTIE, 0.014, g, P)
    arbre_traversant('sortie_arbre_presseur', x, z_p, 0.01, g, P)
    palier('sortie_palier', x, Z_SORTIE, g, P, 0.032)
    # Pont supérieur : il relie les flasques et protège le presseur.
    c.boite('sortie_pont', (0.16, 2 * Y_FLASQUE + EP_FLASQUE, 0.02), (x, 0, 1.16), P['tole_sombre'], g)
    servomoteur('sortie_servo', x, Z_SORTIE, g, P, rayon=0.038, longueur=0.12)
    return g


def pupitre(racine, P):
    """Pupitre sur pied devant la perforation : écran tactile incliné, boutons, arrêt d'urgence."""
    g = c.vide('pupitre', parent=racine)
    x, y = -1.25, -0.615
    inclinaison = math.radians(-8)
    c.boite('pup_embase', (0.34, 0.28, 0.02), (x, y - 0.01, 0.01), P['tole_sombre'], g)
    c.cylindre('pup_colonne', 0.032, 0.98, (x, y + 0.01, 0.51), P['graphite'], 'Z', g)
    c.boite('pup_tete', (0.52, 0.055, 0.34), (x, y, 1.288), P['tole_sombre'], g, rotation=(inclinaison, 0, 0))
    c.boite('pup_rotule', (0.08, 0.06, 0.08), (x, y + 0.02, 1.10), P['graphite'], g)
    c.boite('pup_commandes', (0.30, 0.07, 0.05), (x, y - 0.005, 1.03), P['graphite'], g)
    c.arret_urgence('pup_au', (x + 0.09, y - 0.005, 1.055), g, P, '+Z')
    c.bouton('pup_marche', (x - 0.03, y - 0.005, 1.055), P['vert_bouton'], g, P, '+Z')
    c.bouton('pup_arret', (x - 0.08, y - 0.005, 1.055), P['plastique_noir'], g, P, '+Z')
    c.tuyau('pup_cable', [(x, y + 0.03, 0.03), (x, y + 0.12, 0.02), (x, -0.42, 0.06), (x, -0.40, 0.09)], 0.008,
            P['plastique_noir'], g)
    # Écran : plan texturé dans le plan de face (il regarde déjà vers -Y), posé sur la tête inclinée.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    w, h = 0.46, 0.288
    coins = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    f = bm.faces.new([bm.verts.new((u, 0, v)) for u, v in coins])
    for loop, (u, v) in zip(f.loops, coins):
        loop[uv].uv = (u / w + 0.5, v / h + 0.5)
    e = c._objet('ecran_ihm', bm, P['ecran'], g, (0, 0, 0), (0, 0, 0), None, 0)
    e.rotation_euler = (inclinaison, 0, 0)
    e.location = (x, y - 0.0285, 1.288)
    e['role'] = 'ecran'
    return g


def plieur(racine, P):
    """Bâti du plieur : socle, mur arrière qui porte les arbres, cadre et carters en polycarbonate, élévateur."""
    g = c.vide('plieur', parent=racine)
    x0, x1 = X_PLIEUR
    xm, L = (x0 + x1) / 2, x1 - x0
    yv = -0.42  # plan de la façade vitrée
    ly, ym = Y_MUR - yv - 0.02, (yv + 0.02 + Y_MUR) / 2  # flancs et toit, du montant avant jusqu'au mur
    c.boite('pli_socle', (L - 0.01, 0.88, 0.16), (xm, 0.0, 0.14), P['tole_sombre'], g)
    for px in (x0 + 0.05, x1 - 0.05):
        for py in (-0.38, 0.38):
            pied(f'pli_pied_{px}_{py}', px, py, g, P)
    c.boite('pli_mur', (L, 0.08, 1.025), (xm, Y_MUR + 0.04, 0.7325), P['tole'], g)
    # Cadre : montants et traverses anthracite, panneaux en polycarbonate, fente d'entrée de la bande à gauche.
    for i, px in enumerate((x0 + 0.02, x1 - 0.02)):
        c.boite(f'pli_montant_{i}', (0.04, 0.04, 1.025), (px, yv, 0.7325), P['tole_sombre'], g)
        c.boite(f'pli_traverse_haut_{i}', (0.04, Y_MUR - yv, 0.04), (px, (yv + Y_MUR) / 2, 1.225), P['tole_sombre'], g)
    c.boite('pli_traverse_avant', (L, 0.04, 0.04), (xm, yv, 1.225), P['tole_sombre'], g)
    c.boite('pli_traverse_milieu', (L - 0.08, 0.04, 0.03), (xm, yv, 0.895), P['tole_sombre'], g)
    c.boite('pli_traverse_fente', (0.04, ly, 0.03), (x0 + 0.02, ym, 0.955),
            P['tole_sombre'], g)
    vitres = [
        ((L - 0.08, 0.008, 0.64), (xm, yv, 0.56)),  # porte d'accès à la pile
        ((L - 0.08, 0.008, 0.29), (xm, yv, 1.055)),
        ((0.008, ly, 0.70), (x0 + 0.02, ym, 0.59)),
        ((0.008, ly, 0.10), (x0 + 0.02, ym, 1.155)),
        ((0.008, ly, 0.965), (x1 - 0.02, ym, 0.7225)),
    ]
    for i, (taille, centre) in enumerate(vitres):
        c.boite(f'pli_vitre_{i}', taille, centre, P['verre'], g, chanfrein=0)
    # Porte : charnières à gauche, poignée à droite, interrupteur de sécurité sur la traverse.
    c.boite('pli_poignee', (0.016, 0.024, 0.14), (x1 - 0.08, yv - 0.02, 0.60), P['chrome'], g)
    for zc in (0.35, 0.78):
        c.cylindre(f'pli_charniere_{zc}', 0.01, 0.06, (x0 + 0.045, yv - 0.012, zc), P['graphite'], 'Z', g, segments=10)
    c.boite('pli_securite_porte', (0.06, 0.03, 0.035), (x1 - 0.10, yv - 0.03, 0.895), P['jaune_securite'], g)
    c.boite('pli_au_boitier', (0.07, 0.05, 0.08), (x0 + 0.02, yv - 0.045, 1.02), P['jaune_securite'], g)
    c.arret_urgence('pli_au', (x0 + 0.02, yv - 0.07, 1.02), g, P)
    c.pictogramme_danger('pli_danger', (xm + 0.02, yv - 0.005, 0.83), g, P, taille=0.05)
    c.texte('pli_numero', '4', 0.032, (x0 + 0.09, yv - 0.0208, 1.225), P['tole'], g)
    picto_x('pli_danger_entree', (x0, yv, 1.12), g, P, taille=0.036)
    # Élévateur du plateau : deux colonnes de guidage, vis à billes, chariot ; la pile y monte pli après pli.
    yc = 0.345
    for i, xc in enumerate((-0.40, -0.10)):
        c.cylindre(f'pli_colonne_{i}', 0.016, 0.68, (xc, yc, 0.56), P['chrome'], 'Z', g)
        c.boite(f'pli_colonne_attache_{i}', (0.05, Y_MUR - yc + 0.02, 0.03), (xc, (yc + Y_MUR) / 2, 0.885),
                P['graphite'], g)
        c.cylindre(f'pli_douille_{i}', 0.026, 0.09, (xc, yc, 0.26), P['graphite'], 'Z', g, segments=16)
    c.cylindre('pli_vis_billes', 0.011, 0.66, (-0.25, yc, 0.55), P['acier'], 'Z', g, segments=10)
    c.boite('pli_chariot', (0.36, 0.06, 0.07), (-0.25, yc, 0.26), P['tole_sombre'], g)
    c.boite('pli_plateau', (0.50, 0.62, 0.035), (-0.25, 0.0, 0.2725), P['inox'], g)
    # Guides de pile en travers des plis, et barrières de bourrage et de comptage vers la pile.
    for cote in (-1, 1):
        c.boite(f'pli_guide_{cote}', (0.30, 0.004, 0.13), (-0.25, cote * 0.226, 0.645), P['inox'], g, chanfrein=0)
    for xr in (-0.35, -0.15):
        c.cylindre(f'pli_tige_guide_{xr}', 0.006, Y_MUR + 0.228, (xr, (Y_MUR - 0.228) / 2, 0.72), P['acier'], 'Y', g,
                   segments=8)
    # Cellules sur le mur, visant en travers le dessus de la pile : un pli qui ne retombe pas coupe la barrière de
    # bourrage, chaque pli rabattu passe devant celle de comptage.
    for i, (xs, mesure) in enumerate(((-0.33, 'bourrage'), (-0.17, 'plis'))):
        c.capteur(f'pli_cellule_{mesure}', 'cellule', (xs, Y_MUR - 0.045, 0.76 + 0.04 * i), g, P, 3, mesure, '-Y')
    # Au dos : motoréducteur de la manivelle, moteur et carter de courroie des palettes, moteur de l'élévateur.
    yd = Y_MUR + 0.08
    c.boite('pli_reducteur', (0.14, 0.10, 0.14), (X_MANIVELLE, yd + 0.05, Z_MANIVELLE), P['graphite'], g)
    c.cylindre('pli_moteur_manivelle', 0.05, 0.16, (X_MANIVELLE, yd + 0.18, Z_MANIVELLE), P['graphite'], 'Y', g,
               segments=20)
    c.profil('pli_carter_courroie', c.rectangle_arrondi(X_PALETTES[0] - 0.05, Z_PALETTES - 0.05, X_PALETTES[1] + 0.05,
                                                        Z_PALETTES + 0.05, 0.05), 0.04, yd + 0.02, P['tole'], g)
    c.cylindre('pli_moteur_palettes', 0.04, 0.14, (-0.25, yd + 0.11, Z_PALETTES), P['graphite'], 'Y', g, segments=20)
    c.boite('pli_moteur_elevateur', (0.12, 0.10, 0.10), (-0.25, yd + 0.05, 0.15), P['graphite'], g)
    for i, (xs, zs) in enumerate(((X_MANIVELLE, Z_MANIVELLE), (-0.25, Z_PALETTES))):
        c.tuyau(f'pli_cable_{i}', [(xs + 0.04, yd + 0.06, zs + 0.05), (xs + 0.08, yd + 0.10, zs),
                                   (xs + 0.10, yd + 0.10, 0.4), (xs + 0.10, yd + 0.02, 0.22)], 0.007,
                P['plastique_noir'], g)
    return g


def pliage(racine, P):
    """
    Dispositif de pliage : rouleau d'entrée, balancier (rouleau de tête, bras, goulotte oscillante) mené par une
    manivelle et sa bielle, deux arbres à palettes aux bouts des plis, et la pile de paravent sur son plateau.
    """
    g = c.vide('pliage', parent=racine)
    # Rouleau d'entrée, en porte-à-faux sur le mur, comme tous les arbres du plieur.
    entree = c.cylindre(c.suivant('rotatif'), R_ENTREE, 0.50, (X_ENTREE, 0, Z_ENTREE), P['chrome'], 'Y', g)
    c.rotatif(entree, R_ENTREE, sous_la_bande=True)
    c.cylindre_catalogue(entree, 'Rouleaux d’entraînement du pliage', R_ENTREE * 2000)
    presseur = c.cylindre(c.suivant('rotatif'), 0.02, 0.44, (X_ENTREE, 0, Z_ENTREE + R_ENTREE + 0.02), P['caoutchouc'],
                          'Y', g)
    c.rotatif(presseur, 0.02, sous_la_bande=False)
    c.cylindre('pli_arbre_presseur', 0.008, Y_MUR + 0.22, (X_ENTREE, (Y_MUR - 0.22) / 2, Z_ENTREE + R_ENTREE + 0.02),
               P['acier'], 'Y', g, segments=8)
    for nom, xa, za, ya in (('entree', X_ENTREE, Z_ENTREE, -0.25), ('pivot', PIVOT[0], PIVOT[1], -0.27),
                            ('palette_g', X_PALETTES[0], Z_PALETTES, -0.24), ('palette_d', X_PALETTES[1], Z_PALETTES,
                                                                               -0.24)):
        c.cylindre(f'pli_arbre_{nom}', 0.013, Y_MUR - ya, (xa, (Y_MUR + ya) / 2, za), P['acier'], 'Y', g, segments=12)
        c.cylindre(f'pli_palier_{nom}', 0.032, 0.02, (xa, Y_MUR - 0.01, za), P['graphite'], 'Y', g, segments=16)
    # Balancier : rouleau de tête sur le pivot, deux bras, goulotte au bout ; la bande y descend vers la pile.
    tete = c.cylindre(c.suivant('rotatif'), R_TETE, 0.48, (PIVOT[0], 0, PIVOT[1]), P['chrome'], 'Y', g)
    c.rotatif(tete, R_TETE, sous_la_bande=True)
    rot = (0, -BASCULE, 0)
    for cote in (-1, 1):
        y = cote * 0.255
        barre(f'bal_bras_{cote}', sur_balancier(-0.02), sur_balancier(LONG_BALANCIER + 0.01), y, (0.012, 0.035),
              P['tole_sombre'], g)
        c.cylindre(f'bal_moyeu_{cote}', 0.024, 0.02, (PIVOT[0], y, PIVOT[1]), P['graphite'], 'Y', g, segments=16)
    for w in (-0.016, 0.016):
        xb, zb = sur_balancier(LONG_BALANCIER - 0.005, w)
        c.cylindre(f'bal_barre_{w}', 0.008, 0.52, (xb, 0, zb), P['chrome'], 'Y', g, segments=10)
        xp, zp = sur_balancier(LONG_BALANCIER - 0.075, w * 1.35)
        c.boite(f'bal_goulotte_{w}', (0.003, 0.46, 0.12), (xp, 0, zp), P['inox'], g, chanfrein=0, rotation=rot)
    # Entretoise des bras, à gauche de la bande qui descend le long de l'axe.
    xt, zt = sur_balancier(0.13, -0.03)
    c.boite('bal_entretoise', (0.02, 0.50, 0.025), (xt, 0, zt), P['tole_sombre'], g, rotation=rot)
    # Levier au-dessus du pivot, bielle, manivelle : un tour de manivelle, un aller-retour du balancier.
    haut_levier = sur_balancier(-0.085)
    barre('bal_levier', sur_balancier(0.0), haut_levier, 0.282, (0.012, 0.03), P['tole_sombre'], g)
    phi = math.radians(160)
    maneton = (X_MANIVELLE + 0.045 * math.cos(phi), Z_MANIVELLE + 0.045 * math.sin(phi))
    barre('bal_bielle', haut_levier, maneton, 0.296, (0.01, 0.022), P['acier'], g)
    for nom, p, yy in (('levier', haut_levier, 0.29), ('bielle', maneton, 0.30)):
        c.cylindre(f'bal_axe_{nom}', 0.008, 0.03, (p[0], yy, p[1]), P['chrome'], 'Y', g, segments=10, chanfrein=0)
    manivelle = c.cylindre(c.suivant('rotatif'), 0.06, 0.02, (X_MANIVELLE, 0.325, Z_MANIVELLE), P['graphite'], 'Y', g,
                           segments=24)
    manivelle['role'] = 'rotatif'
    manivelle['axe'] = 'Y local'
    manivelle['vitesseRadS'] = W_MANIVELLE
    c.cylindre('pli_arbre_manivelle', 0.015, Y_MUR - 0.335, (X_MANIVELLE, (Y_MUR + 0.335) / 2, Z_MANIVELLE),
               P['acier'], 'Y', g, segments=12)
    contrepoids = c.secteur('manivelle_contrepoids', 0.058, 0.02, 0.012, 140, (X_MANIVELLE, 0.309, Z_MANIVELLE),
                            P['tole_sombre'], 'Y', segments=24, debut_deg=phi * 180 / math.pi + 110)
    c.attacher(contrepoids, manivelle)
    # Arbres à palettes : trois palettes chacun, ils rabattent le pli à chaque bout de la pile.
    for i, (xa, sens) in enumerate(((X_PALETTES[0], 1), (X_PALETTES[1], -1))):
        moyeu = c.cylindre(c.suivant('rotatif'), 0.017, 0.46, (xa, 0, Z_PALETTES), P['graphite'], 'Y', g, segments=12)
        moyeu['role'] = 'rotatif'
        moyeu['axe'] = 'Y local'
        moyeu['vitesseRadS'] = sens * W_PALETTES
        for k in range(3):
            a = math.radians(-60 * sens + 120 * k)
            pal = rayonnant(f'palette_{i}_{k}', (xa, 0, Z_PALETTES), 0.036, a, (0.04, 0.44, 0.005),
                            P['plastique_noir'], None)
            c.attacher(pal, moyeu)
    # Pile de paravent sur le plateau : dessus imprimé et perforé, tranches feuilletées.
    paquet('pile_paravent', PILE, P['pile_dessus'], P['pile_tranche'], g)
    return g


def table_sortie(racine, P):
    """Table de sortie : plateau inox sur cadre, tablette de cartons à plat, carton ouvert en remplissage, cartons."""
    g = c.vide('table', parent=racine)
    x0, x1, y0, y1 = 0.32, 1.38, -0.32, 0.32
    xm = (x0 + x1) / 2
    zt = 0.58
    c.boite('table_plateau', (x1 - x0, y1 - y0, 0.015), (xm, 0, zt - 0.0075), P['inox'], g)
    for cote in (-1, 1):
        c.boite(f'table_longeron_{cote}', (x1 - x0 - 0.04, 0.04, 0.04), (xm, cote * (y1 - 0.03), zt - 0.035),
                P['tole_sombre'], g)
        c.boite(f'table_traverse_{cote}', (0.04, y1 - y0 - 0.1, 0.04),
                (xm + cote * (x1 - x0 - 0.06) / 2, 0, zt - 0.035), P['tole_sombre'], g)
    for px in (x0 + 0.03, x1 - 0.03):
        for py in (y0 + 0.03, y1 - 0.03):
            c.boite(f'table_pied_{px}_{py}', (0.04, 0.04, zt - 0.115), (px, py, 0.06 + (zt - 0.115) / 2),
                    P['tole_sombre'], g)
            pied(f'table_verin_{px}_{py}', px, py, g, P)
    c.boite('table_tablette', (x1 - x0 - 0.04, y1 - y0 - 0.04, 0.012), (xm, 0, 0.18), P['galva'], g)
    for k in range(4):
        c.boite(f'table_carton_plat_{k}', (0.86, 0.50, 0.006), (xm + 0.01 * k, 0.005 * k, 0.189 + 0.0065 * k),
                P['emballage'], g, chanfrein=0)
    carton_ouvert(g, 0.52, zt, P)
    for i, zc in enumerate((zt, zt + 0.27)):
        carton_ferme(f'carton_{i + 1}', 0.98, zc, g, P)
    # Rouleau d'adhésif et étiquettes de colis, prêts pour le prochain carton.
    c.anneau('table_adhesif', 0.05, 0.038, 0.05, (1.27, -0.12, zt + 0.025), P['adhesif'], 'Z', g, segments=20)
    c.boite('table_etiquettes', (0.10, 0.15, 0.012), (1.27, 0.12, zt + 0.006), P['papier'], g, chanfrein=0.001)
    return g


def carton_ferme(nom, x, z0, g, P, taille=(0.38, 0.46, 0.27)):
    """Carton de paravents fermé : ruban sur le dessus et les côtés, étiquette de colis devant."""
    lx, ly, lz = taille
    c.boite(nom, taille, (x, 0, z0 + lz / 2), P['emballage'], g, chanfrein=0.004)
    c.boite(f'{nom}_ruban', (0.05, ly + 0.002, 0.002), (x, 0, z0 + lz + 0.0005), P['adhesif'], g, chanfrein=0)
    for cote in (-1, 1):
        c.boite(f'{nom}_ruban_{cote}', (0.05, 0.002, 0.08), (x, cote * (ly / 2 + 0.0005), z0 + lz - 0.04),
                P['adhesif'], g, chanfrein=0)
    c.boite(f'{nom}_etiquette', (0.10, 0.002, 0.07), (x + 0.09, -ly / 2 - 0.0005, z0 + lz * 0.55), P['papier'], g,
            chanfrein=0)


def carton_ouvert(g, x, z0, P, taille=(0.38, 0.46, 0.27)):
    """Carton en cours de remplissage : rabats ouverts, deux paquets de paravent dedans."""
    lx, ly, lz = taille
    e = 0.006
    c.boite('carton_ouvert_fond', (lx, ly, e), (x, 0, z0 + e / 2), P['emballage'], g, chanfrein=0)
    for cote in (-1, 1):
        c.boite(f'carton_ouvert_long_{cote}', (lx, e, lz), (x, cote * (ly - e) / 2, z0 + lz / 2), P['emballage'], g,
                chanfrein=0)
        c.boite(f'carton_ouvert_bout_{cote}', (e, ly - 2 * e, lz), (x + cote * (lx - e) / 2, 0, z0 + lz / 2),
                P['emballage'], g, chanfrein=0)
        # Rabats ouverts vers l'extérieur ; ceux des bouts restent presque droits, contre les cartons voisins.
        a = math.radians(65)
        h = ly / 2 - 0.01
        c.boite(f'carton_ouvert_rabat_long_{cote}', (lx, e, h),
                (x, cote * (ly / 2 + h / 2 * math.sin(a)), z0 + lz + h / 2 * math.cos(a)), P['emballage'], g,
                chanfrein=0, rotation=(-cote * a, 0, 0))
        a = math.radians(18)
        hb = lx / 2 - 0.01
        c.boite(f'carton_ouvert_rabat_bout_{cote}', (e, ly - 0.02, hb),
                (x + cote * (lx / 2 + hb / 2 * math.sin(a)), 0, z0 + lz + hb / 2 * math.cos(a)), P['emballage'], g,
                chanfrein=0, rotation=(0, cote * a, 0))
    lp = PILE[1] - PILE[0]
    paquet('carton_ouvert_paravents', (x - lp / 2, x + lp / 2, -0.21, 0.21, z0 + e, z0 + lz - 0.04),
           P['pile_dessus'], P['pile_tranche'], g)


def colonne_lumineuse(racine, P):
    """Colonne lumineuse sur le mur du plieur, visible de toute la ligne."""
    g = c.vide('colonne_lumineuse', parent=racine)
    x, y, z = -0.25, 0.44, 1.245
    c.cylindre('colonne_pied', 0.03, 0.015, (x, y, z + 0.0075), P['graphite'], 'Z', g)
    c.cylindre('colonne_mat', 0.012, 0.14, (x, y, z + 0.085), P['acier'], 'Z', g)
    c.cylindre('colonne_douille', 0.032, 0.012, (x, y, z + 0.161), P['plastique_noir'], 'Z', g)
    z0 = z + 0.167
    for k, (nom, mat, etat) in enumerate((('voyant_vert', P['vert'], 'marche'),
                                          ('voyant_orange', P['orange'], 'attention'),
                                          ('voyant_rouge', P['rouge'], 'arret'))):
        v = c.cylindre(nom, 0.032, 0.054, (x, y, z0 + 0.027 + 0.0585 * k), mat, 'Z', g, None, chanfrein=0.002)
        v['role'] = 'voyant'
        v['etat'] = etat
    for k in range(2):
        c.cylindre(f'colonne_bague_{k}', 0.0325, 0.004, (x, y, z0 + 0.05625 + 0.0585 * k), P['plastique_noir'], 'Z', g,
                   None, chanfrein=0.0005)
    c.cylindre('colonne_chapeau', 0.032, 0.02, (x, y, z0 + 0.0585 * 2 + 0.064), P['plastique_noir'], 'Z', g)
    return g


def bandes(racine, P):
    """
    Chemin de bande, dans l'ordre des anciens nœuds bande_N (1 à 3 au plieur, 4 et 5 depuis la bobine), puis les
    brins ajoutés. Avant la perforation, la bande imprimée ; après, la bande perforée entre chaque étiquette.
    """
    g = c.vide('bande', parent=racine)
    fin_goulotte = sur_balancier(LONG_BALANCIER + 0.005)
    a, b = tangente(PIVOT, R_TETE, fin_goulotte, 0)
    c.bande('bande_1', fin_goulotte, (-0.13, PILE[5] + 0.002), LAIZE, P['bande_perforee'], g)
    c.bande('bande_2', a, b, LAIZE, P['bande_perforee'], g)
    a, b = tangente((X_ENTREE, Z_ENTREE), R_ENTREE, PIVOT, R_TETE)
    c.bande('bande_3', a, b, LAIZE, P['bande_perforee'], g)
    a, b = tangente((X_DER, Z_DER), R_BOBINE, (X_RENVOI, Z_RENVOI), R_RENVOI)
    c.bande('bande_4', a, b, LAIZE, P['bande_imprimee'], g)
    c.bande('bande_5', (X_TRAC, Z_BANDE), (X_PERF, Z_BANDE), LAIZE, P['bande_imprimee'], g)
    a, b = tangente((X_PERF, Z_BANDE), 0, (X_SORTIE, Z_SORTIE), R_SORTIE)
    c.bande('bande_6', a, b, LAIZE, P['bande_perforee'], g)
    a, b = tangente((X_SORTIE, Z_SORTIE), R_SORTIE, (X_ENTREE, Z_ENTREE), R_ENTREE)
    c.bande('bande_7', a, b, LAIZE, P['bande_perforee'], g)
    a, b = tangente((X_RENVOI, Z_RENVOI), R_RENVOI, (X_TRAC, Z_BANDE), 0)
    c.bande('bande_8', a, b, LAIZE, P['bande_imprimee'], g)
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
        traction(racine, P),
        perforation(racine, P),
        sortie(racine, P),
        pupitre(racine, P),
        plieur(racine, P),
        pliage(racine, P),
        table_sortie(racine, P),
        colonne_lumineuse(racine, P),
    ]
    bandes(racine, P)
    g_socle = socle(racine, P)
    ombre = c.ombre_au_sol('socle_6', -2.8, 1.6, -0.9, 0.9, 0.003, largeur_px=512)
    ombre['role'] = 'socle'
    ombre.parent = g_socle
    c.points_diagnostic(
        [(p['numero'], p['nom'], c.depuis_gltf(p['position'])) for p in fiche['points_diagnostic']], racine)
    c.reperes([(r['texte'], c.depuis_gltf(r['position'])) for r in fiche['reperes']], racine)
    return racine, groupes


def vues(objets):
    v = c.vues_par_defaut(objets)
    v['perforation'] = dict(position=(-2.15, -1.25, 1.75), cible=(-1.4, 0, 1.0), focale=40)
    v['plieur'] = dict(position=(0.35, -1.15, 1.95), cible=(-0.25, 0, 0.75), focale=38)
    v['derouleur'] = dict(position=(-3.4, -1.3, 1.5), cible=(-2.3, 0, 0.85), focale=38)
    v['table'] = dict(position=(1.9, -1.4, 1.5), cible=(0.9, 0, 0.75), focale=38)
    # Capteurs : coffret de l'automate sur le flanc de l'armoire, codeur du porte-lames au dos.
    v['automate'] = dict(position=(-2.12, 0.75, 0.8), cible=(-1.82, 0.2, 0.54), focale=30)
    v['dos_perforation'] = dict(position=(-0.95, 1.5, 1.55), cible=(-1.42, 0.45, 1.0), focale=38)
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
