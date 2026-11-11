"""
Outils partagés des scripts de modélisation du kit machines (Blender 5.3, lancé sans fenêtre).

Chaque machine a son script (flexo.py, offset.py…) qui construit la scène de zéro, l'enregistre en .blend à côté de
lui et l'exporte en .glb dans data/kit/modeles/. Le .glb reste la seule chose que l'application lit ; le .blend sert à
ouvrir la machine dans Blender.

Repère : Blender a Z vers le haut, X le long de la machine (sens de défilement de la bande) et la face avant, côté
conducteur, regarde vers -Y. L'export glTF passe en Y vers le haut : -Y Blender devient +Z glTF, la face avant que
l'application attend.

Contrat des nœuds (data/kit/README.md) : rotatif_N, bande_N, voyant_vert/orange/rouge, ecran_ihm,
points_diagnostic/diag_N_nom, reperes/repere_nom, socle_N. Les extras glTF viennent des propriétés personnalisées des
objets.

Le fichier dépasse 800 lignes : il rassemble ce que les huit scripts partagent (pièces, matières, capteurs, export,
images de contrôle). Le couper obligerait chaque script à importer quatre modules pour les mêmes appels `c.xxx`.

Contraintes de l'application sur la géométrie :
- position, normale et UV seulement (mergedModel.ts ne fusionne que ces attributs en Float32) : ni couleur de sommet,
  ni tangente, ni compression Draco (le build compresse déjà en Meshopt, sans perte) ;
- une matière se reconnaît à sa couleur, son métal et sa rugosité (landing/realisme/matieres.ts) : les matières
  restent des valeurs PBR simples, sans texture, sauf là où l'image porte l'information (bande d'étiquettes, écran,
  flanc des bobines).
"""
import argparse
import math
import os
import re
import sys
import unicodedata

import bmesh
import bpy
from mathutils import Matrix, Vector

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE_DEPOT = os.path.abspath(os.path.join(ICI, '..', '..', '..'))
DOSSIER_MODELES = os.path.join(RACINE_DEPOT, 'data', 'kit', 'modeles')
DOSSIER_TEXTURES = os.path.join(ICI, 'textures')
# Projet de chaque machine, le temps de l'assembler dans kit.blend (kit.py) : hors dépôt.
DOSSIER_CONSTRUCTION = os.path.join(ICI, '.construction')

# Arrondi des arêtes vives : au-delà de cet angle entre deux faces, l'arête est chanfreinée.
ANGLE_ARETE = math.radians(30)


# --- Lancement -------------------------------------------------------------------------------------------------


def arguments(machine: str) -> argparse.Namespace:
    """Options passées après « -- » sur la ligne de commande de Blender."""
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog=f'{machine}.py')
    p.add_argument('--glb', default=os.path.join(DOSSIER_MODELES, f'{machine}.glb'), help='glb à écrire')
    p.add_argument('--blend', default=os.path.join(DOSSIER_CONSTRUCTION, f'{machine}.blend'),
                   help='projet Blender de la machine seule (kit.py les réunit dans kit.blend)')
    p.add_argument('--apercu', help="dossier des images de contrôle (aucune image si absent)")
    p.add_argument('--vues', default='', help='vues à rendre, séparées par des virgules (toutes si vide)')
    p.add_argument('--sans-export', action='store_true', help="ni glb ni blend : seulement les images")
    return p.parse_args(argv)


def scene_vide(machine: str) -> bpy.types.Scene:
    """Scène vierge nommée comme la machine : c'est sous ce nom qu'elle entre dans kit.blend."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _matieres.clear()
    _compteurs.clear()
    scene = bpy.context.scene
    scene.name = machine
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    return scene


def slug(texte: str) -> str:
    """Même règle que slug() de domain/catalog.ts : sert aux noms diag_N_nom et repere_nom."""
    t = unicodedata.normalize('NFD', texte)
    t = ''.join(c for c in t if not unicodedata.combining(c))
    return re.sub(r'^_|_$', '', re.sub(r'[^A-Za-z0-9]+', '_', t)).lower()


# --- Matières --------------------------------------------------------------------------------------------------


def _lineaire(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def couleur(hexa: str) -> tuple[float, float, float]:
    """Couleur sRGB « #rrggbb » en valeurs linéaires (celles que Blender et glTF stockent)."""
    h = hexa.lstrip('#')
    return tuple(_lineaire(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


_matieres: dict[str, bpy.types.Material] = {}


def matiere(
    nom: str,
    hexa: str,
    metal: float = 0.0,
    rugosite: float = 0.5,
    alpha: float = 1.0,
    emission: str | None = None,
    force: float = 1.0,
    image: str | None = None,
    masque: bool = False,
) -> bpy.types.Material:
    """
    Matière PBR, créée une fois par nom. `image` : fichier de textures/ posé en couleur de base ; `masque` : son alpha
    découpe la surface (seuil 0,5, mode MASK en glTF), pour la matrice d'échenillage et ses fenêtres vides.
    """
    if nom in _matieres:
        return _matieres[nom]
    m = bpy.data.materials.new(nom)
    m.use_backface_culling = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*couleur(hexa), 1.0)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rugosite
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    if emission:
        b.inputs['Emission Color'].default_value = (*couleur(emission), 1.0)
        b.inputs['Emission Strength'].default_value = force
    if image:
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(os.path.join(DOSSIER_TEXTURES, image), check_existing=True)
        tex.interpolation = 'Linear'
        m.node_tree.links.new(tex.outputs['Color'], b.inputs['Base Color'])
        if emission:
            m.node_tree.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
        if masque:
            seuil = m.node_tree.nodes.new('ShaderNodeMath')
            seuil.operation = 'GREATER_THAN'
            seuil.inputs[1].default_value = 0.5
            m.node_tree.links.new(tex.outputs['Alpha'], seuil.inputs[0])
            m.node_tree.links.new(seuil.outputs[0], b.inputs['Alpha'])
            m.surface_render_method = 'DITHERED'
    _matieres[nom] = m
    return m


# --- Objets ----------------------------------------------------------------------------------------------------


def collection(nom: str = 'machine') -> bpy.types.Collection:
    c = bpy.data.collections.get(nom)
    if not c:
        c = bpy.data.collections.new(nom)
        bpy.context.scene.collection.children.link(c)
    return c


def vide(nom: str, position=(0, 0, 0), parent=None, props: dict | None = None, taille: float = 0.05):
    """Nœud sans géométrie : groupe, point de diagnostic, repère. Ses propriétés deviennent des extras glTF."""
    o = bpy.data.objects.new(nom, None)
    o.empty_display_type = 'PLAIN_AXES'
    o.empty_display_size = taille
    o.location = position
    collection().objects.link(o)
    if parent:
        o.parent = parent
    for k, v in (props or {}).items():
        o[k] = v
    return o


def _objet(nom, bm, mat, parent, position, rotation, chanfrein, segments_chanfrein):
    me = bpy.data.meshes.new(nom)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(nom, me)
    collection().objects.link(obj)
    if mat:
        me.materials.append(mat)
    obj.location = position
    obj.rotation_euler = rotation
    if parent:
        obj.parent = parent
    if chanfrein:
        # Faces lisses + normales durcies par le chanfrein : arêtes arrondies, faces planes nettes.
        me.shade_smooth()
        mod = obj.modifiers.new('chanfrein', 'BEVEL')
        mod.width = chanfrein
        mod.segments = segments_chanfrein
        mod.limit_method = 'ANGLE'
        mod.angle_limit = ANGLE_ARETE
        mod.harden_normals = True
        mod.use_clamp_overlap = True
    else:
        me.set_sharp_from_angle(angle=ANGLE_ARETE)
    return obj


def _chanfrein_auto(*cotes: float) -> float:
    return max(0.0012, min(0.012, min(cotes) * 0.12))


def _segments_chanfrein(*cotes: float) -> int:
    """Deux segments (arrondi) sur les grandes pièces, qui accrochent la lumière ; un seul (chanfrein) ailleurs."""
    return 2 if max(cotes) > 0.3 else 1


def _segments_cercle(rayon: float) -> int:
    """Assez de côtés pour qu'un bout de cylindre vu de face reste rond : 32 pour un rouleau de 13 cm."""
    return max(12, min(48, round(rayon * 500 / 4) * 4))


# Axe d'un cylindre : le maillage est construit le long de Z local, la rotation de l'objet le couche.
# 'Y' tourne Z local vers -Y Blender, soit +Z glTF : l'axe Y local glTF d'un rouleau pointe vers l'avant, comme dans
# les modèles d'origine (le signe de vitesseRadS en dépend).
AXES = {'Y': (math.pi / 2, 0, 0), 'X': (0, math.pi / 2, 0), 'Z': (0, 0, 0)}


def boite(nom, taille, centre, mat, parent=None, chanfrein=None, rotation=(0, 0, 0), segments=None):
    """Pavé de dimensions `taille` (x, y, z) centré sur `centre`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(taille), verts=bm.verts)
    ch = _chanfrein_auto(*taille) if chanfrein is None else chanfrein
    return _objet(nom, bm, mat, parent, centre, rotation, ch, segments or _segments_chanfrein(*taille))


def cylindre(nom, rayon, longueur, centre, mat, axe='Y', parent=None, segments=None, chanfrein=None, rayon2=None):
    """Cylindre (ou tronc de cône si `rayon2`) le long de `axe`, centré sur `centre`."""
    n = segments or _segments_cercle(rayon)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=n, radius1=rayon, radius2=rayon if rayon2 is None else rayon2,
        depth=longueur,
    )
    # Sous 15 mm de rayon, un chanfrein ne se voit plus : arêtes vives.
    ch = (_chanfrein_auto(rayon * 2, longueur) if rayon >= 0.015 else 0) if chanfrein is None else chanfrein
    return _objet(nom, bm, mat, parent, centre, AXES[axe], ch, 1)


def anneau(nom, rayon_ext, rayon_int, longueur, centre, mat, axe='Y', parent=None, segments=None, chanfrein=None):
    """Tube creux : mandrin de bobine, bague, palier."""
    n = segments or _segments_cercle(rayon_ext)
    bm = bmesh.new()
    h = longueur / 2
    cercles = []
    for r, z in ((rayon_ext, -h), (rayon_ext, h), (rayon_int, h), (rayon_int, -h)):
        cercles.append([bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for i in range(n)])
    for a, b in zip(cercles, cercles[1:] + cercles[:1]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ch = _chanfrein_auto(rayon_ext - rayon_int, longueur) if chanfrein is None else chanfrein
    return _objet(nom, bm, mat, parent, centre, AXES[axe], ch, 1)


def profil(nom, points, epaisseur, y, mat, parent=None, chanfrein=None, segments=1):
    """Plaque découpée : polygone `points` [(x, z)…] dans le plan de face, extrudé sur `epaisseur` autour de `y`."""
    bm = bmesh.new()
    avant = [bm.verts.new((x, -epaisseur / 2, z)) for x, z in points]
    arriere = [bm.verts.new((x, epaisseur / 2, z)) for x, z in points]
    bm.faces.new(avant)
    bm.faces.new(list(reversed(arriere)))
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((avant[i], avant[j], arriere[j], arriere[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ch = _chanfrein_auto(epaisseur * 2.5) if chanfrein is None else chanfrein
    return _objet(nom, bm, mat, parent, (0, y, 0), (0, 0, 0), ch, segments)


def arc(cx, cz, r, debut_deg, fin_deg, pas_deg=15.0):
    """Points d'un arc de cercle dans le plan (x, z), pour les profils."""
    n = max(2, int(abs(fin_deg - debut_deg) / pas_deg) + 1)
    return [
        (cx + r * math.cos(math.radians(debut_deg + (fin_deg - debut_deg) * i / (n - 1))),
         cz + r * math.sin(math.radians(debut_deg + (fin_deg - debut_deg) * i / (n - 1))))
        for i in range(n)
    ]


def rectangle_arrondi(x0, z0, x1, z1, r):
    """Contour d'un rectangle aux coins arrondis, dans le sens trigonométrique."""
    return (
        arc(x1 - r, z0 + r, r, -90, 0) + arc(x1 - r, z1 - r, r, 0, 90)
        + arc(x0 + r, z1 - r, r, 90, 180) + arc(x0 + r, z0 + r, r, 180, 270)
    )


def secteur(nom, rayon_ext, rayon_int, longueur, ouverture_deg, centre, mat, axe='Y', parent=None, segments=32,
            debut_deg=0.0):
    """Portion de tube : plaque photopolymère sur son manchon, forme de découpe sur le cylindre magnétique."""
    bm = bmesh.new()
    n = max(4, int(segments * ouverture_deg / 360))
    h = longueur / 2
    a0 = math.radians(debut_deg)
    da = math.radians(ouverture_deg) / n
    anneaux = []
    for r, z in ((rayon_ext, -h), (rayon_ext, h), (rayon_int, h), (rayon_int, -h)):
        anneaux.append([bm.verts.new((r * math.cos(a0 + da * i), r * math.sin(a0 + da * i), z)) for i in range(n + 1)])
    for a, b in zip(anneaux, anneaux[1:] + anneaux[:1]):
        for i in range(n):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    for bout in (0, n):
        bm.faces.new([anneaux[k][bout] for k in range(4)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _objet(nom, bm, mat, parent, centre, AXES[axe], 0, 1)


def bobine(nom, rayon, largeur, centre, mat_bord, mat_flanc, axe='Y', parent=None, segments=None, pas_u=None):
    """
    Bobine pleine : bord (papier, film) et deux flancs à texture plaquée (spirale, mandrin). `pas_u` : longueur de
    bord par répétition de la texture du bord (étiquettes enroulées), sinon une seule répétition sur le tour.
    """
    segments = segments or max(16, min(72, int(rayon * 180) // 4 * 4))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    h = largeur / 2
    bas = [bm.verts.new((rayon * math.cos(2 * math.pi * i / segments), rayon * math.sin(2 * math.pi * i / segments), -h)) for i in range(segments)]
    haut = [bm.verts.new((v.co.x, v.co.y, h)) for v in bas]
    tour = 2 * math.pi * rayon
    rep = tour / pas_u if pas_u else 1.0
    for i in range(segments):
        j = (i + 1) % segments
        f = bm.faces.new((bas[i], bas[j], haut[j], haut[i]))
        f.material_index = 0
        u0, u1 = rep * i / segments, rep * (i + 1) / segments
        for loop, (u, v) in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
            loop[uv].uv = (u, v)
    for cercle, inverse in ((bas, True), (haut, False)):
        f = bm.faces.new(list(reversed(cercle)) if inverse else cercle)
        f.material_index = 1
        for loop in f.loops:
            loop[uv].uv = (0.5 + loop.vert.co.x / (2 * rayon), 0.5 + loop.vert.co.y / (2 * rayon))
    obj = _objet(nom, bm, None, parent, centre, AXES[axe], _chanfrein_auto(largeur) * 0.5, 1)
    obj.data.materials.append(mat_bord)
    obj.data.materials.append(mat_flanc)
    return obj


def tuyau(nom, points, rayon, mat, parent=None, resolution=5):
    """Flexible ou câble passant par `points` (x, y, z), courbe lissée puis convertie en maillage."""
    cu = bpy.data.curves.new(nom, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = rayon
    cu.bevel_resolution = 1 if rayon < 0.02 else 3
    cu.use_fill_caps = True
    cu.resolution_u = resolution
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    tmp = bpy.data.objects.new(nom + '_courbe', cu)
    collection().objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.name = nom
    me.set_sharp_from_angle(angle=ANGLE_ARETE)
    me.materials.clear()
    me.materials.append(mat)
    obj = bpy.data.objects.new(nom, me)
    collection().objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def texte(nom, contenu, taille, centre, mat, parent=None, rotation=None, normale='-Y'):
    """Inscription peinte (numéro de groupe, plaque), plate, lisible depuis la face `normale` (l'avant par défaut)."""
    cu = bpy.data.curves.new(nom, 'FONT')
    cu.body = contenu
    cu.size = taille
    cu.resolution_u = 3
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    tmp = bpy.data.objects.new(nom + '_texte', cu)
    collection().objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.name = nom
    me.materials.clear()
    me.materials.append(mat)
    obj = bpy.data.objects.new(nom, me)
    collection().objects.link(obj)
    obj.location = centre
    obj.rotation_euler = rotation if rotation is not None else ORIENTATIONS[normale]
    if parent:
        obj.parent = parent
    return obj


def attacher(enfant, parent):
    """Rattache sans déplacer : la pièce suit ensuite le nœud parent (un rouleau qui tourne l'entraîne)."""
    bpy.context.view_layer.update()
    monde = enfant.matrix_world.copy()
    enfant.parent = parent
    enfant.matrix_parent_inverse = parent.matrix_world.inverted()
    enfant.matrix_world = monde
    return enfant


def _repere_face(normale):
    """Rotation qui pose Z local sur `normale` en gardant Y local vers le haut : un dessin collé sur la face se lit droit."""
    z = Vector(normale)
    y = Vector((0, 0, 1))
    return tuple(Matrix((y.cross(z), y, z)).transposed().to_euler())


ORIENTATIONS = {
    '+Z': (0, 0, 0),
    '-Y': _repere_face((0, -1, 0)),
    '+Y': _repere_face((0, 1, 0)),
    '-X': _repere_face((-1, 0, 0)),
    '+X': _repere_face((1, 0, 0)),
    '-Z': (math.pi, 0, 0),
}


def arret_urgence(nom, position, parent, P, normale='-Y'):
    """Coup-de-poing d'arrêt d'urgence sur sa collerette jaune, posé sur une face de normale `normale`."""
    pivot = vide(nom, position, parent)
    pivot.rotation_euler = ORIENTATIONS[normale]
    cylindre(f'{nom}_collerette', 0.032, 0.004, (0, 0, 0.002), P['jaune_securite'], 'Z', pivot, segments=20)
    cylindre(f'{nom}_corps', 0.013, 0.016, (0, 0, 0.012), P['rouge_arret'], 'Z', pivot, segments=12, chanfrein=0)
    cylindre(f'{nom}_champignon', 0.021, 0.012, (0, 0, 0.026), P['rouge_arret'], 'Z', pivot, segments=20, rayon2=0.017)
    return pivot


def bouton(nom, position, mat, parent, P, normale='-Y'):
    """Bouton-poussoir encastré dans sa bague chromée."""
    pivot = vide(nom, position, parent)
    pivot.rotation_euler = ORIENTATIONS[normale]
    cylindre(f'{nom}_bague', 0.013, 0.005, (0, 0, 0.0025), P['chrome'], 'Z', pivot, segments=16, chanfrein=0)
    cylindre(f'{nom}_tete', 0.010, 0.007, (0, 0, 0.006), mat, 'Z', pivot, segments=16)
    return pivot


def pictogramme_danger(nom, position, parent, P, taille=0.04, normale='-Y'):
    """Autocollant de danger : triangle jaune bordé de noir et point d'exclamation, collé sur une face."""
    pivot = vide(nom, position, parent)
    pivot.rotation_euler = ORIENTATIONS[normale]

    def triangle(n, cote, z, mat):
        bm = bmesh.new()
        h = cote * math.sqrt(3) / 2
        bm.faces.new([bm.verts.new((-cote / 2, -h / 3, z)), bm.verts.new((cote / 2, -h / 3, z)),
                      bm.verts.new((0, 2 * h / 3, z))])
        return _objet(n, bm, mat, pivot, (0, 0, 0), (0, 0, 0), None, 0)

    triangle(f'{nom}_bord', taille, 0.0004, P['plastique_noir'])
    triangle(f'{nom}_fond', taille * 0.78, 0.0008, P['jaune_securite'])
    boite(f'{nom}_trait', (taille * 0.08, taille * 0.26, 0.0004), (0, taille * 0.06, 0.0012), P['plastique_noir'], pivot,
          chanfrein=0)
    boite(f'{nom}_point', (taille * 0.08, taille * 0.08, 0.0004), (0, -taille * 0.13, 0.0012), P['plastique_noir'],
          pivot, chanfrein=0)
    return pivot


def vis(nom, position, parent, mat, normale='-Y', rayon=0.006):
    """Tête de vis à six pans creux, dépassant de la face de normale `normale`."""
    o = cylindre(nom, rayon, rayon * 0.9, position, mat, 'Z', parent, segments=10, chanfrein=0)
    o.rotation_euler = ORIENTATIONS[normale]
    o.location = Vector(position) + Vector(_normale_vecteur(normale)) * rayon * 0.45
    return o


def _normale_vecteur(normale):
    signe = 1 if normale[0] == '+' else -1
    return {'X': (signe, 0, 0), 'Y': (0, signe, 0), 'Z': (0, 0, signe)}[normale[1]]


# --- Capteurs et cylindres du catalogue ------------------------------------------------------------------------
#
# Chaque mesure de data/catalog.json (types > organes > mesures) a son capteur sur la machine, et chaque cylindre nommé
# (organes > cylindres, utilisés par l'analyse des défauts répétitifs) existe au diamètre du catalogue.
# build/contratKit.test.ts le vérifie.

GENRES_CAPTEUR = (
    'ultrasons', 'cellule', 'fourche', 'pyrometre', 'sonde', 'pression', 'codeur', 'charge', 'camera', 'automate',
    'thermostat', 'lecteur',
)


def capteur(nom, genre, position, parent, P, organe, mesures, normale='-Y'):
    """
    Capteur d'une ou plusieurs mesures du catalogue (`mesures` : clés `cle`), rattaché à son organe. `position` est la
    face sensible, `normale` la direction visée (vers la bande, la bobine, le liquide) ; le corps part à l'opposé.
    Le nœud porte role='capteur', organe, mesure (clés séparées par des virgules) et genre en extras glTF.
    """
    assert genre in GENRES_CAPTEUR, genre
    cles = mesures if isinstance(mesures, str) else ','.join(mesures)
    pivot = vide(nom, position, parent, {'role': 'capteur', 'organe': int(organe), 'mesure': cles, 'genre': genre})
    pivot.rotation_euler = ORIENTATIONS[normale]
    corps, noir, inox, led = P['tole_sombre'], P['plastique_noir'], P['inox'], P['vert_bouton']
    if genre == 'ultrasons':  # tube fileté M30, deux écrous, connecteur au dos
        cylindre(f'{nom}_corps', 0.015, 0.09, (0, 0, -0.045), inox, 'Z', pivot, 16, 0)
        for z in (-0.02, -0.06):
            cylindre(f'{nom}_ecrou{z}', 0.022, 0.006, (0, 0, z), inox, 'Z', pivot, 6, 0)
        cylindre(f'{nom}_face', 0.0135, 0.002, (0, 0, -0.001), noir, 'Z', pivot, 16, 0)
        cylindre(f'{nom}_connecteur', 0.008, 0.02, (0, 0, -0.1), noir, 'Z', pivot, 8, 0)
    elif genre == 'cellule':  # détecteur photoélectrique : boîtier, lentille, témoin
        boite(f'{nom}_boitier', (0.02, 0.034, 0.045), (0, 0, -0.0225), noir, pivot, chanfrein=0.002)
        cylindre(f'{nom}_lentille', 0.007, 0.002, (0, 0.006, 0.0005), P['verre'], 'Z', pivot, 12, 0)
        boite(f'{nom}_temoin', (0.004, 0.004, 0.003), (0.006, -0.014, -0.006), led, pivot, chanfrein=0)
    elif genre == 'fourche':  # fourche à étiquettes ou bord de bande : la bande passe dans la gorge
        boite(f'{nom}_dos', (0.03, 0.07, 0.02), (0, 0, -0.06), noir, pivot, chanfrein=0.002)
        for s in (-1, 1):
            boite(f'{nom}_bec{s}', (0.03, 0.012, 0.05), (0, s * 0.029, -0.025), noir, pivot, chanfrein=0.002)
        boite(f'{nom}_temoin', (0.004, 0.004, 0.003), (0.008, 0, -0.07), led, pivot, chanfrein=0)
    elif genre == 'pyrometre':  # thermomètre infrarouge visant la bande
        cylindre(f'{nom}_corps', 0.011, 0.08, (0, 0, -0.04), inox, 'Z', pivot, 16, 0)
        cylindre(f'{nom}_lentille', 0.007, 0.002, (0, 0, -0.001), P['verre'], 'Z', pivot, 12, 0)
        cylindre(f'{nom}_presse_etoupe', 0.007, 0.02, (0, 0, -0.09), noir, 'Z', pivot, 8, 0)
    elif genre == 'sonde':  # sonde plongeante (température, viscosité, niveau, pH) : tête au-dessus, canne vers la cible
        cylindre(f'{nom}_tete', 0.016, 0.035, (0, 0, -0.0175), P['graphite'], 'Z', pivot, 16, 0)
        cylindre(f'{nom}_canne', 0.004, 0.16, (0, 0, 0.08), inox, 'Z', pivot, 8, 0)
        cylindre(f'{nom}_presse_etoupe', 0.006, 0.015, (0, 0, -0.042), noir, 'Z', pivot, 8, 0)
    elif genre == 'pression':  # transmetteur de pression : raccord, corps, connecteur
        cylindre(f'{nom}_raccord', 0.009, 0.012, (0, 0, -0.006), inox, 'Z', pivot, 6, 0)
        cylindre(f'{nom}_corps', 0.013, 0.06, (0, 0, -0.042), inox, 'Z', pivot, 16, 0)
        cylindre(f'{nom}_connecteur', 0.008, 0.018, (0, 0, -0.081), noir, 'Z', pivot, 8, 0)
    elif genre == 'codeur':  # codeur incrémental en bout d'arbre, presse-étoupe sur le côté
        cylindre(f'{nom}_corps', 0.029, 0.04, (0, 0, -0.02), inox, 'Z', pivot, 20, 0.002)
        cylindre(f'{nom}_bride', 0.033, 0.005, (0, 0, -0.0025), corps, 'Z', pivot, 20, 0)
        cylindre(f'{nom}_presse_etoupe', 0.006, 0.02, (0.03, 0, -0.025), noir, 'X', pivot, 8, 0)
    elif genre == 'charge':  # cellule de charge sous un palier de rouleau
        boite(f'{nom}_corps', (0.07, 0.03, 0.035), (0, 0, -0.0175), inox, pivot, chanfrein=0.002)
        boite(f'{nom}_jauge', (0.028, 0.032, 0.012), (0, 0, -0.0175), noir, pivot, chanfrein=0)
        cylindre(f'{nom}_cable', 0.003, 0.03, (0.04, 0, -0.0175), noir, 'X', pivot, 6, 0)
    elif genre == 'camera':  # caméra industrielle : boîtier, objectif, éclairage annulaire
        boite(f'{nom}_boitier', (0.045, 0.045, 0.07), (0, 0, -0.06), noir, pivot, chanfrein=0.003)
        cylindre(f'{nom}_objectif', 0.016, 0.03, (0, 0, -0.015), P['graphite'], 'Z', pivot, 16, 0)
        anneau(f'{nom}_eclairage', 0.03, 0.019, 0.006, (0, 0, -0.003), P['papier'], 'Z', pivot, 20, 0)
    elif genre == 'automate':  # automate sur rail : alimentation, unité centrale, cartes d'entrées-sorties à témoins
        boite(f'{nom}_rail', (0.30, 0.012, 0.035), (0, 0, -0.006), inox, pivot, chanfrein=0)
        for i, largeur in enumerate((0.05, 0.06, 0.03, 0.03, 0.03, 0.03, 0.03)):
            x = -0.15 + sum((0.05, 0.06, 0.03, 0.03, 0.03, 0.03, 0.03)[:i]) + largeur / 2
            boite(f'{nom}_module{i}', (largeur - 0.002, 0.09, 0.07), (x, 0, -0.047), P['graphite'], pivot, chanfrein=0.002)
            boite(f'{nom}_temoins{i}', (largeur - 0.012, 0.01, 0.002), (x, 0.03, -0.0015), led, pivot, chanfrein=0)
    elif genre == 'thermostat':  # sonde d'ambiance d'armoire, boîtier plat
        boite(f'{nom}_boitier', (0.05, 0.07, 0.025), (0, 0, -0.0125), P['papier'], pivot, chanfrein=0.003)
        boite(f'{nom}_afficheur', (0.03, 0.015, 0.002), (0, 0.015, -0.001), noir, pivot, chanfrein=0)
    elif genre == 'lecteur':  # lecteur ou antenne RFID plate
        boite(f'{nom}_boitier', (0.12, 0.12, 0.03), (0, 0, -0.015), P['papier'], pivot, chanfrein=0.004)
        boite(f'{nom}_temoin', (0.006, 0.006, 0.002), (0.045, -0.045, -0.001), led, pivot, chanfrein=0)
    return pivot


def cylindre_catalogue(obj, nom: str, diametre_mm: float):
    """Relie un rouleau au cylindre du catalogue qu'il représente ; son diamètre doit être celui du catalogue."""
    obj['cylindre'] = nom
    obj['diametreMm'] = round(diametre_mm, 1)
    return obj


def diametre_catalogue(machine_id: str, nom: str) -> float:
    """Diamètre (mm) d'un cylindre du catalogue : `diametre`, ou `developpement` / π pour un cylindre d'impression."""
    import json

    with open(os.path.join(RACINE_DEPOT, 'data', 'catalog.json'), encoding='utf-8') as f:
        types = json.load(f)['types']
    for organe in types[machine_id]['organes'].values():
        for cyl in organe.get('cylindres', []):
            if cyl['nom'] == nom:
                return cyl.get('diametre') or cyl['developpement'] / math.pi
    raise KeyError(nom)


def percer(obj, outil):
    """Retire le volume de `outil` à `obj` (booléen appliqué), puis supprime l'outil."""
    mod = obj.modifiers.new('percage', 'BOOLEAN')
    mod.object = outil
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    # Le perçage passe avant le chanfrein : il doit être le premier modificateur appliqué.
    obj.modifiers.move(obj.modifiers.find(mod.name), 0)
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(outil, do_unlink=True)
    return obj


# --- Rôles du contrat ------------------------------------------------------------------------------------------

VITESSE_BANDE = 0.5  # m/s, data/kit/machines.json > animation
PAS_ETIQUETTE = 0.11  # m

_compteurs: dict[str, int] = {}


def suivant(prefixe: str) -> str:
    _compteurs[prefixe] = _compteurs.get(prefixe, 0) + 1
    return f'{prefixe}_{_compteurs[prefixe]}'


def rotatif(obj, rayon: float, sous_la_bande: bool, sens: int = 1):
    """
    Marque un rouleau. La surface au contact de la bande avance avec elle (VITESSE_BANDE, sens +X par défaut) :
    un rouleau sous la bande tourne dans un sens, un rouleau au-dessus dans l'autre. Le signe suit la convention des
    modèles d'origine (axe Y local glTF vers l'avant).
    """
    w = VITESSE_BANDE / rayon * sens
    obj['role'] = 'rotatif'
    obj['axe'] = 'Y local'
    obj['vitesseRadS'] = round(-w if sous_la_bande else w, 3)
    return obj


def bande(nom, debut, fin, largeur, mat, parent=None, y=0.0, role=True):
    """
    Tronçon droit de bande entre deux points (x, z). La texture avance en U (une unité par étiquette) : U croît dans
    le sens de défilement, de `debut` vers `fin`. `role` faux : bande fixe (film de dorure), hors contrat.
    """
    d = Vector((fin[0] - debut[0], 0, fin[1] - debut[1]))
    longueur = d.length
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    h = largeur / 2
    coins = [(0, -h), (longueur, -h), (longueur, h), (0, h)]
    vs = [bm.verts.new((u, v, 0)) for u, v in coins]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, coins):
        loop[uv].uv = (u / PAS_ETIQUETTE, (v + h) / largeur)
    # Face visible des deux côtés : la bande est vue de dessus et de dessous.
    vs2 = [bm.verts.new((u, v, -0.0004)) for u, v in coins]
    f2 = bm.faces.new(list(reversed(vs2)))
    for loop, (u, v) in zip(f2.loops, list(reversed(coins))):
        loop[uv].uv = (u / PAS_ETIQUETTE, (v + h) / largeur)
    angle = math.atan2(d.z, d.x)
    obj = _objet(nom, bm, mat, parent, (debut[0], y, debut[1]), (0, -angle, 0), None, 0)
    if not role:
        return obj
    obj['role'] = 'bande'
    obj['vitesseMS'] = VITESSE_BANDE
    obj['pasEtiquetteM'] = PAS_ETIQUETTE
    obj['defilement'] = 'decaler la texture en U de vitesse/pas par seconde'
    return obj


def points_diagnostic(points: list[tuple[int, str, tuple]], parent):
    """Un vide diag_N_nom par point, avec numero et nom ; le détail vit dans machines.json."""
    groupe = vide('points_diagnostic', parent=parent)
    for numero, nom, position in points:
        vide(f'diag_{numero}_{slug(nom)}', position, groupe, {'numero': numero, 'nom': nom})
    return groupe


def reperes(liste: list[tuple[str, tuple]], parent):
    groupe = vide('reperes', parent=parent)
    for texte, position in liste:
        vide(f'repere_{slug(texte)}', position, groupe, {'texte': texte})
    return groupe


def palette() -> dict[str, bpy.types.Material]:
    """
    Matières communes aux machines. Valeurs choisies pour tomber dans la bonne classe de matieres.ts : l'anthracite
    reste sous 0,05 de luminance (classe « sombre »), le chrome au-dessus de 0,85 de métal et sous 0,12 de rugosité.
    """
    return {
        'tole': matiere('tole_gris_clair', '#d3d6d2', 0.0, 0.42),  # RAL 7035
        'tole_sombre': matiere('tole_anthracite', '#383d42', 0.0, 0.48),  # RAL 7016
        'galva': matiere('tole_galvanisee', '#bcc1c5', 0.25, 0.45),
        'graphite': matiere('graphite', '#5b6066', 0.0, 0.45),
        'acier': matiere('acier_usine', '#b7bbbf', 1.0, 0.3),
        'chrome': matiere('chrome', '#e8eaec', 1.0, 0.07),
        'inox': matiere('inox_brosse', '#c6c9cb', 0.9, 0.36),
        'caoutchouc': matiere('caoutchouc', '#1d1e1f', 0.0, 0.78),
        'plastique_noir': matiere('plastique_noir', '#25272a', 0.0, 0.42),
        'rouge_arret': matiere('rouge_arret', '#c4161c', 0.0, 0.32),
        'jaune_securite': matiere('jaune_securite', '#f2b200', 0.0, 0.4),
        'vert_bouton': matiere('vert_bouton', '#1f8a3c', 0.0, 0.3),
        'verre': matiere('polycarbonate', '#dfe9ee', 0.0, 0.05, alpha=0.28),
        'papier': matiere('papier', '#f3f1ea', 0.0, 0.85),
        'sol': matiere('sol_epoxy', '#c3c6c7', 0.0, 0.82),
        'marquage': matiere('marquage_jaune', '#f2b200', 0.0, 0.5),
    }


def kit_machine(machine_id: str) -> dict:
    """Fiche de la machine dans data/kit/machines.json : points de diagnostic et repères y sont déjà placés."""
    import json

    with open(os.path.join(RACINE_DEPOT, 'data', 'kit', 'machines.json'), encoding='utf-8') as f:
        kit = json.load(f)
    return next(m for m in kit['machines'] if m['id'] == machine_id)


def depuis_gltf(p) -> tuple[float, float, float]:
    """Position du JSON (repère glTF, Y vers le haut) dans le repère Blender."""
    return (p[0], -p[2], p[1])


# --- Sortie ----------------------------------------------------------------------------------------------------


def _descendants(o):
    for c in o.children:
        yield c
        yield from _descendants(c)


def _sous_un_role(o) -> bool:
    p = o
    while p:
        if p.get('role'):
            return True
        p = p.parent
    return False


def fusionner(groupe):
    """
    Réunit les pièces fixes d'un groupe qui partagent une matière (vis, carters, flexibles) : un appel de dessin au lieu
    de dizaines dans la vue détaillée. Les nœuds du contrat (rouleaux, bandes, voyants, écrans, socle) restent à part,
    et la fusion reste locale au groupe : la mise en évidence d'un organe garde sa précision.
    """
    par_matiere: dict[str, list] = {}
    for o in _descendants(groupe):
        if o.type != 'MESH' or _sous_un_role(o) or len(o.data.materials) != 1 or o.children:
            continue
        par_matiere.setdefault(o.data.materials[0].name, []).append(o)
    for nom_mat, objets in par_matiere.items():
        if len(objets) < 2:
            continue
        with bpy.context.temp_override(
            active_object=objets[0], object=objets[0], selected_objects=objets, selected_editable_objects=objets
        ):
            bpy.ops.object.convert(target='MESH')
            bpy.ops.object.join()
        objets[0].name = f'{groupe.name}_{nom_mat}'
        objets[0].data.name = objets[0].name


def fusionner_capteurs():
    """
    Réunit par matière les pièces de chaque capteur sous son nœud : le rôle, l'organe et la mesure restent sur le
    nœud du capteur, mais une quinzaine de pièces (l'automate, ses modules) deviennent deux ou trois maillages.
    """
    for pivot in [o for o in bpy.data.objects if o.get('role') == 'capteur']:
        par_matiere: dict[str, list] = {}
        for o in pivot.children:
            if o.type == 'MESH' and len(o.data.materials) == 1 and not o.children:
                par_matiere.setdefault(o.data.materials[0].name, []).append(o)
        for nom_mat, objets in par_matiere.items():
            if len(objets) < 2:
                continue
            with bpy.context.temp_override(
                active_object=objets[0], object=objets[0], selected_objects=objets, selected_editable_objects=objets
            ):
                bpy.ops.object.convert(target='MESH')
                bpy.ops.object.join()
            objets[0].name = f'{pivot.name}_{nom_mat}'
            objets[0].data.name = objets[0].name


def ombre_au_sol(nom, x0, x1, y0, y1, z, largeur_px=1024, distance=0.9, force=0.9):
    """
    Ombre de contact cuite (occlusion ambiante, Cycles) sur un plan posé au sol : l'application dessine le plan
    d'usine sans ombres portées, la machine y reste posée grâce à cette image. Noir, l'ombre est dans l'alpha.
    """
    import numpy as np

    hauteur_px = max(16, int(largeur_px * (y1 - y0) / (x1 - x0)) // 8 * 8)
    img = bpy.data.images.new(f'{nom}_ombre', largeur_px, hauteur_px, alpha=True)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    coins = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    f = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in coins])
    for loop, (x, y) in zip(f.loops, coins):
        loop[uv].uv = ((x - x0) / (x1 - x0), (y - y0) / (y1 - y0))
    mat = bpy.data.materials.new(f'{nom}_ombre')
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    plan = _objet(nom, bm, mat, None, (0, 0, z), (0, 0, 0), None, 0)
    scene = bpy.context.scene
    moteur = scene.render.engine
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 96
    scene.cycles.device = 'CPU'
    if not scene.world:
        scene.world = bpy.data.worlds.new('cuisson')
    scene.world.light_settings.distance = distance
    with bpy.context.temp_override(active_object=plan, object=plan, selected_objects=[plan], selected_editable_objects=[plan]):
        bpy.ops.object.bake(type='AO', margin=4)
    scene.render.engine = moteur
    px = np.array(img.pixels[:], dtype=np.float32).reshape(hauteur_px, largeur_px, 4)
    ao = px[:, :, 0]
    alpha = np.clip((1.0 - ao) * 1.35, 0.0, 1.0) * force
    rgba = np.zeros_like(px)
    rgba[:, :, 3] = alpha
    img.pixels[:] = rgba.ravel()
    img.file_format = 'PNG'
    img.pack()
    # Matière finale : noir mat, transparence tirée de l'image.
    nt.nodes.remove(tex)
    b = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 1.0
    mat.surface_render_method = 'BLENDED'
    return plan


def _texturee(me) -> bool:
    return any(
        m and m.node_tree and any(n.type == 'TEX_IMAGE' and n.image for n in m.node_tree.nodes) for m in me.materials
    )


def retirer_uv_inutiles():
    """Les coordonnées de texture ne servent qu'aux matières à image : ailleurs, 8 octets par sommet pour rien."""
    for o in bpy.data.objects:
        if o.type == 'MESH' and not _texturee(o.data):
            while o.data.uv_layers:
                o.data.uv_layers.remove(o.data.uv_layers[0])


def enregistrer(args, groupes_a_fusionner=()):
    """Projet .blend tel que construit (pièces séparées, chanfreins modifiables), puis glb allégé."""
    if args.sans_export:
        return
    retirer_uv_inutiles()
    for chemin in (args.blend, args.glb):
        os.makedirs(os.path.dirname(os.path.abspath(chemin)), exist_ok=True)
    # Images embarquées : le projet s'ouvre et s'assemble dans kit.blend sans chemin vers textures/.
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=args.blend, compress=True)
    for g in groupes_a_fusionner:
        fusionner(g)
    fusionner_capteurs()
    bpy.ops.export_scene.gltf(
        filepath=args.glb,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_tangents=False,
        export_vertex_color='NONE',
        export_attributes=False,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
        export_image_format='AUTO',
    )


# --- Images de contrôle ----------------------------------------------------------------------------------------


def _boite_englobante(objets):
    pts = []
    for o in objets:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def _camera(nom, position, cible, focale=35.0, ortho=None):
    cam = bpy.data.cameras.new(nom)
    if ortho:
        cam.type = 'ORTHO'
        cam.ortho_scale = ortho
    else:
        cam.lens = focale
    cam.clip_start = 0.05
    cam.clip_end = 200
    o = bpy.data.objects.new(nom, cam)
    collection('studio').objects.link(o)
    o.location = position
    o.rotation_euler = (Vector(cible) - Vector(position)).to_track_quat('-Z', 'Y').to_euler()
    return o


def studio(fond='#2b2f33'):
    """Lumière d'atelier : ciel d'intérieur fourni avec Blender, une lampe de plafond, un sol neutre."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 48
    scene.eevee.use_shadows = True
    scene.view_settings.view_transform = 'AgX'
    monde = bpy.data.worlds.new('atelier')
    scene.world = monde
    nt = monde.node_tree
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    chemin = os.path.join(bpy.utils.resource_path('LOCAL'), 'datafiles', 'studiolights', 'world', 'interior.exr')
    env.image = bpy.data.images.load(chemin, check_existing=True)
    fondn = nt.nodes['Background']
    fondn.inputs['Strength'].default_value = 0.9
    nt.links.new(env.outputs['Color'], fondn.inputs['Color'])
    lampe = bpy.data.lights.new('plafond', 'AREA')
    lampe.energy = 1800
    lampe.size = 6
    lo = bpy.data.objects.new('plafond', lampe)
    collection('studio').objects.link(lo)
    lo.location = (0, -2.5, 6)
    lo.rotation_euler = (math.radians(20), 0, 0)
    sol = bpy.data.meshes.new('sol')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    bm.to_mesh(sol)
    bm.free()
    so = bpy.data.objects.new('sol_studio', sol)
    collection('studio').objects.link(so)
    so.location = (0, 0, -0.072)
    sol.materials.append(matiere('sol_studio', fond, 0.0, 0.8))


def vues_par_defaut(objets):
    mn, mx = _boite_englobante(objets)
    c = (mn + mx) / 2
    L = max(mx.x - mn.x, mx.y - mn.y)
    h = mx.z - mn.z
    cible = (c.x, c.y, h * 0.42)
    return {
        'trois_quarts': dict(position=(c.x - 0.55 * L, c.y - 1.05 * L, h * 0.55 + 0.35 * L), cible=cible, focale=40),
        'face': dict(position=(c.x, mn.y - 20, h / 2), cible=(c.x, 0, h / 2), ortho=L * 1.06),
        'arriere': dict(position=(c.x + 0.5 * L, c.y + 1.05 * L, h * 0.55 + 0.3 * L), cible=cible, focale=40),
        'dessus': dict(position=(c.x, c.y, 30), cible=(c.x, c.y + 0.0001, 0), ortho=L * 1.06),
    }


def rendre(dossier: str, prefixe: str, vues: dict, choix: str = '', taille=(1600, 900)):
    """Une image par vue, dans `dossier`. `choix` : noms séparés par des virgules (toutes si vide)."""
    os.makedirs(dossier, exist_ok=True)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = taille
    scene.render.image_settings.file_format = 'PNG'
    voulues = [v for v in choix.split(',') if v] or list(vues)
    for nom in voulues:
        cam = _camera(f'cam_{nom}', **vues[nom])
        scene.camera = cam
        scene.render.filepath = os.path.join(dossier, f'{prefixe}_{nom}.png')
        bpy.ops.render.render(write_still=True)
        print('IMAGE', scene.render.filepath)
