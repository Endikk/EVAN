"""
Images de contrôle d'un .glb tel que l'application le reçoit (réimporté, modificateurs déjà appliqués).

  blender --background --factory-startup --python data/kit/blender/apercu_glb.py -- <fichier.glb> <dossier> [vues]
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1 :]
source, dossier = argv[0], argv[1]
choix = argv[2] if len(argv) > 2 else ''

commun.scene_vide('apercu')
bpy.ops.import_scene.gltf(filepath=source)
machine = [o for o in bpy.data.objects]
commun.studio()
prefixe = os.path.splitext(os.path.basename(source))[0]
commun.rendre(dossier, prefixe, commun.vues_par_defaut(machine), choix)
