#!/bin/bash
# Reconstruit les machines du kit (un .glb chacune dans data/kit/modeles), puis le projet commun kit.blend.
#   data/kit/blender/construire.sh            toutes les machines
#   data/kit/blender/construire.sh flexo ctp  seulement celles-ci ; kit.blend reprend les autres de .construction/
#                                             ou, à défaut, de l'ancien kit.blend
# Blender : la commande `blender` du PATH, ou celle que donne la variable BLENDER
# (par exemple /Applications/Blender.app/Contents/MacOS/Blender).
set -euo pipefail
cd "$(dirname "$0")/../../.."
BLENDER="${BLENDER:-blender}"
command -v "$BLENDER" > /dev/null || { echo "Blender introuvable : installe-le ou indique-le dans BLENDER." >&2; exit 1; }
for m in ${*:-flexo offset digital ctp slitter paravent sheeter rfid}; do
  [ -f "data/kit/blender/$m.py" ] || { echo "Machine inconnue : $m (pas de data/kit/blender/$m.py)." >&2; exit 1; }
  echo "== $m"
  # Sans --python-exit-code, Blender sort avec 0 même quand le script lève une exception.
  "$BLENDER" --background --factory-startup --python-exit-code 1 --python "data/kit/blender/$m.py" > /dev/null
done
journal="$(mktemp)"
"$BLENDER" --background --factory-startup --python-exit-code 1 --python data/kit/blender/kit.py > "$journal"
grep -E '^(SCENE|REPRISE|ABSENTE|KIT)' "$journal"
rm -f "$journal"
