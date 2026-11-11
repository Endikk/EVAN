"""
Presse numérique du kit : jet d'encre bande étroite, laize 340 mm, quatre barres de têtes CMJN avec fixation UV LED
après chaque couleur, séchage UV LED final, finition en ligne (pelliculage, découpe rotative, échenillage, refente).

  blender --background --factory-startup --python data/kit/blender/digital.py -- [--apercu <dossier>] [--vues a,b]

La disposition reprend celle de l'ancien modèle, que le reste de l'application connaît : bande à 1,0 m, mêmes
abscisses de postes et mêmes axes de bobines, mêmes points de diagnostic et repères (lus dans machines.json), même
emprise au sol (MODEL_FOOTPRINT de domain/catalog.ts). Quatre modules posés bout à bout, chacun sur son armoire :
dérouleur, module d'impression sous capot vitré, module de finition, rembobineur. Proportions approximatives, sans
logo ni livrée de marque.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as c  # noqa: E402

MACHINE = 'digital'
Z_BANDE = 1.0
LAIZE = 0.34
LONG_ROULEAU = 0.42
X_TETES = [-1.5, -1.26, -1.02, -0.78]
# Encres des quatre barres, dans l'ordre de passage, et la lettre peinte au bout de chaque barre.
ENCRES = [('C', '#1d8fd1'), ('M', '#cf2479'), ('J', '#f2c511'), ('N', '#1c1c1c')]
Y_MUR = 0.26  # face avant des plaques arrière, qui portent rouleaux et bobines en porte-à-faux
EP_MUR = 0.08
Y_DOS = Y_MUR + EP_MUR
X_UV = -0.34
X_DECOUPE = 0.42
# Bobines : axes de l'ancien modèle (dérouleur, film de pelliculage, matrice, rembobineur).
DEROULEUR = (-2.35, 1.20, 0.30)
FILM = (0.86, 1.28, 0.10)
MATRICE = (1.12, 1.32, 0.12)
REMBOBINEUR = (1.98, 1.10, 0.24)

# Cylindres nommés du catalogue (data/catalog.json) : l'analyse des défauts répétitifs les retrouve par ce nom.
CYL_RENVOI = 'Rouleau de renvoi'
CYL_ENTRAINEMENT = 'Rouleau d\u2019entraînement sous les têtes'
CYL_SECHAGE = 'Rouleau de bande du séchage'
CYL_MAGNETIQUE = 'Cylindre magnétique de finition'
CYL_CONTRE = 'Contre-cylindre de finition'
CYL_PRESSEUR = 'Rouleau presseur du rembobineur'


def rayon_catalogue(nom: str) -> float:
    return c.diametre_catalogue(MACHINE, nom) / 2000


# Les onze rouleaux de l'ancien modèle gardent leur numéro ; ceux qu'on ajoute viennent après.
_ajoutes = {'n': 11}


def nouveau_rotatif() -> str:
    _ajoutes['n'] += 1
    return f"rotatif_{_ajoutes['n']}"


def matieres():
    P = c.palette()
    P.update(
        forme=c.matiere('forme_decoupe', '#8f959b', 0.9, 0.34),
        carton=c.matiere('carton_mandrin', '#a67b4e', 0.0, 0.8),
        matrice_bord=c.matiere('papier_matrice', '#ece6d3', 0.0, 0.85),
        film_bord=c.matiere('film_pelliculage', '#d7dee3', 0.3, 0.15),
        nettoyeur=c.matiere('rouleau_nettoyeur', '#8a2a33', 0.0, 0.62),
        bidon=c.matiere('bidon_encre', '#e4e4df', 0.0, 0.55),
        led=c.matiere('led_uv', '#8a63ff', 0.0, 0.3, emission='#7b4dff', force=4.0),
        temoin=c.matiere('temoin_uv', '#ff8a1c', 0.0, 0.3),
        vert=c.matiere('voyant_vert', '#27c46a', 0.0, 0.3),
        orange=c.matiere('voyant_orange', '#ff9a1a', 0.0, 0.3),
        rouge=c.matiere('voyant_rouge', '#ff3a2e', 0.0, 0.3),
        flanc_papier=c.matiere('flanc_papier', '#ffffff', 0.0, 0.8, image='bobine_papier_flanc.png'),
        flanc_mandrin=c.matiere('flanc_mandrin', '#ffffff', 0.0, 0.8, image='mandrin_carton.png'),
        flanc_film=c.matiere('flanc_film', '#ffffff', 0.3, 0.3, image='bobine_film_flanc.png'),
        flanc_matrice=c.matiere('flanc_matrice', '#ffffff', 0.0, 0.8, image='bobine_matrice_flanc.png'),
        flanc_etiquettes=c.matiere('flanc_etiquettes', '#ffffff', 0.0, 0.7, image='bobine_etiquettes_flanc.png'),
        bord_etiquettes=c.matiere('bord_etiquettes', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        manometre=c.matiere('cadran_manometre', '#ffffff', 0.0, 0.3, image='manometre.png'),
        bande_vierge=c.matiere('bande_vierge', '#ffffff', 0.0, 0.8, image='bande_vierge.png'),
        bande_imprimee=c.matiere('bande_imprimee', '#ffffff', 0.0, 0.5, image='bande_imprimee.png'),
        bande_decoupee=c.matiere('bande_decoupee', '#ffffff', 0.0, 0.5, image='bande_etiquettes_decoupees.png'),
        bande_matrice=c.matiere('bande_matrice', '#ffffff', 0.0, 0.7, image='bande_matrice.png', masque=True),
        # Film de pelliculage : le grain du papier vierge, à demi transparent, suffit à le voir défiler.
        bande_film=c.matiere('bande_film', '#ffffff', 0.0, 0.15, alpha=0.5, image='bande_vierge.png'),
        ecran=c.matiere('ecran_numerique', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                        image='digital_ecran.png'),
    )
    P['encres'] = [c.matiere(f'encre_{lettre}', h, 0.0, 0.25) for lettre, h in ENCRES]
    return P


# --- Pièces répétées -------------------------------------------------------------------------------------------


def tangente(p, centre, r):
    """
    Point où une bande partie de `p` touche une bobine par la gauche ou le haut : la bande s'y enroule ensuite en sens
    horaire vue de face (matrice, étiquettes rembobinées).
    """
    dx, dz = centre[0] - p[0], centre[1] - p[1]
    d = math.hypot(dx, dz)
    a = math.atan2(dz, dx) + math.asin(r / d)
    lg = math.sqrt(d * d - r * r)
    return (p[0] + lg * math.cos(a), p[1] + lg * math.sin(a))


def caisson(nom, x0, x1, y0, y1, z1, g, P, n=2, z0=0.08):
    """Armoire de module : caisse RAL 7035 sur plinthe anthracite, pieds réglables à semelle caoutchouc."""
    L, W = x1 - x0, y1 - y0
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    caisse = c.boite(nom, (L, W, z1 - z0), (xm, ym, (z0 + z1) / 2), P['tole'], g)
    c.boite(f'{nom}_plinthe', (L + 0.006, W + 0.006, 0.07), (xm, ym, z0 + 0.035), P['tole_sombre'], g,
            chanfrein=0.004)
    for i in range(n):
        xp = x0 + 0.08 + (L - 0.16) * i / (n - 1)
        for j, yp in enumerate((y0 + 0.08, y1 - 0.08)):
            c.cylindre(f'{nom}_pied_{i}_{j}', 0.02, 0.06, (xp, yp, 0.05), P['acier'], 'Z', g, segments=6, chanfrein=0)
            c.cylindre(f'{nom}_semelle_{i}_{j}', 0.04, 0.02, (xp, yp, 0.01), P['caoutchouc'], 'Z', g, segments=8,
                       chanfrein=0)
    return caisse


def porte(nom, x0, x1, z0, z1, y_face, g, P, poignee_droite=True, grille=True, arriere=False):
    """Porte d'armoire, en façade ou au dos (`arriere`) : panneau, poignée chromée, grille d'aération à lames."""
    xm, zm = (x0 + x1) / 2, (z0 + z1) / 2
    d = 1 if arriere else -1  # sens de la normale de la face qui porte la porte
    c.boite(nom, (x1 - x0, 0.008, z1 - z0), (xm, y_face + d * 0.004, zm), P['tole'], g)
    xp = x1 - 0.05 if poignee_droite else x0 + 0.05
    c.boite(f'{nom}_poignee', (0.016, 0.02, 0.11), (xp, y_face + d * 0.018, zm + 0.05), P['chrome'], g)
    if grille:
        c.boite(f'{nom}_grille', (0.18, 0.004, 0.08), (xm, y_face + d * 0.01, z0 + 0.09), P['graphite'], g,
                chanfrein=0)
        for j in range(3):
            c.boite(f'{nom}_lame_{j}', (0.17, 0.006, 0.006), (xm, y_face + d * 0.013, z0 + 0.065 + 0.024 * j),
                    P['tole_sombre'], g, chanfrein=0)


def plaque(nom, x0, x1, z0, z1, g, P, r=0.05):
    """Plaque arrière d'un module, coins hauts arrondis : elle porte les arbres en porte-à-faux."""
    pts = [(x0, z0), (x1, z0)] + c.arc(x1 - r, z1 - r, r, 0, 90) + c.arc(x0 + r, z1 - r, r, 90, 180)
    return c.profil(nom, pts, EP_MUR, Y_MUR + EP_MUR / 2, P['tole'], g)


def rouleau(etiquette, nom, rayon, centre, mat, g, P, sous_la_bande, longueur=LONG_ROULEAU, y_mur=Y_MUR,
            rayon_vitesse=None, sens=1):
    """
    Rouleau en porte-à-faux : corps tournant (rotatif_N) avec son bout avant, arbre fixe jusqu'à la plaque arrière,
    flasque de palier sur la plaque. `rayon_vitesse` : rayon au contact de la bande, s'il diffère du corps.
    """
    x, z = centre
    corps = c.cylindre(nom, rayon, longueur, (x, 0, z), mat, 'Y', g)
    c.rotatif(corps, rayon_vitesse or rayon, sous_la_bande, sens)
    # Bouts et flasques sans chanfrein : à cette taille il ne se voit pas, et il triplerait leurs triangles.
    bout = c.cylindre(f'{etiquette}_bout', rayon * 0.78, 0.008, (x, -longueur / 2 - 0.004, z), P['tole_sombre'], 'Y',
                      chanfrein=0)
    c.attacher(bout, corps)
    long_arbre = y_mur - longueur / 2
    if long_arbre > 0:
        c.cylindre(f'{etiquette}_arbre', max(0.008, rayon * 0.4), long_arbre, (x, longueur / 2 + long_arbre / 2, z),
                   P['acier'], 'Y', g, segments=12)
    c.cylindre(f'{etiquette}_palier', max(0.022, rayon * 0.95), 0.02, (x, y_mur - 0.01, z), P['tole_sombre'], 'Y', g,
               segments=16, chanfrein=0)
    return corps


def bobine_sur_arbre(etiquette, noms, bobine, largeur, bord, flanc, g, P, sous_la_bande, mandrin=0.055, pas_u=None):
    """Bobine et son mandrin carton (deux rotatifs) sur un arbre expansible sorti de la plaque arrière."""
    x, z, r = bobine
    b = c.bobine(noms[0], r, largeur, (x, 0, z), bord, flanc, 'Y', g, None, pas_u=pas_u)
    c.rotatif(b, r, sous_la_bande)
    m = c.bobine(noms[1], mandrin, largeur + 0.008, (x, 0, z), P['carton'], P['flanc_mandrin'], 'Y', g, 24)
    c.rotatif(m, r, sous_la_bande)
    avant = largeur / 2 + 0.05
    c.cylindre(f'{etiquette}_arbre', mandrin * 0.55, Y_MUR + avant, (x, (Y_MUR - avant) / 2, z), P['acier'], 'Y', g,
               segments=12)
    c.cylindre(f'{etiquette}_mandrin', mandrin * 0.85, 0.035, (x, -largeur / 2 - 0.03, z), P['tole_sombre'], 'Y', g,
               segments=16, chanfrein=0)
    c.cylindre(f'{etiquette}_valve', 0.011, 0.02, (x, -largeur / 2 - 0.057, z), P['chrome'], 'Y', g, segments=8)
    c.cylindre(f'{etiquette}_palier', mandrin * 1.3, 0.02, (x, Y_MUR - 0.01, z), P['tole_sombre'], 'Y', g, segments=20,
               chanfrein=0)
    return b


def moteur_dos(nom, x, z, g, P, rayon=0.05):
    """Moteur ou frein au dos de la plaque, dans l'axe qu'il entraîne, câble vers l'armoire."""
    y = Y_DOS + 0.09
    c.cylindre(nom, rayon, 0.18, (x, y, z), P['graphite'], 'Y', g, segments=16)
    c.cylindre(f'{nom}_capot', rayon * 0.8, 0.02, (x, Y_DOS + 0.19, z), P['tole_sombre'], 'Y', g, segments=16,
               chanfrein=0)
    c.boite(f'{nom}_connecteur', (0.045, 0.05, 0.03), (x, y + 0.02, z + rayon + 0.012), P['plastique_noir'], g)
    c.tuyau(f'{nom}_cable', [(x, y + 0.03, z + rayon + 0.025), (x + 0.06, y + 0.06, z + rayon), (x + 0.08, Y_DOS + 0.04,
                                                                                                  0.86)],
            0.007, P['plastique_noir'], g, resolution=3)


# --- Postes ----------------------------------------------------------------------------------------------------


def socle(racine, P):
    g = c.vide('socle', parent=racine)
    x0, x1, y0, y1 = -3.05, 2.55, -1.25, 0.85
    dalle = c.boite('socle_1', (x1 - x0, y1 - y0, 0.07), ((x0 + x1) / 2, (y0 + y1) / 2, -0.035), P['sol'], g,
                    chanfrein=0.012)
    dalle['role'] = 'socle'
    # Marquage au sol de la zone machine, aux cotes de l'ancien modèle.
    lx0, lx1, ly0, ly1, e = -2.91, 2.41, -1.11, 0.71, 0.035
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
    """Dérouleur : arbre expansible et frein, renvois, nettoyeur de bande à rouleaux collants, guide-bande."""
    g = c.vide('derouleur', parent=racine)
    x, z, r = DEROULEUR
    caisson('derouleur_armoire', -2.75, -1.95, -0.42, 0.42, 0.84, g, P)
    porte('derouleur_porte', -2.70, -2.12, 0.18, 0.78, -0.42, g, P)
    porte('derouleur_porte_dos', -2.66, -2.04, 0.18, 0.74, 0.42, g, P, grille=False, arriere=True)
    c.arret_urgence('derouleur_au', (-2.035, -0.42, 0.72), g, P)
    c.bouton('derouleur_marche', (-2.035, -0.42, 0.61), P['vert_bouton'], g, P)
    c.bouton('derouleur_impulsion', (-2.035, -0.42, 0.55), P['plastique_noir'], g, P)
    c.pictogramme_danger('derouleur_danger', (-2.7512, -0.2, 0.72), g, P, 0.05, normale='-X')
    plaque('derouleur_plaque', -2.72, -1.86, 0.84, 1.58, g, P)
    bobine_sur_arbre('derouleur', ('rotatif_1', 'rotatif_2'), DEROULEUR, LAIZE, P['papier'], P['flanc_papier'], g, P,
                     sous_la_bande=True)
    moteur_dos('derouleur_frein', x, z, g, P, rayon=0.07)
    # Capteur de diamètre à ultrasons, au-dessus de la bobine, sur une potence : la tension se règle sur le diamètre
    # restant. Il vise la bobine à gauche du sommet, là où la bande ne l'a pas encore quittée.
    xu = x - 0.10
    c.boite('derouleur_potence_pied', (0.03, 0.03, 0.12), (xu, Y_MUR + 0.04, 1.62), P['graphite'], g)
    c.boite('derouleur_potence_bras', (0.03, 0.36, 0.03), (xu, Y_MUR - 0.15, 1.665), P['graphite'], g)
    c.capteur('derouleur_diametre', 'ultrasons', (xu, -0.04, 1.54), g, P, 1, 'diametre', normale='-Z')
    # Renvoi haut (cylindre du catalogue), nettoyeur sur le brin vertical, renvoi bas qui couche la bande à 1 m. Les
    # deux renvois gardent le brin vertical à x = -1,965.
    r = rayon_catalogue(CYL_RENVOI)
    renvoi_haut = rouleau('derouleur_renvoi_haut', nouveau_rotatif(), r, (-1.965 - r, 1.5 - r), P['chrome'], g, P,
                          sous_la_bande=True)
    c.cylindre_catalogue(renvoi_haut, CYL_RENVOI, r * 2000)
    # Tension : cellule de charge sous le palier du renvoi haut, que la bande tire vers le bas.
    c.capteur('derouleur_tension', 'charge', (-1.965 - r, Y_MUR - 0.025, 1.5 - 2 * r - 0.0005), g, P, 1, 'tension',
              normale='+Z')
    # Le brin descend : le rouleau à gauche de la bande tourne en sens horaire, celui de droite à l'inverse.
    rouleau('nettoyeur_gauche', nouveau_rotatif(), 0.03, (-1.995, 1.25), P['nettoyeur'], g, P, sous_la_bande=True,
            longueur=0.40)
    rouleau('nettoyeur_droite', nouveau_rotatif(), 0.03, (-1.935, 1.25), P['nettoyeur'], g, P, sous_la_bande=False,
            longueur=0.40)
    c.boite('nettoyeur_antistatique', (0.016, 0.40, 0.03), (-1.94, 0.0, 1.37), P['graphite'], g)
    c.boite('nettoyeur_antistatique_pointe', (0.006, 0.36, 0.006), (-1.949, 0.0, 1.37), P['acier'], g, chanfrein=0)
    c.tuyau('nettoyeur_cable', [(-1.94, 0.20, 1.385), (-1.93, 0.24, 1.42), (-1.92, Y_MUR, 1.45)], 0.006,
            P['plastique_noir'], g, resolution=3)
    rouleau('derouleur_renvoi_bas', nouveau_rotatif(), r, (-1.965 + r, Z_BANDE + r), P['chrome'], g, P,
            sous_la_bande=False)
    # Guide-bande : capteur de bord en fourche, sur sa tige, à cheval sur le bord avant du brin vertical.
    c.cylindre('guide_tige', 0.008, Y_MUR + 0.23, (-1.90, (Y_MUR - 0.23) / 2, 1.12), P['acier'], 'Y', g)
    c.boite('guide_capteur', (0.09, 0.03, 0.05), (-1.94, -0.225, 1.12), P['plastique_noir'], g)
    for s in (-1, 1):
        c.boite(f'guide_bec_{s}', (0.012, 0.05, 0.04), (-1.965 + s * 0.022, -0.19, 1.12), P['plastique_noir'], g)
    return g


def impression(racine, P):
    """Armoire du module d'impression : niche des encres derrière sa porte vitrée, armoire électrique, plateau."""
    g = c.vide('impression', parent=racine)
    base = caisson('impression_armoire', -1.75, -0.15, -0.46, 0.46, 0.85, g, P, n=3)
    c.percer(base, c.boite('impression_niche_outil', (0.66, 0.20, 0.50), (-1.37, -0.46, 0.49), None, chanfrein=0))
    c.boite('impression_plateau', (1.62, 0.94, 0.02), (-0.95, 0, 0.86), P['tole_sombre'], g)
    # Encres : quatre bidons et le liquide de rinçage, sur un bac de rétention, chacun relié au circuit des têtes.
    c.boite('encres_bac', (0.64, 0.09, 0.04), (-1.37, -0.41, 0.26), P['inox'], g)
    for i in range(5):
        xb = -1.62 + 0.125 * i
        teinte = P['encres'][i] if i < 4 else P['papier']
        c.boite(f'encre_bidon_{i}', (0.095, 0.075, 0.22), (xb, -0.405, 0.39), P['bidon'], g)
        c.boite(f'encre_etiquette_{i}', (0.097, 0.077, 0.06), (xb, -0.405, 0.40), teinte, g, chanfrein=0.002)
        c.cylindre(f'encre_bouchon_{i}', 0.018, 0.022, (xb, -0.405, 0.511), teinte, 'Z', g, segments=12)
        if i == 1:
            c.capteur('encre_niveau_magenta', 'sonde', (xb + 0.03, -0.405, 0.50), g, P, 2, 'niveau_magenta',
                      normale='-Z')
        c.tuyau(f'encre_tuyau_{i}', [(xb, -0.405, 0.52), (xb, -0.40, 0.62), (xb, -0.385, 0.735)], 0.005, teinte, g,
                resolution=3)
    c.texte('encres_inscription', 'ENCRES', 0.028, (-1.37, -0.4608, 0.785), P['tole_sombre'], g)
    c.boite('encres_vitre', (0.66, 0.006, 0.50), (-1.37, -0.466, 0.49), P['verre'], g, chanfrein=0)
    for nom, taille, centre in (
        ('haut', (0.68, 0.012, 0.02), (-1.37, -0.468, 0.745)),
        ('bas', (0.68, 0.012, 0.02), (-1.37, -0.468, 0.235)),
        ('gauche', (0.02, 0.012, 0.52), (-1.705, -0.468, 0.49)),
        ('droite', (0.02, 0.012, 0.52), (-1.035, -0.468, 0.49)),
    ):
        c.boite(f'encres_cadre_{nom}', taille, centre, P['tole_sombre'], g)
    c.boite('encres_poignee', (0.016, 0.02, 0.12), (-1.075, -0.482, 0.52), P['chrome'], g)
    c.arret_urgence('impression_au', (-0.995, -0.46, 0.80), g, P)
    # Armoire électrique : porte, sectionneur général cadenassable, danger électrique.
    # Armoire électrique : niche de l'automate derrière une porte à hublot, sectionneur sur la partie pleine.
    c.percer(base, c.boite('armoire_niche_outil', (0.44, 0.24, 0.38), (-0.65, -0.46, 0.54), None, chanfrein=0))
    c.capteur('automate', 'automate', (-0.65, -0.4225, 0.58), g, P, 6, ['file', 'alarmes'])
    porte_ = c.profil('armoire_porte', c.rectangle_arrondi(-0.95, 0.18, -0.22, 0.80, 0.01), 0.008, -0.464, P['tole'],
                      g)
    c.percer(porte_, c.profil('armoire_porte_outil', c.rectangle_arrondi(-0.88, 0.36, -0.42, 0.72, 0.015), 0.05, -0.464,
                              None, chanfrein=0))
    c.boite('armoire_hublot', (0.47, 0.004, 0.37), (-0.65, -0.463, 0.54), P['verre'], g, chanfrein=0)
    c.boite('armoire_poignee', (0.016, 0.02, 0.11), (-0.915, -0.478, 0.54), P['chrome'], g)
    c.boite('armoire_grille', (0.18, 0.004, 0.08), (-0.65, -0.47, 0.26), P['graphite'], g, chanfrein=0)
    for j in range(3):
        c.boite(f'armoire_lame_{j}', (0.17, 0.006, 0.006), (-0.65, -0.473, 0.235 + 0.024 * j), P['tole_sombre'], g,
                chanfrein=0)
    c.boite('sectionneur_plaque', (0.10, 0.006, 0.10), (-0.33, -0.467, 0.64), P['jaune_securite'], g, chanfrein=0.002)
    c.cylindre('sectionneur_moyeu', 0.026, 0.016, (-0.33, -0.477, 0.64), P['plastique_noir'], 'Y', g, segments=16)
    c.boite('sectionneur_poignee', (0.11, 0.016, 0.026), (-0.33, -0.489, 0.64), P['rouge_arret'], g)
    c.pictogramme_danger('armoire_danger', (-0.33, -0.4685, 0.745), g, P, 0.045)
    # Dos : deux portes d'accès aux alimentations des têtes et au refroidisseur des LED.
    porte('impression_porte_dos_1', -1.70, -0.98, 0.18, 0.80, 0.46, g, P, grille=True, arriere=True)
    porte('impression_porte_dos_2', -0.92, -0.20, 0.18, 0.80, 0.46, g, P, poignee_droite=False, grille=False,
          arriere=True)
    # Goulotte au sol qui relie les armoires des quatre modules, au dos.
    c.boite('goulotte', (4.96, 0.10, 0.05), (-0.21, 0.52, 0.025), P['graphite'], g)
    return g


def capot(racine, P):
    """Capot relevable du module d'impression : armature anthracite, grande vitre, toit, passages de bande."""
    g = c.vide('capot', parent=racine)
    c.boite('capot_toit', (1.62, 0.92, 0.04), (-0.95, 0, 1.44), P['tole_sombre'], g)
    c.boite('capot_fond', (1.56, 0.03, 0.55), (-0.95, 0.445, 1.145), P['tole'], g)
    # Flancs ouverts d'une fente à hauteur de bande.
    for i, xe in enumerate((-1.735, -0.165)):
        c.boite(f'capot_flanc_bas_{i}', (0.03, 0.86, 0.105), (xe, 0, 0.9225), P['tole'], g)
        c.boite(f'capot_flanc_haut_{i}', (0.03, 0.86, 0.395), (xe, 0, 1.2225), P['tole'], g)
    cadre = c.profil('capot_cadre', c.rectangle_arrondi(-1.75, 0.87, -0.15, 1.42, 0.02), 0.03, -0.43,
                     P['tole_sombre'], g)
    outil = c.profil('capot_cadre_outil', c.rectangle_arrondi(-1.70, 0.93, -0.20, 1.37, 0.02), 0.12, -0.43, None,
                     chanfrein=0)
    c.percer(cadre, outil)
    c.boite('capot_vitre', (1.52, 0.006, 0.46), (-0.95, -0.428, 1.15), P['verre'], g, chanfrein=0)
    c.cylindre('capot_poignee', 0.012, 0.80, (-0.95, -0.478, 1.395), P['chrome'], 'X', g)
    for s in (-1, 1):
        c.boite(f'capot_poignee_patte_{s}', (0.02, 0.035, 0.02), (-0.95 + s * 0.38, -0.46, 1.395), P['chrome'], g)
    c.pictogramme_danger('capot_danger', (-1.665, -0.4455, 1.395), g, P, 0.034)
    return g


def tetes(racine, P):
    """Quatre barres de têtes CMJN sur leurs rails, rouleau d'appui sous chacune, lampe de fixation après chacune."""
    g = c.vide('tetes', parent=racine)
    c.boite('tetes_plaque_arriere', (1.50, 0.06, 0.16), (-0.95, 0.29, 0.95), P['tole_sombre'], g)
    # Contrôle des buses : caméra qui lit la mire imprimée après la dernière barre, pendue à une traverse du capot.
    c.boite('buses_traverse', (0.03, 0.84, 0.03), (-0.53, 0.0, 1.30), P['graphite'], g)
    c.cylindre('buses_tige', 0.008, 0.12, (-0.53, 0.0, 1.225), P['acier'], 'Z', g, segments=8, chanfrein=0)
    c.capteur('buses_camera', 'camera', (-0.53, 0.0, 1.07), g, P, 2, 'buses', normale='-Z')
    for s in (-1, 1):
        c.boite(f'tetes_rail_{s}', (1.06, 0.04, 0.04), (-1.11, s * 0.35, 1.13), P['acier'], g)
        for xe in (-1.62, -0.60):
            c.boite(f'tetes_montant_{s}_{xe}', (0.04, 0.04, 0.24), (xe, s * 0.35, 0.99), P['graphite'], g)
    for k, x in enumerate(X_TETES):
        lettre, _ = ENCRES[k]
        encre = P['encres'][k]
        c.boite(f'barre_{lettre}', (0.13, 0.76, 0.10), (x, 0, 1.14), P['graphite'], g)
        # Trois têtes en quinconce couvrent la laize.
        for j, yh in enumerate((-0.115, 0.0, 0.115)):
            c.boite(f'barre_{lettre}_tete_{j}', (0.05, 0.125, 0.034), (x + (0.02 if j % 2 == 0 else -0.02), yh, 1.073),
                    P['acier'], g, chanfrein=0.002)
        c.boite(f'barre_{lettre}_reservoir', (0.08, 0.10, 0.07), (x, -0.22, 1.225), encre, g)
        c.boite(f'barre_{lettre}_embout', (0.135, 0.012, 0.10), (x, -0.385, 1.14), encre, g, chanfrein=0.002)
        c.texte(f'barre_{lettre}_lettre', lettre, 0.05, (x, -0.3915, 1.14),
                P['papier'] if lettre in 'MN' else P['plastique_noir'], g)
        # Aller et retour d'encre vers le fond du capot, câble de données.
        for i, dx in enumerate((-0.022, 0.022)):
            c.tuyau(f'barre_{lettre}_encre_{i}', [(x + dx, -0.22, 1.258), (x + dx, -0.14, 1.32), (x + dx, 0.20, 1.33),
                                                   (x + dx, 0.44, 1.29)], 0.0055, encre, g, resolution=3)
        c.tuyau(f'barre_{lettre}_cable', [(x, 0.12, 1.19), (x, 0.22, 1.27), (x + 0.03, 0.44, 1.30)], 0.008,
                P['plastique_noir'], g, resolution=3)
        ra = rayon_catalogue(CYL_ENTRAINEMENT)
        appui = rouleau(f'appui_{lettre}', 'rotatif_3' if k == 2 else nouveau_rotatif(), ra, (x, Z_BANDE - ra),
                        P['chrome'], g, P, sous_la_bande=True)
        if k == 2:
            c.cylindre_catalogue(appui, CYL_ENTRAINEMENT, ra * 2000)
            # Vitesse machine : codeur à arbre creux sur le bout avant du rouleau d'entraînement.
            c.capteur('vitesse_codeur', 'codeur', (x, -LONG_ROULEAU / 2 - 0.009, Z_BANDE - ra), g, P, 6, 'vitesse',
                      normale='+Y')
        if lettre == 'M':
            # Température des têtes : sonde plongée dans le réservoir tampon chauffé de la barre magenta.
            c.capteur('tetes_temperature', 'sonde', (x, -0.245, 1.26), g, P, 2, 'temperature_tetes', normale='-Z')
        xf = x + 0.12
        c.boite(f'fixation_{lettre}', (0.05, 0.74, 0.04), (xf, 0, 1.09), P['graphite'], g)
        c.boite(f'fixation_{lettre}_led', (0.03, 0.34, 0.006), (xf, 0, 1.068), P['led'], g, chanfrein=0)
    return g


def sechage_uv(racine, P):
    """Séchage UV LED final : carter à ailettes, fenêtre d'émission, refroidissement à eau, rouleau refroidi."""
    g = c.vide('sechage_uv', parent=racine)
    x = X_UV
    c.boite('uv_carter', (0.20, 0.56, 0.12), (x, 0, 1.13), P['graphite'], g)
    for i in range(6):
        c.boite(f'uv_ailette_{i}', (0.008, 0.50, 0.05), (x - 0.075 + 0.03 * i, 0, 1.215), P['acier'], g, chanfrein=0)
    c.boite('uv_facade', (0.18, 0.008, 0.10), (x, -0.284, 1.13), P['inox'], g, chanfrein=0.002)
    c.texte('uv_marque', 'UV', 0.035, (x - 0.045, -0.2885, 1.15), P['tole_sombre'], g)
    c.boite('uv_temoin', (0.02, 0.006, 0.01), (x - 0.045, -0.289, 1.105), P['temoin'], g, chanfrein=0.001)
    c.pictogramme_danger('uv_danger', (x + 0.045, -0.2885, 1.12), g, P, 0.04)
    c.boite('uv_fenetre', (0.16, 0.46, 0.006), (x, 0, 1.067), P['led'], g, chanfrein=0)
    for s in (-1, 1):
        c.boite(f'uv_suspente_{s}', (0.03, 0.03, 0.18), (x, s * 0.2, 1.33), P['graphite'], g)
        c.tuyau(f'uv_eau_{s}', [(x + s * 0.04, 0.24, 1.19), (x + s * 0.04, 0.32, 1.27), (x + s * 0.05, 0.44, 1.26)],
                0.009, P['plastique_noir'], g, resolution=3)
    rs = rayon_catalogue(CYL_SECHAGE)
    refroidi = rouleau('uv_refroidi', nouveau_rotatif(), rs, (x, Z_BANDE - rs), P['chrome'], g, P, sous_la_bande=True)
    c.cylindre_catalogue(refroidi, CYL_SECHAGE, rs * 2000)
    # Température des LED : sonde glissée entre les ailettes jusqu'au radiateur.
    c.capteur('uv_temperature', 'sonde', (x, -0.12, 1.245), g, P, 3, 'temperature_led', normale='-Z')
    # Puissance : cellule UV au ras de la bande, qui regarde la fenêtre d'émission, sur sa tige depuis la plaque.
    xc = x + 0.07
    c.cylindre('uv_cellule_tige', 0.006, Y_MUR + 0.215, (xc, (Y_MUR - 0.215) / 2, 0.97), P['acier'], 'Y', g,
               segments=8, chanfrein=0)
    c.capteur('uv_puissance', 'cellule', (xc, -0.215, 0.999), g, P, 3, 'puissance', normale='+Z')
    return g


def finition(racine, P):
    """
    Finition en ligne : pelliculage (film déroulé au-dessus, posé par un presseur avant la découpe), découpe rotative
    sur cylindre magnétique, échenillage de la matrice, refente.
    """
    g = c.vide('finition', parent=racine)
    caisson('finition_armoire', 0.05, 1.19, -0.42, 0.42, 0.80, g, P, n=3)
    porte('finition_porte_1', 0.09, 0.60, 0.18, 0.74, -0.42, g, P)
    porte('finition_porte_2', 0.64, 1.15, 0.18, 0.74, -0.42, g, P, poignee_droite=False, grille=False)
    porte('finition_porte_dos', 0.30, 0.90, 0.18, 0.74, 0.42, g, P, grille=False, arriere=True)
    c.boite('finition_plateau', (1.16, 0.86, 0.03), (0.62, 0, 0.815), P['tole_sombre'], g)
    plaque('finition_mur', 0.06, 1.18, 0.83, 1.50, g, P)

    # Pelliculage : le film part du haut de sa bobine vers l'arrière, contourne un renvoi et descend au presseur.
    bobine_sur_arbre('film', ('rotatif_6', 'rotatif_7'), FILM, 0.33, P['film_bord'], P['flanc_film'], g, P,
                     sous_la_bande=False, mandrin=0.038)
    moteur_dos('film_frein', FILM[0], FILM[1], g, P, rayon=0.04)
    rouleau('pell_renvoi', nouveau_rotatif(), 0.03, (0.19, 1.35), P['chrome'], g, P, sous_la_bande=False)
    rouleau('pell_presseur', nouveau_rotatif(), 0.04, (0.20, 1.04), P['caoutchouc'], g, P, sous_la_bande=False)
    rouleau('pell_appui', nouveau_rotatif(), 0.04, (0.20, 0.96), P['chrome'], g, P, sous_la_bande=True)
    c.cylindre('pell_verin', 0.016, 0.10, (0.27, 0.235, 1.10), P['acier'], 'Z', g, segments=12)
    c.cylindre('pell_verin_tige', 0.006, 0.06, (0.27, 0.235, 1.03), P['chrome'], 'Z', g, segments=8)

    # Repérage : cellule qui lit les marques imprimées avant la découpe.
    c.cylindre('reperage_tige', 0.007, Y_MUR + 0.11, (0.30, (Y_MUR - 0.11) / 2, 1.085), P['acier'], 'Y', g)
    c.capteur('reperage_cellule', 'cellule', (0.30, -0.10, 1.03), g, P, 4, 'reperage', normale='-Z')

    # Découpe : flasque avant à fenêtre, cylindre magnétique et sa forme souple, contre-cylindre, pont de pression.
    x = X_DECOUPE
    fl = c.profil('decoupe_flasque', c.rectangle_arrondi(x - 0.15, 0.83, x + 0.15, 1.25, 0.03), 0.04, -0.27,
                  P['tole_sombre'], g)
    c.percer(fl, c.profil('decoupe_flasque_outil', c.rectangle_arrondi(x - 0.10, 0.88, x + 0.10, 1.13, 0.02), 0.16,
                          -0.27, None, chanfrein=0))
    for i, (xv, zv) in enumerate(((x - 0.125, 0.86), (x + 0.125, 0.86), (x - 0.125, 1.16), (x + 0.125, 1.16))):
        c.vis(f'decoupe_vis_{i}', (xv, -0.29, zv), g, P['acier'])
    c.pictogramme_danger('decoupe_danger', (x, -0.2905, 1.19), g, P, 0.045)
    rm, rc = rayon_catalogue(CYL_MAGNETIQUE), rayon_catalogue(CYL_CONTRE)
    ep_forme = 0.0009  # forme souple d'acier, posée sur le cylindre : c'est elle qui touche la bande
    zm = Z_BANDE + rm + ep_forme
    mag = rouleau('decoupe_magnetique', 'rotatif_4', rm, (x, zm), P['acier'], g, P, sous_la_bande=False,
                  longueur=0.44, rayon_vitesse=rm + ep_forme)
    c.cylindre_catalogue(mag, CYL_MAGNETIQUE, rm * 2000)
    for s in (-1, 1):
        bague = c.anneau(f'decoupe_bague_{s}', rm + ep_forme, 0.035, 0.02, (x, s * 0.205, zm), P['chrome'], 'Y',
                         segments=24, chanfrein=0)
        c.attacher(bague, mag)
    forme = c.secteur('rotatif_5', rm + ep_forme, rm - 0.0002, 0.36, 320, (x, 0, zm), P['forme'], 'Y', g,
                      debut_deg=200)
    c.rotatif(forme, rm + ep_forme, sous_la_bande=False)
    contre = rouleau('decoupe_contre', nouveau_rotatif(), rc, (x, Z_BANDE - rc), P['chrome'], g, P,
                     sous_la_bande=True, longueur=0.44)
    c.cylindre_catalogue(contre, CYL_CONTRE, rc * 2000)
    # Pression de découpe : transmetteur vissé sur le pont, dans le circuit des vérins de pression.
    c.capteur('decoupe_pression', 'pression', (x + 0.10, -0.20, 1.25), g, P, 4, 'pression', normale='-Z')
    c.boite('decoupe_pont', (0.30, 0.58, 0.07), (x, -0.005, 1.215), P['tole_sombre'], g)
    for j, dx in enumerate((-0.065, 0.065)):
        c.bobine(f'decoupe_manometre_{j}', 0.028, 0.025, (x + dx, -0.305, 1.215), P['chrome'], P['manometre'], 'Y', g,
                 28)
    for s in (-1, 1):
        yv = s * 0.17
        c.cylindre(f'decoupe_vis_pression_{s}', 0.014, 0.05, (x, yv, 1.27), P['acier'], 'Z', g, segments=12)
        c.anneau(f'decoupe_volant_{s}', 0.045, 0.037, 0.01, (x, yv, 1.30), P['chrome'], 'Z', g, segments=24)
        for a in range(3):
            ang = math.radians(90 + 120 * a)
            c.boite(f'decoupe_rayon_{s}_{a}', (0.04, 0.007, 0.005),
                    (x + 0.02 * math.cos(ang), yv + 0.02 * math.sin(ang), 1.30), P['chrome'], g, chanfrein=0,
                    rotation=(0, 0, ang))
        c.cylindre(f'decoupe_moyeu_{s}', 0.01, 0.018, (x, yv, 1.30), P['chrome'], 'Z', g, segments=10)
    moteur_dos('decoupe_servo', x, zm, g, P)
    # Boîtier de commande locale sur le côté de la flasque.
    c.boite('decoupe_boitier', (0.075, 0.03, 0.16), (x + 0.19, -0.275, 1.05), P['graphite'], g)
    c.arret_urgence('decoupe_au', (x + 0.19, -0.29, 1.095), g, P)
    c.bouton('decoupe_marche', (x + 0.19, -0.29, 1.025), P['vert_bouton'], g, P)
    c.bouton('decoupe_impulsion', (x + 0.19, -0.29, 0.99), P['plastique_noir'], g, P)

    # Échenillage : la matrice quitte la bande sur le rouleau d'appui et monte à sa bobine.
    rouleau('ech_appui', nouveau_rotatif(), 0.035, (0.97, 0.965), P['chrome'], g, P, sous_la_bande=True)
    bobine_sur_arbre('matrice', ('rotatif_8', 'rotatif_9'), MATRICE, LAIZE, P['matrice_bord'], P['flanc_matrice'], g,
                     P, sous_la_bande=True, mandrin=0.038)
    moteur_dos('matrice_moteur', MATRICE[0], MATRICE[1], g, P, rayon=0.045)

    # Refente : deux lames circulaires sur leur barre, contre-rouleau trempé sous la bande.
    rouleau('refente_contre', nouveau_rotatif(), 0.035, (1.10, 0.965), P['acier'], g, P, sous_la_bande=True)
    c.boite('refente_barre', (0.04, 0.47, 0.04), (1.10, 0.025, 1.10), P['graphite'], g)
    for s in (-1, 1):
        c.boite(f'refente_porte_lame_{s}', (0.03, 0.03, 0.05), (1.10, s * 0.057, 1.065), P['graphite'], g)
        c.cylindre(f'refente_lame_{s}', 0.028, 0.003, (1.10, s * 0.057 - 0.018, 1.025), P['inox'], 'Y', g,
                   segments=20, chanfrein=0)
    return g


def renvoi(racine, P):
    """Colonne de renvoi entre finition et rembobineur, avec la cellule de comptage des étiquettes."""
    g = c.vide('renvoi', parent=racine)
    x = 1.48
    c.boite('renvoi_semelle', (0.24, 0.24, 0.02), (x, 0.36, 0.01), P['tole_sombre'], g)
    c.boite('renvoi_colonne', (0.14, 0.14, 1.04), (x, 0.36, 0.54), P['tole'], g)
    rouleau('renvoi', nouveau_rotatif(), 0.035, (x, 1.035), P['chrome'], g, P, sous_la_bande=False, y_mur=0.29)
    # Tension de rembobinage : cellule de charge sous le palier du dernier renvoi avant la bobine.
    c.capteur('remb_tension', 'charge', (x, 0.265, 1.035 - 0.0335), g, P, 5, 'tension', normale='+Z')
    xc = 1.40
    # Étiquettes rembobinées : fourche à étiquettes à cheval sur le bord avant de la bande, sur sa tige.
    c.cylindre('comptage_tige', 0.007, 0.53, (xc, 0.025, 1.075), P['acier'], 'Y', g)
    c.boite('comptage_patte', (0.02, 0.016, 0.06), (xc, -0.228, 1.05), P['graphite'], g, chanfrein=0)
    c.capteur('comptage_fourche', 'fourche', (xc, -0.15, Z_BANDE), g, P, 5, 'comptage', normale='+Y')
    return g


def rembobineur(racine, P):
    g = c.vide('rembobineur', parent=racine)
    x, z, r = REMBOBINEUR
    caisson('remb_armoire', 1.62, 2.34, -0.42, 0.42, 0.80, g, P)
    porte('remb_porte', 1.67, 2.17, 0.18, 0.74, -0.42, g, P)
    porte('remb_porte_dos', 1.67, 2.29, 0.18, 0.74, 0.42, g, P, grille=False, arriere=True)
    c.arret_urgence('remb_au', (2.26, -0.42, 0.70), g, P)
    c.bouton('remb_marche', (2.26, -0.42, 0.60), P['vert_bouton'], g, P)
    c.bouton('remb_impulsion', (2.26, -0.42, 0.54), P['plastique_noir'], g, P)
    c.pictogramme_danger('remb_danger', (2.3412, -0.2, 0.70), g, P, 0.05, normale='+X')
    plaque('remb_plaque', 1.66, 2.30, 0.80, 1.40, g, P)
    bobine_sur_arbre('remb', ('rotatif_10', 'rotatif_11'), REMBOBINEUR, LAIZE, P['bord_etiquettes'],
                     P['flanc_etiquettes'], g, P, sous_la_bande=True, pas_u=c.PAS_ETIQUETTE)
    moteur_dos('remb_moteur', x, z, g, P, rayon=0.065)
    # Rouleau presseur sur la bobine, juste après l'arrivée de la bande, porté par un bras pivotant.
    rp = rayon_catalogue(CYL_PRESSEUR)
    a = math.radians(100)
    xp, zp = x + (r + rp) * math.cos(a), z + (r + rp) * math.sin(a)
    presseur = rouleau('remb_presseur', nouveau_rotatif(), rp, (xp, zp), P['caoutchouc'], g, P, sous_la_bande=False,
                       longueur=0.38, y_mur=0.215)
    c.cylindre_catalogue(presseur, CYL_PRESSEUR, rp * 2000)
    xo, zo = 1.74, 1.30
    lg = math.hypot(xp - xo, zp - zo)
    c.boite('remb_presseur_bras', (lg + 0.04, 0.025, 0.03), ((xo + xp) / 2, 0.232, (zo + zp) / 2), P['graphite'], g,
            rotation=(0, -math.atan2(zp - zo, xp - xo), 0))
    c.cylindre('remb_presseur_pivot', 0.022, 0.02, (xo, 0.25, zo), P['tole_sombre'], 'Y', g, segments=16)
    return g


def bandes(racine, P):
    """Chemin de bande. Les sept anciens bande_N gardent leur rôle ; 8 à 10 sont les brins ajoutés."""
    g = c.vide('bande', parent=racine)
    film = 0.33
    c.bande('bande_1', (0.16, 1.35), (0.16, 1.04), film, P['bande_film'], g)
    c.bande('bande_2', (0.97, Z_BANDE), tangente((0.97, Z_BANDE), MATRICE[:2], MATRICE[2]), LAIZE,
            P['bande_matrice'], g)
    r = rayon_catalogue(CYL_RENVOI)
    c.bande('bande_3', (DEROULEUR[0], DEROULEUR[1] + DEROULEUR[2]), (-1.965 - r, 1.5), LAIZE, P['bande_vierge'], g)
    c.bande('bande_4', (-1.965 + r, Z_BANDE), (-1.6, Z_BANDE), LAIZE, P['bande_vierge'], g)
    c.bande('bande_5', (-1.6, Z_BANDE), (0.6, Z_BANDE), LAIZE, P['bande_imprimee'], g)
    c.bande('bande_6', (0.6, Z_BANDE), (0.97, Z_BANDE), LAIZE, P['bande_imprimee'], g)
    c.bande('bande_7', (0.97, Z_BANDE), (1.48, Z_BANDE), LAIZE, P['bande_decoupee'], g)
    c.bande('bande_8', (-1.965, 1.5 - r), (-1.965, Z_BANDE + r), LAIZE, P['bande_vierge'], g)
    # La bande passe sous le renvoi et remonte vers le haut de la bobine rembobinée.
    depart = (1.48 + 0.035 * math.sin(math.radians(39)), 1.035 - 0.035 * math.cos(math.radians(39)))
    c.bande('bande_9', depart, tangente(depart, REMBOBINEUR[:2], REMBOBINEUR[2]), LAIZE, P['bande_decoupee'], g)
    c.bande('bande_10', (FILM[0], FILM[1] + FILM[2]), (0.19, 1.38), film, P['bande_film'], g)
    return g


def pupitre(racine, P):
    """Pupitre sur bras articulé, accroché au toit du capot : écran tactile incliné, clavier, arrêt d'urgence."""
    import bmesh

    g = c.vide('pupitre', parent=racine)
    x = -0.45
    inclinaison = math.radians(-8)
    c.cylindre('pup_mat', 0.025, 0.16, (x, 0.36, 1.54), P['graphite'], 'Z', g, segments=16)
    c.boite('pup_articulation_haute', (0.07, 0.07, 0.06), (x, 0.36, 1.62), P['tole_sombre'], g)
    c.cylindre('pup_bras', 0.025, 1.06, (x, -0.17, 1.62), P['graphite'], 'Y', g, segments=16)
    c.boite('pup_coude', (0.07, 0.07, 0.06), (x, -0.70, 1.62), P['tole_sombre'], g)
    c.cylindre('pup_descente', 0.025, 0.14, (x, -0.70, 1.52), P['graphite'], 'Z', g, segments=16)
    c.boite('pup_rotule', (0.08, 0.06, 0.05), (x, -0.70, 1.455), P['tole_sombre'], g)
    c.boite('pup_tete', (0.52, 0.06, 0.34), (x, -0.715, 1.28), P['tole_sombre'], g, rotation=(inclinaison, 0, 0))
    c.boite('pup_clavier', (0.40, 0.08, 0.04), (x, -0.725, 1.085), P['graphite'], g)
    c.arret_urgence('pup_au', (x + 0.13, -0.725, 1.105), g, P, '+Z')
    c.bouton('pup_marche', (x - 0.06, -0.725, 1.105), P['vert_bouton'], g, P, '+Z')
    c.bouton('pup_arret', (x - 0.12, -0.725, 1.105), P['plastique_noir'], g, P, '+Z')
    # Écran : plan texturé, face avant, posé sur la tête inclinée.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    w, h = 0.46, 0.288
    coins = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    f = bm.faces.new([bm.verts.new((u, 0, v)) for u, v in coins])
    for loop, (u, v) in zip(f.loops, coins):
        loop[uv].uv = (u / w + 0.5, v / h + 0.5)
    e = c._objet('ecran_ihm', bm, P['ecran'], g, (0, 0, 0), (0, 0, 0), None, 0)
    e.rotation_euler = (inclinaison, 0, 0)
    e.location = (x, -0.7458, 1.2843)
    e['role'] = 'ecran'
    return g


def colonne_lumineuse(racine, P):
    g = c.vide('colonne_lumineuse', parent=racine)
    x, y = -1.62, 0.36
    c.cylindre('colonne_pied', 0.03, 0.015, (x, y, 1.4675), P['graphite'], 'Z', g)
    c.cylindre('colonne_mat', 0.012, 0.145, (x, y, 1.5475), P['acier'], 'Z', g)
    c.cylindre('colonne_douille', 0.032, 0.012, (x, y, 1.626), P['plastique_noir'], 'Z', g)
    for nom, zv, mat, etat in (('voyant_vert', 1.66, P['vert'], 'marche'), ('voyant_orange', 1.718, P['orange'],
                                                                             'attention'),
                               ('voyant_rouge', 1.776, P['rouge'], 'arret')):
        v = c.cylindre(nom, 0.032, 0.054, (x, y, zv), mat, 'Z', g, None, chanfrein=0.002)
        v['role'] = 'voyant'
        v['etat'] = etat
    for i, zv in enumerate((1.689, 1.747)):
        c.cylindre(f'colonne_bague_{i}', 0.0325, 0.004, (x, y, zv), P['plastique_noir'], 'Z', g, None, chanfrein=0.0005)
    c.cylindre('colonne_chapeau', 0.032, 0.02, (x, y, 1.813), P['plastique_noir'], 'Z', g)
    return g


# --- Assemblage ------------------------------------------------------------------------------------------------


def construire():
    _ajoutes['n'] = 11
    P = matieres()
    fiche = c.kit_machine(MACHINE)
    racine = c.vide(MACHINE, props={'machine': fiche['nom'], 'fiabilite': 'Technologie confirmée', 'unite': 'metre',
                                    'axeHaut': 'Y'})
    groupes = [
        derouleur(racine, P),
        impression(racine, P),
        capot(racine, P),
        tetes(racine, P),
        sechage_uv(racine, P),
        finition(racine, P),
        renvoi(racine, P),
        rembobineur(racine, P),
        pupitre(racine, P),
        colonne_lumineuse(racine, P),
    ]
    bandes(racine, P)
    g_socle = socle(racine, P)
    ombre = c.ombre_au_sol('socle_6', -2.98, 2.48, -1.18, 0.78, 0.003, largeur_px=512)
    ombre['role'] = 'socle'
    ombre.parent = g_socle
    c.points_diagnostic(
        [(p['numero'], p['nom'], c.depuis_gltf(p['position'])) for p in fiche['points_diagnostic']], racine)
    c.reperes([(r['texte'], c.depuis_gltf(r['position'])) for r in fiche['reperes']], racine)
    return racine, groupes


def vues(objets):
    v = c.vues_par_defaut(objets)
    v['tetes'] = dict(position=(-1.75, -2.1, 1.8), cible=(-1.0, 0, 1.05), focale=40)
    v['derouleur'] = dict(position=(-3.2, -1.35, 1.65), cible=(-2.15, 0, 1.15), focale=40)
    v['finition'] = dict(position=(0.05, -1.4, 1.65), cible=(0.65, 0, 1.12), focale=40)
    v['rembobineur'] = dict(position=(2.85, -1.35, 1.55), cible=(1.75, 0, 1.05), focale=40)
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
