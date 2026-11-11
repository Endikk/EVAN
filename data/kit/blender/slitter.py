"""
Refendeuse-rembobineuse du kit : la bobine mère imprimée est déroulée, contrôlée sur une table lumineuse, refendue en
cinq pistes par des couteaux circulaires, puis rembobinée en bobinettes au métrage du client sur deux arbres.

  blender --background --factory-startup --python data/kit/blender/slitter.py -- [--apercu <dossier>] [--vues a,b]

La disposition reprend celle de l'ancien modèle, que le reste de l'application connaît : bande à 1,40 m sur la table,
mêmes axes de bobine mère, de renvois, de contre-couteau, de couteaux et d'arbres de rembobinage, mêmes points de
diagnostic et repères (lus dans machines.json), même emprise au sol (MODEL_FOOTPRINT de domain/catalog.ts). Le dessin
est celui d'une refendeuse en porte-à-faux : un mur arrière porte l'arbre de la bobine mère et son frein, les rouleaux,
la table, la barre porte-couteaux et les deux arbres ; le côté conducteur reste libre pour charger la bobine mère et
sortir les bobinettes. Proportions approximatives, sans logo ni livrée de marque.

Textures propres : slitter_bande_mere.png (cinq étiquettes de front, une par piste), slitter_bande_piste.png (une
piste refendue), slitter_ecran.png (écran du pupitre, repris de l'ancien modèle et remis à l'endroit).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as c  # noqa: E402

MACHINE = 'slitter'
LAIZE = 0.88  # bande mère : cinq pistes de 0,172 m et deux rives de 1 cm
LONG_ROULEAU = 0.94
# Dérouleur : bobine mère sur son arbre expansible.
X_MERE, Z_MERE, R_MERE = -0.72, 0.86, 0.40
# Cylindres nommés du catalogue (data/catalog.json), au diamètre que l'analyse des défauts répétitifs attend.
CYL_RENVOI = 'Rouleau de renvoi de la bobine mère'
CYL_TENDEUR = 'Rouleau tendeur de la table'
CYL_CONTRE = 'Rouleau contre-lame'
CYL_CONTACT = 'Rouleau de contact du rembobinage'


def rayon_catalogue(nom):
    return c.diametre_catalogue(MACHINE, nom) / 2000


# Renvoi d'entrée et rouleau tendeur de sortie de table : la bande y passe à 1,40 m, leurs axes suivent leur rayon.
Z_BANDE = 1.40
R_RENVOI, R_TENDEUR = rayon_catalogue(CYL_RENVOI), rayon_catalogue(CYL_TENDEUR)
RENVOIS = ((-0.20, Z_BANDE - R_RENVOI), (0.55, Z_BANDE - R_TENDEUR))
# Refente : contre-couteau sous la bande, couteaux circulaires au-dessus, une lame entre deux pistes et une par rive.
X_REFENTE = 0.82
Z_CONTRE, R_CONTRE = 1.335, rayon_catalogue(CYL_CONTRE)
Z_COUTEAU = 1.48
# La lame descend 3 mm sous le dessus du contre-couteau : elle cisaille la bande contre sa contre-lame.
R_COUTEAU = Z_COUTEAU - (Z_CONTRE + R_CONTRE) + 0.003
Z_BARRE = 1.64
Y_COUTEAUX = (0.43, 0.258, 0.086, -0.086, -0.258, -0.43)
# Rembobinage : deux arbres différentiels, une piste sur deux sur chacun pour que les bobinettes voisines ne se
# touchent pas. Ordre des pistes = ordre des anciens rotatif_12 à 21.
X_REMB = 1.42
ARBRES = {'haut': (1.08, 0.15), 'bas': (0.68, 0.13)}  # hauteur de l'arbre, rayon des bobinettes
PISTES = ((0.344, 'haut'), (0.172, 'bas'), (0.0, 'haut'), (-0.172, 'bas'), (-0.344, 'haut'))
LARGEUR_PISTE = 0.16
R_MANDRIN = 0.055
# Bâti-armoire et mur porteur.
X_BATI = (-1.16, 1.72)
Y_AVANT = -0.51  # face avant du bâti
Y_MUR = 0.48  # face avant du mur
EP_MUR = 0.12
Y_DOS = Y_MUR + EP_MUR
Y_MILIEU_MUR = Y_MUR + EP_MUR / 2
Z_BATI = 0.32
Z_MUR = 1.74


def matieres():
    P = c.palette()
    P.update(
        carton=c.matiere('carton_mandrin', '#a67b4e', 0.0, 0.8),
        vert=c.matiere('voyant_vert', '#27c46a', 0.0, 0.3),
        orange=c.matiere('voyant_orange', '#ff9a1a', 0.0, 0.3),
        rouge=c.matiere('voyant_rouge', '#ff3a2e', 0.0, 0.3),
        flanc_etiquettes=c.matiere('flanc_etiquettes', '#ffffff', 0.0, 0.7, image='bobine_etiquettes_flanc.png'),
        flanc_mandrin=c.matiere('flanc_mandrin', '#ffffff', 0.0, 0.8, image='mandrin_carton.png'),
        bord_mere=c.matiere('bord_bobine_mere', '#ffffff', 0.0, 0.5, image='slitter_bande_mere.png'),
        bord_piste=c.matiere('bord_bobinette', '#ffffff', 0.0, 0.5, image='slitter_bande_piste.png'),
        bande_mere=c.matiere('bande_mere', '#ffffff', 0.0, 0.5, image='slitter_bande_mere.png'),
        bande_piste=c.matiere('bande_piste', '#ffffff', 0.0, 0.5, image='slitter_bande_piste.png'),
        manometre=c.matiere('cadran_manometre', '#ffffff', 0.0, 0.3, image='manometre.png'),
        ecran=c.matiere('ecran_refente', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                        image='slitter_ecran.png'),
        plateau=c.matiere('plateau_lumineux', '#eef3f1', 0.0, 0.25, emission='#f4f8ff', force=1.4),
        led=c.matiere('led_eclairage', '#f4f6f8', 0.0, 0.3, emission='#ffffff', force=2.0),
        afficheur=c.matiere('afficheur_metrage', '#ff3b2f', 0.0, 0.3, emission='#ff3b2f', force=2.5),
        vitre_afficheur=c.matiere('vitre_afficheur', '#1a0b0a', 0.0, 0.12),
        objectif=c.matiere('objectif_camera', '#0e1216', 0.6, 0.08),
        rive=c.matiere('rive_support', '#e9d597', 0.0, 0.8),
    )
    return P


# --- Pièces répétées -------------------------------------------------------------------------------------------


def palier_mur(nom, x, z, rayon, g, P):
    """Flasque de palier sur la face avant du mur, à l'entrée d'un arbre."""
    c.cylindre(nom, rayon * 1.7, 0.02, (x, Y_MUR - 0.01, z), P['tole_sombre'], 'Y', g, segments=20)


def rouleau(nom, rayon, x, z, mat, g, P, sous_la_bande, longueur=LONG_ROULEAU, y=0.0, palier=True):
    """Rouleau en porte-à-faux : corps tournant (rotatif_N) avec son bout avant, arbre fixe jusqu'au mur, palier."""
    corps = c.cylindre(c.suivant('rotatif'), rayon, longueur, (x, y, z), mat, 'Y', g)
    c.rotatif(corps, rayon, sous_la_bande)
    avant = y - longueur / 2
    bout = c.cylindre(f'{nom}_bout', rayon * 0.78, 0.008, (x, avant - 0.004, z), P['tole_sombre'], 'Y')
    c.attacher(bout, corps)
    ecrou = c.cylindre(f'{nom}_ecrou', max(0.006, rayon * 0.2), 0.008, (x, avant - 0.012, z), P['acier'], 'Y',
                       segments=6)
    c.attacher(ecrou, corps)
    arriere = y + longueur / 2
    if arriere < Y_MUR - 0.002:
        long_arbre = Y_MUR - arriere
        c.cylindre(f'{nom}_arbre', rayon * 0.4, long_arbre, (x, arriere + long_arbre / 2, z), P['acier'], 'Y', g)
    if palier:
        palier_mur(f'{nom}_palier', x, z, max(rayon * 0.55, 0.025), g, P)
    return corps


def servomoteur(nom, x, z, g, P, rayon=0.058):
    """Servomoteur d'entraînement direct au dos du mur, avec son connecteur et son câble vers le bâti."""
    y = Y_DOS + 0.1
    c.cylindre(nom, rayon, 0.2, (x, y, z), P['graphite'], 'Y', g, segments=16)
    c.cylindre(f'{nom}_capot', rayon * 0.82, 0.03, (x, Y_DOS + 0.215, z), P['tole_sombre'], 'Y', g, segments=16,
               chanfrein=0)
    c.boite(f'{nom}_connecteur', (0.05, 0.06, 0.035), (x, y + 0.02, z + rayon + 0.015), P['plastique_noir'], g)
    c.tuyau(f'{nom}_cable', [(x, y + 0.03, z + rayon + 0.03), (x + 0.05, y + 0.08, z + rayon + 0.02),
                            (x + 0.07, Y_DOS + 0.05, Z_BATI + 0.2), (x + 0.07, Y_DOS + 0.012, Z_BATI + 0.01)],
            0.007, P['plastique_noir'], g)


def bras(nom, a, b, y, epaisseur, largeur, mat, g):
    """Plat droit de a à b (x, z), à la profondeur y : bras pivotant, patte."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    return c.boite(nom, (math.hypot(dx, dz), epaisseur, largeur), ((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2), mat, g,
                   rotation=(0, -math.atan2(dz, dx), 0))


def tangente(a, b):
    """
    Brin de bande entre deux rouleaux, chacun donné par (centre (x, z), rayon, la bande passe dessus) : points où elle
    quitte le premier et touche le second.
    """
    (x1, z1), r1, d1 = a
    (x2, z2), r2, d2 = b
    s1, s2 = (1 if d1 else -1), (1 if d2 else -1)
    dx, dz = x2 - x1, z2 - z1
    phi = math.atan2(dz, dx) + math.asin((s2 * r2 - s1 * r1) / math.hypot(dx, dz))
    nx, nz = -math.sin(phi), math.cos(phi)
    return (x1 + s1 * r1 * nx, z1 + s1 * r1 * nz), (x2 + s2 * r2 * nx, z2 + s2 * r2 * nz)


def boitier_commande(nom, x, cote, g, P):
    """Boîte de commande locale sur un flanc du mur : arrêt d'urgence, marche par à-coups, marche."""
    s = 1 if cote == '+X' else -1
    xb = x + s * 0.03
    c.boite(f'{nom}_boitier', (0.06, 0.10, 0.20), (xb, Y_MILIEU_MUR, 1.05), P['graphite'], g)
    xf = xb + s * 0.03
    c.arret_urgence(f'{nom}_au', (xf, Y_MILIEU_MUR, 1.11), g, P, cote)
    c.bouton(f'{nom}_impulsion', (xf, Y_MILIEU_MUR, 1.03), P['plastique_noir'], g, P, cote)
    c.bouton(f'{nom}_marche', (xf, Y_MILIEU_MUR, 0.985), P['vert_bouton'], g, P, cote)


# --- Postes ----------------------------------------------------------------------------------------------------


def socle(racine, P):
    g = c.vide('socle', parent=racine)
    x0, x1, y0, y1 = -1.75, 2.45, -1.15, 0.85
    dalle = c.boite('socle_1', (x1 - x0, y1 - y0, 0.07), ((x0 + x1) / 2, (y0 + y1) / 2, -0.035), P['sol'], g,
                    chanfrein=0.012)
    dalle['role'] = 'socle'
    # Marquage au sol de la zone machine.
    lx0, lx1, ly0, ly1, e = -1.61, 2.31, -1.01, 0.71, 0.035
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
    """Bâti-armoire : il porte le mur et abrite variateurs et automate, portes côté conducteur."""
    g = c.vide('bati', parent=racine)
    x0, x1 = X_BATI
    xm, L = (x0 + x1) / 2, x1 - x0
    y0, y1 = Y_AVANT, Y_DOS + 0.02
    c.boite('bati_armoire', (L, y1 - y0, Z_BATI - 0.07), (xm, (y0 + y1) / 2, (Z_BATI + 0.07) / 2), P['tole_sombre'], g)
    c.boite('bati_dessus', (L - 0.02, Y_MUR - y0 - 0.01, 0.01), (xm, (Y_MUR + y0 + 0.01) / 2, Z_BATI + 0.005),
            P['inox'], g)
    for i, (a, b) in enumerate(((-1.12, -0.22), (-0.18, 0.72), (0.76, 1.68))):
        xp = (a + b) / 2
        c.boite(f'bati_porte_{i + 1}', (b - a, 0.01, 0.19), (xp, y0 - 0.005, 0.195), P['tole_sombre'], g)
        c.boite(f'bati_poignee_{i + 1}', (0.11, 0.022, 0.014), (b - 0.12, y0 - 0.018, 0.25), P['chrome'], g)
        c.boite(f'bati_grille_{i + 1}', (0.22, 0.004, 0.08), (a + 0.18, y0 - 0.012, 0.17), P['graphite'], g,
                chanfrein=0)
        for j in range(4):
            c.boite(f'bati_lame_{i + 1}_{j + 1}', (0.21, 0.006, 0.006), (a + 0.18, y0 - 0.015, 0.143 + j * 0.018),
                    P['tole_sombre'], g, chanfrein=0)
    # Pieds réglables.
    for i, xp in enumerate((x0 + 0.10, -0.25, 0.75, x1 - 0.10)):
        for j, yp in enumerate((y0 + 0.08, y1 - 0.08)):
            c.cylindre(f'bati_pied_{i}_{j}', 0.028, 0.05, (xp, yp, 0.045), P['acier'], 'Z', g, segments=6)
            c.cylindre(f'bati_semelle_{i}_{j}', 0.05, 0.02, (xp, yp, 0.01), P['caoutchouc'], 'Z', g, segments=12,
                       chanfrein=0)
    return g


def mur(racine, P):
    """Mur porteur d'un seul tenant : tout l'outillage y est monté en porte-à-faux, côté conducteur libre."""
    g = c.vide('mur', parent=racine)
    x0, x1 = X_BATI
    r = 0.05
    pts = [(x0, Z_BATI), (x1, Z_BATI)] + c.arc(x1 - r, Z_MUR - r, r, 0, 90) + c.arc(x0 + r, Z_MUR - r, r, 90, 180)
    c.profil('mur_porteur', pts, EP_MUR, Y_MILIEU_MUR, P['tole'], g)
    c.boite('mur_plinthe', (x1 - x0, 0.008, 0.10), ((x0 + x1) / 2, Y_MUR - 0.004, Z_BATI + 0.05), P['tole_sombre'], g,
            chanfrein=0.002)
    # Trappe de visite des transmissions, vissée, sous la table.
    xa, xb, za, zb = -0.22, 0.66, 0.46, 1.14
    c.boite('mur_trappe', (xb - xa, 0.006, zb - za), ((xa + xb) / 2, Y_MUR - 0.003, (za + zb) / 2), P['tole'], g,
            chanfrein=0.002)
    for i, (xv, zv) in enumerate(((xa + 0.03, za + 0.03), (xb - 0.03, za + 0.03), (xa + 0.03, zb - 0.03),
                                  (xb - 0.03, zb - 0.03))):
        c.vis(f'mur_trappe_vis{i + 1}', (xv, Y_MUR - 0.006, zv), g, P['acier'])
    c.pictogramme_danger('mur_danger_trappe', ((xa + xb) / 2, Y_MUR - 0.0062, zb - 0.07), g, P, taille=0.06)
    # Numéros de postes : dérouleur, contrôle, refente, rembobinage.
    for n, xn in ((1, -0.55), (2, 0.02), (3, 0.62), (4, 1.60)):
        c.texte(f'mur_poste_{n}', str(n), 0.07, (xn, Y_MUR - 0.0008, 1.66), P['tole_sombre'], g)
    # Dos : porte de l'armoire électrique, sectionneur, poignée, grille.
    a, b = -0.40, 0.55
    c.boite('mur_porte_dos', (b - a, 0.01, 1.06), ((a + b) / 2, Y_DOS + 0.004, 0.97), P['tole'], g)
    c.boite('mur_poignee_dos', (0.02, 0.03, 0.14), (b - 0.06, Y_DOS + 0.02, 1.0), P['plastique_noir'], g)
    c.boite('mur_grille_dos', (0.24, 0.006, 0.14), (a + 0.18, Y_DOS + 0.009, 0.62), P['graphite'], g, chanfrein=0)
    c.boite('sectionneur_plaque', (0.10, 0.006, 0.10), (b - 0.16, Y_DOS + 0.012, 1.30), P['jaune_securite'], g)
    c.boite('sectionneur_poignee', (0.022, 0.03, 0.08), (b - 0.16, Y_DOS + 0.03, 1.30), P['rouge_arret'], g,
            rotation=(0, math.radians(35), 0))
    return g


def derouleur(racine, P):
    """Bobine mère sur arbre expansible, frein pneumatique au dos du mur, capteur de diamètre, réglage du frein."""
    g = c.vide('derouleur', parent=racine)
    x, z = X_MERE, Z_MERE
    bob = c.bobine(c.suivant('rotatif'), R_MERE, LAIZE, (x, 0, z), P['bord_mere'], P['flanc_etiquettes'], 'Y', g,
                   None, pas_u=c.PAS_ETIQUETTE)
    c.rotatif(bob, R_MERE, sous_la_bande=True)
    noyau = c.bobine(c.suivant('rotatif'), R_MANDRIN, LAIZE + 0.008, (x, 0, z), P['carton'], P['flanc_mandrin'], 'Y',
                     g, 32)
    c.rotatif(noyau, R_MERE, sous_la_bande=True)
    # Arbre expansible : il dépasse à l'avant avec ses lardons gonflés, son embout et sa valve de gonflage.
    y_avant = -0.585
    c.cylindre('derouleur_arbre', 0.036, Y_MUR - y_avant, (x, (Y_MUR + y_avant) / 2, z), P['acier'], 'Y', g)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        c.boite(f'derouleur_lardon_{k}', (0.014, 0.11, 0.008), (x + 0.036 * math.cos(a), -0.51,
                                                               z + 0.036 * math.sin(a)),
                P['caoutchouc'], g, chanfrein=0, rotation=(0, math.pi / 2 - a, 0))
    c.cylindre('derouleur_embout', 0.044, 0.02, (x, y_avant - 0.01, z), P['tole_sombre'], 'Y', g)
    c.cylindre('derouleur_valve', 0.006, 0.014, (x + 0.022, y_avant - 0.027, z + 0.01), P['chrome'], 'Y', g,
               segments=8, chanfrein=0)
    c.boite('derouleur_mandrin_securite', (0.15, 0.03, 0.17), (x, Y_MUR - 0.015, z), P['tole_sombre'], g)
    # Frein pneumatique à disque au dos : la tension se règle par la pression d'air.
    c.cylindre('frein_moyeu', 0.05, 0.04, (x, Y_DOS + 0.02, z), P['acier'], 'Y', g, segments=20)
    c.cylindre('frein_disque', 0.15, 0.012, (x, Y_DOS + 0.05, z), P['acier'], 'Y', g)
    c.cylindre('frein_corps', 0.085, 0.07, (x, Y_DOS + 0.095, z), P['graphite'], 'Y', g, segments=24)
    c.cylindre('frein_capot', 0.07, 0.02, (x, Y_DOS + 0.14, z), P['tole_sombre'], 'Y', g, segments=24)
    for k, ang in enumerate((60, 180, 300)):
        a = math.radians(ang)
        c.boite(f'frein_etrier_{k}', (0.05, 0.05, 0.06), (x + 0.14 * math.cos(a), Y_DOS + 0.05, z + 0.14 * math.sin(a)),
                P['rouge_arret'], g, rotation=(0, math.pi / 2 - a, 0))
    c.tuyau('frein_flexible', [(x + 0.07, Y_DOS + 0.05, z + 0.17), (x + 0.12, Y_DOS + 0.09, z + 0.25),
                               (x + 0.25, Y_DOS + 0.03, z + 0.30)], 0.006, P['plastique_noir'], g)
    # Réglage du frein au mur, au-dessus de la bobine : manomètre et détendeur.
    xp, zp = -0.86, 1.58
    c.boite('frein_panneau', (0.22, 0.014, 0.14), (xp, Y_MUR - 0.007, zp), P['graphite'], g)
    c.bobine('frein_manometre', 0.034, 0.03, (xp - 0.045, Y_MUR - 0.03, zp + 0.01), P['chrome'], P['manometre'], 'Y', g,
             32)
    c.cylindre('frein_detendeur', 0.02, 0.03, (xp + 0.055, Y_MUR - 0.029, zp + 0.01), P['plastique_noir'], 'Y', g,
               segments=10)
    c.texte('frein_inscription', 'FREIN', 0.02, (xp, Y_MUR - 0.0148, zp - 0.048), P['papier'], g)
    # Capteur de diamètre à ultrasons sur sa tige, à gauche du départ de bande, visant l'axe de la bobine.
    a = math.radians(128)
    xs, zs = x + 0.46 * math.cos(a), z + 0.46 * math.sin(a)
    us = c.capteur('capteur_diametre_mere', 'ultrasons', (xs, 0.0, zs), g, P, 1, 'diametre', '+Z')
    us.rotation_euler = (0, math.atan2(-math.cos(a), -math.sin(a)), 0)  # Z local vers l'axe de la bobine
    xt, zt = x + 0.505 * math.cos(a), z + 0.505 * math.sin(a)
    c.cylindre('capteur_tige', 0.011, Y_MUR - 0.016, (xt, (Y_MUR + 0.016) / 2, zt), P['acier'], 'Y', g, segments=10)
    c.pictogramme_danger('derouleur_danger', (-1.06, Y_MUR - 0.001, 1.42), g, P, taille=0.05)
    boitier_commande('derouleur', X_BATI[0], '-X', g, P)
    return g


def renvois(racine, P):
    """Renvois d'entrée et de sortie de table ; le premier repose sur une cellule de charge qui mesure la tension."""
    g = c.vide('renvois', parent=racine)
    (x1, z1), (x2, z2) = RENVOIS
    entree = rouleau('renvoi_entree', R_RENVOI, x1, z1, P['chrome'], g, P, sous_la_bande=True)
    c.cylindre_catalogue(entree, CYL_RENVOI, R_RENVOI * 2000)
    tendeur = rouleau('renvoi_tendeur', R_TENDEUR, x2, z2, P['chrome'], g, P, sous_la_bande=True)
    c.cylindre_catalogue(tendeur, CYL_TENDEUR, R_TENDEUR * 2000)
    # Cellule de charge sous le palier du renvoi d'entrée : la bande l'enveloppe, la force mesurée donne la tension.
    c.capteur('renvoi_cellule', 'charge', (x1, Y_MUR - 0.016, z1 - 0.045), g, P, 1, 'tension', '+Z')
    c.tuyau('renvoi_cellule_cable', [(x1 + 0.035, Y_MUR - 0.012, z1 - 0.075), (x1 + 0.08, Y_MUR - 0.01, z1 - 0.09),
                                     (x1 + 0.09, Y_MUR - 0.006, z1 - 0.2)], 0.004, P['plastique_noir'], g)
    return g


def roue_metreuse(g, P):
    """
    Roue de mesure posée sur la bande au droit du renvoi de sortie : son codeur compte les mètres du compteur. Construite
    après le rembobinage pour garder les numéros rotatif_N de l'ancien modèle.
    """
    x2, z2 = RENVOIS[1]
    yr, zr = -0.40, z2 + R_TENDEUR + 0.025
    roue = c.cylindre(c.suivant('rotatif'), 0.025, 0.016, (x2, yr, zr), P['caoutchouc'], 'Y', g, segments=20)
    c.rotatif(roue, 0.025, sous_la_bande=False)
    # Les mètres comptés ici, rapportés à chaque lame, donnent son usure (organe 3, couteaux).
    c.capteur('codeur_metrage', 'codeur', (x2, yr - 0.01, zr), g, P, 3, 'usure_lame3', '+Y')
    xt, zt, yb = x2 + 0.07, 1.50, yr - 0.056
    c.cylindre('codeur_tige', 0.009, Y_MUR - yb + 0.006, (xt, (Y_MUR + yb - 0.006) / 2, zt), P['acier'], 'Y', g,
               segments=10)
    bras('codeur_bras', (x2, zr), (xt, zt), yb, 0.012, 0.02, P['tole_sombre'], g)
    # Câble du codeur le long du bras puis sur la tige, jusqu'au mur.
    c.tuyau('codeur_cable', [(x2 + 0.01, yr - 0.05, zr + 0.022), (xt - 0.012, yb - 0.004, zt + 0.016),
                             (xt, yb + 0.12, zt + 0.013), (xt, Y_MUR - 0.01, zt + 0.013)], 0.004, P['plastique_noir'],
            g)


def table(racine, P):
    """Table lumineuse d'inspection : plateau rétroéclairé sous la bande, réglette des pistes, caméra et éclairage."""
    g = c.vide('table', parent=racine)
    x0, x1 = -0.15, 0.50
    y0, y1 = -0.53, Y_MUR - 0.01
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    c.boite('table_caisson', (x1 - x0 - 0.02, y1 - y0 - 0.02, 0.05), (xm, ym, 1.29), P['tole'], g)
    c.boite('table_cadre', (x1 - x0, y1 - y0, 0.04), (xm, ym, 1.335), P['tole_sombre'], g)
    # Plateau rétroéclairé, plus large que la bande pour que la lumière se voie au bord.
    c.boite('table_plateau', (x1 - x0 - 0.06, y1 - y0 - 0.06, 0.012), (xm, ym, 1.356), P['plateau'], g,
            chanfrein=0.002)
    for i, xs in enumerate((x0 + 0.08, x1 - 0.08)):
        c.boite(f'table_console_{i}', (0.04, Y_MUR - (y0 + 0.1), 0.05), (xs, (Y_MUR + y0 + 0.1) / 2, 1.24),
                P['tole_sombre'], g)
    # Réglette en travers, au bout du plateau : un trait tous les 5 cm, les lames repérées en rouge.
    xr = x1 - 0.015
    c.boite('reglette', (0.022, LAIZE + 0.06, 0.003), (xr, -0.02, 1.3565), P['inox'], g, chanfrein=0)
    for k in range(-9, 10):
        long = 0.012 if k % 2 else 0.018
        c.boite(f'reglette_trait_{k}', (long, 0.0016, 0.001), (xr - (0.018 - long) / 2, k * 0.05, 1.3585),
                P['tole_sombre'], g, chanfrein=0)
    for k, y in enumerate(Y_COUTEAUX):
        c.boite(f'reglette_lame_{k}', (0.02, 0.003, 0.001), (xr, y, 1.3586), P['rouge_arret'], g, chanfrein=0)
    # Capteur de bord de bande en fourche (guidage), sur le cadre côté conducteur.
    xg = -0.10
    c.boite('guide_capteur', (0.05, 0.03, 0.10), (xg, -0.475, 1.405), P['plastique_noir'], g)
    for nom, dz in (('haut', 0.02), ('bas', -0.02)):
        c.boite(f'guide_bec_{nom}', (0.04, 0.05, 0.012), (xg, -0.445, Z_BANDE + dz), P['plastique_noir'], g)
    # Portique de contrôle : caméra au milieu, deux rampes de LED de part et d'autre.
    xc, zc = 0.18, 1.665
    c.boite('camera_portique', (0.06, Y_MUR + 0.47, 0.05), (xc, (Y_MUR - 0.47) / 2, zc), P['tole_sombre'], g)
    c.boite('camera_platine', (0.10, 0.02, 0.10), (xc, Y_MUR - 0.01, zc - 0.01), P['tole_sombre'], g)
    # Caméra d'inspection : elle repère les étiquettes manquantes et les défauts, rapportés à chaque bobine.
    c.capteur('camera_inspection', 'camera', (xc, -0.03, 1.52), g, P, 2, ['manquantes', 'defauts'], '-Z')
    c.boite('camera_patte', (0.03, 0.03, 0.03), (xc, -0.03, 1.627), P['tole_sombre'], g)
    for i, xl in enumerate((xc - 0.05, xc + 0.05)):
        c.boite(f'eclairage_{i}', (0.04, 0.86, 0.03), (xl, 0.0, zc - 0.01), P['graphite'], g)
        c.boite(f'eclairage_led_{i}', (0.03, 0.84, 0.004), (xl, 0.0, zc - 0.026), P['led'], g, chanfrein=0)
    c.tuyau('camera_cable', [(xc + 0.025, -0.03, 1.60), (xc + 0.035, 0.03, 1.70), (xc + 0.02, 0.25, 1.70),
                             (xc + 0.02, Y_MUR - 0.01, 1.70)], 0.005, P['plastique_noir'], g)
    return g


def porte_couteau(g, n, x, y, contre, P):
    """
    Porte-couteau pneumatique serré sur la barre : carter en capot ouvert en bas, lame circulaire libre (rotatif_N) qui
    cisaille la bande contre sa contre-lame, montée sur le contre-couteau.
    """
    yc = y + 0.006  # le carter et le corps débordent du côté de la lame opposé à la contre-lame
    c.boite(f'couteau{n}_bride', (0.116, 0.036, 0.076), (x, yc, Z_BARRE), P['tole_sombre'], g)
    c.cylindre(f'couteau{n}_serrage', 0.009, 0.03, (x - 0.072, yc, Z_BARRE + 0.015), P['plastique_noir'], 'X', g,
               segments=10)
    c.boite(f'couteau{n}_corps', (0.05, 0.026, 0.04), (x, yc, 1.585), P['tole_sombre'], g)
    c.cylindre(f'couteau{n}_verin', 0.012, 0.06, (x + 0.042, yc, 1.60), P['graphite'], 'Z', g, segments=12)
    c.secteur(f'couteau{n}_carter', R_COUTEAU + 0.008, 0.028, 0.026, 270, (x, yc, Z_COUTEAU), P['tole_sombre'], 'Y', g,
              segments=40, debut_deg=-45)
    lame = c.cylindre(c.suivant('rotatif'), R_COUTEAU, 0.004, (x, y, Z_COUTEAU), P['chrome'], 'Y', g, segments=48,
                      chanfrein=0, rayon2=R_COUTEAU - 0.006)
    c.rotatif(lame, R_COUTEAU, sous_la_bande=False)
    moyeu = c.cylindre(f'couteau{n}_moyeu', 0.026, 0.03, (x, yc, Z_COUTEAU), P['acier'], 'Y', segments=16)
    c.attacher(moyeu, lame)
    bague = c.anneau(f'couteau{n}_contre_lame', R_CONTRE + 0.004, R_CONTRE - 0.001, 0.016, (x, y - 0.010, Z_CONTRE),
                     P['chrome'], 'Y', segments=28, chanfrein=0)
    c.attacher(bague, contre)


def refente(racine, P):
    """Contre-couteau sous la bande, six porte-couteaux sur leur barre, buses d'aspiration des rives."""
    g = c.vide('refente', parent=racine)
    x = X_REFENTE
    contre = rouleau('contre_couteau', R_CONTRE, x, Z_CONTRE, P['acier'], g, P, sous_la_bande=True)
    c.cylindre_catalogue(contre, CYL_CONTRE, R_CONTRE * 2000)
    servomoteur('contre_couteau_servo', x, Z_CONTRE, g, P, rayon=0.05)
    y_bout = -0.52
    c.boite('barre_couteaux', (0.10, Y_MUR - y_bout, 0.06), (x, (Y_MUR + y_bout) / 2, Z_BARRE), P['acier'], g)
    c.boite('barre_embout', (0.11, 0.012, 0.07), (x, y_bout - 0.006, Z_BARRE), P['tole_sombre'], g)
    c.pictogramme_danger('refente_danger', (x, y_bout - 0.0125, Z_BARRE), g, P, taille=0.05)
    c.boite('barre_platine', (0.18, 0.025, 0.14), (x, Y_MUR - 0.0125, Z_BARRE), P['tole_sombre'], g)
    for k, y in enumerate(Y_COUTEAUX):
        porte_couteau(g, k + 1, x, y, contre, P)
    # Vis de positionnement des porte-couteaux le long de la barre ; son codeur donne la position de chaque lame.
    xv, zv = x + 0.072, Z_BARRE
    c.cylindre('vis_positionnement', 0.008, Y_MUR - y_bout + 0.015, (xv, (Y_MUR + y_bout - 0.015) / 2, zv),
               P['chrome'], 'Y', g, segments=10)
    c.capteur('codeur_position_lames', 'codeur', (xv, y_bout - 0.015, zv), g, P, 3, 'position_lames', '+Y')
    # Rives coupées par les lames extrêmes, aspirées par deux buses ; l'avant descend vers l'aspirateur.
    depart = (x + 0.012, Z_CONTRE + R_CONTRE - 0.002)
    for s in (-1, 1):
        larg = 0.05 if s < 0 else 0.055
        c.boite(f'rive_buse_{s}', (0.07, larg, 0.05), (0.93, s * (0.45 + (larg - 0.05) / 2), 1.373), P['graphite'], g)
        c.bande(f'rive_{s}', depart, (0.905, 1.38), 0.01, P['rive'], g, y=s * 0.435, role=False)
    c.tuyau('rive_flexible', [(0.955, -0.47, 1.35), (0.98, -0.50, 1.22), (0.99, -0.50, 0.78), (1.00, -0.44, 0.58),
                              (1.00, -0.41, 0.53)], 0.02, P['graphite'], g)
    return g


def aspiration(racine, P):
    """Aspirateur des rives sur le bâti : caisson, moteur, conduit vers le bac à déchets au pied du mur."""
    g = c.vide('aspiration', parent=racine)
    xa, ya = 1.02, -0.33
    c.boite('aspiration_caisson', (0.24, 0.26, 0.18), (xa, ya, Z_BATI + 0.09), P['tole'], g)
    c.cylindre('aspiration_moteur', 0.065, 0.10, (xa + 0.02, ya + 0.05, Z_BATI + 0.23), P['graphite'], 'Z', g,
               segments=20)
    c.cylindre('aspiration_entree', 0.026, 0.03, (xa - 0.02, ya - 0.08, Z_BATI + 0.195), P['tole_sombre'], 'Z', g,
               segments=16)
    c.boite('aspiration_conduit', (0.09, Y_MUR - (ya + 0.13), 0.08), (xa, (Y_MUR + ya + 0.13) / 2, Z_BATI + 0.05),
            P['galva'], g)
    return g


def arbre_differentiel(g, nom, x, z, P):
    """Arbre différentiel en porte-à-faux : bagues de friction visibles entre les mandrins, embout et valve à l'avant."""
    y_bout = -0.50
    c.cylindre(f'arbre_{nom}', 0.034, Y_MUR - y_bout, (x, (Y_MUR + y_bout) / 2, z), P['acier'], 'Y', g, segments=20)
    c.cylindre(f'arbre_{nom}_embout', 0.042, 0.02, (x, y_bout - 0.01, z), P['tole_sombre'], 'Y', g, segments=20)
    c.cylindre(f'arbre_{nom}_valve', 0.006, 0.014, (x + 0.02, y_bout - 0.027, z), P['chrome'], 'Y', g, segments=8,
               chanfrein=0)
    palier_mur(f'arbre_{nom}_palier', x, z, 0.03, g, P)
    pris = sorted((yp - LARGEUR_PISTE / 2 - 0.004, yp + LARGEUR_PISTE / 2 + 0.004) for yp, a in PISTES if a == nom)
    debut = y_bout + 0.01
    for a, b in pris + [(Y_MUR - 0.03, Y_MUR)]:
        n = int((a - debut) / 0.04)
        for k in range(n):
            yk = debut + (k + 0.5) * (a - debut) / n
            c.cylindre(f'arbre_{nom}_bague_{a:.2f}_{k}', 0.040, 0.016, (x, yk, z), P['graphite'], 'Y', g,
                       segments=12, chanfrein=0)
        debut = b


def rembobinage(racine, P):
    """Deux arbres de bobinettes, rouleaux presseurs sur bras pivotants, régulateurs d'air, barre de sécurité."""
    g = c.vide('rembobinage', parent=racine)
    x = X_REMB
    for yp, arbre in PISTES:
        zp, r = ARBRES[arbre]
        b = c.bobine(c.suivant('rotatif'), r, LARGEUR_PISTE, (x, yp, zp), P['bord_piste'], P['flanc_etiquettes'], 'Y',
                     g, 32, pas_u=c.PAS_ETIQUETTE)
        c.rotatif(b, r, sous_la_bande=True)
        m = c.bobine(c.suivant('rotatif'), R_MANDRIN, LARGEUR_PISTE + 0.008, (x, yp, zp), P['carton'],
                     P['flanc_mandrin'], 'Y', g, 24)
        c.rotatif(m, r, sous_la_bande=True)
    for nom, (zp, r) in ARBRES.items():
        arbre_differentiel(g, nom, x, zp, P)
        servomoteur(f'remb_{nom}_servo', x, zp, g, P)
        # Rouleau presseur : il appuie sur les bobinettes pour chasser l'air, son bras pivote quand elles grossissent.
        rr, a = rayon_catalogue(CYL_CONTACT), math.radians(15)
        xr, zr = x + (r + rr) * math.cos(a), zp + (r + rr) * math.sin(a)
        presseur = rouleau(f'presseur_{nom}', rr, xr, zr, P['caoutchouc'], g, P, sous_la_bande=False, longueur=0.90,
                           y=-0.02, palier=False)
        pivot = (X_BATI[1] - 0.05, zp + 0.18)
        bras(f'presseur_{nom}_bras', (xr, zr), pivot, 0.455, 0.02, 0.035, P['tole_sombre'], g)
        c.cylindre(f'presseur_{nom}_pivot', 0.026, 0.03, (pivot[0], Y_MUR - 0.015, pivot[1]), P['graphite'], 'Y', g,
                   segments=16)
        if nom == 'haut':
            c.cylindre_catalogue(presseur, CYL_CONTACT, rr * 2000)
            # Cellule de charge sous le pivot du bras : la force d'appui suit la tension des bobinettes.
            c.capteur('remb_cellule_tension', 'charge', (pivot[0], Y_MUR - 0.016, pivot[1] - 0.03), g, P, 4,
                      'tension', '+Z')
    comptage(g, P)
    # Régulateurs de l'air des arbres différentiels : la pression règle la tension de chaque arbre.
    xp, zp = 1.16, 0.86
    c.boite('remb_panneau', (0.24, 0.014, 0.16), (xp, Y_MUR - 0.007, zp), P['graphite'], g)
    for dx, nom in ((-0.06, 'haut'), (0.06, 'bas')):
        c.bobine(f'remb_manometre_{nom}', 0.034, 0.03, (xp + dx, Y_MUR - 0.03, zp + 0.025), P['chrome'],
                 P['manometre'], 'Y', g, 32)
        c.cylindre(f'remb_detendeur_{nom}', 0.016, 0.03, (xp + dx, Y_MUR - 0.029, zp - 0.045), P['plastique_noir'],
                   'Y', g, segments=10)
    c.texte('remb_inscription', 'ARBRES', 0.018, (xp, Y_MUR - 0.0148, zp + 0.068), P['papier'], g)
    # Barre de sécurité devant les bobinettes : la heurter arrête la machine.
    for i, xs in enumerate((x - 0.17, x + 0.21)):
        c.cylindre(f'remb_barre_montant_{i}', 0.012, 0.14, (xs, -0.47, Z_BATI + 0.07), P['tole_sombre'], 'Z', g,
                   segments=10)
    c.cylindre('remb_barre_securite', 0.016, 0.42, (x + 0.02, -0.47, Z_BATI + 0.14), P['jaune_securite'], 'X', g,
               segments=12)
    c.pictogramme_danger('remb_danger', (1.58, Y_MUR - 0.001, 1.45), g, P, taille=0.05)
    boitier_commande('remb', X_BATI[1], '+X', g, P)
    return g


def comptage(g, P):
    """
    Une cellule de comptage par piste, au-dessus de la bande avant le rembobinage : le compte d'étiquettes de chaque
    bobinette, comparé à la quantité commandée, donne l'écart de comptage.
    """
    xc = 1.10
    contre = ((X_REFENTE, Z_CONTRE), R_CONTRE, True)
    hauteurs = {}
    for yp, arbre in PISTES:
        zp, r = ARBRES[arbre]
        (xa, za), (xb, zb) = tangente(contre, ((X_REMB, zp), r, True))
        hauteurs[yp] = za + (xc - xa) * (zb - za) / (xb - xa)
    z_tige = max(hauteurs.values()) + 0.10
    y_avant = min(hauteurs) - 0.03
    c.cylindre('comptage_tige', 0.009, Y_MUR - y_avant, (xc, (Y_MUR + y_avant) / 2, z_tige), P['acier'], 'Y', g,
               segments=10)
    for k, (yp, zl) in enumerate(sorted(hauteurs.items())):
        face = zl + 0.03
        c.capteur(f'comptage_piste_{k + 1}', 'cellule', (xc, yp, face), g, P, 4, 'ecart_comptage', '-Z')
        haut = face + 0.045
        c.cylindre(f'comptage_suspente_{k + 1}', 0.005, z_tige - haut, (xc, yp, (z_tige + haut) / 2), P['acier'],
                   'Z', g, segments=8, chanfrein=0)


def compteur(racine, P):
    """Compteur de métrage au mur, au-dessus des bobinettes : métrage de la bobine en cours, à comparer à la commande."""
    g = c.vide('compteur', parent=racine)
    xc, zc = 1.28, 1.56
    yf = Y_MUR - 0.05
    c.boite('compteur_boitier', (0.32, 0.05, 0.13), (xc, Y_MUR - 0.025, zc), P['graphite'], g)
    c.boite('compteur_vitre', (0.25, 0.004, 0.06), (xc - 0.015, yf - 0.002, zc - 0.012), P['vitre_afficheur'], g,
            chanfrein=0)
    c.texte('compteur_chiffres', '01250', 0.05, (xc - 0.03, yf - 0.0045, zc - 0.012), P['afficheur'], g)
    c.texte('compteur_unite', 'm', 0.03, (xc + 0.08, yf - 0.0045, zc - 0.018), P['afficheur'], g)
    c.texte('compteur_titre', 'MÉTRAGE', 0.018, (xc - 0.05, yf - 0.0008, zc + 0.043), P['papier'], g)
    for k, mat in enumerate((P['vert_bouton'], P['plastique_noir'])):
        c.bouton(f'compteur_touche_{k}', (xc + 0.13, yf, zc + 0.02 - k * 0.04), mat, g, P)
    return g


def pupitre(racine, P):
    """Pupitre sur pied devant le rembobinage : écran tactile incliné, boutons, arrêt d'urgence."""
    import bmesh

    g = c.vide('pupitre', parent=racine)
    x, y = 2.05, -0.55
    inclinaison = math.radians(-8)
    c.boite('pup_embase', (0.34, 0.30, 0.02), (x, y, 0.01), P['tole_sombre'], g)
    c.cylindre('pup_colonne', 0.032, 0.94, (x, y + 0.02, 0.49), P['graphite'], 'Z', g)
    c.boite('pup_tete', (0.52, 0.055, 0.34), (x, y + 0.005, 1.188), P['tole_sombre'], g, rotation=(inclinaison, 0, 0))
    c.boite('pup_rotule', (0.08, 0.06, 0.08), (x, y + 0.03, 1.0), P['graphite'], g)
    c.boite('pup_commandes', (0.30, 0.07, 0.05), (x, y, 0.93), P['graphite'], g)
    c.arret_urgence('pup_au', (x + 0.09, y, 0.955), g, P, '+Z')
    c.bouton('pup_marche', (x - 0.03, y, 0.955), P['vert_bouton'], g, P, '+Z')
    c.bouton('pup_arret', (x - 0.08, y, 0.955), P['plastique_noir'], g, P, '+Z')
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
    e.location = (x, y - 0.0235, 1.188)
    e['role'] = 'ecran'
    # Coffret vitré au dos de la tête : l'automate y donne vitesse et alarmes, visible sans ouvrir.
    yc, zc, l, h, p = y + 0.105, 1.188, 0.40, 0.26, 0.13
    c.boite('pup_coffret_fond', (l, 0.01, h), (x, yc - p / 2, zc), P['tole_sombre'], g)
    for s in (-1, 1):
        c.boite(f'pup_coffret_cote_{s}', (0.01, p, h), (x + s * (l - 0.01) / 2, yc, zc), P['tole_sombre'], g)
        c.boite(f'pup_coffret_dessus_{s}', (l, p, 0.01), (x, yc, zc + s * (h - 0.01) / 2), P['tole_sombre'], g)
    c.capteur('pup_automate', 'automate', (x, yc + p / 2 - 0.02, zc), g, P, 5, ['vitesse', 'alarmes'], '+Y')
    c.boite('pup_coffret_vitre', (l - 0.02, 0.004, h - 0.02), (x, yc + p / 2 - 0.002, zc), P['verre'], g, chanfrein=0)
    # Câble au sol vers le bâti, sous un passe-câble.
    c.boite('pup_passe_cable', (0.36, 0.06, 0.012), (x - 0.18, y + 0.08, 0.006), P['jaune_securite'], g, chanfrein=0.002)
    return g


def colonne_lumineuse(racine, P):
    g = c.vide('colonne_lumineuse', parent=racine)
    x, y, z0 = -1.05, Y_MILIEU_MUR, Z_MUR
    c.cylindre('colonne_pied', 0.03, 0.015, (x, y, z0 + 0.0075), P['graphite'], 'Z', g)
    c.cylindre('colonne_mat', 0.012, 0.16, (x, y, z0 + 0.095), P['acier'], 'Z', g)
    c.cylindre('colonne_douille', 0.032, 0.012, (x, y, 1.907), P['plastique_noir'], 'Z', g)
    for nom, zv, mat, etat in (('voyant_vert', 1.94, P['vert'], 'marche'),
                               ('voyant_orange', 1.998, P['orange'], 'attention'),
                               ('voyant_rouge', 2.056, P['rouge'], 'arret')):
        v = c.cylindre(nom, 0.032, 0.054, (x, y, zv), mat, 'Z', g, None, chanfrein=0.002)
        v['role'] = 'voyant'
        v['etat'] = etat
    for i, zv in enumerate((1.969, 2.027)):
        c.cylindre(f'colonne_bague_{i}', 0.0325, 0.004, (x, y, zv), P['plastique_noir'], 'Z', g, None, chanfrein=0.0005)
    c.cylindre('colonne_chapeau', 0.032, 0.02, (x, y, 2.093), P['plastique_noir'], 'Z', g)
    return g


def bandes(racine, P):
    """Chemin de bande, dans l'ordre des anciens nœuds bande_N : mère jusqu'aux couteaux, puis une bande par piste."""
    g = c.vide('bande', parent=racine)
    mere = ((X_MERE, Z_MERE), R_MERE, True)
    entree = (RENVOIS[0], R_RENVOI, True)
    sortie = (RENVOIS[1], R_TENDEUR, True)
    contre = ((X_REFENTE, Z_CONTRE), R_CONTRE, True)
    c.bande('bande_1', *tangente(mere, entree), LAIZE, P['bande_mere'], g)
    c.bande('bande_2', *tangente(entree, sortie), LAIZE, P['bande_mere'], g)
    c.bande('bande_3', *tangente(sortie, contre), LAIZE, P['bande_mere'], g)
    for k, (yp, arbre) in enumerate(PISTES):
        zp, r = ARBRES[arbre]
        c.bande(f'bande_{k + 4}', *tangente(contre, ((X_REMB, zp), r, True)), LARGEUR_PISTE, P['bande_piste'], g,
                y=yp)
    return g


# --- Assemblage ------------------------------------------------------------------------------------------------


def construire():
    P = matieres()
    fiche = c.kit_machine(MACHINE)
    racine = c.vide(MACHINE, props={'machine': fiche['nom'], 'fiabilite': 'Déduit', 'unite': 'metre',
                                    'axeHaut': 'Y'})
    # Ordre de construction = numéros rotatif_N de l'ancien modèle : bobine mère, renvois, contre-couteau, lames,
    # bobinettes ; viennent ensuite les presseurs et la roue métreuse, nouveaux.
    groupes = [
        bati(racine, P),
        mur(racine, P),
        derouleur(racine, P),
        renvois(racine, P),
        table(racine, P),
        refente(racine, P),
        aspiration(racine, P),
        rembobinage(racine, P),
        compteur(racine, P),
        pupitre(racine, P),
        colonne_lumineuse(racine, P),
    ]
    roue_metreuse(groupes[3], P)
    bandes(racine, P)
    g_socle = socle(racine, P)
    # 512 px sur 4 m : la finesse au mètre de l'ombre de la flexo, pour un tiers du poids.
    ombre = c.ombre_au_sol('socle_6', -1.68, 2.38, -1.08, 0.78, 0.003, largeur_px=512)
    ombre['role'] = 'socle'
    ombre.parent = g_socle
    c.points_diagnostic(
        [(p['numero'], p['nom'], c.depuis_gltf(p['position'])) for p in fiche['points_diagnostic']], racine)
    c.reperes([(r['texte'], c.depuis_gltf(r['position'])) for r in fiche['reperes']], racine)
    return racine, groupes


def vues(objets):
    v = c.vues_par_defaut(objets)
    v['derouleur'] = dict(position=(-1.95, -1.55, 1.55), cible=(-0.65, 0, 0.95), focale=40)
    v['table'] = dict(position=(-0.55, -1.25, 2.05), cible=(0.2, 0, 1.38), focale=42)
    v['couteaux'] = dict(position=(0.30, -0.95, 1.80), cible=(0.84, -0.15, 1.45), focale=45)
    v['rembobinage'] = dict(position=(2.35, -1.45, 1.45), cible=(1.40, 0, 0.95), focale=40)
    v['pupitre'] = dict(position=(2.6, -1.7, 1.45), cible=(1.9, -0.4, 1.1), focale=40)
    v['capteurs_refente'] = dict(position=(1.45, -1.05, 1.95), cible=(0.85, -0.25, 1.45), focale=40)
    v['capteurs_derouleur'] = dict(position=(-1.25, -1.3, 1.75), cible=(-0.75, 0, 1.25), focale=40)
    v['automate'] = dict(position=(2.7, 0.4, 1.45), cible=(2.05, -0.45, 1.18), focale=40)
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
