"""
Rotative offset étiquettes du kit : machine type, bande étroite (laize 420 mm), six groupes offset à encres UV, séchage
UV entre les groupes et en sortie, découpe rotative, échenillage et rembobinage en ligne.

  blender --background --factory-startup --python data/kit/blender/offset.py -- [--apercu <dossier>] [--vues a,b]

La disposition reprend celle de l'ancien modèle, que le reste de l'application connaît : bande à 0,86 m, groupes aux
mêmes abscisses (pas de 0,62 m), mêmes axes pour le cylindre d'impression, le blanchet et le porte-plaque, la découpe
et les trois bobines ; points de diagnostic et repères lus dans machines.json ; emprise de MODEL_FOOTPRINT
(domain/catalog.ts).

Chaque groupe suit le dessin d'un groupe offset bande étroite : deux bâtis latéraux, celui du côté conducteur ouvert
d'une grande fenêtre ; sous la bande le cylindre d'impression, au-dessus le blanchet puis le porte-plaque ; à gauche du
porte-plaque le mouillage (bac, plongeur, doseur, toucheur), à droite et au-dessus le train d'encrage en cascade
(toucheurs, distributeurs oscillants, intermédiaires, preneur, rouleau d'encrier) sous l'encrier et ses vis. Les
rouleaux de l'ancien modèle flottaient sans se toucher : ici leurs centres sont calculés de proche en proche pour que
chacun porte sur ses voisins. Machine type, sans logo ni livrée.
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as c  # noqa: E402

MACHINE = 'offset'
Z_BANDE = 0.86
LAIZE = 0.42
LONG = 0.50  # cylindres et rouleaux, entre les bâtis
X_GROUPES = [round(-2.42 + 0.62 * k, 3) for k in range(6)]
# Encres des six groupes : quadrichromie, puis orange et vert en tons directs.
ENCRES = ['#1d8fd1', '#cf2479', '#f2c511', '#1c1c1c', '#e8641b', '#2e9d4f']
Z_BATI = 0.30  # dessus du bâti commun, pied des groupes
X_BATI = (-3.17, 2.38)
Y_AVANT = -0.3275  # milieu du bâti latéral côté conducteur
EP_AVANT = 0.035
Y_FACE = Y_AVANT - EP_AVANT / 2  # face avant des bâtis, côté conducteur
Y_ARRIERE = 0.31  # face intérieure du bâti côté entraînement
EP_ARRIERE = 0.07
Y_DOS = Y_ARRIERE + EP_ARRIERE
DX_BATI = (-0.26, 0.29)  # bâtis latéraux d'un groupe, autour de son abscisse
Z_HAUT = 1.90
FENETRE = (-0.222, 0.625, 0.258, 1.755)  # ouverture du bâti conducteur (dx0, z0, dx1, z1)
# Plaque et toile de blanchet, posées sur le corps de leur cylindre : le corps garde le diamètre du catalogue.
EP_HABILLAGE = 0.0012
# Groupes dont le point de diagnostic porte les cylindres et capteurs du catalogue (machines.json).
G_MOUILLAGE, G_ENCRAGE, G_PLAQUE, G_VITESSE = 2, 5, 4, 3


def matieres():
    P = c.palette()
    P.update(
        plaque=c.matiere('plaque_offset', '#7c93a6', 0.65, 0.32),
        blanchet=c.matiere('blanchet', '#2c3a52', 0.0, 0.66),
        eau=c.matiere('eau_mouillage', '#b9d8e4', 0.0, 0.06),
        forme=c.matiere('forme_decoupe', '#8f959b', 0.9, 0.34),
        carton=c.matiere('carton_mandrin', '#a67b4e', 0.0, 0.8),
        matrice_bord=c.matiere('papier_matrice', '#ece6d3', 0.0, 0.85),
        temoin=c.matiere('temoin_uv', '#ff8a1c', 0.0, 0.3),
        vert=c.matiere('voyant_vert', '#27c46a', 0.0, 0.3),
        orange=c.matiere('voyant_orange', '#ff9a1a', 0.0, 0.3),
        rouge=c.matiere('voyant_rouge', '#ff3a2e', 0.0, 0.3),
        flanc_papier=c.matiere('flanc_papier', '#ffffff', 0.0, 0.8, image='bobine_papier_flanc.png'),
        flanc_mandrin=c.matiere('flanc_mandrin', '#ffffff', 0.0, 0.8, image='mandrin_carton.png'),
        flanc_matrice=c.matiere('flanc_matrice', '#ffffff', 0.0, 0.8, image='bobine_matrice_flanc.png'),
        flanc_etiquettes=c.matiere('flanc_etiquettes', '#ffffff', 0.0, 0.7, image='bobine_etiquettes_flanc.png'),
        bord_etiquettes=c.matiere('bord_etiquettes', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        manometre=c.matiere('cadran_manometre', '#ffffff', 0.0, 0.3, image='manometre.png'),
        bande_vierge=c.matiere('bande_vierge', '#ffffff', 0.0, 0.8, image='bande_vierge.png'),
        bande_imprimee=c.matiere('bande_imprimee', '#ffffff', 0.0, 0.5, image='bande_imprimee.png'),
        bande_decoupee=c.matiere('bande_decoupee', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        bande_matrice=c.matiere('bande_matrice', '#ffffff', 0.0, 0.7, image='bande_matrice.png', masque=True),
        ecran=c.matiere('ecran_offset', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8, image='offset_ecran.png'),
    )
    # Encre des rouleaux encreurs et de l'encrier : brillante, c'est elle qu'on voit sur un train d'encrage en marche.
    P['encres'] = [c.matiere(f'encre_{k + 1}', h, 0.0, 0.24) for k, h in enumerate(ENCRES)]
    return P


# --- Géométrie des trains de rouleaux --------------------------------------------------------------------------


def autour(centre, rayon, angle_deg, rayon2):
    """Centre d'un rouleau de rayon `rayon2` posé sur un autre, à l'angle donné (degrés, plan de face)."""
    a = math.radians(angle_deg)
    d = rayon + rayon2
    return (centre[0] + d * math.cos(a), centre[1] + d * math.sin(a))


def entre(a, ra, b, rb, r, gauche):
    """Centre d'un rouleau de rayon `r` qui touche les rouleaux a et b, à gauche (ou à droite) du sens a vers b."""
    da, db = ra + r, rb + r
    d = math.hypot(b[0] - a[0], b[1] - a[1])
    l = (da * da - db * db + d * d) / (2 * d)
    h = math.sqrt(max(0.0, da * da - l * l))
    ux, uz = (b[0] - a[0]) / d, (b[1] - a[1]) / d
    s = 1 if gauche else -1
    return (a[0] + l * ux - s * h * uz, a[1] + l * uz + s * h * ux)


def tangente(c1, r1, cote1, c2, r2, cote2):
    """
    Brin de bande tendu d'un rouleau à l'autre : `cote` vaut +1 si le rouleau est à gauche du sens de marche, -1 s'il
    est à droite. Rend les deux points de tangence (x, z).
    """
    p1, p2 = cote1 * r1, cote2 * r2
    dx, dz = c2[0] - c1[0], c2[1] - c1[1]
    theta = math.atan2(dz, dx) + math.acos((p2 - p1) / math.hypot(dx, dz))
    nx, nz = math.cos(theta), math.sin(theta)
    return (c1[0] - p1 * nx, c1[1] - p1 * nz), (c2[0] - p2 * nx, c2[1] - p2 * nz)


def train_encrage():
    """
    Train d'encrage d'un groupe, de la plaque vers l'encrier : (nom, (dx, z), rayon, nature, sous, cylindre du
    catalogue). La plaque tourne en sens horaire ; chaque contact inverse le sens, d'où `sous` (le dessus du rouleau
    avance avec la bande). Toucheurs et distributeurs aux diamètres du catalogue ; angles choisis pour que la cascade
    monte jusqu'à l'encrier sans sortir des bâtis.
    """
    p, rp = PLAQUE
    rp += EP_HABILLAGE
    rt = rayon_catalogue('Rouleau toucheur encreur')
    rd = rayon_catalogue('Rouleau distributeur oscillant')
    ri = 0.030
    t1, t2, t3 = (autour(p, rp, a, rt) for a in (-5, 45, 95))
    d1 = entre(t1, rt, t2, rt, rd, gauche=False)
    d2 = entre(t2, rt, t3, rt, rd, gauche=False)
    i1 = entre(d1, rd, d2, rd, ri, gauche=False)
    d3 = autour(i1, ri, 75, rd)
    i2 = autour(d3, rd, 125, ri)
    d4 = autour(i2, ri, 65, rd)
    i3 = autour(d4, rd, 120, ri)
    d5 = autour(i3, ri, 70, rd)
    preneur = autour(d5, rd, 110, 0.028)
    encrier = autour(preneur, 0.028, 80, 0.045)
    return [
        ('toucheur_1', t1, rt, 'encre', False, 'Rouleau toucheur encreur'),
        ('toucheur_2', t2, rt, 'encre', False, None),
        ('toucheur_3', t3, rt, 'encre', False, None),
        ('distributeur_1', d1, rd, 'chrome', True, 'Rouleau distributeur oscillant'),
        ('distributeur_2', d2, rd, 'chrome', True, None),
        ('intermediaire_1', i1, ri, 'encre', False, None),
        ('distributeur_3', d3, rd, 'chrome', True, None),
        ('intermediaire_2', i2, ri, 'encre', False, None),
        ('distributeur_4', d4, rd, 'chrome', True, None),
        ('intermediaire_3', i3, ri, 'encre', False, None),
        ('distributeur_5', d5, rd, 'chrome', True, None),
        ('preneur', preneur, 0.028, 'encre', False, None),
        ('rouleau_encrier', encrier, 0.045, 'chrome', True, None),
    ]


def train_mouillage():
    """Mouillage : toucheur sur la plaque, doseur chromé, plongeur trempé dans le bac."""
    p, rp = PLAQUE
    rm = rayon_catalogue('Rouleau mouilleur')
    toucheur = autour(p, rp + EP_HABILLAGE, 150, rm)
    doseur = autour(toucheur, rm, 170, 0.028)
    plongeur = autour(doseur, 0.028, 215, 0.034)
    return [
        ('toucheur_mouillage', toucheur, rm, 'caoutchouc', False, 'Rouleau mouilleur'),
        ('doseur', doseur, 0.028, 'chrome', True, None),
        ('plongeur', plongeur, 0.034, 'caoutchouc', False, None),
    ]


def rayon_catalogue(nom):
    return c.diametre_catalogue(MACHINE, nom) / 2000


# Cylindres d'un groupe : (dx, z), rayon, aux diamètres du catalogue (développement / π). Le contre-cylindre double
# développement est deux fois plus gros que le porte-plaque et le blanchet ; bande pincée entre lui et le blanchet,
# porte-plaque posé sur le blanchet en haut à droite, comme dans un groupe offset bande étroite.
R_IMPRESSION = rayon_catalogue('Cylindre de contre-pression (double développement)')
R_BLANCHET = rayon_catalogue('Cylindre porte-blanchet')
R_PLAQUE = rayon_catalogue('Cylindre porte-plaque')
IMPRESSION = ((0.0, Z_BANDE - 0.0008 - R_IMPRESSION), R_IMPRESSION)
_Z_BLANCHET = Z_BANDE + 0.0005 + R_BLANCHET + EP_HABILLAGE
BLANCHET = ((0.0, _Z_BLANCHET), R_BLANCHET)
PLAQUE = (autour((0.0, _Z_BLANCHET), R_BLANCHET + EP_HABILLAGE, 67.5, R_PLAQUE + EP_HABILLAGE), R_PLAQUE)
ENCRAGE = train_encrage()
MOUILLAGE = train_mouillage()


# --- Pièces répétées -------------------------------------------------------------------------------------------


def rouleau(rayon, x, z, mat, g, P, sous, longueur=LONG, arbre=True, ecrou=False, segments=None):
    """
    Rouleau entre les bâtis : corps tournant (rotatif_N), arbre fixe d'un bâti à l'autre et écrou de bout côté
    conducteur sur les gros cylindres. Arbre et écrou sont coaxiaux : leur rotation ne se verrait pas, ils restent avec
    les pièces fixes du groupe, que l'export fusionne (moins de nœuds, un .glb plus léger).
    """
    # Sous 5 cm de rayon, le chanfrein des bouts ne se lit plus à l'échelle de l'atelier : arêtes vives, deux fois
    # moins de triangles sur la centaine de rouleaux de la presse.
    chanfrein = 0 if rayon < 0.05 else None
    if segments is None and rayon < 0.05:
        segments = 16
    corps = c.cylindre(c.suivant('rotatif'), rayon, longueur, (x, 0, z), mat, 'Y', g, segments=segments,
                       chanfrein=chanfrein)
    c.rotatif(corps, rayon, sous)
    # Les petits rouleaux du train d'encrage se passent de bout d'arbre : à cette taille il ne se lit plus, et le
    # poids du modèle va aux capteurs.
    if arbre and rayon >= 0.04:
        # L'arbre dépasse à peine côté conducteur et rentre dans le bâti côté entraînement.
        y0, y1 = -longueur / 2 - 0.015, Y_ARRIERE + 0.01
        c.cylindre(f'{corps.name}_arbre', max(0.007, rayon * 0.32), y1 - y0, (x, (y0 + y1) / 2, z), P['acier'], 'Y',
                   g, segments=6, chanfrein=0)
    if ecrou:
        c.cylindre(f'{corps.name}_ecrou', rayon * 0.2, 0.012, (x, -longueur / 2 - 0.006, z), P['tole_sombre'], 'Y',
                   g, segments=6, chanfrein=0)
    return corps


def bague(nom, rayon, x, z, g, P, longueur=LONG):
    """
    Bagues d'appui (anneaux de roulement) aux deux bouts d'un cylindre : elles roulent sur celles du voisin. De
    révolution, elles restent fixes avec le groupe sans que l'œil voie la différence.
    """
    for s in (-1, 1):
        c.cylindre(f'{nom}_{"av" if s < 0 else "ar"}', rayon, 0.022, (x, s * (longueur / 2 - 0.013), z), P['chrome'],
                   'Y', g, segments=20, chanfrein=0)


def contour_bati(x0, x1, z0, z1, r=0.04):
    """Bâti latéral : pied droit sur le bâti commun, haut arrondi."""
    return [(x0, z0), (x1, z0)] + c.arc(x1 - r, z1 - r, r, 0, 90) + c.arc(x0 + r, z1 - r, r, 90, 180)


def bati_fenetre(nom, x0, x1, z0, z1, fenetre, g, P, mat, ep=EP_AVANT, y=Y_AVANT, rayon=0.04, vis=True):
    """Bâti côté conducteur, ouvert d'une fenêtre qui montre les bouts des rouleaux ; quatre vis aux coins."""
    b = c.profil(nom, contour_bati(x0, x1, z0, z1, rayon), ep, y, mat, g)
    fx0, fz0, fx1, fz1 = fenetre
    outil = c.profil(f'{nom}_outil', c.rectangle_arrondi(fx0, fz0, fx1, fz1, 0.03), ep * 4, y, None, chanfrein=0)
    c.percer(b, outil)
    face = y - ep / 2
    coins = (((x0 + fx0) / 2, fz0 + 0.04), ((x1 + fx1) / 2, fz0 + 0.04), ((x0 + fx0) / 2, fz1 - 0.04),
             ((x1 + fx1) / 2, fz1 - 0.04)) if vis else ()
    for i, (xv, zv) in enumerate(coins):
        c.vis(f'{nom}_vis{i + 1}', (xv, face, zv), g, P['acier'])
    return b


def servomoteur(nom, x, z, g, P, rayon=0.06, longueur=0.18, y0=Y_DOS + 0.10, cable=True):
    """Servomoteur au dos du carter d'entraînement, connecteur et câble vers le chemin de câbles."""
    y = y0 + longueur / 2
    n = 12 if rayon > 0.05 else 10
    c.cylindre(nom, rayon, longueur, (x, y, z), P['graphite'], 'Y', g, segments=n, chanfrein=0)
    c.cylindre(f'{nom}_capot', rayon * 0.82, 0.025, (x, y0 + longueur + 0.0125, z), P['tole_sombre'], 'Y', g,
               segments=n, chanfrein=0)
    if not cable:
        return
    c.boite(f'{nom}_connecteur', (0.045, 0.05, 0.03), (x, y, z + rayon + 0.013), P['plastique_noir'], g, chanfrein=0)
    c.tuyau(f'{nom}_cable', [(x, y + 0.01, z + rayon + 0.028), (x + 0.04, y + 0.06, z + 0.02),
                             (x + 0.05, 0.56, 0.47)], 0.0065, P['plastique_noir'], g, resolution=3)


def bobine_sur_colonne(nom, x, z, rayon, bord, flanc, sous, g, P, pas_u=None, y_colonne=0.30):
    """Bobine en porte-à-faux sur l'arbre expansible d'une colonne : bobine et mandrin carton tournent ensemble."""
    long_arbre = y_colonne + 0.27
    c.cylindre(f'{nom}_flasque', 0.085, 0.03, (x, y_colonne - 0.015, z), P['tole_sombre'], 'Y', g, segments=24)
    c.cylindre(f'{nom}_arbre', 0.032, long_arbre, (x, y_colonne - long_arbre / 2, z), P['acier'], 'Y', g)
    c.cylindre(f'{nom}_mandrin', 0.048, 0.05, (x, -0.29, z), P['tole_sombre'], 'Y', g)
    c.cylindre(f'{nom}_molette', 0.025, 0.04, (x, -0.33, z), P['chrome'], 'Y', g, segments=8)
    b = c.bobine(c.suivant('rotatif'), rayon, LAIZE, (x, 0, z), bord, flanc, 'Y', g, min(56, int(rayon * 180) // 4 * 4),
                 pas_u=pas_u)
    c.rotatif(b, rayon, sous)
    m = c.bobine(c.suivant('rotatif'), 0.055, LAIZE + 0.008, (x, 0, z), P['carton'], P['flanc_mandrin'], 'Y', g, 28)
    c.rotatif(m, rayon, sous)
    return b


def colonne_bobine(nom, x, g, P, haut=1.20, carter=0.92):
    """Colonne d'un dérouleur ou d'un rembobineur : embase, fût, chapeau, carter du frein ou du moteur au dos."""
    c.boite(f'{nom}_embase', (0.56, 1.0, 0.12), (x, 0.0, 0.06), P['tole_sombre'], g, segments=1)
    c.boite(f'{nom}_colonne', (0.32, 0.20, haut - 0.12), (x, 0.40, (haut + 0.12) / 2), P['tole'], g, segments=1)
    c.boite(f'{nom}_plinthe', (0.326, 0.206, 0.09), (x, 0.40, 0.165), P['tole_sombre'], g, chanfrein=0.004,
            segments=1)
    c.boite(f'{nom}_chapeau', (0.34, 0.22, 0.03), (x, 0.40, haut + 0.015), P['tole_sombre'], g, segments=1)
    c.boite(f'{nom}_carter', (0.26, 0.12, 0.30), (x, 0.56, carter), P['tole'], g)


# --- Bâti et postes --------------------------------------------------------------------------------------------


def socle(racine, P):
    """Dalle et marquage au sol de l'ancien modèle, aux mêmes dimensions."""
    g = c.vide('socle', parent=racine)
    x0, x1, y0, y1 = -4.0, 3.45, -1.25, 0.90
    dalle = c.boite('socle_1', (x1 - x0, y1 - y0, 0.07), ((x0 + x1) / 2, (y0 + y1) / 2, -0.035), P['sol'], g,
                    chanfrein=0.012)
    dalle['role'] = 'socle'
    lx0, lx1, ly0, ly1, e = -3.86, 3.31, -1.11, 0.76, 0.034
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
    """Bâti commun des groupes : caisson sur pieds réglables, trappes d'accès, chemin de câbles au dos."""
    g = c.vide('bati', parent=racine)
    x0, x1 = X_BATI
    xm, L = (x0 + x1) / 2, x1 - x0
    y0, y1 = -0.42, 0.46
    c.boite('bati_caisson', (L, y1 - y0, Z_BATI - 0.08), (xm, (y0 + y1) / 2, (Z_BATI + 0.08) / 2), P['tole_sombre'],
            g)
    c.boite('bati_plinthe', (L - 0.06, y1 - y0 - 0.06, 0.06), (xm, (y0 + y1) / 2, 0.05), P['graphite'], g,
            chanfrein=0.003)
    c.boite('bati_lisere', (L + 0.004, 0.012, 0.012), (xm, y0 - 0.002, Z_BATI - 0.006), P['inox'], g, chanfrein=0.002)
    n = 9
    w = (L - 0.06) / n
    for i in range(n):
        xp = x0 + 0.03 + w * (i + 0.5)
        c.boite(f'bati_trappe_{i + 1}', (w - 0.03, 0.008, 0.16), (xp, y0 - 0.004, 0.19), P['tole_sombre'], g,
                segments=1)
        c.boite(f'bati_poignee_{i + 1}', (0.09, 0.02, 0.014), (xp + w / 2 - 0.12, y0 - 0.016, 0.235), P['chrome'], g,
                chanfrein=0)
        c.boite(f'bati_grille_{i + 1}', (0.20, 0.004, 0.08), (xp - 0.1, y0 - 0.009, 0.17), P['graphite'], g,
                chanfrein=0)
    for i in range(6):
        xp = x0 + 0.12 + (L - 0.24) * i / 5
        for yp in (-0.33, 0.37):
            c.cylindre(f'bati_pied_{i}_{yp}', 0.026, 0.06, (xp, yp, 0.05), P['acier'], 'Z', g, segments=6,
                       chanfrein=0)
            c.cylindre(f'bati_semelle_{i}_{yp}', 0.05, 0.02, (xp, yp, 0.01), P['caoutchouc'], 'Z', g, segments=10,
                       chanfrein=0)
    # Chemin de câbles des servomoteurs, sur consoles au dos du caisson.
    c.boite('bati_chemin_cables', (L - 0.6, 0.12, 0.05), (xm + 0.2, 0.56, 0.45), P['galva'], g)
    for i in range(5):
        xs = x0 + 0.5 + (L - 0.9) * i / 4
        c.boite(f'bati_console_{i}', (0.03, 0.14, 0.03), (xs, 0.52, 0.41), P['graphite'], g)
    return g


def derouleur(racine, P):
    g = c.vide('derouleur', parent=racine)
    x, z = -3.45, 0.92
    colonne_bobine('derouleur', x, g, P)
    # La bande part du dessous de la bobine vers le rouleau d'entrée : la bobine tourne dans le sens anti-horaire.
    bobine_sur_colonne('derouleur', x, z, 0.40, P['papier'], P['flanc_papier'], False, g, P)
    # Capteur de diamètre à ultrasons au-dessus de la bobine, sur sa potence, visant le haut du rouleau de papier.
    c.boite('derouleur_potence', (0.04, 0.04, 0.24), (x + 0.12, 0.40, 1.335), P['graphite'], g)
    c.boite('derouleur_bras', (0.04, 0.40, 0.03), (x + 0.12, 0.22, 1.44), P['graphite'], g)
    c.capteur('ultrasons_diametre', 'ultrasons', (x + 0.12, 0.04, 1.37), g, P, 1, 'diametre', normale='-Z')
    c.arret_urgence('derouleur_au', (x - 0.161, 0.40, 1.06), g, P, '-X')
    c.pictogramme_danger('derouleur_danger', (x - 0.161, 0.40, 0.80), g, P, normale='-X')
    return g


# Rouleau de renvoi de l'entrée, sous la bande : centre (x, z), rayon.
RENVOI = ((-2.9, Z_BANDE - 0.0008 - rayon_catalogue('Rouleau de renvoi')), rayon_catalogue('Rouleau de renvoi'))


def entree(racine, P):
    """Groupe d'entrée : rouleau d'appel et son presseur pneumatique, puis le capteur du guide-bande."""
    g = c.vide('entree', parent=racine)
    xe = -2.9
    x0, x1, zt = xe - 0.11, xe + 0.11, 1.02
    bati_fenetre('entree_bati', x0, x1, Z_BATI, zt, (xe - 0.075, 0.845, xe + 0.075, 0.975), g, P, P['tole'],
                 rayon=0.03)
    c.profil('entree_bati_arriere', contour_bati(x0, x1, Z_BATI, zt, 0.03), EP_ARRIERE, Y_ARRIERE + EP_ARRIERE / 2,
             P['tole'], g)
    (_, zr), rr = RENVOI
    renvoi = rouleau(rr, xe, zr, P['chrome'], g, P, sous=True)
    c.cylindre_catalogue(renvoi, 'Rouleau de renvoi', rr * 2000)
    # Tension de bande : le palier du renvoi repose sur une cellule de charge, côté conducteur.
    c.boite('entree_palier', (0.07, 0.03, 0.05), (xe, Y_FACE - 0.015, zr), P['graphite'], g)
    c.cylindre('entree_palier_arbre', 0.012, 0.012, (xe, Y_FACE - 0.036, zr), P['acier'], 'Y', g, segments=8,
               chanfrein=0)
    c.capteur('cellule_charge_derouleur', 'charge', (xe, Y_FACE - 0.016, zr - 0.025), g, P, 1, 'tension',
              normale='+Z')
    rouleau(0.035, xe, 0.896, P['caoutchouc'], g, P, sous=False, longueur=0.46, ecrou=True)
    # Vérin du presseur, sur la face du bâti.
    c.cylindre('entree_verin', 0.016, 0.10, (xe + 0.085, Y_FACE - 0.02, 0.93), P['inox'], 'Z', g, segments=12)
    c.cylindre('entree_tige', 0.006, 0.05, (xe + 0.085, Y_FACE - 0.02, 0.865), P['chrome'], 'Z', g, segments=8)
    servomoteur('entree_servo', xe, 0.825, g, P, rayon=0.05, longueur=0.15, y0=Y_DOS)
    # Capteur de bord de bande en fourche, sur son poteau.
    xg = -2.725
    c.cylindre('guide_poteau', 0.012, 0.52, (xg, -0.25, Z_BATI + 0.26), P['acier'], 'Z', g, segments=10)
    c.boite('guide_capteur', (0.04, 0.03, 0.075), (xg, -0.25, Z_BANDE), P['plastique_noir'], g)
    c.boite('guide_bec_haut', (0.035, 0.05, 0.012), (xg, -0.22, Z_BANDE + 0.018), P['plastique_noir'], g)
    c.boite('guide_bec_bas', (0.035, 0.05, 0.012), (xg, -0.22, Z_BANDE - 0.018), P['plastique_noir'], g)
    return g


def groupe_offset(racine, k, P):
    x = X_GROUPES[k]
    n = k + 1
    g = c.vide(f'groupe_{n}', parent=racine)
    encre = P['encres'][k]
    batis_groupe(g, n, x, encre, P)
    cylindres(g, n, x, P)
    encrage(g, n, x, encre, P)
    mouillage(g, n, x, P)
    entrainement(g, n, x, P)
    commandes(g, n, x, k, P)
    if n < 6:
        secheur_inter(g, n, x + (DX_BATI[1] + 0.62 + DX_BATI[0]) / 2, P)
    return g


def batis_groupe(g, n, x, encre, P):
    x0, x1 = x + DX_BATI[0], x + DX_BATI[1]
    fx0, fz0, fx1, fz1 = FENETRE
    bati_fenetre(f'g{n}_bati_avant', x0, x1, Z_BATI, Z_HAUT, (x + fx0, fz0, x + fx1, fz1), g, P, P['tole'],
                 vis=False)
    c.profil(f'g{n}_bati_arriere', contour_bati(x0, x1, Z_BATI, Z_HAUT), EP_ARRIERE, Y_ARRIERE + EP_ARRIERE / 2,
             P['tole'], g)
    # Chapeau qui relie les deux bâtis, carter bas entre eux, entretoises.
    c.boite(f'g{n}_chapeau', (x1 - x0 + 0.01, Y_DOS - Y_FACE + 0.01, 0.035), ((x0 + x1) / 2, (Y_DOS + Y_FACE) / 2,
                                                                             Z_HAUT + 0.0175), P['tole_sombre'], g,
            segments=1)
    c.boite(f'g{n}_carter_bas', (x1 - x0 - 0.03, Y_ARRIERE - Y_AVANT - EP_AVANT / 2, 0.24),
            ((x0 + x1) / 2, (Y_ARRIERE + Y_AVANT + EP_AVANT / 2) / 2, Z_BATI + 0.12), P['tole_sombre'], g, segments=1)
    for i, (dx, z) in enumerate(((-0.235, 1.80),)):
        c.cylindre(f'g{n}_entretoise_{i}', 0.016, Y_ARRIERE - Y_AVANT, (x + dx, (Y_ARRIERE + Y_AVANT) / 2, z),
                   P['acier'], 'Y', g, segments=10, chanfrein=0)
    # Numéro du groupe et couleur de son encre, en haut du bâti conducteur.
    yf = Y_FACE
    c.texte(f'g{n}_numero', str(n), 0.075, (x0 + 0.06, yf - 0.0008, 1.825), P['tole_sombre'], g)
    c.boite(f'g{n}_encre', (0.15, 0.004, 0.022), (x + 0.06, yf - 0.002, 1.825), encre, g, chanfrein=0.001)
    c.pictogramme_danger(f'g{n}_danger', (x1 - 0.06, yf, 1.828), g, P, taille=0.045)


def cylindres(g, n, x, P):
    """
    Contre-cylindre double développement sous la bande, blanchet dessus, porte-plaque posé sur le blanchet, avec leurs
    bagues d'appui. Le corps tournant a le diamètre du catalogue ; plaque et toile l'habillent par-dessus.
    """
    catalogue = n == G_PLAQUE
    (dx, z), r = IMPRESSION
    imp = rouleau(r, x + dx, z, P['chrome'], g, P, sous=True, ecrou=True, segments=32)
    if catalogue:
        c.cylindre_catalogue(imp, 'Cylindre de contre-pression (double développement)', r * 2000)
    if n == G_VITESSE:
        # Vitesse de la presse : codeur en bout d'arbre du contre-cylindre, lu par l'automate.
        c.capteur('codeur_vitesse', 'codeur', (x + dx, -LONG / 2 - 0.018, z), g, P, 8, 'vitesse', normale='+Y')
    for nom, ((dx, z), r), mat, sous, debut, ouverture, longueur in (
        ('blanchet', BLANCHET, P['blanchet'], False, 200, 352, 0.44),
        ('plaque', PLAQUE, P['plaque'], True, 30, 346, 0.40),
    ):
        corps = rouleau(r, x + dx, z, P['acier'], g, P, sous=sous, ecrou=True, segments=28)
        c.rotatif(corps, r + EP_HABILLAGE, sous)  # vitesse de surface prise sur la plaque ou la toile
        habillage = c.secteur(f'g{n}_{nom}', r + EP_HABILLAGE, r - 0.001, longueur, ouverture, (x + dx, 0, z), mat, 'Y',
                              segments=28, debut_deg=debut)
        c.attacher(habillage, corps)
        bague(f'g{n}_{nom}_bague', r + EP_HABILLAGE, x + dx, z, g, P)
        if catalogue:
            c.cylindre_catalogue(corps, f'Cylindre porte-{nom}', r * 2000)
    if catalogue:
        (dx, z), r = BLANCHET
        # Heures du blanchet : comptées sur le codeur de son arbre.
        c.capteur('codeur_blanchet', 'codeur', (x + dx, -LONG / 2 - 0.018, z), g, P, 4, 'heures_blanchet',
                  normale='+Y')
        # Pression d'impression : transmetteur sur le distributeur des vérins de mise en pression, bâti conducteur.
        c.boite('g4_distributeur_pression', (0.06, 0.02, 0.04), (x - 0.15, Y_FACE - 0.01, 0.55), P['graphite'], g)
        c.capteur('transmetteur_pression', 'pression', (x - 0.15, Y_FACE - 0.01, 0.57), g, P, 4, 'pression',
                  normale='-Z')
        # Repérage : cellule au-dessus du bord de bande, entre le pincement et la sortie du groupe.
        support_capteur(g, n, x + 0.245, Z_BANDE + 0.073, P)
        c.capteur('cellule_reperage', 'cellule', (x + 0.245, -0.185, Z_BANDE + 0.02), g, P, 4, 'reperage',
                  normale='-Z')


def support_capteur(g, n, xs, z, P):
    """Traverse d'un bâti à l'autre, au-dessus de la bande, qui porte cellule ou caméra."""
    c.cylindre(f'g{n}_traverse_capteur', 0.008, Y_ARRIERE - Y_AVANT, (xs, (Y_ARRIERE + Y_AVANT) / 2, z),
               P['acier'], 'Y', g, segments=8, chanfrein=0)


def encrage(g, n, x, encre, P):
    """Train d'encrage en cascade et encrier à vis en haut du groupe."""
    for nom, (dx, z), r, nature, sous, catalogue in ENCRAGE:
        mat = encre if nature == 'encre' else P['chrome']
        # Le rouleau d'encrier s'arrête entre les joues de l'encrier ; les distributeurs, oscillants, débordent.
        longueur = 0.46 if nom == 'rouleau_encrier' else 0.48 if nature == 'chrome' else 0.44
        o = rouleau(r, x + dx, z, mat, g, P, sous, longueur=longueur)
        if catalogue and n == G_ENCRAGE:
            c.cylindre_catalogue(o, catalogue, r * 2000)
        if nom == 'distributeur_3' and n == G_ENCRAGE:
            # Température des rouleaux : pyromètre visant un distributeur, celui que l'eau de refroidissement traverse.
            c.capteur('pyrometre_rouleaux', 'pyrometre', (x + dx + r + 0.012, -0.12, z), g, P, 3,
                      'temperature_rouleaux', normale='-X')
        if nom == 'rouleau_encrier':
            # Le rouleau d'encrier avance pas à pas : il tourne bien plus lentement que le reste du train.
            o['vitesseRadS'] = round(o['vitesseRadS'] * 0.08, 3)
    (ex, ez), re = ENCRAGE[-1][1], ENCRAGE[-1][2]
    ex += x
    # Bac de l'encrier : lame appuyée sous le rouleau d'encrier, paroi extérieure, fond.
    bac = [(ex + 0.037, ez - 0.030), (ex + 0.051, ez - 0.050), (ex + 0.119, ez - 0.050), (ex + 0.119, ez + 0.083),
           (ex + 0.109, ez + 0.083), (ex + 0.109, ez - 0.038), (ex + 0.051, ez - 0.038), (ex + 0.041, ez - 0.024)]
    c.profil(f'g{n}_encrier', bac, 0.47, 0.0, P['tole_sombre'], g, chanfrein=0)
    bord = [(ex + re * 1.005 * math.cos(math.radians(a)), ez + re * 1.005 * math.sin(math.radians(a)))
            for a in (-25, 0, 20, 47)]
    encre_bac = [bord[0], (ex + 0.051, ez - 0.036), (ex + 0.107, ez - 0.036), (ex + 0.107, ez + 0.033),
                 bord[3], bord[2], bord[1]]
    c.profil(f'g{n}_encre_bac', encre_bac, 0.46, 0.0, encre, g, chanfrein=0)
    for s in (-1, 1):
        c.boite(f'g{n}_encrier_joue_{s}', (0.09, 0.008, 0.15), (ex + 0.075, s * 0.239, ez + 0.012),
                P['tole_sombre'], g)
    # Vis d'encrier : une par zone de la laize, l'opérateur règle l'ouverture de la lame zone par zone.
    for i in range(7):
        yv = -0.18 + 0.36 * i / 6
        c.cylindre(f'g{n}_vis_encrier_{i}', 0.0065, 0.022, (ex + 0.114, yv, ez + 0.094), P['chrome'], 'Z', g,
                   segments=6, chanfrein=0)
    if n == G_ENCRAGE:
        # Vis d'encrier motorisées : le codeur du moteur de zone, sur la joue côté conducteur, donne leur ouverture.
        c.capteur('codeur_vis_encrier', 'codeur', (ex + 0.075, -0.243, ez + 0.005), g, P, 3, 'ouverture',
                  normale='+Y')
        # Densité : caméra au-dessus de la bande, juste après le pincement du groupe.
        support_capteur(g, n, x + 0.245, Z_BANDE + 0.121, P)
        c.capteur('camera_densite', 'camera', (x + 0.245, 0.0, Z_BANDE + 0.018), g, P, 3, 'densite', normale='-Z')


def mouillage(g, n, x, P):
    """Mouillage : bac d'eau en inox, plongeur trempé, doseur, toucheur sur la plaque ; sondes dans le bac du groupe 2."""
    for nom, (dx, z), r, nature, sous, catalogue in MOUILLAGE:
        o = rouleau(r, x + dx, z, P[nature], g, P, sous, longueur=0.44)
        if catalogue and n == G_MOUILLAGE:
            c.cylindre_catalogue(o, catalogue, r * 2000)
    (px, pz), pr = MOUILLAGE[-1][1], MOUILLAGE[-1][2]
    # Le plongeur trempe de 13 mm dans l'eau.
    xb, zo = x + px, pz - pr + 0.013
    z0, z1 = zo - 0.053, zo + 0.017
    c.boite(f'g{n}_bac_fond', (0.115, 0.48, 0.008), (xb, 0, z0 + 0.004), P['inox'], g, chanfrein=0)
    for s in (-1, 1):
        c.boite(f'g{n}_bac_long_{s}', (0.006, 0.48, z1 - z0), (xb + s * 0.0545, 0, (z0 + z1) / 2), P['inox'], g,
                chanfrein=0)
        c.boite(f'g{n}_bac_bout_{s}', (0.115, 0.006, z1 - z0), (xb, s * 0.237, (z0 + z1) / 2), P['inox'], g,
                chanfrein=0)
    c.boite(f'g{n}_eau', (0.103, 0.468, zo - z0 - 0.008), (xb, 0, (z0 + 0.008 + zo) / 2), P['eau'], g, chanfrein=0)
    if n == G_MOUILLAGE:
        # Sondes plongées au bout du bac, côté conducteur : la canne descend jusqu'au fond, la tête reste au-dessus.
        zs = z0 + 0.008 + 0.162
        c.capteur('sonde_conductivite_ph', 'sonde', (xb - 0.044, -0.20, zs), g, P, 2, ['conductivite', 'ph'],
                  normale='-Z')
        c.capteur('sonde_temperature_eau', 'sonde', (xb - 0.044, -0.13, zs), g, P, 2, 'temperature', normale='-Z')


def entrainement(g, n, x, P):
    """Côté entraînement : carter des engrenages au dos du bâti, servomoteur des cylindres, moteur d'encrage."""
    c.boite(f'g{n}_carter_engrenages', (0.42, 0.10, 0.62), (x + 0.03, Y_DOS + 0.05, 1.03), P['tole_sombre'], g,
            segments=1)
    c.boite(f'g{n}_carter_encrage', (0.20, 0.08, 0.30), (x + 0.15, Y_DOS + 0.04, 1.52), P['tole_sombre'], g)
    servomoteur(f'g{n}_servo_cylindres', x + 0.03, 0.96, g, P)
    servomoteur(f'g{n}_moteur_encrage', x + 0.15, 1.52, g, P, rayon=0.042, longueur=0.14, y0=Y_DOS + 0.08,
                cable=False)


def commandes(g, n, x, k, P):
    """Commandes locales du groupe : marche, marche par à-coups ; arrêt d'urgence aux groupes 1 et 4."""
    yf = Y_FACE
    xb = x + DX_BATI[1] - 0.075
    c.boite(f'g{n}_boitier', (0.075, 0.02, 0.12), (xb, yf - 0.01, 0.52), P['graphite'], g)
    c.bouton(f'g{n}_marche', (xb, yf - 0.02, 0.545), P['vert_bouton'], g, P)
    c.bouton(f'g{n}_impulsion', (xb, yf - 0.02, 0.495), P['plastique_noir'], g, P)
    if k % 3 == 0:
        c.arret_urgence(f'g{n}_au', (x + DX_BATI[0] + 0.08, yf, 0.52), g, P)


def secheur_inter(g, n, xu, P):
    """Lampe UV entre deux groupes, juste au-dessus de la bande, et sa gaine de refroidissement vers le collecteur."""
    c.boite(f'uv{n}_cassette', (0.056, 0.68, 0.14), (xu, 0.008, 0.965), P['graphite'], g, segments=1)
    c.boite(f'uv{n}_facade', (0.05, 0.006, 0.12), (xu, Y_FACE - 0.003, 0.965), P['inox'], g, chanfrein=0.002)
    c.texte(f'uv{n}_marque', 'UV', 0.02, (xu, Y_FACE - 0.0068, 0.99), P['tole_sombre'], g)
    c.boite(f'uv{n}_temoin', (0.012, 0.004, 0.008), (xu, Y_FACE - 0.007, 0.95), P['temoin'], g, chanfrein=0.001)
    c.boite(f'uv{n}_vitre', (0.044, 0.44, 0.004), (xu, 0.0, 0.894), P['plastique_noir'], g, chanfrein=0)
    c.boite(f'uv{n}_gaine', (0.044, 0.08, 0.64), (xu, 0.20, 1.355), P['galva'], g, chanfrein=0)
    c.boite(f'uv{n}_coude', (0.044, 0.40, 0.08), (xu, 0.36, 1.71), P['galva'], g, chanfrein=0)


def secheur_final(racine, P):
    """Sécheur UV de sortie : carter de lampes au-dessus de la bande, rouleau refroidi dessous, alimentation en bas."""
    g = c.vide('sechage_uv', parent=racine)
    x0, x1 = 0.99, 1.45
    xm, L = (x0 + x1) / 2, x1 - x0
    yc = (Y_DOS + 0.02 + Y_FACE) / 2
    profondeur = Y_DOS + 0.02 - Y_FACE
    c.boite('uv_carter', (L, profondeur, 0.30), (xm, yc, 1.05), P['graphite'], g, segments=1)
    c.boite('uv_facade', (L - 0.04, 0.008, 0.26), (xm, Y_FACE - 0.004, 1.05), P['inox'], g, chanfrein=0.002,
            segments=1)
    c.texte('uv_marque', 'UV', 0.05, (xm - 0.13, Y_FACE - 0.0088, 1.11), P['tole_sombre'], g)
    c.boite('uv_temoin_1', (0.03, 0.006, 0.012), (xm + 0.12, Y_FACE - 0.009, 1.12), P['temoin'], g, chanfrein=0.001)
    c.boite('uv_temoin_2', (0.03, 0.006, 0.012), (xm + 0.12, Y_FACE - 0.009, 1.095), P['temoin'], g, chanfrein=0.001)
    c.pictogramme_danger('uv_danger', (xm, Y_FACE - 0.008, 1.15), g, P, taille=0.05)
    for i in range(2):
        c.boite(f'uv_poignee_{i}', (0.012, 0.02, 0.10), (x0 + 0.05 + i * (L - 0.1), Y_FACE - 0.018, 1.03), P['chrome'],
                g)
    c.boite('uv_vitre', (L - 0.06, 0.48, 0.004), (xm, 0.0, 0.898), P['plastique_noir'], g, chanfrein=0.001)
    # Ventilateurs sur le dessus, et la remontée vers l'extraction de l'atelier.
    for i, xv in enumerate((xm - 0.13, xm + 0.13)):
        c.cylindre(f'uv_ventilateur_{i}', 0.065, 0.04, (xv, -0.08, 1.22), P['tole_sombre'], 'Z', g, segments=20)
        c.cylindre(f'uv_grille_{i}', 0.058, 0.004, (xv, -0.08, 1.242), P['graphite'], 'Z', g, segments=20,
                   chanfrein=0)
    c.boite('uv_gaine_montante', (0.18, 0.18, 1.17), (xm, 0.18, 1.785), P['galva'], g, segments=1)
    c.boite('uv_gaine_bride', (0.20, 0.20, 0.02), (xm, 0.18, 2.36), P['acier'], g, chanfrein=0.002)
    # Rouleau refroidi sous la bande : il évacue la chaleur des lampes.
    r = rayon_catalogue('Rouleau refroidisseur')
    froid = rouleau(r, xm, Z_BANDE - 0.0008 - r, P['chrome'], g, P, sous=True, ecrou=True)
    c.cylindre_catalogue(froid, 'Rouleau refroidisseur', r * 2000)
    # Température : sonde plongée dans la gaine d'extraction ; puissance : cellule UV vissée dans le carter des lampes.
    c.capteur('sonde_temperature_uv', 'sonde', (xm, 0.09, 1.45), g, P, 5, 'temperature', normale='+Y')
    c.capteur('cellule_puissance_uv', 'cellule', (1.30, Y_FACE - 0.008, 0.96), g, P, 5, 'puissance_uv',
              normale='+Y')
    for i, dz in enumerate((0.03, -0.03)):
        c.tuyau(f'uv_eau_{i}', [(xm + 0.02, Y_DOS + 0.01, 0.79 + dz), (xm + 0.05, Y_DOS + 0.10, 0.70 + dz),
                                (xm + 0.08, 0.50, 0.47)], 0.008, P['plastique_noir'], g, resolution=3)
    # Armoire d'alimentation des lampes, sous la bande.
    c.boite('uv_armoire', (L, profondeur, 0.38), (xm, yc, Z_BATI + 0.19), P['tole'], g, segments=1)
    c.boite('uv_armoire_porte', (L - 0.04, 0.008, 0.34), (xm, Y_FACE - 0.004, Z_BATI + 0.19), P['tole'], g,
            segments=1)
    c.boite('uv_armoire_poignee', (0.014, 0.022, 0.10), (x1 - 0.06, Y_FACE - 0.018, Z_BATI + 0.24), P['plastique_noir'],
            g)
    c.boite('uv_armoire_grille', (0.24, 0.004, 0.10), (xm - 0.06, Y_FACE - 0.01, Z_BATI + 0.12), P['graphite'], g,
            chanfrein=0)
    for j in range(5):
        c.boite(f'uv_armoire_lame_{j}', (0.23, 0.006, 0.006), (xm - 0.06, Y_FACE - 0.013, Z_BATI + 0.084 + j * 0.018),
                P['tole_sombre'], g, chanfrein=0)
    return g


def decoupe(racine, P):
    g = c.vide('decoupe', parent=racine)
    xd = 1.72
    x0, x1, zt = xd - 0.18, xd + 0.18, 1.22
    bati_fenetre('decoupe_bati', x0, x1, Z_BATI, zt, (xd - 0.125, 0.70, xd + 0.125, 1.16), g, P, P['tole_sombre'],
                 ep=0.05, y=Y_AVANT - 0.0075, rayon=0.03)
    c.profil('decoupe_bati_arriere', contour_bati(x0, x1, Z_BATI, zt, 0.03), EP_ARRIERE, Y_ARRIERE + EP_ARRIERE / 2,
             P['tole_sombre'], g)
    c.pictogramme_danger('decoupe_danger', (xd, Y_FACE - 0.015, 0.62), g, P, taille=0.05)
    c.arret_urgence('decoupe_au', (xd + 0.11, Y_FACE - 0.015, 0.45), g, P)
    # Pont de pression : vérins sur les blocs paliers du cylindre magnétique, manomètres, réglage de l'écart.
    c.boite('decoupe_pont', (0.40, Y_DOS - Y_FACE + 0.03, 0.09), (xd, (Y_DOS + Y_FACE) / 2, zt + 0.045),
            P['tole_sombre'], g)
    for j, dx in enumerate((-0.07, 0.07)):
        c.bobine(f'decoupe_manometre_{j + 1}', 0.03, 0.03, (xd + dx, Y_FACE - 0.03, zt + 0.045), P['chrome'],
                 P['manometre'], 'Y', g, 20)
    for yv in (-0.20, 0.20):
        c.cylindre(f'decoupe_verin_{yv}', 0.022, 0.09, (xd, yv, zt + 0.135), P['inox'], 'Z', g, segments=16)
        c.anneau(f'decoupe_volant_{yv}', 0.052, 0.043, 0.012, (xd, yv, zt + 0.19), P['chrome'], 'Z', g, segments=16,
                 chanfrein=0)
        for a in range(3):
            ang = math.radians(90 + 120 * a)
            c.boite(f'decoupe_rayon_{yv}_{a}', (0.046, 0.008, 0.006),
                    (xd + 0.024 * math.cos(ang), yv + 0.024 * math.sin(ang), zt + 0.19), P['chrome'], g,
                    chanfrein=0, rotation=(0, 0, ang))
        c.cylindre(f'decoupe_moyeu_{yv}', 0.011, 0.02, (xd, yv, zt + 0.19), P['chrome'], 'Z', g, segments=10)
    # Cylindre magnétique et sa forme souple au-dessus de la bande, contre-cylindre dessous, bagues d'appui.
    # Diamètres du catalogue ; la forme souple (2,4 mm) habille le cylindre magnétique, les bagues des deux
    # cylindres roulent l'une sur l'autre.
    rm, rc, ep = rayon_catalogue('Cylindre magnétique'), rayon_catalogue('Contre-cylindre'), 0.0024
    zm, zc = Z_BANDE + 0.0005 + rm + ep, Z_BANDE - 0.0008 - rc
    mag = rouleau(rm, xd, zm, P['acier'], g, P, sous=False, ecrou=True)
    c.rotatif(mag, rm + ep, False)
    c.cylindre_catalogue(mag, 'Cylindre magnétique', rm * 2000)
    forme = c.secteur('decoupe_forme', rm + ep, rm - 0.001, 0.40, 320, (xd, 0, zm), P['forme'], 'Y', debut_deg=200)
    c.attacher(forme, mag)
    cc = rouleau(rc, xd, zc, P['chrome'], g, P, sous=True, ecrou=True)
    c.cylindre_catalogue(cc, 'Contre-cylindre', rc * 2000)
    bague('decoupe_mag_bague', (zm - zc) / 2, xd, zm, g, P)
    bague('decoupe_contre_bague', (zm - zc) / 2, xd, zc, g, P)
    servomoteur('decoupe_servo', xd, zm, g, P, y0=Y_DOS)
    # Pression de découpe : transmetteur sur le pont, au départ des vérins ; mètres par outil : codeur du magnétique.
    c.capteur('transmetteur_decoupe', 'pression', (xd - 0.13, -0.28, zt + 0.09), g, P, 6, 'pression', normale='-Z')
    c.capteur('codeur_decoupe', 'codeur', (xd, -LONG / 2 - 0.018, zm), g, P, 6, 'metres_outil', normale='+Y')
    return g


def echenillage(racine, P):
    """Échenillage : barre de pelage à la sortie de la découpe, bobine de matrice sur sa colonne."""
    g = c.vide('echenillage', parent=racine)
    xm, zm = 2.15, 1.36
    c.boite('ech_colonne', (0.20, 0.16, 1.20), (xm, 0.42, Z_BATI + 0.60), P['tole'], g)
    c.boite('ech_chapeau', (0.22, 0.18, 0.025), (xm, 0.42, Z_BATI + 1.2125), P['tole_sombre'], g)
    c.boite('ech_carter_moteur', (0.18, 0.12, 0.22), (xm, 0.56, zm), P['tole'], g)
    c.cylindre('ech_flasque', 0.06, 0.03, (xm, 0.325, zm), P['tole_sombre'], 'Y', g, segments=20)
    c.cylindre('ech_arbre', 0.02, 0.59, (xm, 0.045, zm), P['acier'], 'Y', g)
    c.cylindre('ech_bouchon', 0.03, 0.03, (xm, -0.26, zm), P['tole_sombre'], 'Y', g)
    b = c.bobine(c.suivant('rotatif'), 0.14, LAIZE, (xm, 0, zm), P['matrice_bord'], P['flanc_matrice'], 'Y', g)
    c.rotatif(b, 0.14, sous_la_bande=True)
    m = c.bobine(c.suivant('rotatif'), 0.038, LAIZE + 0.008, (xm, 0, zm), P['carton'], P['flanc_mandrin'], 'Y', g, 24)
    c.rotatif(m, 0.14, sous_la_bande=True)
    c.cylindre('ech_barre_pelage', 0.012, 0.66, (1.95, 0.005, 0.872), P['chrome'], 'Y', g, segments=12)
    for y in (Y_AVANT - 0.0075, Y_ARRIERE + 0.035):
        c.boite(f'ech_support_{y}', (0.075, 0.03, 0.04), (1.925, y, 0.872), P['tole_sombre'], g)
    return g


def _presseur():
    """Presseur du rembobineur : posé sur la bande au point où elle touche la bobine pleine, de l'autre côté."""
    r = rayon_catalogue('Rouleau presseur du rembobineur')
    t1, t2 = tangente((2.50, 0.891), 0.03, 1, (2.85, 0.92), 0.28, -1)
    d = math.hypot(t2[0] - t1[0], t2[1] - t1[1])
    nx, nz = -(t2[1] - t1[1]) / d, (t2[0] - t1[0]) / d
    return (t2[0] + r * nx, t2[1] + r * nz), r


PRESSEUR = _presseur()


def rembobineur(racine, P):
    g = c.vide('rembobineur', parent=racine)
    x, z = 2.85, 0.92
    colonne_bobine('remb', x, g, P)
    bobine_sur_colonne('remb', x, z, 0.28, P['bord_etiquettes'], P['flanc_etiquettes'], True, g, P,
                       pas_u=c.PAS_ETIQUETTE)
    # Rouleau de renvoi au-dessus de la bande, porté par une console de la colonne.
    c.boite('remb_console', (0.24, 0.05, 0.05), (2.585, 0.36, 0.891), P['tole_sombre'], g)
    c.cylindre('remb_renvoi_arbre', 0.012, 0.62, (2.50, 0.075, 0.891), P['acier'], 'Y', g, segments=8, chanfrein=0)
    rouleau(0.03, 2.50, 0.891, P['chrome'], g, P, sous=False, longueur=0.48, arbre=False)
    # Tension de rembobinage : cellule de charge sous la console du renvoi.
    c.capteur('cellule_charge_rembobineur', 'charge', (2.50, 0.36, 0.866), g, P, 7, 'tension', normale='+Z')
    # Presseur appliqué sur la bobine là où la bande l'atteint, porté par un bras qui pivote sur la colonne.
    (px, pz), rp = PRESSEUR
    pres = rouleau(rp, px, pz, P['caoutchouc'], g, P, sous=False, longueur=0.44, arbre=False)
    c.cylindre_catalogue(pres, 'Rouleau presseur du rembobineur', rp * 2000)
    c.cylindre('remb_presseur_arbre', 0.01, 0.52, (px, 0.02, pz), P['acier'], 'Y', g, segments=8, chanfrein=0)
    pivot = (2.70, 1.15)
    # Bras dessiné en profil (sans rotation d'objet) : la fusion à l'export garde le repère du premier objet, une boîte
    # tournée fausserait la boîte englobante du poste.
    longueur_bras = math.hypot(pivot[0] - px, pivot[1] - pz)
    ux, uz = (pivot[0] - px) / longueur_bras, (pivot[1] - pz) / longueur_bras
    bras = [(px - 0.02 * ux + 0.02 * uz, pz - 0.02 * uz - 0.02 * ux), (pivot[0] + 0.02 * ux + 0.02 * uz,
            pivot[1] + 0.02 * uz - 0.02 * ux), (pivot[0] + 0.02 * ux - 0.02 * uz, pivot[1] + 0.02 * uz + 0.02 * ux),
            (px - 0.02 * ux - 0.02 * uz, pz - 0.02 * uz + 0.02 * ux)]
    c.profil('remb_bras', bras, 0.03, 0.265, P['tole_sombre'], g)
    c.cylindre('remb_bras_pivot', 0.022, 0.04, (pivot[0], 0.27, pivot[1]), P['acier'], 'Y', g, segments=12)
    # Comptage : fourche à étiquettes sur le bord de la bande, avant le rembobineur.
    c.cylindre('remb_poteau_fourche', 0.01, Z_BANDE - 0.035 - Z_BATI, (2.35, -0.25, (Z_BANDE - 0.035 + Z_BATI) / 2),
               P['acier'], 'Z', g, segments=8, chanfrein=0)
    c.capteur('fourche_comptage', 'fourche', (2.35, -0.19, Z_BANDE), g, P, 7, 'comptage', normale='+Y')
    c.arret_urgence('remb_au', (x + 0.161, 0.40, 1.06), g, P, '+X')
    # Compteur de métrage et boutons du rembobineur, sur le flanc de la colonne.
    c.boite('remb_boitier', (0.02, 0.12, 0.16), (x - 0.17, 0.40, 0.62), P['graphite'], g)
    c.boite('remb_afficheur', (0.004, 0.08, 0.03), (x - 0.181, 0.40, 0.67), P['plastique_noir'], g, chanfrein=0)
    c.bouton('remb_marche', (x - 0.18, 0.37, 0.60), P['vert_bouton'], g, P, '-X')
    c.bouton('remb_arret', (x - 0.18, 0.43, 0.60), P['plastique_noir'], g, P, '-X')
    return g


def bandes(racine, P):
    """Chemin de bande, dans l'ordre des anciens nœuds bande_N, brins tendus d'un rouleau à l'autre."""
    g = c.vide('bande', parent=racine)
    a, b = tangente((1.95, 0.872), 0.012, 1, (2.15, 1.36), 0.14, -1)
    c.bande('bande_1', a, b, 0.40, P['bande_matrice'], g)
    a, b = tangente((-3.45, 0.92), 0.40, 1, RENVOI[0], RENVOI[1], -1)
    c.bande('bande_2', a, b, LAIZE, P['bande_vierge'], g)
    c.bande('bande_3', (-2.9, Z_BANDE), (-2.42, Z_BANDE), LAIZE, P['bande_vierge'], g)
    c.bande('bande_4', (-2.42, Z_BANDE), (1.95, Z_BANDE), LAIZE, P['bande_imprimee'], g)
    c.bande('bande_5', (1.95, Z_BANDE), (2.50, Z_BANDE), LAIZE, P['bande_decoupee'], g)
    a, b = tangente((2.50, 0.891), 0.03, 1, (2.85, 0.92), 0.28, -1)
    c.bande('bande_6', a, b, LAIZE, P['bande_decoupee'], g)
    return g


def pupitre(racine, P):
    """Pupitre au sol devant le groupe 3 : écran tactile incliné, boutons, arrêt d'urgence."""
    g = c.vide('pupitre', parent=racine)
    x, y = -1.2, -0.745
    inclinaison = math.radians(-10)
    c.boite('pup_embase', (0.38, 0.32, 0.02), (x, y + 0.02, 0.01), P['tole_sombre'], g)
    c.boite('pup_pied', (0.16, 0.12, 0.98), (x, y + 0.04, 0.51), P['tole'], g)
    c.boite('pup_commandes', (0.36, 0.16, 0.06), (x, y - 0.01, 1.03), P['graphite'], g)
    c.arret_urgence('pup_au', (x + 0.11, y - 0.02, 1.06), g, P, '+Z')
    c.bouton('pup_marche', (x - 0.02, y - 0.02, 1.06), P['vert_bouton'], g, P, '+Z')
    c.bouton('pup_arret', (x - 0.07, y - 0.02, 1.06), P['plastique_noir'], g, P, '+Z')
    c.boite('pup_rotule', (0.07, 0.05, 0.10), (x, y + 0.04, 1.11), P['graphite'], g)
    c.boite('pup_tete', (0.50, 0.06, 0.33), (x, y, 1.308), P['tole_sombre'], g, rotation=(inclinaison, 0, 0))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    w, h = 0.46, 0.288
    coins = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    f = bm.faces.new([bm.verts.new((u, 0, v)) for u, v in coins])
    for loop, (u, v) in zip(f.loops, coins):
        loop[uv].uv = (u / w + 0.5, v / h + 0.5)
    e = c._objet('ecran_ihm', bm, P['ecran'], g, (0, 0, 0), (0, 0, 0), None, 0)
    e.rotation_euler = (inclinaison, 0, 0)
    d = 0.0305
    e.location = (x, y - d * math.cos(inclinaison), 1.308 - d * math.sin(inclinaison))
    e['role'] = 'ecran'
    coffret_automate(g, x - 0.44, P)
    return g


def coffret_automate(g, xa, P):
    """Coffret de l'automate à côté du pupitre : porte vitrée, automate sur rail, thermostat d'armoire."""
    c.boite('coffret_socle', (0.34, 0.18, 0.10), (xa, -0.70, 0.05), P['tole_sombre'], g)
    c.boite('coffret_fond', (0.36, 0.10, 0.70), (xa, -0.65, 0.45), P['tole'], g, segments=1)
    for s in (-1, 1):
        c.boite(f'coffret_cote_{s}', (0.02, 0.10, 0.70), (xa + s * 0.17, -0.75, 0.45), P['tole'], g)
        c.boite(f'coffret_rive_{s}', (0.32, 0.10, 0.03), (xa, -0.75, 0.45 + s * 0.335), P['tole'], g)
    c.boite('coffret_vitre', (0.32, 0.004, 0.64), (xa, -0.797, 0.45), P['verre'], g, chanfrein=0)
    c.boite('coffret_poignee', (0.014, 0.02, 0.08), (xa + 0.17, -0.81, 0.45), P['plastique_noir'], g)
    c.capteur('automate', 'automate', (xa, -0.785, 0.62), g, P, 8, 'alarmes', normale='-Y')
    c.capteur('thermostat_armoire', 'thermostat', (xa + 0.10, -0.725, 0.36), g, P, 8, 'temperature_armoire',
              normale='-Y')


def colonne_lumineuse(racine, P):
    """Colonne lumineuse sur le chapeau du groupe 1, côté entraînement."""
    g = c.vide('colonne_lumineuse', parent=racine)
    x, y, z0 = -2.42, 0.30, Z_HAUT + 0.035
    c.cylindre('colonne_pied', 0.03, 0.015, (x, y, z0 + 0.0075), P['graphite'], 'Z', g)
    c.cylindre('colonne_mat', 0.012, 0.17, (x, y, z0 + 0.1), P['acier'], 'Z', g)
    c.cylindre('colonne_douille', 0.032, 0.012, (x, y, z0 + 0.191), P['plastique_noir'], 'Z', g)
    for nom, dz, mat, etat in (('voyant_vert', 0.225, P['vert'], 'marche'),
                               ('voyant_orange', 0.2835, P['orange'], 'attention'),
                               ('voyant_rouge', 0.342, P['rouge'], 'arret')):
        v = c.cylindre(nom, 0.032, 0.054, (x, y, z0 + dz), mat, 'Z', g, None, chanfrein=0.002)
        v['role'] = 'voyant'
        v['etat'] = etat
    for i, dz in enumerate((0.2535, 0.3125)):
        c.cylindre(f'colonne_bague_{i}', 0.0325, 0.004, (x, y, z0 + dz), P['plastique_noir'], 'Z', g, None,
                   chanfrein=0.0005)
    c.cylindre('colonne_chapeau', 0.032, 0.02, (x, y, z0 + 0.379), P['plastique_noir'], 'Z', g)
    return g


def auxiliaires(racine, P):
    """Au dos de la presse : collecteur d'extraction des lampes UV, centrale de mouillage et sa nourrice."""
    g = c.vide('auxiliaires', parent=racine)
    x0, x1 = X_GROUPES[0] + 0.30, 1.13
    c.boite('extraction_collecteur', (x1 - x0, 0.14, 0.12), ((x0 + x1) / 2, 0.60, 1.71), P['galva'], g)
    for i, xs in enumerate((X_GROUPES[0] + 0.03, X_GROUPES[2] + 0.03, X_GROUPES[4] + 0.03)):
        c.boite(f'extraction_console_{i}', (0.04, 0.26, 0.03), (xs, 0.51, 1.635), P['graphite'], g)
    # Centrale de mouillage : bac de solution refroidi, sondes de pH et de conductivité, régulateur.
    xc = -2.93
    c.boite('centrale', (0.40, 0.28, 0.78), (xc, 0.62, 0.39), P['tole'], g)
    c.boite('centrale_couvercle', (0.42, 0.30, 0.025), (xc, 0.62, 0.7925), P['tole_sombre'], g)
    c.boite('centrale_regulateur', (0.12, 0.012, 0.09), (xc - 0.08, 0.474, 0.66), P['plastique_noir'], g)
    c.boite('centrale_afficheur', (0.08, 0.004, 0.03), (xc - 0.08, 0.467, 0.675), P['vert'], g, chanfrein=0)
    c.boite('centrale_grille', (0.004, 0.18, 0.20), (xc + 0.202, 0.62, 0.25), P['graphite'], g, chanfrein=0)
    c.cylindre('nourrice', 0.02, 3.6, (-1.0, 0.43, 0.62), P['inox'], 'X', g, segments=10)
    for i, dz in enumerate((0.0, 0.05)):
        c.tuyau(f'centrale_flexible_{i}', [(xc + 0.10, 0.62, 0.805), (xc + 0.12, 0.55, 0.90 + dz),
                                           (xc + 0.30, 0.45, 0.66 + dz)], 0.01, P['plastique_noir'], g,
                resolution=4)
    return g


# --- Assemblage ------------------------------------------------------------------------------------------------


def construire():
    P = matieres()
    fiche = c.kit_machine(MACHINE)
    racine = c.vide(MACHINE, props={'machine': fiche['nom'], 'fiabilite': 'Technologie confirmée', 'unite': 'metre',
                                    'axeHaut': 'Y'})
    groupes = [
        bati(racine, P),
        derouleur(racine, P),
        entree(racine, P),
        *[groupe_offset(racine, k, P) for k in range(6)],
        secheur_final(racine, P),
        decoupe(racine, P),
        echenillage(racine, P),
        rembobineur(racine, P),
        pupitre(racine, P),
        colonne_lumineuse(racine, P),
        auxiliaires(racine, P),
    ]
    bandes(racine, P)
    g_socle = socle(racine, P)
    # 448 px suffisent à une ombre de contact floue ; 1024 quadruplaient le poids de l'image pour rien.
    ombre = c.ombre_au_sol('socle_6', -3.95, 3.40, -1.20, 0.85, 0.003, largeur_px=448)
    ombre['role'] = 'socle'
    ombre.parent = g_socle
    c.points_diagnostic(
        [(p['numero'], p['nom'], c.depuis_gltf(p['position'])) for p in fiche['points_diagnostic']], racine)
    c.reperes([(r['texte'], c.depuis_gltf(r['position'])) for r in fiche['reperes']], racine)
    return racine, groupes


def vues(objets):
    v = c.vues_par_defaut(objets)
    xg = X_GROUPES[3]
    v['groupe'] = dict(position=(xg - 0.75, -1.25, 1.75), cible=(xg, 0, 1.2), focale=40)
    v['profil_groupe'] = dict(position=(xg + 0.04, -20, 1.2), cible=(xg + 0.04, 0, 1.2), ortho=1.45)
    v['encrage'] = dict(position=(xg + 0.75, -0.95, 2.2), cible=(xg + 0.1, 0, 1.45), focale=40)
    v['decoupe'] = dict(position=(1.0, -1.45, 1.55), cible=(1.75, 0, 1.0), focale=40)
    v['derouleur'] = dict(position=(-4.3, -1.6, 1.6), cible=(-3.2, 0, 0.9), focale=40)
    v['rembobineur'] = dict(position=(3.5, -1.5, 1.7), cible=(2.5, 0, 1.0), focale=40)
    v['capteurs_groupes'] = dict(position=(0.55, -0.85, 1.25), cible=(-0.15, 0, 1.0), focale=35)
    v['mouillage'] = dict(position=(-2.05, -0.55, 1.45), cible=(-1.93, 0, 1.03), focale=40)
    v['coffret'] = dict(position=(-1.35, -1.6, 0.9), cible=(-1.55, -0.7, 0.55), focale=40)
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
