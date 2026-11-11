# Modèles Blender du kit

Chaque machine du kit est construite par un script Python lancé dans Blender sans fenêtre (`flexo.py`,
`offset.py`…). Le script écrit le modèle `data/kit/modeles/<machine>.glb`, le seul que l'application lit. Toutes les
machines se retrouvent ensuite dans un seul projet Blender, `kit.blend`, une scène par machine : l'ouvrir, puis
choisir la machine dans le sélecteur de scène en haut de la fenêtre.

## Construire

Blender 5.1 ou plus récent (`brew install --cask blender`). Depuis la racine du dépôt :

```
data/kit/blender/construire.sh              # toutes les machines, puis kit.blend
data/kit/blender/construire.sh flexo ctp    # seulement celles-ci, puis kit.blend
```

Une machine seule, sans refaire `kit.blend` :

```
blender --background --factory-startup --python data/kit/blender/flexo.py
```

Le projet de la machine seule va dans `.construction/` (hors dépôt) ; `kit.py` les réunit dans `kit.blend`, et reprend
de l'ancien `kit.blend` une machine qu'on n'a pas reconstruite. `construire.sh` s'arrête à la première erreur : il
lance Blender avec `--python-exit-code 1`, sans quoi Blender sort avec 0 même quand un script échoue. Si `blender`
n'est pas dans le PATH : `BLENDER=/Applications/Blender.app/Contents/MacOS/Blender data/kit/blender/construire.sh`.

Options après `--` :

- `--apercu <dossier>` rend des images de contrôle (vues `trois_quarts`, `face`, `arriere`, `dessus`, plus les gros
  plans propres à la machine) ;
- `--vues a,b` limite les images à ces vues ;
- `--sans-export` ne touche ni au `.blend` ni au `.glb` (pour regarder sans rien écrire) ;
- `--glb` et `--blend` changent les fichiers écrits.

Pour voir un `.glb` tel que l'application le reçoit :

```
blender --background --factory-startup --python data/kit/blender/apercu_glb.py -- data/kit/modeles/flexo.glb <dossier>
```

Puis, dans `src/EVAN.Front` : `npx vitest run build/` vérifie le contrat de chaque modèle contre `machines.json`
(`build/contratKit.test.ts`) et la compression du build (`build/modelesKit.test.ts`).

## Fichiers

- `commun.py` : outils partagés. Pièces de base (boîte, cylindre, tube, profil découpé, bobine texturée, flexible),
  matières, rôles du contrat (rouleaux, bandes, voyants, points de diagnostic, repères), ombre au sol cuite, export.
- `flexo.py`, `offset.py`… : une machine par script, une fonction par poste.
- `kit.py` et `construire.sh` : le projet commun `kit.blend`, et la reconstruction complète.
- `apercu_glb.py` : images de contrôle d'un `.glb`.
- `inspecter_glb.py` : inventaire d'un `.glb` (nœuds, rôles, extras, boîtes, matières) et extraction de ses images,
  pour reprendre un ancien modèle.
- `textures/` : images des machines ; `textures/sources/` fabrique celles qui ne viennent pas telles quelles des
  anciens modèles.

## Règles que les scripts respectent

- Unité le mètre. Dans Blender, Z monte, X suit le défilement de la bande et la face avant (côté conducteur) regarde
  vers -Y ; l'export la tourne vers +Z, comme l'application l'attend.
- Disposition, points de diagnostic et repères repris de l'ancien modèle : les positions viennent de `machines.json`,
  l'emprise au sol tient dans `MODEL_FOOTPRINT` (`src/EVAN.Front/src/domain/catalog.ts`).
- Un rouleau (`rotatif_N`) a son origine sur son axe et son axe Y local glTF couché vers l'avant. Le signe de
  `vitesseRadS` en dépend : `commun.rotatif()` le calcule selon que le rouleau passe sous la bande ou dessus.
- Matières PBR simples, sans texture sauf là où l'image porte l'information. L'accueil reconnaît chaque matière à sa
  couleur, son métal et sa rugosité (`src/EVAN.Front/src/pages/landing/realisme/matieres.ts`) : la palette de
  `commun.palette()` est réglée pour tomber dans les bonnes classes.
- Position, normale et UV seulement, UV uniquement sur les matières à image. Ni couleur de sommet, ni tangente, ni
  Draco : le build compresse déjà en Meshopt, et la vue d'usine fusionne les maillages aux mêmes attributs.
- À l'export, les pièces fixes d'un même poste qui partagent une matière sont fusionnées : moins d'appels de dessin,
  sans perdre la précision de la mise en évidence d'un organe. Le `.blend` garde les pièces séparées.

## Budget

| Machine | Triangles | `.glb` brut |
|---|---|---|
| flexo | 106 900 | 3,69 Mo |
| offset | 48 400 | 1,95 Mo |
| digital | 34 500 | 1,46 Mo |
| ctp | 30 200 | 1,40 Mo |
| slitter | 30 900 | 1,29 Mo |
| rfid | 28 500 | 1,31 Mo |
| paravent | 28 800 | 1,20 Mo |
| sheeter | 25 900 | 1,16 Mo |

Plafonds : 45 000 triangles et 1,5 Mo par machine, 60 000 et 2 Mo pour l'offset, la flexo à part. Au-delà de 1,5 Mo,
passer l'ombre cuite de 1024 à 512 ou 640 px suffit souvent.

Mesuré le 2026-11-11 sur l'usine de démo de Tours (même code, seuls les modèles changent) : 604 000 triangles et
568 appels de dessin par image, contre 418 000 et 456 avec les anciens modèles ; 30 images par seconde dans les deux
cas, processeur ralenti ×4 compris, sans tâche longue.

## Outils encore propres à une machine

Plusieurs scripts ont écrit les mêmes outils, faute de les trouver dans `commun.py` : `tangente` (brin de bande entre
deux rouleaux), `plan_image` (écran plan), `tube`, `pied_reglable`, `grille`, `caisson` et `porte`, `picto_x` et
`face_x` (devenus inutiles : `commun.ORIENTATIONS` garde le haut des dessins sur toutes les faces depuis le
2026-11-11). Les réunir dans `commun.py` demandera de reconstruire et de revérifier chaque machine.
