"""
Prépresse et gravure de plaques du kit : table de plaques vierges, graveur CTP à tambour externe, passerelle,
développeuse (développement, rinçage, gommage, séchage), empileur de sortie et poste PAO et BAT.

  blender --background --factory-startup --python data/kit/blender/ctp.py -- [--apercu <dossier>] [--vues a,b]

La disposition reprend celle de l'ancien modèle, que le reste de l'application connaît : graveur centré sur l'origine,
table de chargement à gauche, développeuse et ses six rouleaux aux mêmes axes (z 0,83), empileur à droite, bureau
devant. Points de diagnostic et repères lus dans machines.json, emprise au sol de MODEL_FOOTPRINT. Les plaques
avancent selon +X : vierges sur la table, gravées sur le tambour, développées puis empilées. Machine type : proportions
approximatives, sans logo ni livrée de marque.
"""
import math
import os
import sys

import bmesh
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as c  # noqa: E402

MACHINE = 'ctp'
# Plaque de la ligne : 0,52 m dans le sens du passage (X), 0,62 m en travers (Y). Épaisseur grossie (0,3 mm en vrai)
# pour qu'elle se voie.
PLAQUE_L, PLAQUE_W, EP_PLAQUE = 0.52, 0.62, 0.003
# Développeuse : axes des six rouleaux bas de l'ancien modèle, plan de passage sur leur génératrice haute.
X_ROULEAUX = [1.43, 1.61, 1.79, 1.97, 2.15, 2.33]
Z_ROULEAUX, R_ROULEAU = 0.83, 0.035
Z_PASSAGE = Z_ROULEAUX + R_ROULEAU
# Graveur : caisson, fente de sortie (hauteur de l'ancienne passerelle), tambour.
Z_FENTE = 0.93
X_TAMBOUR, Z_TAMBOUR, R_TAMBOUR, L_TAMBOUR = -0.10, 0.81, 0.15, 0.72
# Passerelle : de la fente du graveur à la table d'entrée de la développeuse, en pente douce.
PASSERELLE = ((0.67, Z_FENTE), (1.15, 0.868))


def matieres():
    P = c.palette()
    P.update(
        couche=c.matiere('plaque_couche', '#2e7896', 0.0, 0.35),
        alu=c.matiere('aluminium_plaque', '#c3c8cc', 0.85, 0.3),
        intercalaire=c.matiere('papier_intercalaire', '#e9e2cf', 0.0, 0.85),
        carton=c.matiere('carton_emballage', '#a67b4e', 0.0, 0.8),
        fume=c.matiere('polycarbonate_fume', '#2c363e', 0.0, 0.05, alpha=0.35),
        bain_dev=c.matiere('bain_developpement', '#2a2219', 0.0, 0.06),
        bain_eau=c.matiere('eau_rincage', '#6d8c9c', 0.0, 0.05),
        bain_gomme=c.matiere('bain_gomme', '#b39554', 0.0, 0.08),
        brosse=c.matiere('brosse', '#4b3d2f', 0.0, 0.95),
        bidon=c.matiere('bidon_pehd', '#e2e0d8', 0.0, 0.55),
        bidon_bleu=c.matiere('bidon_bleu', '#2f5f8f', 0.0, 0.45),
        filtre=c.matiere('boitier_filtre', '#e7e7e2', 0.0, 0.55),
        bureau=c.matiere('plateau_bureau', '#cdbb98', 0.0, 0.55),
        tissu=c.matiere('tissu_siege', '#3e444b', 0.0, 0.9),
        led_verte=c.matiere('led_verte', '#2ecc71', 0.0, 0.3, emission='#2ecc71', force=2.0),
        led_bleue=c.matiere('led_bleue', '#3aa0e8', 0.0, 0.3, emission='#3aa0e8', force=2.0),
        led_orange=c.matiere('led_orange', '#ff9a1a', 0.0, 0.3, emission='#ff9a1a', force=2.0),
        lampe=c.matiere('diffuseur_lampe', '#fff6e8', 0.0, 0.4, emission='#fff6e8', force=1.5),
        vert=c.matiere('voyant_vert', '#27c46a', 0.0, 0.3),
        orange=c.matiere('voyant_orange', '#ff9a1a', 0.0, 0.3),
        rouge=c.matiere('voyant_rouge', '#ff3a2e', 0.0, 0.3),
        ecran_graveur=c.matiere('ecran_graveur', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                                image='ctp_ecran_graveur.png'),
        ecran_amalgame=c.matiere('ecran_amalgame', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                                 image='ctp_ecran_amalgame.png'),
        ecran_bat=c.matiere('ecran_bat', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8, image='ctp_ecran_bat.png'),
        afficheur=c.matiere('afficheur_bain', '#ffffff', 0.0, 0.9, emission='#ffffff', force=0.8,
                            image='ctp_afficheur_bain.png'),
        gravee=c.matiere('plaque_gravee', '#ffffff', 0.4, 0.35, image='ctp_plaque_gravee.png'),
        epreuve=c.matiere('epreuve_bat', '#ffffff', 0.0, 0.7, image='bande_imprimee.png'),
    )
    return P


# --- Outils propres à la machine ------------------------------------------------------------------------------


def plaque(nom, longueur, largeur, epaisseur, centre, mat_dessus, mat_bord, parent=None, rotation=(0, 0, 0),
           repetition=(1.0, 1.0)):
    """
    Plaque ou feuille dont seul le dessus porte sa matière propre (couche, image gravée, épreuve) : U le long de X,
    sens du passage, V en travers. Les chants et le dos sont en `mat_bord` (aluminium, papier).
    """
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    lx, ly, h = longueur / 2, largeur / 2, epaisseur / 2
    bas = [bm.verts.new((x, y, -h)) for x, y in ((-lx, -ly), (lx, -ly), (lx, ly), (-lx, ly))]
    haut = [bm.verts.new((v.co.x, v.co.y, h)) for v in bas]
    dessus = bm.faces.new(haut)
    dessus.material_index = 0
    for loop in dessus.loops:
        loop[uv].uv = ((loop.vert.co.x / longueur + 0.5) * repetition[0], (loop.vert.co.y / largeur + 0.5) * repetition[1])
    autres = [bm.faces.new(list(reversed(bas)))]
    for i in range(4):
        j = (i + 1) % 4
        autres.append(bm.faces.new((bas[i], bas[j], haut[j], haut[i])))
    for f in autres:
        f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = c._objet(nom, bm, None, parent, centre, rotation, 0, 1)
    obj.data.materials.append(mat_dessus)
    obj.data.materials.append(mat_bord)
    return obj


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
    """Profil dessiné en coupe (y, z), extrudé le long de X : capots et couvercles vus de côté."""
    o = c.profil(nom, points_yz, longueur, 0.0, mat, parent, chanfrein)
    # Une rotation d'un quart de tour autour de Z envoie l'abscisse du profil sur Y et l'extrusion sur X.
    o.rotation_euler = (0, 0, math.pi / 2)
    o.location = (x, 0, 0)
    return o


def tube(nom, a, b, rayon, mat, parent=None, segments=None, chanfrein=None):
    """Cylindre tendu entre deux points : bras de lampe, branches du piètement."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = c.cylindre(nom, rayon, d.length, (a + b) / 2, mat, 'Z', parent, segments=segments, chanfrein=chanfrein)
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    return o


def sur_face(centre, rotation, local):
    """Point d'une pièce tournée, donné dans son repère : pour poser écran et boutons sur un pupitre incliné."""
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
    lame = (largeur * 0.92, 0.008, 0.008) if sur_y else (0.008, largeur * 0.92, 0.008)
    dec = (0, s * 0.002, 0) if sur_y else (s * 0.002, 0, 0)
    c.boite(f'{nom}_fond', fond, (x + dec[0], y + dec[1], z), P['graphite'], g, chanfrein=0)
    for k in range(lames):
        zk = z - hauteur / 2 + hauteur * (k + 0.5) / lames
        c.boite(f'{nom}_lame_{k}', lame, (x + 2.5 * dec[0], y + 2.5 * dec[1], zk), P['tole_sombre'], g, chanfrein=0)


def z_passerelle(x):
    (x0, z0), (x1, z1) = PASSERELLE
    return z0 + (z1 - z0) * (x - x0) / (x1 - x0)


# --- Postes ---------------------------------------------------------------------------------------------------


def socle(racine, P):
    """Dalle et marquage au sol de l'ancien modèle, aux mêmes dimensions."""
    g = c.vide('socle', parent=racine)
    x0, x1, y0, y1 = -2.2, 3.4, -2.1, 0.85
    dalle = c.boite('socle_1', (x1 - x0, y1 - y0, 0.07), ((x0 + x1) / 2, (y0 + y1) / 2, -0.035), P['sol'], g,
                    chanfrein=0.012)
    dalle['role'] = 'socle'
    lx0, lx1, ly0, ly1, e = -2.06, 3.26, -1.96, 0.71, 0.035
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


def chargement(racine, P):
    """Table de chargement : pile de plaques vierges et leurs intercalaires dans le fond de carton, corbeille."""
    g = c.vide('chargement', parent=racine)
    x = -1.32
    c.boite('table_plateau', (0.92, 0.72, 0.025), (x, 0, 0.4725), P['inox'], g)
    for i, (taille, centre) in enumerate((
        ((0.86, 0.03, 0.05), (x, -0.33, 0.435)), ((0.86, 0.03, 0.05), (x, 0.33, 0.435)),
        ((0.03, 0.63, 0.05), (x - 0.43, 0, 0.435)), ((0.03, 0.63, 0.05), (x + 0.43, 0, 0.435)),
    )):
        c.boite(f'table_ceinture_{i}', taille, centre, P['tole_sombre'], g)
    for i, (xp, yp) in enumerate(((-1.72, -0.30), (-0.92, -0.30), (-1.72, 0.30), (-0.92, 0.30))):
        c.boite(f'table_pied_{i}', (0.04, 0.04, 0.35), (xp, yp, 0.235), P['tole_sombre'], g)
        pied_reglable(f'table_verin_{i}', xp, yp, g, P)
    # Tablette basse : cartons de plaques neuves en réserve.
    for i, yp in enumerate((-0.30, 0.30)):
        c.boite(f'table_traverse_{i}', (0.76, 0.03, 0.03), (x, yp, 0.15), P['tole_sombre'], g)
    c.boite('table_tablette', (0.80, 0.64, 0.012), (x, 0, 0.171), P['galva'], g)
    for i in range(2):
        c.boite(f'table_carton_{i}', (0.66, 0.56, 0.06), (x + 0.02 * i, 0.01, 0.208 + 0.061 * i), P['carton'], g)
        c.boite(f'table_carton_etiquette_{i}', (0.14, 0.002, 0.03), (x + 0.2 + 0.02 * i, -0.271 + 0.01, 0.208 + 0.061 * i),
                P['papier'], g, chanfrein=0)
    # Fond de carton ouvert, puis la pile : plaque d'aluminium et papier intercalaire, couche par couche.
    c.boite('pile_fond', (0.58, 0.68, 0.012), (x, 0, 0.491), P['carton'], g)
    for i, (taille, centre) in enumerate((
        ((0.58, 0.006, 0.03), (x, -0.337, 0.512)), ((0.58, 0.006, 0.03), (x, 0.337, 0.512)),
        ((0.006, 0.67, 0.03), (x - 0.287, 0, 0.512)), ((0.006, 0.67, 0.03), (x + 0.287, 0, 0.512)),
    )):
        c.boite(f'pile_rebord_{i}', taille, centre, P['carton'], g, chanfrein=0)
    z = 0.497
    for k in range(12):
        c.boite(f'pile_plaque_{k}', (PLAQUE_L, PLAQUE_W, 0.006), (x, 0, z + 0.003), P['alu'], g, chanfrein=0)
        c.boite(f'pile_intercalaire_{k}', (PLAQUE_L + 0.012, PLAQUE_W + 0.01, 0.0025),
                (x + 0.003 * (k % 2), 0.002, z + 0.00725), P['intercalaire'], g, chanfrein=0)
        z += 0.0085
    # Plaque du dessus, intercalaire déjà retiré : la couche bleue est à nu, prête à être prise.
    plaque('pile_dessus', PLAQUE_L, PLAQUE_W, 0.004, (x, 0, z + 0.002), P['couche'], P['alu'], g)
    # Stock : capteur à ultrasons au-dessus de la pile, sur une potence au coin arrière de la table ; la hauteur de
    # pile donne le nombre de plaques restantes.
    c.boite('stock_potence', (0.03, 0.03, 0.48), (-1.66, 0.33, 0.725), P['tole_sombre'], g)
    tube('stock_bras', (-1.66, 0.33, 0.95), (-1.32, 0.0, 0.95), 0.012, P['tole_sombre'], g, segments=8, chanfrein=0)
    c.boite('stock_bride', (0.04, 0.04, 0.03), (-1.32, 0.0, 0.93), P['tole_sombre'], g)
    c.capteur('capteur_stock_plaques', 'ultrasons', (-1.32, 0.0, 0.80), g, P, 1, 'stock', '-Z')
    # Corbeille des intercalaires retirés.
    xb, yb = -1.86, -0.60
    c.boite('corbeille_fond', (0.30, 0.26, 0.012), (xb, yb, 0.006), P['graphite'], g, chanfrein=0)
    for i, (taille, centre) in enumerate((
        ((0.30, 0.01, 0.40), (xb, yb - 0.125, 0.20)), ((0.30, 0.01, 0.40), (xb, yb + 0.125, 0.20)),
        ((0.01, 0.24, 0.40), (xb - 0.145, yb, 0.20)), ((0.01, 0.24, 0.40), (xb + 0.145, yb, 0.20)),
    )):
        c.boite(f'corbeille_paroi_{i}', taille, centre, P['graphite'], g)
    # Feuilles froissées en vrac, inclinées sans traverser les parois.
    for i, (dx, ang) in enumerate(((-0.05, 0.12), (0.01, -0.08), (0.05, 0.15))):
        c.boite(f'corbeille_papier_{i}', (0.18, 0.003, 0.30), (xb + dx, yb + 0.05 * (i - 1), 0.32), P['intercalaire'],
                g, chanfrein=0, rotation=(0.12 * (i - 1), ang, 0))
    return g


def graveur(racine, P):
    """
    Graveur thermique à tambour externe : caisson capoté, tambour et tête laser visibles par les vitres teintées de la
    façade et du capot, table d'introduction à gauche, fente de sortie à droite vers la passerelle.
    """
    g = c.vide('graveur', parent=racine)
    caisson = c.boite('graveur_caisson', (1.34, 1.02, 0.90), (0, 0, 0.59), P['tole'], g)
    # Chambre du tambour, ouverte en façade et sur le dessus, sous les vitres.
    c.percer(caisson, c.boite('graveur_chambre_outil', (0.84, 1.02, 0.50), (0, -0.11, 0.85), None, chanfrein=0))
    c.boite('graveur_plinthe', (1.28, 0.96, 0.08), (0, 0, 0.10), P['tole_sombre'], g)
    for i, (xp, yp) in enumerate(((-0.58, -0.42), (0.58, -0.42), (-0.58, 0.42), (0.58, 0.42))):
        pied_reglable(f'graveur_verin_{i}', xp, yp, g, P)
    # Habillage intérieur sombre : on regarde dans une machine, pas dans un bloc.
    for i, (taille, centre) in enumerate((
        ((0.84, 0.905, 0.01), (0, -0.0575, 0.605)), ((0.84, 0.01, 0.44), (0, 0.395, 0.82)),
        ((0.01, 0.905, 0.44), (-0.415, -0.0575, 0.82)), ((0.01, 0.905, 0.44), (0.415, -0.0575, 0.82)),
    )):
        c.boite(f'graveur_doublure_{i}', taille, centre, P['tole_sombre'], g, chanfrein=0)
    # Façade haute percée de sa vitre, vissée aux quatre coins.
    yf = -0.514
    facade = c.profil('graveur_facade', [(-0.66, 0.58), (0.66, 0.58), (0.66, 1.04), (-0.66, 1.04)], 0.008, yf,
                      P['tole'], g)
    c.percer(facade, c.profil('graveur_facade_outil', c.rectangle_arrondi(-0.30, 0.66, 0.30, 0.96, 0.025), 0.05, yf,
                              None, chanfrein=0))
    c.boite('graveur_vitre', (0.62, 0.004, 0.32), (0, yf, 0.81), P['fume'], g, chanfrein=0)
    for i, (xv, zv) in enumerate(((-0.63, 0.61), (0.63, 0.61), (-0.63, 1.01), (0.63, 1.01))):
        c.vis(f'graveur_facade_vis_{i}', (xv, yf - 0.004, zv), g, P['acier'])
    # Portes de maintenance basses : serrure, poignée encastrée, persiennes.
    for i, (a, b) in enumerate(((-0.645, -0.01), (0.01, 0.645))):
        xm = (a + b) / 2
        c.boite(f'graveur_porte_{i}', (b - a, 0.008, 0.375), (xm, yf, 0.3675), P['tole'], g)
        xi = b - 0.06 if i == 0 else a + 0.06
        c.boite(f'graveur_poignee_{i}', (0.10, 0.012, 0.025), (xi, yf - 0.008, 0.52), P['plastique_noir'], g)
        c.cylindre(f'graveur_serrure_{i}', 0.009, 0.01, (xi, yf - 0.009, 0.48), P['chrome'], 'Y', g, segments=12,
                   chanfrein=0)
        grille(f'graveur_grille_{i}', (xm, yf - 0.004, 0.27), 0.40, 0.10, '-Y', g, P, lames=4)
    # Commandes de façade : écran, voyants d'état, marche, clé, arrêt d'urgence.
    c.boite('graveur_ecran_cadre', (0.27, 0.018, 0.18), (0.48, -0.527, 0.85), P['tole_sombre'], g)
    ecran = plan_image('ecran_ihm', 0.24, 0.15, (0.48, -0.5365, 0.85), P['ecran_graveur'], g)
    ecran['role'] = 'ecran'
    for i, (xl, mat) in enumerate(((0.39, P['led_verte']), (0.42, P['led_bleue']), (0.45, P['led_orange']))):
        c.cylindre(f'graveur_led_{i}', 0.007, 0.006, (xl, yf - 0.006, 0.735), mat, 'Y', g, segments=12, chanfrein=0)
    c.bouton('graveur_marche', (0.53, yf - 0.004, 0.735), P['vert_bouton'], g, P)
    c.bouton('graveur_cle', (0.57, yf - 0.004, 0.735), P['plastique_noir'], g, P)
    c.arret_urgence('graveur_au', (0.48, yf - 0.004, 0.655), g, P)
    # Sécurité laser : pictogramme, plaque « LASER CLASSE 1 », plaque signalétique.
    c.pictogramme_danger('graveur_danger', (-0.48, yf - 0.004, 0.955), g, P, taille=0.05)
    c.boite('graveur_plaque_laser', (0.17, 0.002, 0.03), (-0.48, yf - 0.005, 0.88), P['jaune_securite'], g, chanfrein=0)
    c.texte('graveur_texte_laser', 'LASER CLASSE 1', 0.016, (-0.48, yf - 0.0065, 0.88), P['plastique_noir'], g)
    c.boite('graveur_signaletique', (0.10, 0.002, 0.06), (-0.50, yf - 0.005, 0.66), P['chrome'], g, chanfrein=0)
    # Capot du tambour, arrondi devant, avec sa vitre teintée ; bloc arrière fixe qui porte la colonne lumineuse.
    capot = profil_x('graveur_capot', [(0.25, 1.04), (0.25, 1.15)] + c.arc(-0.44, 1.07, 0.08, 90, 180)
                     + [(-0.52, 1.04)], 1.30, 0.0, P['tole'], g)
    c.percer(capot, c.boite('graveur_capot_outil', (0.72, 0.54, 0.2), (0, -0.13, 1.10), None, chanfrein=0))
    c.boite('graveur_capot_vitre', (0.73, 0.55, 0.004), (0, -0.13, 1.146), P['fume'], g, chanfrein=0)
    c.boite('graveur_capot_poignee', (0.36, 0.022, 0.018), (0, -0.531, 1.05), P['plastique_noir'], g)
    for xc in (-0.45, 0.45):
        c.cylindre(f'graveur_charniere_{xc}', 0.012, 0.08, (xc, 0.25, 1.15), P['acier'], 'X', g, chanfrein=0)
    c.boite('graveur_bloc_arriere', (1.34, 0.26, 0.11), (0, 0.38, 1.095), P['tole'], g)
    grille('graveur_grille_arriere', (-0.25, 0.51, 1.095), 0.40, 0.07, '+Y', g, P, lames=3)
    # Introduction à gauche : fente, table inclinée sur ses consoles, une plaque vierge engagée.
    c.boite('graveur_fente_entree', (0.006, 0.68, 0.022), (-0.672, 0, Z_FENTE - 0.005), P['plastique_noir'], g,
            chanfrein=0)
    c.boite('graveur_table_entree', (0.22, 0.70, 0.008), (-0.78, 0, 0.918), P['inox'], g)
    for s in (-1, 1):
        c.boite(f'graveur_guide_entree_{s}', (0.22, 0.012, 0.03), (-0.78, s * 0.345, 0.932), P['tole_sombre'], g)
        tube(f'graveur_console_{s}', (-0.675, s * 0.30, 0.80), (-0.84, s * 0.30, 0.912), 0.012, P['tole_sombre'], g)
    plaque('graveur_plaque_vierge', PLAQUE_L, PLAQUE_W, EP_PLAQUE, (-0.61, 0, 0.9235), P['couche'], P['alu'], g)
    # Cellule de bourrage au-dessus de la table d'introduction : une plaque qui y reste trop longtemps est bloquée.
    c.boite('bourrage_console', (0.13, 0.02, 0.02), (-0.735, -0.22, 1.03), P['tole_sombre'], g)
    c.capteur('capteur_bourrage', 'cellule', (-0.78, -0.22, 0.975), g, P, 1, 'bourrage', '-Z')
    # Sortie à droite, vers la passerelle.
    c.boite('graveur_fente_sortie', (0.006, 0.68, 0.022), (0.672, 0, Z_FENTE), P['plastique_noir'], g, chanfrein=0)
    grille('graveur_grille_gauche', (-0.67, 0.15, 0.35), 0.40, 0.16, '-X', g, P)
    grille('graveur_grille_droite', (0.67, 0.15, 0.35), 0.40, 0.16, '+X', g, P)
    # Dos : ventilateurs, presse-étoupe, câbles d'alimentation et de réseau vers la goulotte au sol.
    for xv in (-0.35, 0.35):
        c.cylindre(f'graveur_ventilateur_{xv}', 0.075, 0.012, (xv, 0.516, 0.75), P['graphite'], 'Y', g)
        c.cylindre(f'graveur_moyeu_{xv}', 0.02, 0.016, (xv, 0.518, 0.75), P['plastique_noir'], 'Y', g, chanfrein=0)
        for a in (0, 90):
            c.boite(f'graveur_croisillon_{xv}_{a}', (0.15, 0.004, 0.008), (xv, 0.523, 0.75), P['tole_sombre'], g,
                    chanfrein=0, rotation=(0, math.radians(a), 0))
    c.boite('graveur_presse_etoupe', (0.16, 0.01, 0.06), (0.40, 0.515, 0.25), P['tole_sombre'], g)
    c.tuyau('graveur_cable_secteur', [(0.36, 0.52, 0.25), (0.36, 0.59, 0.16), (0.32, 0.62, 0.03), (0.15, 0.62, 0.02)],
            0.009, P['plastique_noir'], g)
    c.tuyau('graveur_cable_reseau', [(0.44, 0.52, 0.25), (0.46, 0.585, 0.14), (0.50, 0.615, 0.03), (0.70, 0.625, 0.02)],
            0.005, P['bidon_bleu'], g)
    tambour_et_tete(g, P)
    return g


def tambour_et_tete(g, P):
    """Intérieur du graveur : tambour tournant et sa plaque, paliers, tête laser sur ses glissières."""
    centre = (X_TAMBOUR, 0, Z_TAMBOUR)
    tambour = c.cylindre(c.suivant('rotatif'), R_TAMBOUR, L_TAMBOUR, centre, P['acier'], 'Y', g)
    c.rotatif(tambour, R_TAMBOUR, sous_la_bande=True)
    # Plaque enroulée sur 199° (0,52 m sur un tambour de 0,30 m), tenue par deux barres de serrage.
    ouverture = math.degrees(PLAQUE_L / R_TAMBOUR)
    pl = c.secteur('graveur_plaque_tambour', R_TAMBOUR + 0.0025, R_TAMBOUR + 0.0005, PLAQUE_W, ouverture, centre,
                   P['couche'], 'Y', debut_deg=-10)
    c.attacher(pl, tambour)
    for k, a in enumerate((-10, -10 + ouverture)):
        r = R_TAMBOUR + 0.006
        barre = c.boite(f'graveur_serrage_{k}', (0.014, 0.66, 0.014),
                        (X_TAMBOUR + r * math.cos(math.radians(a)), 0, Z_TAMBOUR + r * math.sin(math.radians(a))),
                        P['tole_sombre'], chanfrein=0)
        c.attacher(barre, tambour)
    for s in (-1, 1):
        flasque = c.cylindre(f'graveur_flasque_tambour_{s}', R_TAMBOUR + 0.012, 0.012,
                             (X_TAMBOUR, s * (L_TAMBOUR / 2 + 0.006), Z_TAMBOUR), P['graphite'], 'Y')
        c.attacher(flasque, tambour)
    c.cylindre('graveur_arbre_tambour', 0.03, 0.86, (X_TAMBOUR, -0.04, Z_TAMBOUR), P['acier'], 'Y', g)
    for yp in (-0.445, 0.375):
        c.boite(f'graveur_palier_pied_{yp}', (0.08, 0.03, 0.23), (X_TAMBOUR, yp, 0.725), P['tole_sombre'], g)
        c.cylindre(f'graveur_palier_{yp}', 0.05, 0.04, (X_TAMBOUR, yp, Z_TAMBOUR), P['graphite'], 'Y', g)
    # Glissières, vis-mère et chariot : la tête parcourt la largeur de la plaque, en face du tambour.
    for zr in (0.75, 0.87):
        c.cylindre(f'graveur_glissiere_{zr}', 0.011, 0.80, (0.30, -0.03, zr), P['chrome'], 'Y', g, chanfrein=0)
    c.cylindre('graveur_vis_mere', 0.007, 0.80, (0.30, -0.03, 0.81), P['acier'], 'Y', g, segments=10, chanfrein=0)
    for yp in (-0.445, 0.375):
        c.boite(f'graveur_support_glissiere_{yp}', (0.05, 0.03, 0.29), (0.30, yp, 0.755), P['tole_sombre'], g)
    yt = -0.28  # près de la façade : la tête se voit par la vitre, en face du point de diagnostic
    c.boite('graveur_chariot', (0.06, 0.16, 0.18), (0.29, yt, 0.81), P['graphite'], g)
    c.boite('graveur_tete', (0.13, 0.14, 0.14), (0.195, yt, 0.81), P['tole_sombre'], g)
    for k in range(5):
        c.boite(f'graveur_ailette_{k}', (0.11, 0.004, 0.025), (0.195, yt - 0.06 + 0.03 * k, 0.8925), P['graphite'], g,
                chanfrein=0)
    c.cylindre('graveur_optique', 0.024, 0.05, (0.105, yt, 0.81), P['acier'], 'X', g)
    # Photodiode d'étalonnage en bout de course, face à l'optique : la tête y mesure la puissance de chaque diode.
    c.capteur('capteur_puissance_diodes', 'cellule', (0.065, -0.40, 0.81), g, P, 2, 'puissance_diode', '+X')
    # Sonde de température plongée dans le bloc de refroidissement des diodes, sur le dessus de la tête.
    c.capteur('capteur_temperature_diodes', 'sonde', (0.24, yt + 0.045, 0.905), g, P, 2, 'temperature', '-Z')
    c.cylindre('graveur_lentille', 0.014, 0.01, (0.075, yt, 0.81), P['plastique_noir'], 'X', g, chanfrein=0)
    c.tuyau('graveur_cable_tete', [(0.29, yt + 0.08, 0.90), (0.29, 0.06, 0.97), (0.30, 0.22, 0.98), (0.32, 0.38, 0.92)],
            0.012, P['plastique_noir'], g)


def passerelle(racine, P):
    """Passerelle à rouleaux entre graveur et développeuse, une plaque gravée en transit."""
    g = c.vide('passerelle', parent=racine)
    (x0, z0), (x1, z1) = PASSERELLE
    pente = math.atan2(z0 - z1, x1 - x0)  # positive : l'extrémité +X descend
    xm = (x0 + x1) / 2
    for s in (-1, 1):
        c.boite(f'passerelle_longeron_{s}', (0.50, 0.02, 0.07), (xm, s * 0.36, z_passerelle(xm) - 0.02), P['tole_sombre'],
                g, rotation=(0, pente, 0))
    for k, xr in enumerate((0.74, 0.85, 0.96, 1.07)):
        r = c.cylindre(c.suivant('rotatif'), 0.016, 0.70, (xr, 0, z_passerelle(xr) - 0.016), P['chrome'], 'Y', g,
                       chanfrein=0)
        c.rotatif(r, 0.016, sous_la_bande=True)
    plaque('passerelle_plaque', PLAQUE_L, PLAQUE_W, EP_PLAQUE, (0.91, 0, z_passerelle(0.91) + EP_PLAQUE / 2),
           P['gravee'], P['alu'], g, rotation=(0, pente, 0))
    # Cellule de détection de plaque, sur le longeron avant.
    c.boite('passerelle_cellule', (0.03, 0.04, 0.03), (0.76, -0.36, z_passerelle(0.76) + 0.03), P['plastique_noir'], g)
    c.cylindre('passerelle_cellule_led', 0.004, 0.004, (0.76, -0.381, z_passerelle(0.76) + 0.035), P['led_verte'], 'Y',
               g, segments=8, chanfrein=0)
    # Béquille : deux montants, une entretoise, des vérins.
    for s in (-1, 1):
        haut = z_passerelle(0.91) - 0.055
        c.boite(f'passerelle_montant_{s}', (0.04, 0.04, haut - 0.06), (0.91, s * 0.30, (haut + 0.06) / 2),
                P['tole_sombre'], g)
        pied_reglable(f'passerelle_verin_{s}', 0.91, s * 0.30, g, P)
    c.boite('passerelle_entretoise', (0.03, 0.56, 0.03), (0.91, 0, 0.30), P['tole_sombre'], g)
    return g


def developpeuse(racine, P):
    """
    Développeuse de plaques : bac de développement à brosse, rinçage, gommage, séchage à lames d'air, sous des capots
    teintés qui laissent voir les rouleaux. Bidons de régénération dans la niche basse, pupitre à l'entrée.
    """
    g = c.vide('developpeuse', parent=racine)
    # Les six rouleaux bas d'abord : ils gardent les noms rotatif_1 à 6 de l'ancien modèle.
    for k, x in enumerate(X_ROULEAUX):
        mat = P['chrome'] if k in (1, 5) else P['caoutchouc']
        r = c.cylindre(c.suivant('rotatif'), R_ROULEAU, 0.62, (x, 0, Z_ROULEAUX), mat, 'Y', g)
        c.rotatif(r, R_ROULEAU, sous_la_bande=True)
        c.cylindre(f'dev_axe_bas_{k}', 0.01, 0.70, (x, 0, Z_ROULEAUX), P['acier'], 'Y', g, segments=10, chanfrein=0)
        for s in (-1, 1):
            c.boite(f'dev_palier_{k}_{s}', (0.05, 0.03, 0.13), (x, s * 0.355, 0.865), P['graphite'], g)
    # Rouleaux presseurs au-dessus du passage, brosse rotative dans le bain de développement.
    for k, x in enumerate(X_ROULEAUX):
        rh = 0.042 if k == 1 else 0.03
        mat = P['brosse'] if k == 1 else P['caoutchouc']
        r = c.cylindre(c.suivant('rotatif'), rh, 0.62, (x, 0, Z_PASSAGE + rh + 0.002), mat, 'Y', g)
        c.rotatif(r, rh, sous_la_bande=False)
        c.cylindre(f'dev_axe_haut_{k}', 0.009, 0.70, (x, 0, Z_PASSAGE + rh + 0.002), P['acier'], 'Y', g, segments=10,
                   chanfrein=0)
    caisson = c.boite('dev_caisson', (1.50, 0.96, 0.68), (1.88, 0, 0.44), P['tole'], g)
    c.percer(caisson, c.boite('dev_niche_outil', (0.50, 0.80, 0.31), (2.33, -0.28, 0.285), None, chanfrein=0))
    c.boite('dev_plinthe', (1.44, 0.90, 0.05), (1.88, 0, 0.075), P['tole_sombre'], g)
    for i, xp in enumerate((1.22, 1.88, 2.54)):
        for s in (-1, 1):
            pied_reglable(f'dev_verin_{i}_{s}', xp, s * 0.40, g, P, hauteur=0.05)
    cadre = c.boite('dev_cadre', (1.50, 0.96, 0.02), (1.88, 0, 0.79), P['inox'], g)
    c.percer(cadre, c.boite('dev_cadre_outil', (1.24, 0.66, 0.1), (1.94, 0, 0.79), None, chanfrein=0))
    # Bains vus par l'ouverture des bacs, et cloisons entre les sections.
    for nom, a, b, mat in (('dev', 1.32, 1.875, P['bain_dev']), ('rincage', 1.885, 2.055, P['bain_eau']),
                           ('gomme', 2.065, 2.235, P['bain_gomme']), ('sechage', 2.245, 2.56, P['tole_sombre'])):
        c.boite(f'dev_bain_{nom}', (b - a, 0.66, 0.004), ((a + b) / 2, 0, 0.783), mat, g, chanfrein=0)
    for xc in (1.88, 2.06, 2.24):
        c.boite(f'dev_cloison_{xc}', (0.01, 0.66, 0.03), (xc, 0, 0.795), P['inox'], g, chanfrein=0)
    # Sondes de température et de conductivité plongées dans le bain de développement, entre brosse et pinçage ;
    # codeur en bout d'arbre de la brosse, sur son palier avant.
    c.capteur('capteur_temperature_bain', 'sonde', (1.70, -0.31, 0.80), g, P, 3, 'temperature_bain', '-Z')
    c.capteur('capteur_conductivite_bain', 'sonde', (1.70, -0.245, 0.80), g, P, 3, 'conductivite', '-Z')
    c.capteur('capteur_vitesse_brosse', 'codeur', (X_ROULEAUX[1], -0.41, Z_PASSAGE + 0.044), g, P, 3,
              'vitesse_brosses', '-Y')
    # Rampes d'aspersion du rinçage et du gommage.
    for xr in (1.925, 2.105):
        c.cylindre(f'dev_rampe_{xr}', 0.009, 0.66, (xr, 0, 0.94), P['inox'], 'Y', g, segments=10, chanfrein=0)
        for yb in (-0.2, 0.0, 0.2):
            c.cylindre(f'dev_buse_{xr}_{yb}', 0.005, 0.016, (xr, yb, 0.926), P['plastique_noir'], 'Z', g, segments=8,
                       chanfrein=0)
        c.tuyau(f'dev_alim_rampe_{xr}', [(xr, 0.33, 0.94), (xr, 0.40, 0.92), (xr, 0.43, 0.81)], 0.007, P['inox'], g)
    # Séchage : lames d'air de part et d'autre du passage, résistance au-dessus.
    for zl in (0.89, 0.846):
        c.boite(f'dev_lame_air_{zl}', (0.025, 0.64, 0.02), (2.45, 0, zl), P['inox'], g, chanfrein=0)
    c.boite('dev_resistance', (0.10, 0.60, 0.03), (2.42, 0, 0.94), P['graphite'], g)
    # Entrée : table et plaque de guidage jusqu'au premier pinçage.
    c.boite('dev_module_entree', (0.18, 0.96, 0.06), (1.22, 0, 0.83), P['tole'], g)
    c.boite('dev_table_entree', (0.26, 0.66, 0.004), (1.255, 0, 0.862), P['inox'], g, chanfrein=0)
    capots(g, P)
    facade_developpeuse(g, P)
    return g


def capots(g, P):
    """Capots relevables en polycarbonate teinté, un par groupe de sections, entre deux joues de tôle."""
    ext = [(-0.47, 0.80), (-0.47, 0.92), (-0.41, 0.975), (0.41, 0.975), (0.47, 0.92), (0.47, 0.80)]
    inte = [(0.465, 0.80), (0.465, 0.918), (0.408, 0.970), (-0.408, 0.970), (-0.465, 0.918), (-0.465, 0.80)]
    for nom, a, b in (('developpement', 1.31, 1.875), ('rincage_gommage', 1.885, 2.235), ('sechage', 2.245, 2.60)):
        xm = (a + b) / 2
        profil_x(f'dev_capot_{nom}', ext + inte, b - a, xm, P['fume'], g, chanfrein=0)
        c.boite(f'dev_capot_poignee_{nom}', (0.12, 0.02, 0.015), (xm, -0.48, 0.90), P['plastique_noir'], g)
        for dx in (-0.12, 0.12):
            c.cylindre(f'dev_capot_charniere_{nom}_{dx}', 0.008, 0.05, (xm + dx, 0.47, 0.93), P['acier'], 'X', g,
                       chanfrein=0)
    # Joues d'extrémité au-dessus de la fente de passage, et lèvre basse de la sortie.
    joue = [(-0.47, 0.875), (-0.47, 0.92), (-0.41, 0.975), (0.41, 0.975), (0.47, 0.92), (0.47, 0.875)]
    profil_x('dev_joue_entree', joue, 0.01, 1.305, P['tole'], g)
    profil_x('dev_joue_sortie', joue, 0.01, 2.605, P['tole'], g)
    c.boite('dev_levre_sortie', (0.01, 0.94, 0.058), (2.605, 0, 0.829), P['tole'], g)
    c.boite('dev_fente_sortie', (0.006, 0.66, 0.012), (2.612, 0, Z_PASSAGE + 0.004), P['plastique_noir'], g,
            chanfrein=0)


def facade_developpeuse(g, P):
    """Pupitre d'entrée, portes, noms des sections, niche des bidons, et au dos filtre, soufflerie et vidange."""
    yf = -0.48
    # Pupitre incliné sur le module d'entrée : afficheur du bain, marche, arrêt.
    rot = (math.radians(-26), 0, 0)
    centre = (1.22, -0.40, 0.895)
    c.boite('dev_pupitre', (0.16, 0.10, 0.07), centre, P['graphite'], g, rotation=rot)
    plan_image('dev_afficheur', 0.10, 0.05, sur_face(centre, rot, (0, -0.0505, 0.008)), P['afficheur'], g, rot)
    for nom, dx, mat in (('marche', -0.045, P['vert_bouton']), ('arret', 0.0, P['plastique_noir'])):
        b = c.bouton(f'dev_{nom}', sur_face(centre, rot, (dx, -0.05, -0.024)), mat, g, P)
        b.rotation_euler = (math.pi / 2 + rot[0], 0, 0)
    c.arret_urgence('dev_au', (1.22, yf, 0.70), g, P)
    # Portes de la partie bains, avec poignées et persiennes.
    for i, (a, b) in enumerate(((1.15, 1.595), (1.615, 2.06))):
        xm = (a + b) / 2
        c.boite(f'dev_porte_{i}', (b - a, 0.008, 0.52), (xm, yf - 0.004, 0.40), P['tole'], g)
        c.boite(f'dev_poignee_{i}', (0.014, 0.022, 0.10), (b - 0.05, yf - 0.018, 0.52), P['chrome'], g)
        grille(f'dev_grille_{i}', (xm - 0.04, yf - 0.008, 0.22), 0.26, 0.08, '-Y', g, P, lames=3)
    for texte, x in (('DÉVELOPPEMENT', 1.5925), ('RINÇAGE', 1.97), ('GOMMAGE', 2.15), ('SÉCHAGE', 2.4225)):
        c.texte(f'dev_nom_{texte}', texte, 0.022, (x, yf - 0.0008, 0.735), P['tole_sombre'], g)
    # Niche basse : bac de rétention, bidons de régénérateur, de gomme et de bain usé, et leurs flexibles.
    c.boite('dev_bac_retention', (0.46, 0.44, 0.04), (2.33, -0.20, 0.15), P['plastique_noir'], g)
    for k, (xb, corps, bouchon) in enumerate(((2.18, P['bidon'], P['rouge_arret']), (2.33, P['bidon'], P['jaune_securite']),
                                               (2.48, P['bidon_bleu'], P['plastique_noir']))):
        c.boite(f'dev_bidon_{k}', (0.12, 0.18, 0.22), (xb, -0.24, 0.28), corps, g)
        c.cylindre(f'dev_bouchon_{k}', 0.022, 0.02, (xb + 0.025, -0.24, 0.40), bouchon, 'Z', g, segments=12)
        c.boite(f'dev_anse_{k}', (0.03, 0.10, 0.02), (xb - 0.025, -0.24, 0.40), corps, g)
        c.boite(f'dev_bidon_etiquette_{k}', (0.08, 0.002, 0.09), (xb, -0.331, 0.27), P['papier'], g, chanfrein=0)
        c.boite(f'dev_bidon_bande_{k}', (0.08, 0.002, 0.012), (xb, -0.3315, 0.305), bouchon, g, chanfrein=0)
        c.tuyau(f'dev_flexible_bidon_{k}', [(xb + 0.025, -0.24, 0.41), (xb + 0.025, -0.20, 0.43),
                                            (xb + 0.04, -0.10, 0.45)], 0.005, P['plastique_noir'], g)
    c.pictogramme_danger('dev_danger_chimie', (2.20, yf - 0.001, 0.56), g, P, taille=0.05)
    c.pictogramme_danger('dev_danger_chaud', (2.46, yf - 0.001, 0.56), g, P, taille=0.05)
    # Dos : cartouche filtrante du bain, soufflerie du séchage, eau et vidange vers le siphon, alimentation.
    yd = 0.48
    c.cylindre('dev_filtre', 0.045, 0.22, (1.70, 0.535, 0.40), P['filtre'], 'Z', g)
    c.cylindre('dev_filtre_tete', 0.05, 0.03, (1.70, 0.535, 0.525), P['graphite'], 'Z', g)
    c.boite('dev_filtre_bride', (0.03, 0.06, 0.04), (1.70, 0.50, 0.525), P['tole_sombre'], g)
    for k, dx in enumerate((-0.02, 0.02)):
        c.tuyau(f'dev_filtre_flexible_{k}', [(1.70 + dx, 0.535, 0.54), (1.70 + dx, 0.52, 0.60), (1.70 + dx, yd, 0.62)],
                0.007, P['plastique_noir'], g)
    c.boite('dev_soufflerie', (0.24, 0.10, 0.22), (2.40, 0.53, 0.64), P['tole'], g)
    c.cylindre('dev_soufflerie_grille', 0.07, 0.008, (2.40, 0.584, 0.64), P['graphite'], 'Y', g)
    for k, (xa, za) in enumerate(((2.10, 0.25), (2.20, 0.22))):
        c.tuyau(f'dev_vidange_{k}', [(xa, yd, za), (xa + 0.02, 0.56, 0.15), (2.24 + 0.02 * k, 0.62, 0.02)], 0.012,
                P['galva'], g)
    c.boite('dev_siphon', (0.16, 0.10, 0.006), (2.25, 0.62, 0.003), P['inox'], g, chanfrein=0)
    for k in range(3):
        c.boite(f'dev_siphon_fente_{k}', (0.12, 0.012, 0.002), (2.25, 0.595 + 0.025 * k, 0.0065), P['plastique_noir'], g,
                chanfrein=0)
    c.tuyau('dev_cable_secteur', [(1.30, yd, 0.20), (1.30, 0.58, 0.05), (1.32, 0.62, 0.02)], 0.009, P['plastique_noir'],
            g)


def empileur(racine, P):
    """Empileur de sortie : plateau incliné, les plaques glissent contre la butée côté développeuse."""
    g = c.vide('empileur', parent=racine)
    bas = Vector((2.69, 0.72))
    pente = math.atan2(0.09, 0.51)
    d = Vector((math.cos(pente), math.sin(pente)))
    n = Vector((-math.sin(pente), math.cos(pente)))
    rot = (0, -pente, 0)

    def point(le_long, au_dessus):
        p = bas + d * le_long + n * au_dessus
        return p.x, p.y

    x, z = point(0.27, -0.005)
    c.boite('empileur_plateau', (0.54, 0.70, 0.01), (x, 0, z), P['galva'], g, rotation=rot)
    x, z = point(0.27, 0.0125)
    for s in (-1, 1):
        c.boite(f'empileur_guide_{s}', (0.54, 0.012, 0.035), (x, s * 0.356, z), P['tole_sombre'], g, rotation=rot)
    x, z = point(-0.01, 0.02)
    c.boite('empileur_butee', (0.02, 0.70, 0.04), (x, 0, z), P['caoutchouc'], g, rotation=rot)
    for k in range(4):
        x, z = point(0.005 + PLAQUE_L / 2, EP_PLAQUE / 2 + k * (EP_PLAQUE + 0.0012))
        plaque(f'empileur_plaque_{k}', PLAQUE_L, PLAQUE_W, EP_PLAQUE, (x, 0, z), P['gravee'], P['alu'], g, rotation=rot)
    # Piètement sur roulettes : l'empileur se recule pour accéder à la sortie de la développeuse.
    for i, xp in enumerate((2.71, 3.17)):
        haut = bas.y + (xp - bas.x) * math.tan(pente) - 0.012
        for s in (-1, 1):
            c.boite(f'empileur_pied_{i}_{s}', (0.03, 0.03, haut - 0.075), (xp, s * 0.32, (haut + 0.075) / 2),
                    P['tole_sombre'], g)
            c.boite(f'empileur_platine_{i}_{s}', (0.05, 0.05, 0.008), (xp, s * 0.32, 0.071), P['graphite'], g,
                    chanfrein=0)
            c.cylindre(f'empileur_roue_{i}_{s}', 0.03, 0.022, (xp, s * 0.32, 0.03), P['caoutchouc'], 'Y', g,
                       segments=12, chanfrein=0)
            for f in (-1, 1):
                c.boite(f'empileur_chape_{i}_{s}_{f}', (0.04, 0.005, 0.04), (xp, s * 0.32 + f * 0.015, 0.05),
                        P['graphite'], g, chanfrein=0)
        c.boite(f'empileur_traverse_{i}', (0.025, 0.62, 0.025), (xp, 0, 0.25), P['tole_sombre'], g)
    for s in (-1, 1):
        c.boite(f'empileur_lisse_{s}', (0.44, 0.025, 0.025), (2.94, s * 0.32, 0.25), P['tole_sombre'], g)
    return g


def poste_pao(racine, P):
    """Poste PAO et BAT : bureau, deux écrans (amalgame, BAT), unité centrale, épreuve, lampe, fauteuil."""
    g = c.vide('poste_pao', parent=racine)
    yb = -1.35
    c.boite('bureau_plateau', (1.30, 0.66, 0.028), (0.20, yb, 0.736), P['bureau'], g)
    for i, xp in enumerate((-0.40, 0.80)):
        c.boite(f'bureau_semelle_{i}', (0.06, 0.62, 0.035), (xp, yb, 0.0225), P['graphite'], g)
        c.boite(f'bureau_colonne_{i}', (0.07, 0.05, 0.66), (xp, yb, 0.37), P['graphite'], g)
        c.boite(f'bureau_bras_{i}', (0.05, 0.56, 0.03), (xp, yb, 0.707), P['graphite'], g)
        for s in (-1, 1):
            c.cylindre(f'bureau_patin_{i}_{s}', 0.02, 0.005, (xp, yb + s * 0.28, 0.0025), P['caoutchouc'], 'Z', g,
                       segments=10, chanfrein=0)
    c.boite('bureau_poutre', (1.16, 0.04, 0.05), (0.20, -1.08, 0.68), P['graphite'], g)
    c.boite('bureau_voile', (1.12, 0.008, 0.30), (0.20, -1.06, 0.50), P['graphite'], g)
    c.boite('bureau_goulotte', (0.65, 0.12, 0.05), (0.325, -1.17, 0.69), P['graphite'], g)
    # Coffret vitré sous le plateau : l'automate de liaison qui compte travaux en file et plaques refaites entre le
    # flux prépresse, le graveur et la développeuse.
    xa = -0.17
    c.boite('coffret_fond', (0.36, 0.01, 0.15), (xa, -1.075, 0.625), P['tole_sombre'], g)
    for i, (taille, centre) in enumerate((
        ((0.36, 0.13, 0.01), (xa, -1.135, 0.705)), ((0.36, 0.13, 0.01), (xa, -1.135, 0.545)),
        ((0.01, 0.13, 0.15), (xa - 0.175, -1.135, 0.625)), ((0.01, 0.13, 0.15), (xa + 0.175, -1.135, 0.625)),
    )):
        c.boite(f'coffret_paroi_{i}', taille, centre, P['tole_sombre'], g)
    c.capteur('automate_flux', 'automate', (xa, -1.185, 0.625), g, P, 4, ['file', 'plaques_refaites'], '-Y')
    c.boite('coffret_porte', (0.34, 0.004, 0.14), (xa, -1.2, 0.625), P['fume'], g, chanfrein=0)
    c.boite('coffret_serrure', (0.01, 0.006, 0.03), (xa + 0.15, -1.204, 0.625), P['chrome'], g, chanfrein=0)
    # Deux écrans légèrement tournés vers le fauteuil.
    for nom, xe, angle, mat in (('gauche', -0.075, 10, P['ecran_amalgame']), ('droit', 0.475, -10, P['ecran_bat'])):
        pivot = c.vide(f'moniteur_{nom}', (xe, -1.20, 1.00), g)
        pivot.rotation_euler = (0, 0, math.radians(angle))
        c.boite(f'moniteur_{nom}_coque', (0.55, 0.03, 0.35), (0, 0, 0), P['plastique_noir'], pivot)
        plan_image(f'moniteur_{nom}_dalle', 0.50, 0.3125, (0, -0.0155, 0.006), mat, pivot)  # 16:10, comme l'image
        c.boite(f'moniteur_{nom}_dos', (0.30, 0.04, 0.20), (0, 0.03, 0.0), P['plastique_noir'], pivot)
        c.boite(f'moniteur_{nom}_cou', (0.05, 0.03, 0.19), (0, 0.06, -0.15), P['graphite'], pivot)
        c.boite(f'moniteur_{nom}_pied', (0.22, 0.18, 0.012), (0, 0.03, -0.238), P['graphite'], pivot)
        c.tuyau(f'moniteur_{nom}_cable', [(xe, -1.13, 0.86), (xe + 0.02, -1.12, 0.76), (xe + 0.05, -1.17, 0.71)],
                0.004, P['plastique_noir'], g)
    c.boite('clavier', (0.44, 0.14, 0.016), (0.15, -1.47, 0.758), P['plastique_noir'], g)
    c.boite('clavier_touches', (0.41, 0.11, 0.004), (0.15, -1.47, 0.768), P['graphite'], g, chanfrein=0)
    c.boite('tapis_souris', (0.24, 0.20, 0.003), (0.48, -1.47, 0.7515), P['plastique_noir'], g, chanfrein=0)
    c.boite('souris', (0.06, 0.10, 0.025), (0.48, -1.47, 0.765), P['graphite'], g)
    # Épreuve de BAT posée à plat, lisible depuis le fauteuil.
    plaque('epreuve_bat', 0.42, 0.297, 0.0006, (-0.24, -1.46, 0.7505), P['epreuve'], P['papier'], g,
           rotation=(0, 0, math.radians(6)), repetition=(1.41, 1.0))
    # Lampe de contrôle des couleurs, au-dessus de l'épreuve.
    c.cylindre('lampe_socle', 0.07, 0.02, (-0.40, -1.10, 0.76), P['graphite'], 'Z', g)
    tube('lampe_bras_1', (-0.40, -1.10, 0.77), (-0.42, -1.18, 1.12), 0.01, P['graphite'], g, segments=8, chanfrein=0)
    tube('lampe_bras_2', (-0.42, -1.18, 1.12), (-0.38, -1.42, 1.10), 0.01, P['graphite'], g, segments=8, chanfrein=0)
    c.cylindre('lampe_tete', 0.06, 0.05, (-0.37, -1.44, 1.07), P['graphite'], 'Z', g, rayon2=0.035)
    c.cylindre('lampe_diffuseur', 0.055, 0.004, (-0.37, -1.44, 1.044), P['lampe'], 'Z', g, chanfrein=0)
    # Unité centrale au sol, sous le bureau, et câble réseau vers le graveur sous un passe-câble.
    c.boite('unite_centrale', (0.19, 0.42, 0.40), (0.66, -1.40, 0.225), P['plastique_noir'], g)
    c.cylindre('unite_centrale_bouton', 0.008, 0.004, (0.66, -1.612, 0.40), P['chrome'], 'Y', g, segments=10, chanfrein=0)
    c.cylindre('unite_centrale_led', 0.003, 0.004, (0.69, -1.612, 0.40), P['led_bleue'], 'Y', g, segments=8, chanfrein=0)
    for k in range(3):
        c.boite(f'unite_centrale_aeration_{k}', (0.12, 0.003, 0.008), (0.66, -1.611, 0.12 + 0.02 * k), P['graphite'], g,
                chanfrein=0)
    c.tuyau('unite_centrale_cable', [(0.66, -1.185, 0.38), (0.64, -1.16, 0.55), (0.62, -1.17, 0.67)], 0.005,
            P['plastique_noir'], g)
    c.tuyau('cable_reseau_bureau', [(0.55, -1.15, 0.67), (0.56, -1.07, 0.40), (0.55, -1.05, 0.02)], 0.004,
            P['bidon_bleu'], g)
    c.boite('passe_cable', (0.07, 0.52, 0.012), (0.55, -0.79, 0.006), P['jaune_securite'], g, chanfrein=0.002)
    c.boite('passe_cable_bande', (0.02, 0.52, 0.002), (0.55, -0.79, 0.0125), P['plastique_noir'], g, chanfrein=0)
    fauteuil(g, P)
    return g


def fauteuil(g, P):
    """Fauteuil de bureau sur piètement étoile à roulettes, tourné vers les écrans."""
    xc, yc = 0.20, -1.85
    c.cylindre('fauteuil_moyeu', 0.04, 0.05, (xc, yc, 0.08), P['graphite'], 'Z', g)
    for k in range(5):
        a = math.radians(90 + 72 * k)
        ca, sa = math.cos(a), math.sin(a)
        c.boite(f'fauteuil_branche_{k}', (0.25, 0.035, 0.03), (xc + 0.125 * ca, yc + 0.125 * sa, 0.075),
                P['graphite'], g, rotation=(0, 0, a))
        c.cylindre(f'fauteuil_roulette_{k}', 0.025, 0.02, (xc + 0.245 * ca, yc + 0.245 * sa, 0.025), P['caoutchouc'],
                   'X', g, segments=12, chanfrein=0)
    c.cylindre('fauteuil_verin', 0.022, 0.20, (xc, yc, 0.20), P['chrome'], 'Z', g)
    c.cylindre('fauteuil_fourreau', 0.03, 0.12, (xc, yc, 0.36), P['plastique_noir'], 'Z', g)
    c.boite('fauteuil_mecanisme', (0.18, 0.18, 0.04), (xc, yc, 0.43), P['graphite'], g)
    c.boite('fauteuil_assise', (0.46, 0.45, 0.07), (xc, yc, 0.485), P['tissu'], g, chanfrein=0.02, segments=2)
    c.boite('fauteuil_lame_dossier', (0.06, 0.03, 0.30), (xc, -2.02, 0.56), P['graphite'], g)
    c.boite('fauteuil_dossier', (0.43, 0.05, 0.42), (xc, -2.045, 0.82), P['tissu'], g, chanfrein=0.02, segments=2,
            rotation=(0.12, 0, 0))


def colonne_lumineuse(racine, P):
    """Colonne lumineuse sur le bloc arrière du graveur, comme l'ancien modèle."""
    g = c.vide('colonne_lumineuse', parent=racine)
    x, y = 0.52, 0.38
    c.cylindre('colonne_pied', 0.03, 0.015, (x, y, 1.1575), P['graphite'], 'Z', g)
    c.cylindre('colonne_mat', 0.012, 0.156, (x, y, 1.243), P['acier'], 'Z', g)
    c.cylindre('colonne_douille', 0.032, 0.012, (x, y, 1.327), P['plastique_noir'], 'Z', g)
    for nom, zv, mat, etat in (('voyant_vert', 1.36, P['vert'], 'marche'), ('voyant_orange', 1.4185, P['orange'],
                                                                              'attention'),
                               ('voyant_rouge', 1.477, P['rouge'], 'arret')):
        v = c.cylindre(nom, 0.032, 0.054, (x, y, zv), mat, 'Z', g, None, chanfrein=0.002)
        v['role'] = 'voyant'
        v['etat'] = etat
    for i, zv in enumerate((1.38925, 1.44775)):
        c.cylindre(f'colonne_bague_{i}', 0.0325, 0.004, (x, y, zv), P['plastique_noir'], 'Z', g, None, chanfrein=0.0005)
    c.cylindre('colonne_chapeau', 0.032, 0.02, (x, y, 1.514), P['plastique_noir'], 'Z', g)
    return g


def goulotte(racine, P):
    """Goulotte de sol derrière la ligne : câbles du graveur et de la développeuse."""
    g = c.vide('goulotte', parent=racine)
    c.boite('goulotte_sol', (2.15, 0.08, 0.02), (0.875, 0.62, 0.01), P['galva'], g)
    return g


# --- Assemblage ------------------------------------------------------------------------------------------------


def construire():
    P = matieres()
    fiche = c.kit_machine(MACHINE)
    racine = c.vide(MACHINE, props={'machine': fiche['nom'], 'fiabilite': 'Technologie confirmée', 'unite': 'metre',
                                    'axeHaut': 'Y'})
    groupes = [
        developpeuse(racine, P),  # en premier : ses rouleaux bas reprennent rotatif_1 à 6
        chargement(racine, P),
        graveur(racine, P),
        passerelle(racine, P),
        empileur(racine, P),
        poste_pao(racine, P),
        colonne_lumineuse(racine, P),
        goulotte(racine, P),
    ]
    g_socle = socle(racine, P)
    ombre = c.ombre_au_sol('socle_6', -2.13, 3.33, -2.03, 0.78, 0.003, largeur_px=768)
    ombre['role'] = 'socle'
    ombre.parent = g_socle
    c.points_diagnostic(
        [(p['numero'], p['nom'], c.depuis_gltf(p['position'])) for p in fiche['points_diagnostic']], racine)
    c.reperes([(r['texte'], c.depuis_gltf(r['position'])) for r in fiche['reperes']], racine)
    return racine, groupes


def vues(objets):
    v = c.vues_par_defaut(objets)
    v['graveur'] = dict(position=(-0.9, -1.75, 1.75), cible=(0.0, -0.1, 0.85), focale=40)
    v['interieur'] = dict(position=(0.15, -1.0, 0.86), cible=(0.0, 0.0, 0.80), focale=35)
    v['developpeuse'] = dict(position=(1.2, -1.5, 1.6), cible=(1.9, 0, 0.8), focale=40)
    v['chargement'] = dict(position=(-2.4, -1.4, 1.4), cible=(-1.1, 0, 0.6), focale=40)
    v['pao'] = dict(position=(0.9, -2.7, 1.55), cible=(0.2, -1.3, 0.9), focale=40)
    v['automate'] = dict(position=(-0.17, -1.85, 0.68), cible=(-0.17, -1.15, 0.62), focale=40)
    v['empileur'] = dict(position=(3.9, -1.3, 1.45), cible=(2.7, 0, 0.75), focale=40)
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
