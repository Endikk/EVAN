"""Fabrique les textures paravent_* de la bande perforée et de la pile (lancé une fois dans Blender, pour son numpy).

L'écran du pupitre (paravent_ecran.png) est refait à part : ce script n'y touche pas.
"""
import os
import sys

import bpy
import numpy as np

TEX = sys.argv[sys.argv.index('--') + 1]


def lire(chemin):
    img = bpy.data.images.load(chemin)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)  # ligne 0 = bas de l'image
    return px


def ecrire(nom, px):
    h, w, _ = px.shape
    img = bpy.data.images.new(nom, w, h, alpha=True)
    img.pixels[:] = np.clip(px, 0, 1).ravel()
    img.filepath_raw = os.path.join(TEX, nom + '.png')
    img.file_format = 'PNG'
    img.save()
    print('ECRIT', img.filepath_raw, w, h)


def rgb(hexa):
    h = hexa.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1.0]


# 1. Bande perforée : la bande imprimée, plus une ligne de perforation (tirets) dans l'intervalle entre deux étiquettes.
px = lire(os.path.join(TEX, 'bande_imprimee.png'))
h, w, _ = px.shape
trait = np.array(rgb('#7d8389'), dtype=np.float32)
for y in range(h):
    if (y // 5) % 2 == 0:
        for x in (0, 1, w - 2, w - 1):
            px[y, x] = trait
ecrire('paravent_bande_perforee', px)

# 2. Tranche d'une pile de paravent : feuillets superposés, un pli toutes les quatre lignes, la séparation des paquets.
H, W = 128, 32
px = np.zeros((H, W, 4), dtype=np.float32)
papier = np.array(rgb('#efece4'), dtype=np.float32)
fin = np.array(rgb('#d6d1c6'), dtype=np.float32)
fort = np.array(rgb('#a9a397'), dtype=np.float32)
rng = np.random.default_rng(7)
for y in range(H):
    ligne = papier.copy()
    if y % 4 == 0:
        ligne = fin.copy()
    if y % 64 == 0:
        ligne = fort.copy()
    ligne[:3] *= 1.0 + rng.uniform(-0.02, 0.02)
    px[y, :] = ligne
ecrire('paravent_tranche', px)
