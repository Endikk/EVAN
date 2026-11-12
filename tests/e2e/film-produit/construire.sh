#!/bin/sh
# Refait le film du README de bout en bout. Le serveur de développement du front doit tourner :
#   (cd src/EVAN.Front && npx vite --port 5199 --strictPort)
# Étapes : captures des écrans, tournage de la panne, rendu image par image, encodage vers docs/media/film.avif.
# Passer « montage » en argument pour sauter captures et tournage (les fichiers de travail/ sont réutilisés).
set -e
cd "$(dirname "$0")"
export EVAN_URL="${EVAN_URL:-http://localhost:5199}"
if [ "$1" != "montage" ]; then
  node ecrans.cjs
  (cd .. && node parcours/tournage.mjs film-produit/plans/panne.mjs film-produit/travail/clips nuit)
  rm -rf travail/clips/panne && mkdir -p travail/clips/panne
  ffmpeg -y -loglevel error -i travail/clips/panne.mp4 -vf fps=30 -q:v 2 travail/clips/panne/f%04d.jpg
  echo "{\"n\":$(ls travail/clips/panne/*.jpg | wc -l | tr -d ' ')}" > travail/clips/panne/n.json
fi
node serveur.cjs &
SERVEUR=$!
trap 'kill $SERVEUR 2>/dev/null' EXIT
sleep 1
node rendre.cjs
ffmpeg -y -loglevel error -framerate 30 -i travail/images/f%05d.png -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart travail/film.mp4
ffmpeg -y -loglevel error -i travail/film.mp4 -vf "fps=15,scale=1280:720:flags=lanczos" -c:v libsvtav1 -crf 36 -preset 4 -pix_fmt yuv420p -svtav1-params "tune=0" ../../../docs/media/film.avif 2>/dev/null
ls -la travail/film.mp4 ../../../docs/media/film.avif
