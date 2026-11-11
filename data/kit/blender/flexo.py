"""
Gallus Labelmaster 440 du kit : presse flexo 8 groupes, laize 440 mm, dorure à froid, 3 postes de découpe.

  blender --background --factory-startup --python data/kit/blender/flexo.py -- [--apercu <dossier>] [--vues a,b]

La disposition reprend celle de l'ancien modèle, que le reste de l'application connaît : bande à 0,98 m, mêmes axes de
rouleaux, mêmes points de diagnostic et repères (lus dans machines.json), même emprise au sol (MODEL_FOOTPRINT de
domain/catalog.ts). Le dessin est celui d'une presse en porte-à-faux : un mur arrière porte les cylindres et leurs
servomoteurs, le côté conducteur reste ouvert pour changer manchons et rouleaux tramés. Proportions approximatives,
sans logo ni livrée de marque.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as c  # noqa: E402

MACHINE = 'flexo'
Z_BANDE = 0.98
LAIZE = 0.44
LONG_ROULEAU = 0.50
X_GROUPES = [round(-2.62 + 0.43 * k, 3) for k in range(8)]
# Encres des huit groupes : quadrichromie, puis orange, vert, violet et blanc couvrant.
ENCRES = ['#1d8fd1', '#cf2479', '#f2c511', '#1c1c1c', '#e8641b', '#2e9d4f', '#6c3fa0', '#efefec']
X_POSTES = [1.46, 1.85, 2.24]
Y_MUR = 0.30  # face avant du mur arrière, côté entraînement
EP_MUR = 0.18
Y_DOS = Y_MUR + EP_MUR  # face arrière du mur
Y_FLASQUE = -0.285  # milieu des flasques, côté conducteur
Z_BATI = 0.50  # dessus du bâti
X_BATI = (-3.28, 2.92)

# Cylindres que le catalogue nomme (data/catalog.json, organes > cylindres) : l'analyse des défauts répétitifs compare
# le pas d'un défaut à leur circonférence, le modèle les porte donc à leur diamètre exact.
CYL = {
    'renvoi': 'Rouleau de renvoi d\u2019entrée',
    'danseur': 'Rouleau danseur',
    'guide': 'Rouleau du guide-bande',
    'porte_cliche': 'Cylindre porte-cliché G2',
    'contre_pression': 'Cylindre de contre-pression G2',
    'anilox': 'Anilox G3',
    'refroidisseur': 'Rouleau refroidisseur',
    'transfert_film': 'Rouleau de transfert du film',
    'magnetique': 'Cylindre magnétique P2',
    'contre_cylindre': 'Contre-cylindre P2',
    'echenillage': 'Rouleau d\u2019échenillage',
    'presseur': 'Rouleau presseur du rembobineur',
}


def rayon(cle: str) -> float:
    """Rayon (m) d'un cylindre du catalogue."""
    return c.diametre_catalogue(MACHINE, CYL[cle]) / 2000


# Groupe d'impression, du catalogue : plaque sur son manchon (développement 381 mm), contre-pression, anilox au contact.
R_PLAQUE = rayon('porte_cliche')
R_IMPRESSION = rayon('contre_pression')
R_ANILOX = rayon('anilox')
Z_PORTE_CLICHE = Z_BANDE - R_PLAQUE
Z_IMPRESSION = Z_BANDE + R_IMPRESSION
# L'anilox touche la plaque, en bas à gauche, sur la même direction que dans l'ancien modèle.
_DIR_ANILOX = (-0.9366, -0.3502)
DX_ANILOX = _DIR_ANILOX[0] * (R_PLAQUE + R_ANILOX)
Z_ANILOX = Z_PORTE_CLICHE + _DIR_ANILOX[1] * (R_PLAQUE + R_ANILOX)
# Découpe : cylindre magnétique et contre-cylindre au développement du catalogue, forme souple de 1 mm.
R_MAGNETIQUE = rayon('magnetique')
R_FORME = R_MAGNETIQUE + 0.001
Z_MAGNETIQUE = Z_BANDE + R_FORME
Z_CONTRE = Z_BANDE - rayon('contre_cylindre')


def matieres():
    P = c.palette()
    P.update(
        plaque=c.matiere('plaque_photopolymere', '#3e7b8a', 0.0, 0.5),
        manchon=c.matiere('manchon', '#a4ae9f', 0.0, 0.38),
        anilox=c.matiere('anilox_ceramique', '#565c62', 0.7, 0.3),
        seau=c.matiere('seau', '#e7e7e2', 0.0, 0.55),
        forme=c.matiere('forme_decoupe', '#8f959b', 0.9, 0.34),
        film=c.matiere('film_dorure', '#dcdfe3', 1.0, 0.12),
        film_use=c.matiere('film_dorure_use', '#8e949a', 0.8, 0.45),
        carton=c.matiere('carton_mandrin', '#a67b4e', 0.0, 0.8),
        matrice_bord=c.matiere('papier_matrice', '#ece6d3', 0.0, 0.85),
        temoin=c.matiere('temoin_uv', '#ff8a1c', 0.0, 0.3),
        vert=c.matiere('voyant_vert', '#27c46a', 0.0, 0.3),
        orange=c.matiere('voyant_orange', '#ff9a1a', 0.0, 0.3),
        rouge=c.matiere('voyant_rouge', '#ff3a2e', 0.0, 0.3),
        flanc_papier=c.matiere('flanc_papier', '#ffffff', 0.0, 0.8, image='bobine_papier_flanc.png'),
        flanc_mandrin=c.matiere('flanc_mandrin', '#ffffff', 0.0, 0.8, image='mandrin_carton.png'),
        flanc_film=c.matiere('flanc_film', '#ffffff', 0.6, 0.35, image='bobine_film_flanc.png'),
        flanc_film_use=c.matiere('flanc_film_use', '#ffffff', 0.6, 0.45, image='bobine_film_use_flanc.png'),
        flanc_matrice=c.matiere('flanc_matrice', '#ffffff', 0.0, 0.8, image='bobine_matrice_flanc.png'),
        flanc_etiquettes=c.matiere('flanc_etiquettes', '#ffffff', 0.0, 0.7, image='bobine_etiquettes_flanc.png'),
        bord_etiquettes=c.matiere('bord_etiquettes', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        manometre=c.matiere('cadran_manometre', '#ffffff', 0.0, 0.3, image='manometre.png'),
        bande_vierge=c.matiere('bande_vierge', '#ffffff', 0.0, 0.8, image='bande_vierge.png'),
        bande_imprimee=c.matiere('bande_imprimee', '#ffffff', 0.0, 0.5, image='bande_imprimee.png'),
        bande_decoupee=c.matiere('bande_decoupee', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        bande_matrice=c.matiere('bande_matrice', '#ffffff', 0.0, 0.7, image='bande_matrice.png', masque=True),
        ecran_impression=c.matiere('ecran_impression', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                                   image='ecran_impression.png'),
        ecran_decoupe=c.matiere('ecran_decoupe', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                                image='ecran_decoupe.png'),
    )
    P['encres'] = [c.matiere(f'encre_{k + 1}', h, 0.0, 0.22) for k, h in enumerate(ENCRES)]
    return P


# --- Pièces répétées -------------------------------------------------------------------------------------------


def palier_mur(nom, x, z, rayon, g, P):
    """Flasque de palier sur la face avant du mur, à l'entrée d'un arbre."""
    c.cylindre(nom, rayon * 1.7, 0.02, (x, Y_MUR - 0.01, z), P['tole_sombre'], 'Y', g, segments=20)


def rouleau(nom_bout, rayon, centre, mat, g, P, sous_la_bande, longueur=LONG_ROULEAU, arbre=True, catalogue=None):
    """
    Rouleau en porte-à-faux : corps tournant (rotatif_N) avec son bout avant, arbre fixe jusqu'au mur, flasque de
    palier sur le mur. `catalogue` : nom du cylindre du catalogue qu'il représente.
    """
    x, _, z = centre
    corps = c.cylindre(c.suivant('rotatif'), rayon, longueur, centre, mat, 'Y', g)
    c.rotatif(corps, rayon, sous_la_bande)
    if catalogue:
        c.cylindre_catalogue(corps, catalogue, rayon * 2000)
    bout = c.cylindre(f'{nom_bout}_bout', rayon * 0.78, 0.008, (x, -longueur / 2 - 0.004, z), P['tole_sombre'], 'Y')
    c.attacher(bout, corps)
    ecrou = c.cylindre(f'{nom_bout}_ecrou', rayon * 0.17, 0.008, (x, -longueur / 2 - 0.012, z), P['acier'], 'Y',
                       segments=6)
    c.attacher(ecrou, corps)
    if arbre:
        long_arbre = Y_MUR - longueur / 2
        c.cylindre(f'{nom_bout}_arbre', rayon * 0.4, long_arbre, (x, longueur / 2 + long_arbre / 2, z), P['acier'],
                   'Y', g)
        palier_mur(f'{nom_bout}_palier', x, z, rayon * 0.55, g, P)
    return corps


def flasque_fenetre(nom, x0, x1, z0, z1, fenetre, g, P, mat, epaisseur=0.03, y=Y_FLASQUE, rayon=0.05):
    """
    Flasque côté conducteur, ouverte d'une fenêtre (x0, x1, z0, z1) qui laisse voir les bouts des cylindres, fixée par
    quatre vis dans ses montants.
    """
    fl = c.profil(nom, c.rectangle_arrondi(x0, z0, x1, z1, rayon), epaisseur, y, mat, g)
    fx0, fx1, fz0, fz1 = fenetre
    outil = c.profil(f'{nom}_outil', c.rectangle_arrondi(fx0, fz0, fx1, fz1, 0.025), epaisseur * 4, y, None,
                     chanfrein=0)
    c.percer(fl, outil)
    face = y - epaisseur / 2
    coins = (((x0 + fx0) / 2, z0 + 0.05), ((x1 + fx1) / 2, z0 + 0.05), ((x0 + fx0) / 2, fz1 - 0.06),
             ((x1 + fx1) / 2, fz1 - 0.06))
    for i, (xv, zv) in enumerate(coins):
        c.vis(f'{nom}_vis{i + 1}', (xv, face, zv), g, P['acier'])
    return fl


def servomoteur(nom, x, z, g, P, rayon=0.058):
    """Servomoteur d'entraînement direct au dos du mur, avec son connecteur et son câble vers le bâti."""
    y = Y_DOS + 0.1
    c.cylindre(nom, rayon, 0.2, (x, y, z), P['graphite'], 'Y', g, segments=16)
    c.cylindre(f'{nom}_capot', rayon * 0.82, 0.03, (x, Y_DOS + 0.215, z), P['tole_sombre'], 'Y', g, segments=16,
               chanfrein=0)
    c.boite(f'{nom}_connecteur', (0.05, 0.06, 0.035), (x, y + 0.02, z + rayon + 0.015), P['plastique_noir'], g)
    c.tuyau(f'{nom}_cable', [(x, y + 0.03, z + rayon + 0.03), (x + 0.05, y + 0.08, z + rayon + 0.02),
                            (x + 0.07, Y_DOS + 0.05, 0.62), (x + 0.07, Y_DOS + 0.03, 0.52)], 0.007,
            P['plastique_noir'], g)


# --- Stations --------------------------------------------------------------------------------------------------


def socle(racine, P):
    g = c.vide('socle', parent=racine)
    x0, x1, y0, y1 = -4.25, 4.10, -1.30, 1.00
    dalle = c.boite('socle_1', (x1 - x0, y1 - y0, 0.07), ((x0 + x1) / 2, (y0 + y1) / 2, -0.035), P['sol'], g,
                    chanfrein=0.012)
    dalle['role'] = 'socle'
    # Marquage au sol de la zone machine.
    lx0, lx1, ly0, ly1, e = -4.11, 3.96, -1.16, 0.86, 0.035
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


def bati(racine, P):
    g = c.vide('bati', parent=racine)
    x0, x1 = X_BATI
    xm, L = (x0 + x1) / 2, x1 - x0
    base = c.boite('bati_inferieur', (L, 0.88, 0.43), (xm, 0.04, 0.285), P['tole_sombre'], g)
    c.boite('bati_plateau', (L - 0.02, 0.70, 0.012), (xm, -0.04, 0.506), P['inox'], g)
    # Portes de l'armoire du bâti, côté conducteur : panneau, poignée, grille d'aération.
    n = 8
    w = (L - 0.08) / n
    for i in range(n):
        xp = x0 + 0.04 + w * (i + 0.5)
        if i == 2:
            armoire_vitree(g, base, xp, w, P)
            continue
        c.boite(f'bati_porte_{i + 1}', (w - 0.03, 0.01, 0.33), (xp, -0.404, 0.29), P['tole_sombre'], g)
        c.boite(f'bati_poignee_{i + 1}', (0.014, 0.022, 0.11), (xp + w / 2 - 0.06, -0.418, 0.33), P['chrome'], g)
        c.boite(f'bati_grille_{i + 1}', (0.22, 0.004, 0.09), (xp - 0.08, -0.410, 0.18), P['graphite'], g, chanfrein=0)
        for j in range(5):
            c.boite(f'bati_lame_{i + 1}_{j + 1}', (0.21, 0.006, 0.006), (xp - 0.08, -0.413, 0.147 + j * 0.0165),
                    P['tole_sombre'], g, chanfrein=0)
    # Pieds réglables.
    for i in range(7):
        xp = x0 + 0.12 + (L - 0.24) * i / 6
        for yp in (-0.33, 0.41):
            c.cylindre(f'bati_pied_{i}_{yp}', 0.03, 0.05, (xp, yp, 0.045), P['acier'], 'Z', g, segments=6)
            c.cylindre(f'bati_semelle_{i}_{yp}', 0.055, 0.02, (xp, yp, 0.01), P['caoutchouc'], 'Z', g, segments=12,
                       chanfrein=0)
    return g


def mur(racine, P):
    """Mur arrière d'un seul tenant, plus haut au droit de la dorure et de l'échenillage qui portent des bobines."""
    g = c.vide('mur', parent=racine)
    x0, x1 = X_BATI
    r = 0.04
    pts = (
        [(x0, Z_BATI), (x1, Z_BATI)]
        + c.arc(x1 - r, 1.76 - r, r, 0, 90) + c.arc(2.36 + r, 1.76 - r, r, 90, 180)
        + [(2.36, 1.32), (1.22, 1.32)]
        + c.arc(1.22 - r, 1.76 - r, r, 0, 90) + c.arc(0.70 + r, 1.76 - r, r, 90, 180)
        + [(0.70, 1.32)]
        + c.arc(x0 + r, 1.32 - r, r, 90, 180)
    )
    c.profil('mur_arriere', pts, EP_MUR, Y_MUR + EP_MUR / 2, P['tole'], g)
    c.boite('mur_plinthe', (x1 - x0, 0.008, 0.11), ((x0 + x1) / 2, Y_MUR - 0.004, Z_BATI + 0.055), P['tole_sombre'], g,
            chanfrein=0.002)
    # Dos : portes de l'armoire électrique, poignées, grilles.
    portes = [(-3.2, -2.42), (-2.38, -1.56), (-1.52, -0.70), (-0.66, 0.16), (0.2, 0.66), (1.26, 2.30)]
    for i, (a, b) in enumerate(portes):
        xm = (a + b) / 2
        c.boite(f'mur_porte_{i + 1}', (b - a, 0.01, 0.62), (xm, Y_DOS + 0.004, 0.92), P['tole'], g)
        c.boite(f'mur_poignee_{i + 1}', (0.02, 0.03, 0.14), (b - 0.06, Y_DOS + 0.02, 0.95), P['plastique_noir'], g)
        c.boite(f'mur_grille_{i + 1}', (0.20, 0.006, 0.12), (a + 0.16, Y_DOS + 0.009, 0.72), P['graphite'], g,
                chanfrein=0)
    return g


def derouleur(racine, P):
    g = c.vide('derouleur', parent=racine)
    x, z = -3.62, 1.0
    c.boite('derouleur_embase', (0.62, 1.02, 0.06), (x + 0.02, 0.04, 0.03), P['tole_sombre'], g)
    c.boite('derouleur_colonne', (0.34, 0.24, 1.14), (x, 0.38, 0.63), P['tole'], g)
    c.boite('derouleur_plinthe', (0.346, 0.246, 0.10), (x, 0.38, 0.11), P['tole_sombre'], g, chanfrein=0.004)
    c.boite('derouleur_chapeau', (0.36, 0.26, 0.03), (x, 0.38, 1.215), P['tole_sombre'], g)
    c.boite('derouleur_carter_frein', (0.28, 0.12, 0.30), (x, 0.56, z), P['tole'], g)
    c.cylindre('derouleur_flasque', 0.09, 0.03, (x, 0.245, z), P['tole_sombre'], 'Y', g)
    c.cylindre('derouleur_arbre', 0.034, 0.58, (x, -0.03, z), P['acier'], 'Y', g)
    c.cylindre('derouleur_mandrin', 0.05, 0.05, (x, -0.29, z), P['tole_sombre'], 'Y', g)
    c.cylindre('derouleur_molette', 0.026, 0.05, (x, -0.335, z), P['chrome'], 'Y', g, segments=8)
    bob = c.bobine(c.suivant('rotatif'), 0.42, LAIZE, (x, 0, z), P['papier'], P['flanc_papier'], 'Y', g)
    c.rotatif(bob, 0.42, sous_la_bande=True)
    noyau = c.bobine(c.suivant('rotatif'), 0.055, LAIZE + 0.008, (x, 0, z), P['carton'], P['flanc_mandrin'], 'Y', g,
                     32)
    c.rotatif(noyau, 0.42, sous_la_bande=True)
    c.arret_urgence('derouleur_au', (x - 0.171, 0.36, 1.06), g, P, '-X')
    # Diamètre de la bobine : capteur à ultrasons au-dessus, sur une potence fixée au chapeau de la colonne.
    c.boite('derouleur_potence', (0.03, 0.03, 0.47), (x, 0.38, 1.465), P['tole_sombre'], g)
    c.boite('derouleur_potence_bras', (0.03, 0.46, 0.03), (x, 0.165, 1.685), P['tole_sombre'], g)
    c.capteur('derouleur_capteur_diametre', 'ultrasons', (x, -0.05, 1.57), g, P, 1, 'diametre', '-Z')
    # Danseur : bras pivotant sur la colonne, rouleau en appui sous la bande entre la bobine et l'entrée.
    xd, zd = -3.30, 1.355
    pivot = (x + 0.17, 1.20)
    long_bras = math.hypot(xd - pivot[0], zd - pivot[1])
    angle = math.atan2(zd - pivot[1], xd - pivot[0])
    c.boite('danseur_bras', (long_bras, 0.025, 0.035), ((xd + pivot[0]) / 2, 0.265, (zd + pivot[1]) / 2), P['tole_sombre'],
            g, rotation=(0, -angle, 0))
    c.cylindre('danseur_pivot', 0.025, 0.03, (pivot[0], 0.265, pivot[1]), P['acier'], 'Y', g)
    rd = rayon('danseur')
    danseur = rouleau('danseur', rd, (xd, 0, zd), P['chrome'], g, P, sous_la_bande=True, arbre=False,
                      catalogue=CYL['danseur'])
    c.cylindre('danseur_arbre', rd * 0.4, 0.015, (xd, 0.2575, zd), P['acier'], 'Y', g)
    for i, zv in enumerate((0.3, 0.95)):
        for yv in (0.30, 0.46):
            c.vis(f'derouleur_vis_{i}_{yv}', (x - 0.17, yv, zv), g, P['acier'], '-X')
    return g


def entree(racine, P):
    """Groupe d'entrée : deux rouleaux de renvoi et le capteur du guide-bande."""
    g = c.vide('entree', parent=racine)
    flasque_fenetre('entree_flasque', -3.28, -2.82, Z_BATI, 1.47, (-3.21, -2.86, 0.86, 1.41), g, P, P['tole'])
    r1 = rayon('renvoi')
    rouleau('entree_r1', r1, (-3.12, 0, 1.40 - r1), P['chrome'], g, P, sous_la_bande=True, catalogue=CYL['renvoi'])
    rouleau('entree_r2', 0.035, (-2.92, 0, 0.945), P['chrome'], g, P, sous_la_bande=True)
    # Tension de bande : cellule de charge sous le palier du renvoi, contre le mur.
    c.capteur('entree_cellule_tension', 'charge', (-3.12, Y_MUR - 0.018, 1.40 - r1 - r1 * 0.94), g, P, 1, 'tension', '+Z')
    # Guide-bande : rouleau sous la bande, capteur de bord en fourche juste avant, sur sa tige.
    rg = rayon('guide')
    rouleau('entree_guide', rg, (-2.85, 0, Z_BANDE - rg), P['chrome'], g, P, sous_la_bande=True, catalogue=CYL['guide'])
    c.capteur('entree_guide_bande', 'fourche', (-2.885, -0.20, Z_BANDE), g, P, 1, 'position', '+Y')
    c.cylindre('guide_support', 0.008, 0.28, (-2.885, -0.25, 0.80), P['acier'], 'Z', g)
    return g


def groupe_impression(racine, k, P):
    x = X_GROUPES[k]
    n = k + 1
    g = c.vide(f'groupe_{n}', parent=racine)
    flasque_fenetre(f'g{n}_flasque', x - 0.16, x + 0.16, Z_BATI, 1.20, (x - 0.125, x + 0.125, 0.79, 1.125), g, P,
                    P['tole'])
    c.pictogramme_danger(f'g{n}_danger', (x + 0.125, Y_FLASQUE - 0.015, 1.158), g, P)
    yf = Y_FLASQUE - 0.015  # face avant de la flasque
    c.texte(f'g{n}_numero', str(n), 0.055, (x - 0.105, yf - 0.0008, 1.163), P['tole_sombre'], g)
    c.boite(f'g{n}_encre', (0.11, 0.004, 0.016), (x + 0.03, yf - 0.002, 1.163), P['encres'][k], g, chanfrein=0.001)
    # Commandes locales : marche par à-coups, et un arrêt d'urgence sur un groupe sur deux.
    c.boite(f'g{n}_boitier', (0.07, 0.02, 0.11), (x + 0.115, yf - 0.01, 0.66), P['graphite'], g)
    c.bouton(f'g{n}_marche', (x + 0.115, yf - 0.02, 0.685), P['vert_bouton'], g, P)
    c.bouton(f'g{n}_impulsion', (x + 0.115, yf - 0.02, 0.64), P['plastique_noir'], g, P)
    if k % 2 == 0:
        c.arret_urgence(f'g{n}_au', (x - 0.10, yf, 0.66), g, P)

    # Cylindre de contre-pression, au-dessus de la bande.
    rouleau(f'g{n}_impression', R_IMPRESSION, (x, 0, Z_IMPRESSION), P['chrome'], g, P, sous_la_bande=False,
            catalogue=CYL['contre_pression'] if n == 2 else None)
    # Cylindre porte-cliché sous la bande : mandrin, manchon, plaque photopolymère collée sur 330°.
    z_pc = Z_PORTE_CLICHE
    mandrin = c.cylindre(c.suivant('rotatif'), 0.052, 0.54, (x, 0, z_pc), P['acier'], 'Y', g)
    c.rotatif(mandrin, R_PLAQUE, sous_la_bande=True)
    manchon = c.cylindre(c.suivant('rotatif'), R_PLAQUE - 0.0017, 0.48, (x, 0, z_pc), P['manchon'], 'Y', g)
    c.rotatif(manchon, R_PLAQUE, sous_la_bande=True)
    plaque = c.secteur(f'g{n}_plaque', R_PLAQUE, R_PLAQUE - 0.0017, 0.42, 330, (x, 0, z_pc), P['plaque'], 'Y',
                       debut_deg=110)
    c.attacher(plaque, manchon)
    if n == 2:
        c.cylindre_catalogue(plaque, CYL['porte_cliche'], R_PLAQUE * 2000)
    ecrou = c.cylindre(f'g{n}_porte_cliche_ecrou', 0.016, 0.014, (x, -0.277, z_pc), P['tole_sombre'], 'Y', segments=6)
    c.attacher(ecrou, mandrin)
    c.cylindre(f'g{n}_porte_cliche_arbre', 0.026, 0.03, (x, 0.285, z_pc), P['acier'], 'Y', g)
    palier_mur(f'g{n}_porte_cliche_palier', x, z_pc, 0.04, g, P)
    # Rouleau tramé et chambre à racle fermée.
    xa, za = x + DX_ANILOX, Z_ANILOX
    rouleau(f'g{n}_anilox', R_ANILOX, (xa, 0, za), P['anilox'], g, P, sous_la_bande=False,
            catalogue=CYL['anilox'] if n == 3 else None)
    # Chambre à racle contre le flanc gauche de l'anilox.
    xc = xa - R_ANILOX + 0.002
    c.profil(f'g{n}_chambre', c.rectangle_arrondi(xc - 0.054, za - 0.033, xc, za + 0.033, 0.012), 0.50, 0.0,
             P['inox'], g)
    for s in (-1, 1):
        c.boite(f'g{n}_joint_{s}', (0.056, 0.012, 0.068), (xc - 0.027, s * 0.256, za), P['caoutchouc'], g)
        c.cylindre(f'g{n}_raccord_{s}', 0.009, 0.03, (xc - 0.031, s * 0.17, za - 0.041), P['acier'], 'Z', g)
    c.boite(f'g{n}_racle', (0.004, 0.48, 0.03), (xc, 0, za + 0.024), P['acier'], g, chanfrein=0.0008)
    # Seau d'encre sur le plateau, et ses deux flexibles (aspiration, retour).
    xs, ys = x - 0.13, -0.17
    c.cylindre(f'g{n}_seau', 0.075, 0.17, (xs, ys, Z_BATI + 0.097), P['seau'], 'Z', g)
    c.cylindre(f'g{n}_seau_etiquette', 0.0755, 0.05, (xs, ys, Z_BATI + 0.08), P['encres'][k], 'Z', g, None, 0)
    c.cylindre(f'g{n}_seau_couvercle', 0.078, 0.014, (xs, ys, Z_BATI + 0.19), P['plastique_noir'], 'Z', g)
    for s, dx in ((-1, -0.03), (1, 0.03)):
        c.tuyau(f'g{n}_flexible_{s}', [(xs + dx, ys, Z_BATI + 0.197), (xs + dx, ys + 0.02, Z_BATI + 0.25),
                                        (xc - 0.031, s * 0.17 - 0.02 * s, za - 0.09), (xc - 0.031, s * 0.17, za - 0.056)],
                0.007, P['plastique_noir'], g)
    if n == 3:
        # Encrage : sondes de viscosité, de température et de niveau plongées dans le seau du groupe 3.
        z_couvercle = Z_BATI + 0.197
        for cle, dx, dy in (('viscosite', -0.04, -0.035), ('temperature', 0.0, -0.05), ('niveau', 0.04, -0.035)):
            c.capteur(f'g{n}_sonde_{cle}', 'sonde', (xs + dx, ys + dy, z_couvercle), g, P, 3, cle, '-Z')
    # Repérage : cellule au-dessus de la bande, juste après la pince du groupe. Celle du groupe 2 est l'organe 2.
    cellule = c.capteur(f'g{n}_cellule_reperage', 'cellule', (x + R_IMPRESSION + 0.022, -0.15, Z_BANDE + 0.02), g, P, 2,
                        'reperage', '-Z')
    if n != 2:
        for cle in ('role', 'organe', 'mesure', 'genre'):
            del cellule[cle]
    # Servomoteurs du cylindre d'impression et du porte-cliché, au dos du mur.
    servomoteur(f'g{n}_servo_impression', x, Z_IMPRESSION, g, P)
    servomoteur(f'g{n}_servo_porte_cliche', x, z_pc - 0.02, g, P, rayon=0.05)
    if n == 2:
        # Couple et erreur de poursuite : lus sur le codeur du servomoteur du cylindre d'impression.
        c.capteur('g2_codeur_servo', 'codeur', (x, Y_DOS + 0.27, Z_IMPRESSION), g, P, 2, ['poursuite', 'couple'], '+Y')
    xu = x + 0.215
    secheur_uv(g, n, xu, P)
    if n == 6:
        # Séchage (organe 4) : température de l'air dans la gaine, puissance UV sur le carter, température de bande en
        # sortie de lampe.
        c.capteur('uv6_sonde_air', 'sonde', (xu, 0.02, 1.36), g, P, 4, 'temperature_air', '+Y')
        c.capteur('uv6_cellule_uv', 'cellule', (xu - 0.096, -0.10, 1.12), g, P, 4, 'puissance_uv', '+X')
        c.capteur('uv6_pyrometre_bande', 'pyrometre', (X_GROUPES[k + 1] - R_IMPRESSION - 0.02, -0.10, Z_BANDE + 0.02), g,
                  P, 4, 'temperature_bande', '-Z')
    if n == 4:
        # Vitesse machine (organe 9) : roue de mesure sous la bande, codeur en bout d'axe, sur sa tige.
        xr, rr = -1.18, 0.03
        roue = c.cylindre(c.suivant('rotatif'), rr, 0.03, (xr, -0.185, Z_BANDE - rr), P['caoutchouc'], 'Y', g, 24)
        c.rotatif(roue, rr, sous_la_bande=True)
        c.cylindre('roue_mesure_tige', 0.008, Z_BANDE - rr - Z_BATI, (xr, -0.185, (Z_BANDE - rr + Z_BATI) / 2),
                   P['acier'], 'Z', g)
        c.capteur('roue_mesure_codeur', 'codeur', (xr, -0.2, Z_BANDE - rr), g, P, 9, 'vitesse', '+Y')
    if n == 8:
        # Rouleau refroidisseur sous la bande, au pied de la dernière lampe UV (organe 4).
        rr = rayon('refroidisseur')
        rouleau('refroidisseur', rr, (0.60, 0, Z_BANDE - rr), P['chrome'], g, P, sous_la_bande=True,
                catalogue=CYL['refroidisseur'])
    return g


def armoire_vitree(g, base, xp, w, P):
    """
    Armoire électrique du bâti, porte vitrée : l'automate (vitesse, alarmes) et la sonde d'ambiance d'armoire
    (organe 9, pupitre et automate) se voient sans ouvrir.
    """
    outil = c.boite('armoire_outil', (w - 0.10, 0.20, 0.30), (xp, -0.38, 0.29), None, chanfrein=0)
    c.percer(base, outil)
    c.boite('armoire_fond', (w - 0.10, 0.01, 0.30), (xp, -0.285, 0.29), P['tole'], g, chanfrein=0)
    c.boite('armoire_goulotte', (w - 0.14, 0.03, 0.03), (xp, -0.30, 0.41), P['graphite'], g, chanfrein=0)
    for j in range(6):
        c.boite(f'armoire_disjoncteur_{j}', (0.018, 0.06, 0.07), (xp + 0.06 + j * 0.02, -0.32, 0.18), P['papier'], g,
                chanfrein=0.001)
    c.capteur('armoire_automate', 'automate', (xp - 0.08, -0.29, 0.30), g, P, 9, 'alarmes', '+Y')
    c.capteur('armoire_thermostat', 'thermostat', (xp + 0.20, -0.29, 0.34), g, P, 9, 'temperature_armoire', '+Y')
    # Porte : cadre tôlé et vitre.
    for nom, taille, dx, dz in (('haut', (w - 0.03, 0.012, 0.03), 0, 0.15), ('bas', (w - 0.03, 0.012, 0.03), 0, -0.15),
                                ('gauche', (0.03, 0.012, 0.33), -(w - 0.06) / 2, 0), ('droite', (0.03, 0.012, 0.33), (w - 0.06) / 2, 0)):
        c.boite(f'armoire_cadre_{nom}', taille, (xp + dx, -0.404, 0.29 + dz), P['tole_sombre'], g, chanfrein=0.002)
    c.boite('armoire_vitre', (w - 0.08, 0.004, 0.28), (xp, -0.404, 0.29), P['verre'], g, chanfrein=0)
    c.boite('armoire_poignee', (0.014, 0.022, 0.11), (xp + w / 2 - 0.06, -0.418, 0.33), P['chrome'], g)


def secheur_uv(g, n, xu, P):
    """Lampe UV après le groupe : carter en porte-à-faux, façade inox, gaine de refroidissement vers l'extraction."""
    c.boite(f'uv{n}_carter', (0.19, 0.58, 0.20), (xu, 0.005, 1.135), P['graphite'], g)
    c.boite(f'uv{n}_facade', (0.17, 0.008, 0.16), (xu, -0.288, 1.135), P['inox'], g, chanfrein=0.002)
    c.texte(f'uv{n}_marque', 'UV', 0.032, (xu - 0.035, -0.2925, 1.17), P['tole_sombre'], g)
    c.boite(f'uv{n}_temoin', (0.02, 0.006, 0.01), (xu + 0.05, -0.293, 1.17), P['temoin'], g, chanfrein=0.001)
    c.boite(f'uv{n}_vitre', (0.13, 0.50, 0.004), (xu, 0.0, 1.034), P['plastique_noir'], g, chanfrein=0.001)
    c.tuyau(f'uv{n}_gaine', [(xu, 0.07, 1.23), (xu, 0.07, 1.33), (xu, 0.06, 1.42), (xu, 0.06, 1.50)], 0.036,
            P['graphite'], g, resolution=6)
    c.tuyau(f'uv{n}_cable', [(xu + 0.06, 0.24, 1.234), (xu + 0.06, 0.28, 1.30), (xu + 0.06, 0.34, 1.335)], 0.008,
            P['plastique_noir'], g)


def dorure(racine, P):
    g = c.vide('dorure', parent=racine)
    xf = 0.96
    flasque_fenetre('dorure_flasque', 0.72, 1.20, Z_BATI, 1.25, (0.80, 1.12, 0.80, 1.17), g, P, P['tole'])
    c.pictogramme_danger('dorure_danger', (1.12, Y_FLASQUE - 0.015, 1.205), g, P)
    c.arret_urgence('dorure_au', (1.12, Y_FLASQUE - 0.015, 0.66), g, P)
    # Pinceur de dorure : rouleau caoutchouté sur la bande, cylindre d'appui dessous.
    rt = rayon('transfert_film')
    rouleau('dorure_pinceur', rt, (xf, 0, Z_BANDE + rt), P['caoutchouc'], g, P, sous_la_bande=False,
            catalogue=CYL['transfert_film'])
    rouleau('dorure_appui', 0.075, (xf, 0, 0.903), P['chrome'], g, P, sous_la_bande=True)
    # Bobines de film : dévidoir à gauche, film usé rembobiné à droite.
    for nom, xb, rb, bord, flanc, sous in (
        ('devidoir', 0.83, 0.12, P['film'], P['flanc_film'], True),
        ('rembobineur', 1.11, 0.085, P['film_use'], P['flanc_film_use'], False),
    ):
        b = c.bobine(c.suivant('rotatif'), rb, 0.42, (xb, 0, 1.6), bord, flanc, 'Y', g)
        c.rotatif(b, rb, sous_la_bande=sous)
        m = c.bobine(c.suivant('rotatif'), 0.038, 0.428, (xb, 0, 1.6), P['carton'], P['flanc_mandrin'], 'Y', g)
        c.rotatif(m, rb, sous_la_bande=sous)
        c.cylindre(f'dorure_{nom}_arbre', 0.022, Y_MUR + 0.25, (xb, (Y_MUR - 0.25) / 2, 1.6), P['acier'], 'Y', g)
        c.cylindre(f'dorure_{nom}_bouchon', 0.03, 0.03, (xb, -0.25, 1.6), P['tole_sombre'], 'Y', g)
        palier_mur(f'dorure_{nom}_palier', xb, 1.6, 0.03, g, P)
    # Film tendu entre les bobines et le pinceur (fixe : seule la bande d'étiquettes défile).
    c.bande('dorure_film_aller', (0.948, 1.585), (xf - rt, Z_BANDE + rt), 0.42, P['film'], g, role=False)
    c.bande('dorure_film_retour', (xf + rt, Z_BANDE + rt), (1.026, 1.585), 0.42, P['film_use'], g, role=False)
    servomoteur('dorure_servo', xf, Z_BANDE + rt, g, P)
    # Diamètre restant de film : ultrasons au-dessus du dévidoir, sur une potence posée sur le mur.
    c.boite('dorure_potence', (0.03, 0.03, 0.13), (0.83, 0.38, 1.825), P['tole_sombre'], g)
    c.boite('dorure_potence_bras', (0.03, 0.46, 0.03), (0.83, 0.165, 1.895), P['tole_sombre'], g)
    c.capteur('dorure_capteur_diametre', 'ultrasons', (0.83, -0.05, 1.78), g, P, 5, 'diametre_film', '-Z')
    # Tension du film : cellule de charge sous le palier du dévidoir.
    c.capteur('dorure_cellule_tension', 'charge', (0.83, Y_MUR - 0.018, 1.6 - 0.052), g, P, 5, 'tension_film', '+Z')
    # Pression de la station : transmetteur sur son bloc, contre le mur.
    c.boite('dorure_bloc_pression', (0.05, 0.04, 0.05), (1.06, Y_MUR - 0.02, 1.15), P['acier'], g)
    c.capteur('dorure_transmetteur', 'pression', (1.06, Y_MUR - 0.04, 1.15), g, P, 5, 'pression', '+Y')
    return g


def poste_decoupe(racine, i, xd, P):
    n = i + 1
    g = c.vide(f'poste_{n}', parent=racine)
    flasque_fenetre(f'poste{n}_flasque', xd - 0.17, xd + 0.17, Z_BATI, 1.21, (xd - 0.11, xd + 0.11, 0.84, 1.13), g, P,
                    P['tole_sombre'], epaisseur=0.05, y=-0.295, rayon=0.03)
    c.pictogramme_danger(f'poste{n}_danger', (xd, -0.3205, 0.79), g, P, taille=0.05)
    # Pont supérieur : vérins de pression et leurs manomètres.
    c.boite(f'poste{n}_pont', (0.30, 0.62, 0.09), (xd, -0.01, 1.255), P['tole_sombre'], g)
    for j, dx in enumerate((-0.07, 0.07)):
        c.bobine(f'poste{n}_manometre_{j + 1}', 0.032, 0.03, (xd + dx, -0.335, 1.255), P['chrome'], P['manometre'], 'Y',
                 g, 32)
    for yv in (-0.22, 0.20):
        c.cylindre(f'poste{n}_verin_{yv}', 0.018, 0.08, (xd, yv, 1.34), P['acier'], 'Z', g)
        c.anneau(f'poste{n}_volant_{yv}', 0.055, 0.045, 0.012, (xd, yv, 1.385), P['chrome'], 'Z', g)
        for a in range(3):
            ang = math.radians(90 + 120 * a)
            c.boite(f'poste{n}_rayon_{yv}_{a}', (0.05, 0.008, 0.006),
                    (xd + 0.025 * math.cos(ang), yv + 0.025 * math.sin(ang), 1.385), P['chrome'], g, chanfrein=0.001,
                    rotation=(0, 0, ang))
        c.cylindre(f'poste{n}_moyeu_{yv}', 0.012, 0.02, (xd, yv, 1.385), P['chrome'], 'Z', g)
    # Cylindre magnétique et sa forme souple ; contre-cylindre ; bagues d'appui (anneaux de Schmitz).
    mag = rouleau(f'poste{n}_magnetique', R_MAGNETIQUE, (xd, 0, Z_MAGNETIQUE), P['acier'], g, P, sous_la_bande=False,
                  catalogue=CYL['magnetique'] if n == 2 else None)
    forme = c.secteur(f'poste{n}_forme', R_FORME, R_MAGNETIQUE + 0.0001, 0.40, 320, (xd, 0, Z_MAGNETIQUE), P['forme'], 'Y',
                      debut_deg=200)
    c.attacher(forme, mag)
    r_contre = rayon('contre_cylindre')
    cc = rouleau(f'poste{n}_contre', r_contre, (xd, 0, Z_CONTRE), P['chrome'], g, P, sous_la_bande=True,
                 catalogue=CYL['contre_cylindre'] if n == 2 else None)
    # Bagues d'appui : elles roulent l'une sur l'autre, leur rayon fixe l'écart entre les deux cylindres.
    r_bague = (Z_MAGNETIQUE - Z_CONTRE) / 2
    for cyl, zc in ((mag, Z_MAGNETIQUE), (cc, Z_CONTRE)):
        for s in (-1, 1):
            bague = c.anneau(f'{cyl.name}_bague_{s}', r_bague, 0.045, 0.022, (xd, s * 0.235, zc), P['chrome'], 'Y')
            c.attacher(bague, cyl)
    servomoteur(f'poste{n}_servo', xd, Z_MAGNETIQUE, g, P)
    if n == 2:
        # Pression de découpe : transmetteur sur le pont, entre les manomètres ; mètres par outil : codeur du servo ;
        # repérage : cellule au-dessus de la bande avant le poste.
        c.capteur('poste2_transmetteur', 'pression', (xd, -0.3205, 1.255), g, P, 6, 'pression', '+Y')
        c.capteur('poste2_codeur_servo', 'codeur', (xd, Y_DOS + 0.27, Z_MAGNETIQUE), g, P, 6, 'metres_outil', '+Y')
        c.capteur('poste2_cellule_reperage', 'cellule', (xd - 0.13, -0.15, Z_BANDE + 0.02), g, P, 6, 'reperage', '-Z')
    return g


def echenillage(racine, P):
    g = c.vide('echenillage', parent=racine)
    flasque_fenetre('ech_flasque', 2.38, 2.92, Z_BATI, 1.12, (2.45, 2.85, 0.86, 1.07), g, P, P['tole'])
    re = rayon('echenillage')
    rouleau('ech_rouleau', re, (2.405, 0, Z_BANDE + re), P['chrome'], g, P, sous_la_bande=False,
            catalogue=CYL['echenillage'])
    b = c.bobine(c.suivant('rotatif'), 0.15, LAIZE, (2.62, 0, 1.52), P['matrice_bord'], P['flanc_matrice'], 'Y', g)
    c.rotatif(b, 0.15, sous_la_bande=True)
    m = c.bobine(c.suivant('rotatif'), 0.038, LAIZE + 0.008, (2.62, 0, 1.52), P['carton'], P['flanc_mandrin'], 'Y', g,
                 24)
    c.rotatif(m, 0.15, sous_la_bande=True)
    c.cylindre('ech_arbre', 0.022, Y_MUR + 0.26, (2.62, (Y_MUR - 0.26) / 2, 1.52), P['acier'], 'Y', g)
    c.cylindre('ech_bouchon', 0.032, 0.03, (2.62, -0.26, 1.52), P['tole_sombre'], 'Y', g)
    palier_mur('ech_palier', 2.62, 1.52, 0.035, g, P)
    rouleau('ech_renvoi', 0.035, (2.86, 0, 0.945), P['chrome'], g, P, sous_la_bande=True)
    servomoteur('ech_servo', 2.62, 1.52, g, P)
    c.arret_urgence('ech_au', (2.84, Y_FLASQUE - 0.015, 0.66), g, P)
    # Tension du déchet : cellule de charge sous le palier de la bobine ; casse du squelette : cellule qui vise le brin
    # montant ; diamètre du déchet : ultrasons au-dessus de la bobine, sur le mur.
    c.capteur('ech_cellule_tension', 'charge', (2.62, Y_MUR - 0.018, 1.52 - 0.062), g, P, 7, 'tension_dechet', '+Z')
    c.capteur('ech_cellule_casse', 'cellule', (2.40, -0.15, 1.36), g, P, 7, 'casse', '+X')
    c.cylindre('ech_cellule_tige', 0.006, Y_MUR + 0.15, (2.36, (Y_MUR - 0.15) / 2, 1.36), P['acier'], 'Y', g)
    c.boite('ech_potence', (0.03, 0.03, 0.08), (2.62, 0.38, 1.80), P['tole_sombre'], g)
    c.boite('ech_potence_bras', (0.03, 0.46, 0.03), (2.62, 0.165, 1.845), P['tole_sombre'], g)
    c.capteur('ech_capteur_diametre', 'ultrasons', (2.62, -0.05, 1.73), g, P, 7, 'diametre_dechet', '-Z')
    return g


def rembobineur(racine, P):
    g = c.vide('rembobineur', parent=racine)
    x, z = 3.22, 1.0
    c.boite('remb_embase', (0.62, 1.02, 0.06), (x - 0.02, 0.04, 0.03), P['tole_sombre'], g)
    c.boite('remb_colonne', (0.34, 0.24, 1.14), (x, 0.38, 0.63), P['tole'], g)
    c.boite('remb_plinthe', (0.346, 0.246, 0.10), (x, 0.38, 0.11), P['tole_sombre'], g, chanfrein=0.004)
    c.boite('remb_chapeau', (0.36, 0.26, 0.03), (x, 0.38, 1.215), P['tole_sombre'], g)
    c.boite('remb_carter_moteur', (0.28, 0.12, 0.30), (x, 0.56, z), P['tole'], g)
    c.cylindre('remb_flasque', 0.09, 0.03, (x, 0.245, z), P['tole_sombre'], 'Y', g)
    c.cylindre('remb_arbre', 0.034, 0.58, (x, -0.03, z), P['acier'], 'Y', g)
    c.cylindre('remb_mandrin', 0.05, 0.05, (x, -0.29, z), P['tole_sombre'], 'Y', g)
    c.cylindre('remb_molette', 0.026, 0.05, (x, -0.335, z), P['chrome'], 'Y', g, segments=8)
    b = c.bobine(c.suivant('rotatif'), 0.30, LAIZE, (x, 0, z), P['bord_etiquettes'], P['flanc_etiquettes'], 'Y', g, None,
                 pas_u=c.PAS_ETIQUETTE)
    c.rotatif(b, 0.30, sous_la_bande=True)
    m = c.bobine(c.suivant('rotatif'), 0.055, LAIZE + 0.008, (x, 0, z), P['carton'], P['flanc_mandrin'], 'Y', g)
    c.rotatif(m, 0.30, sous_la_bande=True)
    c.arret_urgence('remb_au', (x + 0.171, 0.36, 1.06), g, P, '+X')
    # Rouleau presseur posé sur la bobine, au bout d'un bras qui pivote sur la colonne.
    rp = rayon('presseur')
    xp, zp = x - (0.30 + rp) * math.cos(math.radians(45)), z + (0.30 + rp) * math.sin(math.radians(45))
    presseur = rouleau('remb_presseur', rp, (xp, 0, zp), P['caoutchouc'], g, P, sous_la_bande=False, arbre=False,
                       catalogue=CYL['presseur'])
    pivot = (x - 0.12, 1.15)
    long_bras = math.hypot(xp - pivot[0], zp - pivot[1])
    angle = math.atan2(zp - pivot[1], xp - pivot[0])
    c.boite('remb_presseur_bras', (long_bras, 0.025, 0.035), ((xp + pivot[0]) / 2, 0.265, (zp + pivot[1]) / 2),
            P['tole_sombre'], g, rotation=(0, -angle, 0))
    c.cylindre('remb_presseur_pivot', 0.025, 0.03, (pivot[0], 0.265, pivot[1]), P['acier'], 'Y', g)
    c.cylindre('remb_presseur_arbre', rp * 0.4, 0.015, (xp, 0.2575, zp), P['acier'], 'Y', g)
    # Diamètre de rembobinage : ultrasons au-dessus de la bobine ; comptage : fourche à étiquettes sur le bord de la
    # bande ; tension : cellule de charge sous le palier du dernier renvoi.
    c.boite('remb_potence', (0.03, 0.03, 0.32), (x, 0.38, 1.39), P['tole_sombre'], g)
    c.boite('remb_potence_bras', (0.03, 0.46, 0.03), (x, 0.165, 1.535), P['tole_sombre'], g)
    c.capteur('remb_capteur_diametre', 'ultrasons', (x, -0.05, 1.42), g, P, 8, 'diametre', '-Z')
    c.capteur('remb_fourche_comptage', 'fourche', (2.72, -0.20, Z_BANDE), g, P, 8, 'comptage', '+Y')
    c.cylindre('remb_fourche_tige', 0.008, 0.28, (2.72, -0.25, 0.80), P['acier'], 'Z', g)
    c.capteur('remb_cellule_tension', 'charge', (2.86, Y_MUR - 0.018, 0.945 - 0.035 * 0.94), g, P, 8, 'tension', '+Z')
    return g


def bandes(racine, P):
    """Chemin de bande, dans l'ordre des anciens nœuds bande_N."""
    g = c.vide('bande', parent=racine)
    re = rayon('echenillage')
    c.bande('bande_1', (2.405 + re, Z_BANDE + re), (2.47, 1.52), LAIZE, P['bande_matrice'], g)
    c.bande('bande_2', (-3.62, 1.42), (-3.12, 1.40), LAIZE, P['bande_vierge'], g)
    c.bande('bande_3', (-3.12, 1.40), (-2.92, Z_BANDE), LAIZE, P['bande_vierge'], g)
    c.bande('bande_4', (-2.92, Z_BANDE), (-2.62, Z_BANDE), LAIZE, P['bande_vierge'], g)
    c.bande('bande_5', (-2.62, Z_BANDE), (1.20, Z_BANDE), LAIZE, P['bande_imprimee'], g)
    c.bande('bande_6', (1.20, Z_BANDE), (2.36, Z_BANDE), LAIZE, P['bande_imprimee'], g)
    c.bande('bande_7', (2.36, Z_BANDE), (2.86, Z_BANDE), LAIZE, P['bande_decoupee'], g)
    c.bande('bande_8', (2.86, Z_BANDE), (3.22, 1.30), LAIZE, P['bande_decoupee'], g)
    return g


def pupitre(racine, x, nom, ecran, P):
    """Pupitre sur pied devant la presse : écran tactile incliné, boutons, arrêt d'urgence."""
    import bmesh

    g = c.vide(f'pupitre_{nom}', parent=racine)
    inclinaison = math.radians(-8)
    c.boite(f'pup_{nom}_embase', (0.34, 0.30, 0.02), (x, -0.72, 0.01), P['tole_sombre'], g)
    c.cylindre(f'pup_{nom}_colonne', 0.032, 1.0, (x, -0.70, 0.52), P['graphite'], 'Z', g)
    c.boite(f'pup_{nom}_tete', (0.52, 0.055, 0.34), (x, -0.715, 1.248), P['tole_sombre'], g, rotation=(inclinaison, 0, 0))
    c.boite(f'pup_{nom}_rotule', (0.08, 0.06, 0.08), (x, -0.69, 1.06), P['graphite'], g)
    c.boite(f'pup_{nom}_commandes', (0.30, 0.07, 0.05), (x, -0.72, 0.99), P['graphite'], g)
    c.arret_urgence(f'pup_{nom}_au', (x + 0.09, -0.72, 1.015), g, P, '+Z')
    c.bouton(f'pup_{nom}_marche', (x - 0.03, -0.72, 1.015), P['vert_bouton'], g, P, '+Z')
    c.bouton(f'pup_{nom}_arret', (x - 0.08, -0.72, 1.015), P['plastique_noir'], g, P, '+Z')
    # Écran : plan texturé, face avant, posé sur la tête inclinée.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    w, h = 0.46, 0.288
    coins = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    f = bm.faces.new([bm.verts.new((u, 0, v)) for u, v in coins])
    for loop, (u, v) in zip(f.loops, coins):
        loop[uv].uv = (u / w + 0.5, v / h + 0.5)
    e = c._objet('ecran_ihm', bm, ecran, g, (0, 0, 0), (0, 0, 0), None, 0)
    e.rotation_euler = (inclinaison, 0, 0)
    e.location = (x, -0.7435, 1.248)
    e['role'] = 'ecran'
    return g


def colonne_lumineuse(racine, P):
    g = c.vide('colonne_lumineuse', parent=racine)
    x, y = -2.62, 0.39
    c.cylindre('colonne_pied', 0.03, 0.015, (x, y, 1.3275), P['graphite'], 'Z', g)
    c.cylindre('colonne_mat', 0.012, 0.41, (x, y, 1.54), P['acier'], 'Z', g)
    c.cylindre('colonne_douille', 0.032, 0.012, (x, y, 1.751), P['plastique_noir'], 'Z', g)
    for nom, zv, mat, etat in (('voyant_vert', 1.785, P['vert'], 'marche'), ('voyant_orange', 1.8435, P['orange'],
                                                                              'attention'),
                               ('voyant_rouge', 1.901, P['rouge'], 'arret')):
        v = c.cylindre(nom, 0.032, 0.054, (x, y, zv), mat, 'Z', g, None, chanfrein=0.002)
        v['role'] = 'voyant'
        v['etat'] = etat
    for i, zv in enumerate((1.8135, 1.8725)):
        c.cylindre(f'colonne_bague_{i}', 0.0325, 0.004, (x, y, zv), P['plastique_noir'], 'Z', g, None, chanfrein=0.0005)
    c.cylindre('colonne_chapeau', 0.032, 0.02, (x, y, 1.938), P['plastique_noir'], 'Z', g)
    return g


def extraction(racine, P):
    """Gaine d'extraction de l'air des lampes UV, sur consoles fixées au mur, et sa remontée vers le toit."""
    g = c.vide('extraction', parent=racine)
    x0, x1 = -2.74, 0.68
    c.boite('gaine_horizontale', (x1 - x0, 0.22, 0.12), ((x0 + x1) / 2, 0.06, 1.54), P['galva'], g)
    c.boite('gaine_montante', (0.22, 0.22, 0.50), (-2.85, 0.06, 1.72), P['galva'], g)
    c.boite('gaine_coude', (0.22, 0.22, 0.12), (-2.85, 0.06, 1.54), P['galva'], g)
    for i, xj in enumerate((-1.9, -0.95, 0.0)):
        c.boite(f'gaine_joint_{i}', (0.02, 0.232, 0.132), (xj, 0.06, 1.54), P['acier'], g, chanfrein=0.002)
    for i, xs in enumerate((-2.2, -1.25, -0.3, 0.55)):
        c.boite(f'gaine_console_pied_{i}', (0.04, 0.04, 0.26), (xs, 0.40, 1.45), P['graphite'], g)
        c.boite(f'gaine_console_bras_{i}', (0.04, 0.38, 0.03), (xs, 0.23, 1.465), P['graphite'], g)
    return g


# --- Assemblage ------------------------------------------------------------------------------------------------


def construire():
    P = matieres()
    fiche = c.kit_machine(MACHINE)
    racine = c.vide(MACHINE, props={'machine': fiche['nom'], 'fiabilite': 'Source directe', 'unite': 'metre',
                                    'axeHaut': 'Y'})
    groupes = [
        bati(racine, P),
        mur(racine, P),
        derouleur(racine, P),
        entree(racine, P),
        *[groupe_impression(racine, k, P) for k in range(8)],
        dorure(racine, P),
        *[poste_decoupe(racine, i, xd, P) for i, xd in enumerate(X_POSTES)],
        echenillage(racine, P),
        rembobineur(racine, P),
        pupitre(racine, -1.05, 'impression', P['ecran_impression'], P),
        pupitre(racine, 1.85, 'decoupe', P['ecran_decoupe'], P),
        colonne_lumineuse(racine, P),
        extraction(racine, P),
    ]
    bandes(racine, P)
    g_socle = socle(racine, P)
    ombre = c.ombre_au_sol('socle_6', -4.18, 4.03, -1.23, 0.93, 0.003)
    ombre['role'] = 'socle'
    ombre.parent = g_socle
    c.points_diagnostic(
        [(p['numero'], p['nom'], c.depuis_gltf(p['position'])) for p in fiche['points_diagnostic']], racine)
    c.reperes([(r['texte'], c.depuis_gltf(r['position'])) for r in fiche['reperes']], racine)
    return racine, groupes


def vues(objets):
    v = c.vues_par_defaut(objets)
    v['groupe'] = dict(position=(-2.9, -1.35, 1.55), cible=(-2.0, 0, 0.95), focale=45)
    v['decoupe'] = dict(position=(1.2, -1.3, 1.6), cible=(1.95, 0, 1.05), focale=45)
    v['dorure'] = dict(position=(0.4, -1.4, 1.8), cible=(0.96, 0, 1.3), focale=45)
    v['derouleur'] = dict(position=(-4.6, -1.4, 1.6), cible=(-3.4, 0, 1.0), focale=40)
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
