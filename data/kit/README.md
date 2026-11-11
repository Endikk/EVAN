# Kit machines

Contenu :

- `machines.json` : les 8 types de machines (et le parc d'imprimantes clients) avec fiabilité, caractéristiques, connectivité, repères et 43 points de diagnostic.
- `modeles/*.glb` : un modèle 3D par machine, au format glTF 2.0 binaire, validé sans erreur par le validateur Khronos.
- `connaissances.md` : la même base en texte, du parcours d'une commande au diagnostic des pannes.

## Modèles 3D

- Unité : mètre. Axe vertical : Y. Le socle d'atelier est inclus (nœuds `socle_N`).
- Textures intégrées dans chaque fichier, sans transformation de texture (répétitions déjà appliquées aux coordonnées UV).
- Ouverture directe dans Blender (Fichier > Importer > glTF 2.0), Three.js, Babylon.js, Unity (glTFast) ou Unreal.
- Chaque modèle est construit par un script Blender (`blender/<machine>.py`) ; toutes les machines sont réunies
  dans le projet `blender/kit.blend`, une scène par machine. Voir `blender/README.md`.

Nœuds utiles :

| Nom | Rôle | Données (extras) |
|---|---|---|
| `rotatif_N` | Cylindres, rouleaux, bobines | `vitesseRadS` : rotation autour de l'axe Y local |
| `bande_N` | Bande d'étiquettes | `vitesseMS` 0,5 et `pasEtiquetteM` 0,11 : décaler la texture en U |
| `voyant_vert`, `voyant_orange`, `voyant_rouge` | Colonne lumineuse | `etat` |
| `ecran_ihm` | Écran de pilotage | |
| `points_diagnostic/diag_N_nom` | Point de diagnostic | `numero`, `nom` ; le détail est dans le JSON |
| `reperes/repere_nom` | Repère de légende | `texte` |

### Exemple Three.js

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const spinning = [], webs = [];
new GLTFLoader().load('modeles/flexo.glb', (gltf) => {
  scene.add(gltf.scene);
  gltf.scene.traverse((o) => {
    if (o.userData.role === 'rotatif') spinning.push(o);
    if (o.userData.role === 'bande' && o.material.map) webs.push(o);
  });
});

function animate(dt) {
  spinning.forEach((o) => o.rotateY(o.userData.vitesseRadS * dt));
  webs.forEach((o) => { o.material.map.offset.x -= (o.userData.vitesseMS / o.userData.pasEtiquetteM) * dt; });
}
```

Pour placer une info-bulle sur un point de diagnostic : `gltf.scene.getObjectByName('points_diagnostic').children`, puis croiser `numero` avec `machines[].points_diagnostic` dans le JSON.

## Avertissement

Les rendus sont illustratifs : proportions approximatives, sans logo ni design de marque. Seule la Gallus Labelmaster 440 correspond à un modèle du commerce ; les autres représentent des machines types (voir `fiabilite` dans le JSON).
