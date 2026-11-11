# Sources des textures

Les images de `textures/` que les machines n'ont pas reprises telles quelles sont fabriquées par ces scripts. Ils
écrivent directement dans `data/kit/blender/textures/`. Depuis la racine du dépôt :

```
# Écrans de toutes les machines : pupitres d'atelier et postes informatiques, valeurs nominales du catalogue.
node data/kit/blender/textures/sources/ecrans.cjs data/kit/blender/textures

# Refendeuse : bandes à cinq pistes et piste refendue, dessinées de zéro.
blender --background --factory-startup --python data/kit/blender/textures/sources/slitter.py -- data/kit/blender/textures

# CTP : écrans, afficheur du bain, plaque gravée, dessinés en SVG et rendus par sharp.
node data/kit/blender/textures/sources/ctp.cjs data/kit/blender/textures
```

La feuilleteuse et le paravent partent des images de leur ancien modèle (planche, bande). Ces anciens modèles
sont dans l'historique Git : les extraire, puis lancer le script avec le dossier des images.

```
git show fc162ed:data/kit/modeles/sheeter.glb > /tmp/sheeter_ancien.glb
blender --background --factory-startup --python data/kit/blender/inspecter_glb.py -- /tmp/sheeter_ancien.glb /tmp/sheeter_images
blender --background --factory-startup --python data/kit/blender/textures/sources/sheeter.py -- /tmp/sheeter_images data/kit/blender/textures

git show fc162ed:data/kit/modeles/paravent.glb > /tmp/paravent_ancien.glb
blender --background --factory-startup --python data/kit/blender/inspecter_glb.py -- /tmp/paravent_ancien.glb /tmp/paravent_images
blender --background --factory-startup --python data/kit/blender/textures/sources/paravent.py -- data/kit/blender/textures /tmp/paravent_images
```

Les autres images de `textures/` (bandes et flancs de bobines de la flexo, écrans des autres machines) sont celles des
anciens modèles, extraites à l'endroit par `inspecter_glb.py`.
