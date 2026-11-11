"""Prépare la texture des planches de la feuilleteuse à partir des images de l'ancien modèle (voir README.md)."""
import os
import sys
import bpy
import numpy as np

src, dst = sys.argv[sys.argv.index('--') + 1:][:2]


def charger(nom):
    img = bpy.data.images.load(os.path.join(src, nom))
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)


def ecrire(px, nom):
    h, w, _ = px.shape
    img = bpy.data.images.new(nom, w, h, alpha=True)
    img.pixels[:] = px.ravel()
    img.filepath_raw = os.path.join(dst, nom)
    img.file_format = 'PNG'
    img.save()
    print('ECRIT', img.filepath_raw, w, h)


# L'écran (sheeter_ecran.png) est dessiné par ecrans.cjs, avec ceux des autres machines.

# Planche A4 (297 x 210 px, 1 px = 1 mm) suivie d'un vide transparent de 33 px : une période de 0,33 m sur le convoyeur.
planche = charger('Image_4.png')
h, w, _ = planche.shape
periode = np.zeros((h, 330, 4), dtype=np.float32)
periode[:, :w] = planche
periode[:, :w, 3] = 1.0
ecrire(periode, 'sheeter_planches.png')
