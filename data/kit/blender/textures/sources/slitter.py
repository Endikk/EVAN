"""
Textures de la refendeuse : bande mère (cinq étiquettes de front, une par piste) et piste refendue (une étiquette).
Même dessin que les bandes du kit (support jaune, étiquette blanche, bandeau couleur, code-barres), au pas de 0,11 m.

  blender --background --factory-startup --python textures_slitter.py -- <dossier textures>
"""
import os
import sys

import bpy
import numpy as np

PAS = 0.11  # m, une répétition de texture en U
LONG_ETIQ = 0.095  # m, le long de la bande
LARGE_ETIQ = 0.15  # m, en travers
CENTRES_PISTES = (-0.344, -0.172, 0.0, 0.172, 0.344)
SUR = 4  # suréchantillonnage, pour des bords lissés

SUPPORT = (0xE9, 0xD5, 0x97)
OMBRE = (0xC5, 0xB1, 0x76)
BLANC = (0xFF, 0xFF, 0xFF)
BANDEAU = (0x0A, 0x8F, 0xC2)
TEXTE = (0x4A, 0x52, 0x60)
CODE = (0x16, 0x19, 0x1D)

rng = np.random.default_rng(7)
MODULE = PAS / 128
LARGEURS = rng.integers(1, 4, 60)  # largeur des barres et des blancs, en modules
BORDS = np.concatenate([[0], np.cumsum(LARGEURS)]) * MODULE
CODE_2D = rng.random((9, 9)) > 0.5
CODE_2D[:3, :3] = CODE_2D[:3, -3:] = CODE_2D[-3:, :3] = True  # repères d'angle


def etiquette(a, b):
    """Couleur et masque d'une étiquette en (a le long, b en travers), mètres depuis son coin."""
    r = 0.004
    dans = (a >= 0) & (a <= LONG_ETIQ) & (b >= 0) & (b <= LARGE_ETIQ)
    # coins arrondis
    ca = np.clip(a, r, LONG_ETIQ - r)
    cb = np.clip(b, r, LARGE_ETIQ - r)
    dans &= (a - ca) ** 2 + (b - cb) ** 2 <= r * r
    rgb = np.empty(a.shape + (3,))
    rgb[:] = BLANC
    bandeau = b <= 0.022
    rgb[bandeau] = BANDEAU
    titre = (b >= 0.112) & (b <= 0.124) & (a >= 0.010) & (a <= 0.062)
    ligne = (b >= 0.098) & (b <= 0.104) & (a >= 0.010) & (a <= 0.046)
    rgb[titre | ligne] = TEXTE
    # code-barres : barres alternées de largeur tirée au sort
    zone = (b >= 0.036) & (b <= 0.084) & (a >= 0.010)
    k = np.searchsorted(BORDS, a - 0.010, side='right') - 1
    barre = zone & (k >= 0) & (k < len(LARGEURS)) & (k % 2 == 0) & (a - 0.010 <= 0.050)
    rgb[barre] = CODE
    # code 2D
    a0, b0, cote = 0.068, 0.060, 0.020
    c2 = (a >= a0) & (a < a0 + cote) & (b >= b0) & (b < b0 + cote)
    ia = np.clip(((a - a0) / cote * 9).astype(int), 0, 8)
    ib = np.clip(((b - b0) / cote * 9).astype(int), 0, 8)
    rgb[c2 & CODE_2D[ib, ia]] = CODE
    return rgb, dans


def bande(largeur, centres, hauteur_px, largeur_px=128):
    """Image (lignes = V en travers, de -largeur/2 en bas à +largeur/2 en haut ; colonnes = U le long)."""
    H, W = hauteur_px * SUR, largeur_px * SUR
    u = (np.arange(W) + 0.5) / W * PAS
    v = (np.arange(H) + 0.5) / H * largeur - largeur / 2
    U, V = np.meshgrid(u, v)
    img = np.empty((H, W, 3))
    img[:] = SUPPORT
    a = U - (PAS - LONG_ETIQ) / 2
    for yc in centres:
        b = V - (yc - LARGE_ETIQ / 2)
        # ombre portée d'un millimètre sous l'étiquette, vers l'aval et le bas
        _, ombre = etiquette(a - 0.0009, b + 0.0009)
        img[ombre] = OMBRE
        rgb, dans = etiquette(a, b)
        img[dans] = rgb[dans]
    img = img.reshape(hauteur_px, SUR, largeur_px, SUR, 3).mean(axis=(1, 3)) / 255
    return img


def enregistrer(img, chemin):
    h, w, _ = img.shape
    im = bpy.data.images.new(os.path.basename(chemin), w, h, alpha=False)
    rgba = np.ones((h, w, 4))
    rgba[:, :, :3] = img
    im.pixels[:] = rgba.ravel()
    im.filepath_raw = chemin
    im.file_format = 'PNG'
    im.save()
    print('TEXTURE', chemin, w, h)


dossier = sys.argv[sys.argv.index('--') + 1]
enregistrer(bande(0.88, CENTRES_PISTES, 512), os.path.join(dossier, 'slitter_bande_mere.png'))
enregistrer(bande(0.16, (0.0,), 128), os.path.join(dossier, 'slitter_bande_piste.png'))
