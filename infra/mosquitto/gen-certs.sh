#!/bin/sh
# Autorité de certification de démonstration + certificats serveur et clients (mTLS).
# Exécuté par le service « certs » de docker-compose si les fichiers n'existent pas encore.
# En production : une AC interne, des clés jamais copiées, une rotation planifiée.
set -eu
# Git Bash sous Windows : ne pas convertir « /O=EVAN/CN=… » en chemin.
export MSYS_NO_PATHCONV=1
OUT="${1:-/certs}"
mkdir -p "$OUT"
cd "$OUT"
# Un dossier par conteneur, avec le certificat public de l'AC et sa seule paire : un conteneur compromis (l'API est le
# plus exposé) ne livre ni la clé de l'AC, qui permettrait de forger toutes les identités, ni la clé des autres.
# Les fichiers à plat restent pour le développement hors Docker (appsettings.json).
identity() {
  dir="$1"
  shift
  mkdir -p "$dir"
  cp ca.crt "$@" "$dir/"
  chmod 644 "$dir"/*
}
split_identities() {
  identity mqtt server.crt server.key
  identity api api.crt api.key
  identity simulator simulator.crt simulator.key
  identity gateway gateway.crt gateway.key
  identity gateway-crissey gateway-crissey.crt gateway-crissey.key
}

if [ -f ca.crt ] && [ -f server.crt ]; then
  split_identities
  echo "Certificats déjà présents dans $OUT"
  exit 0
fi
command -v openssl >/dev/null 2>&1 || apk add --no-cache openssl >/dev/null

openssl req -x509 -newkey rsa:3072 -nodes -days 825 -subj "/O=EVAN/CN=EVAN Demo CA" -keyout ca.key -out ca.crt

sign() {
  name="$1"; cn="$2"; ext="$3"
  openssl req -newkey rsa:2048 -nodes -subj "/O=EVAN/CN=$cn" -keyout "$name.key" -out "$name.csr"
  printf "%b" "$ext" > "$name.ext"
  openssl x509 -req -in "$name.csr" -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -sha256 -extfile "$name.ext" -out "$name.crt"
  rm -f "$name.csr" "$name.ext"
}

sign server mqtt "subjectAltName=DNS:mqtt,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth"
sign api api "extendedKeyUsage=clientAuth"
sign simulator simulator "extendedKeyUsage=clientAuth"
sign gateway tours-01 "extendedKeyUsage=clientAuth"
sign gateway-crissey crissey-01 "extendedKeyUsage=clientAuth"

# Démonstration locale uniquement : clés lisibles par les conteneurs (utilisateurs différents).
chmod 644 ./*.key ./*.crt
split_identities
echo "Certificats générés dans $OUT"
