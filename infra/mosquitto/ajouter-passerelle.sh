#!/bin/sh
# Ajoute la passerelle d'une usine au broker : un certificat client signé par l'autorité d'EVAN (même AC que
# gen-certs.sh), puis le bloc à recopier dans infra/mosquitto/acl. Le CN du certificat est l'identité MQTT de la
# passerelle : les ACL la limitent aux sujets de son usine.
#
#   infra/mosquitto/ajouter-passerelle.sh <usine> <passerelle> [dossier des certificats]
#   infra/mosquitto/ajouter-passerelle.sh site-dupont gw-dupont
#
# Usine et passerelle : les identifiants qu'affiche EVAN (Compte > Passerelles, ou la clé Gateway du fichier de
# configuration téléchargé). À lancer sur le poste de l'exploitant qui garde la clé de l'AC, jamais dans un conteneur
# de l'API : un conteneur compromis ne doit pas pouvoir forger d'identité.
set -eu
# Git Bash sous Windows : ne pas convertir « /O=EVAN/CN=… » en chemin.
export MSYS_NO_PATHCONV=1

SITE="${1:-}"
GW="${2:-}"
CERTS="${3:-$(dirname "$0")/certs}"

usage() {
  echo "Usage : $0 <usine> <passerelle> [dossier des certificats]" >&2
  echo "Exemple : $0 site-dupont gw-dupont" >&2
  exit 2
}

# Mêmes règles que l'API (segment de sujet MQTT) : lettres, chiffres, - et _, 64 caractères au plus.
identifiant() {
  printf '%s' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
}

[ -n "$SITE" ] && [ -n "$GW" ] || usage
identifiant "$SITE" || { echo "Usine invalide : $SITE" >&2; exit 2; }
identifiant "$GW" || { echo "Passerelle invalide : $GW" >&2; exit 2; }
[ -f "$CERTS/ca.crt" ] && [ -f "$CERTS/ca.key" ] || { echo "Autorité introuvable dans $CERTS (ca.crt, ca.key) : lancer d'abord gen-certs.sh." >&2; exit 1; }
[ ! -e "$CERTS/$GW" ] || { echo "$CERTS/$GW existe déjà : rien n'est remplacé. Supprimer ce dossier pour renouveler le certificat." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl est requis." >&2; exit 1; }

# Clé privée lisible du seul propriétaire, fichiers de travail effacés quoi qu'il arrive.
umask 077
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

openssl req -newkey rsa:2048 -nodes -subj "/O=EVAN/CN=$GW" -keyout "$TMP/$GW.key" -out "$TMP/$GW.csr" 2>/dev/null
printf "extendedKeyUsage=clientAuth\n" > "$TMP/$GW.ext"
openssl x509 -req -in "$TMP/$GW.csr" -CA "$CERTS/ca.crt" -CAkey "$CERTS/ca.key" -CAcreateserial -days 825 -sha256 \
  -extfile "$TMP/$GW.ext" -out "$TMP/$GW.crt" 2>/dev/null

# Le dossier de la passerelle : l'AC publique et sa seule paire, jamais la clé de l'AC.
mkdir -p "$CERTS/$GW"
cp "$CERTS/ca.crt" "$TMP/$GW.crt" "$TMP/$GW.key" "$CERTS/$GW/"
chmod 644 "$CERTS/$GW/ca.crt" "$CERTS/$GW/$GW.crt"
chmod 600 "$CERTS/$GW/$GW.key"

cat <<FIN
Certificat de la passerelle $GW écrit dans $CERTS/$GW/ (ca.crt, $GW.crt, $GW.key).
Copier ce dossier sous le nom certs/ à côté de la passerelle, avec son appsettings.json téléchargé depuis EVAN.

Bloc à ajouter à la fin de infra/mosquitto/acl :

# Passerelle de l'usine $SITE : elle publie ses machines, reçoit ses commandes, rien d'autre.
user $GW
topic write evan/v1/$SITE/+/telemetry
topic write evan/v1/$SITE/+/state
topic write evan/v1/$SITE/+/alarm
topic write evan/v1/$SITE/gateway/$GW/status
topic read evan/v1/$SITE/gateway/$GW/cmd/#
topic write evan/v1/$SITE/gateway/$GW/reply/#

Puis recharger les droits du broker, sans couper les connexions : docker compose kill -s HUP mqtt
FIN
