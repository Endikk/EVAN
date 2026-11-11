"""
Projet Blender commun : réunit les machines du kit dans kit.blend, une scène par machine, dans l'ordre du catalogue.

  blender --background --factory-startup --python-exit-code 1 --python data/kit/blender/kit.py

Chaque scène vient du projet que le script de la machine a laissé dans .construction/ (construire.sh). Une machine
absente de .construction/ (clone neuf, reconstruction partielle) est reprise de l'ancien kit.blend ; si elle n'y est
pas non plus, le script échoue plutôt que d'écrire un kit incomplet.
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun  # noqa: E402

ORDRE = ['flexo', 'offset', 'digital', 'ctp', 'slitter', 'paravent', 'sheeter', 'rfid']
KIT = os.path.join(commun.ICI, 'kit.blend')


def ajouter_scene(chemin: str, machine: str) -> bool:
    with bpy.data.libraries.load(chemin, link=False) as (source, cible):
        if machine not in source.scenes:
            return False
        cible.scenes = [machine]
    cible.scenes[0].name = machine
    return True


bpy.ops.wm.read_factory_settings(use_empty=True)
vide = bpy.context.scene
vide.name = '_vide'
manquantes = []
for machine in ORDRE:
    chemin = os.path.join(commun.DOSSIER_CONSTRUCTION, f'{machine}.blend')
    if os.path.exists(chemin) and ajouter_scene(chemin, machine):
        print('SCENE', machine, len(bpy.data.scenes[machine].objects), 'objets')
    elif os.path.exists(KIT) and ajouter_scene(KIT, machine):
        print('REPRISE', machine, "de l'ancien kit.blend")
    else:
        print('ABSENTE', machine)
        manquantes.append(machine)
if manquantes:
    raise SystemExit(f'kit.blend non écrit : machines absentes {manquantes}')

premiere = bpy.data.scenes[ORDRE[0]]
for fenetre in bpy.context.window_manager.windows:
    fenetre.scene = premiere
bpy.data.scenes.remove(vide)
bpy.ops.wm.save_as_mainfile(filepath=KIT, compress=True)
print('KIT', KIT, [s.name for s in bpy.data.scenes])
