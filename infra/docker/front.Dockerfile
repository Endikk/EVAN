# syntax=docker/dockerfile:1
# EVAN.Front : build Vite puis nginx. Contexte de build : racine du dépôt (data/ est lu au build).
FROM node:24-alpine AS build
WORKDIR /repo
COPY src/EVAN.Front/package.json src/EVAN.Front/package-lock.json src/EVAN.Front/
# Correctifs de dépendances appliqués par le postinstall de npm ci (patch-package) : à copier avant l'installation.
COPY src/EVAN.Front/patches/ src/EVAN.Front/patches/
# Cache npm partagé entre les builds : une dépendance déjà téléchargée ne l'est plus.
RUN --mount=type=cache,target=/root/.npm,sharing=locked cd src/EVAN.Front && npm ci --no-audit --no-fund
COPY data/ data/
COPY src/EVAN.Front/ src/EVAN.Front/
# Adresse du site (https://domaine) : balises de partage en adresses absolues, pour l'aperçu d'un lien collé dans une
# messagerie. Vide : adresses relatives (build/publication.ts).
ARG EVAN_URL_PUBLIQUE=
RUN cd src/EVAN.Front && EVAN_URL_PUBLIQUE="$EVAN_URL_PUBLIQUE" npm run build
# Précompression gzip -9 (servie telle quelle par gzip_static) : plus petit qu'à la volée, sans coût CPU par requête.
# Les woff2 et images sont déjà compressés.
RUN find src/EVAN.Front/dist -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.css' -o -name '*.html' \
      -o -name '*.svg' -o -name '*.json' -o -name '*.glb' \) -size +1k \
      -exec sh -c 'gzip -9 -n -c "$1" > "$1.gz"' _ {} \;

FROM nginx:1.29-alpine
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
# Ce qui précède nginx : rien par défaut ; docker-compose.prod.yml monte relais-tls.conf à sa place (Caddy en HTTPS).
COPY infra/nginx/relais.conf /etc/nginx/evan/relais.conf
COPY --from=build /repo/src/EVAN.Front/dist /usr/share/nginx/html
