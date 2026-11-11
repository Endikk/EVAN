"""
Inventaire d'un .glb : arbre des nœuds avec rôles, extras, positions et boîtes (repère Blender : Z en haut, -Y à
l'avant), triangles, matières. Avec un dossier en troisième argument, enregistre aussi chaque image, à l'endroit pour
Blender (prête à être plaquée avec des UV ordinaires), et dit qui l'utilise.

  blender --background --factory-startup --python data/kit/blender/inspecter_glb.py -- <fichier.glb> [<dossier images>]
"""
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1 :]
source = argv[0]
dossier_images = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)


def boite(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return ([round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)])


def triangles(o):
    me = o.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


total = 0


def parcourir(o, profondeur):
    global total
    props = {k: v for k, v in o.items() if not k.startswith('_') and isinstance(v, (int, float, str))}
    loc = [round(x, 3) for x in o.matrix_world.translation]
    ligne = f"{'  ' * profondeur}{o.name} [{o.type}] pos={loc}"
    if o.type == 'MESH':
        t = triangles(o)
        total += t
        mats = [s.material.name for s in o.material_slots if s.material]
        ligne += f' tris={t} boite={boite(o)} mat={mats}'
    if props:
        ligne += f' {props}'
    print(ligne)
    for enfant in sorted(o.children, key=lambda c: c.name):
        parcourir(enfant, profondeur + 1)


for racine in sorted((o for o in bpy.data.objects if o.parent is None), key=lambda o: o.name):
    parcourir(racine, 0)

pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects if o.type == 'MESH' for c in o.bound_box]
print('TRIANGLES', total, 'OBJETS', len(bpy.data.objects))
print('BOITE', [round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)])
for m in bpy.data.materials:
    b = m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
    if b:
        coul = [round(x, 3) for x in b.inputs['Base Color'].default_value[:3]]
        print('MATIERE', m.name, 'couleur', coul, 'metal', round(b.inputs['Metallic'].default_value, 2), 'rugosite',
              round(b.inputs['Roughness'].default_value, 2), 'texture' if b.inputs['Base Color'].is_linked else '')

if dossier_images:
    os.makedirs(dossier_images, exist_ok=True)
    usages = {}
    for o in bpy.data.objects:
        for s in getattr(o, 'material_slots', []):
            if s.material and s.material.node_tree:
                for n in s.material.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image:
                        usages.setdefault(n.image.name, set()).add(f'{o.name}:{s.material.name}')
    for img in bpy.data.images:
        if img.size[0] == 0:
            continue
        chemin = os.path.join(dossier_images, f'{img.name}.png')
        # Telle qu'importée, l'image garde le sens du glTF : à l'envers pour des UV Blender ordinaires. On la retourne.
        import numpy as np

        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        img.pixels[:] = px[::-1].ravel()
        img.filepath_raw = chemin
        img.file_format = 'PNG'
        img.save()
        print('IMAGE', chemin, tuple(img.size), sorted(usages.get(img.name, [])))
