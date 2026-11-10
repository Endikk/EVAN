# Mise en ligne en HTTPS

`docker-compose.yml` lance EVAN sur un poste, en clair sur le port 8088. `docker-compose.prod.yml` le surcharge pour un
hôte joignable depuis Internet : Caddy reçoit le web en HTTPS, avec un certificat Let's Encrypt obtenu et renouvelé
seul, et relaie à nginx, qui ne publie plus rien en clair.

| Service | En local (`docker-compose.yml`) | En ligne (`+ docker-compose.prod.yml`) |
|---|---|---|
| `proxy` | absent | Caddy 2.11 sur 80 et 443 : certificat du domaine `EVAN_DOMAINE`, HTTP redirigé vers HTTPS, HSTS d'un an |
| `web` | nginx publié sur 8088 | plus aucun port publié ; croit l'adresse du client et le protocole annoncés par Caddy (`infra/nginx/relais-tls.conf`) |
| `api`, `simulator`, `web`, `gateway` | construits sur place | images de GHCR (`ghcr.io/endikk/evan-*`), construites sur place si GHCR ne répond pas |
| `db`, `api` | mot de passe `evan-dev` par défaut | `EVAN_DB_PASSWORD` obligatoire |
| `api` | origines `localhost` | origine `https://EVAN_DOMAINE` ; export OpenTelemetry si un collecteur est désigné |

Le reste ne change pas : la base (5433) et l'API (8080) restent publiées sur 127.0.0.1 seulement, le broker MQTT garde
son TLS mutuel sur 8883.

## 1. Prérequis

- Un hôte Linux joignable depuis Internet, avec Docker Engine et le plugin Compose v2 à jour (la surcharge retire le
  port de nginx par la balise `!reset`).
- Un nom de domaine, ou un sous-domaine, dont l'enregistrement DNS `A` (et `AAAA` si l'hôte a une adresse IPv6) pointe
  sur l'hôte. Caddy ne peut pas obtenir de certificat avant.
- Ports entrants ouverts au pare-feu : 80 et 443 en TCP, 443 en UDP pour HTTP/3. Le port 80 sert au défi de
  Let's Encrypt et à la redirection vers HTTPS : il reste ouvert.
- Le port 8883 (MQTT sur TLS) seulement si des passerelles installées en usine se connectent à cet hôte, et alors
  réservé aux adresses de ces usines. La démo n'en a pas besoin : le simulateur tourne sur l'hôte.
- Pour tirer les images de GHCR depuis un dépôt privé : un jeton GitHub avec le droit `read:packages`.

## 2. Première mise en ligne

```bash
git clone <adresse du dépôt> /srv/evan && cd /srv/evan
cp .env.example .env && chmod 600 .env
```

Dans `.env` :

| Variable | Valeur |
|---|---|
| `EVAN_DB_PASSWORD` | un mot de passe tiré au hasard : `openssl rand -base64 24` |
| `EVAN_CODE_ACCES` | code de l'assistant et du serveur MCP pour le réseau, 16 caractères au moins ; vide, ils restent fermés |
| `ANTHROPIC_API_KEY` | clé Claude, seulement si l'assistant doit répondre ; poser aussi un plafond de dépense dans la console Anthropic |
| `COMPOSE_FILE` | `docker-compose.yml:docker-compose.prod.yml` : chaque commande `docker compose` prend les deux fichiers |
| `EVAN_DOMAINE` | le domaine, sans `https://` : `evan.exemple.fr` |
| `EVAN_VERSION` | `latest`, ou le tag d'une image publiée pour figer une version |

Puis :

```bash
echo "$JETON_GITHUB" | docker login ghcr.io -u <compte-github> --password-stdin
docker compose pull
docker compose up -d
docker compose logs -f proxy        # attendre « certificate obtained successfully »
```

Vérifier depuis un autre poste :

```bash
curl -I http://evan.exemple.fr/               # redirection permanente vers https://
curl -sI https://evan.exemple.fr/ | grep -i strict-transport-security
curl https://evan.exemple.fr/api/health       # "stockage":"timescaledb", "mqtt":true
```

Sans `COMPOSE_FILE` dans `.env`, chaque commande prend les deux fichiers à la main :
`docker compose -f docker-compose.yml -f docker-compose.prod.yml …`.

## 3. Mettre à jour, revenir en arrière

```bash
git pull                      # fichiers de configuration (Caddyfile, nginx, Mosquitto, surcharge)
docker compose pull
docker compose up -d
```

Pour revenir à une version précédente, `EVAN_VERSION` reçoit le tag de l'image voulue, puis `pull` et `up -d`.

## 4. Construire sur l'hôte

Sans accès à GHCR, ou pour une version locale :

```bash
docker compose up -d --build
```

Seule une image construite ainsi connaît l'adresse du site : la surcharge passe `EVAN_URL_PUBLIQUE=https://EVAN_DOMAINE`
au build du front, qui écrit alors les balises de partage (`og:image`, `og:url`) en adresses absolues, pour l'aperçu
d'un lien collé dans une messagerie. L'image de GHCR les garde en adresses relatives.

EVAN est l'outil interne de l'entreprise : aucune page n'est ouverte aux moteurs de recherche (`robots.txt` interdit
tout, `index.html` porte `noindex`, nginx envoie `X-Robots-Tag: noindex, nofollow`).

## 5. Sauvegarder la base

Toute la donnée d'exploitation est dans PostgreSQL (TimescaleDB) : mesures, états des machines, alarmes, journal.

```bash
mkdir -p sauvegardes
docker compose exec -T db pg_dump -U evan -Fc evan > sauvegardes/evan-$(date +%F).dump
```

Tous les jours à 3 h, en gardant deux semaines (durée à ajuster) :

```cron
0 3 * * * cd /srv/evan && docker compose exec -T db pg_dump -U evan -Fc evan > sauvegardes/evan-$(date +\%F).dump && find sauvegardes -name 'evan-*.dump' -mtime +14 -delete
```

Une copie doit partir hors de l'hôte (autre machine, stockage objet) : une sauvegarde sur le même disque disparaît avec
lui.

Restaurer, sur une base neuve (même image TimescaleDB que `docker-compose.yml`, API arrêtée pour qu'elle ne crée pas
le schéma avant) :

```bash
docker compose up -d db
docker compose exec -T db psql -U evan -d evan -c "CREATE EXTENSION IF NOT EXISTS timescaledb; SELECT timescaledb_pre_restore();"
docker compose exec -T db pg_restore -U evan -d evan < sauvegardes/evan-AAAA-MM-JJ.dump
docker compose exec -T db psql -U evan -d evan -c "SELECT timescaledb_post_restore();"
docker compose up -d
```

À garder aussi, hors de l'hôte et à l'abri :

| Quoi | Pourquoi |
|---|---|
| `.env` | mots de passe, code d'accès, clé Claude |
| `infra/mosquitto/certs/` | autorité de certification du broker : elle signe les certificats des passerelles d'usine. Perdue, chaque passerelle doit recevoir un nouveau certificat. Sa clé (`ca.key`) donne le droit d'en signer : jamais en clair hors de l'hôte |
| volume `caddy-data` | certificats et compte Let's Encrypt ; se recrée seul, mais Let's Encrypt limite les demandes répétées |

## 6. Observabilité

L'API exporte en OpenTelemetry (OTLP) ses traces, ses métriques et ses journaux dès que `OTEL_EXPORTER_OTLP_ENDPOINT`
désigne un collecteur ; sans cette variable, rien n'est enregistré ni exporté. Dans `.env` :

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://collecteur:4317
# OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf      # collecteur en HTTP (port 4318) au lieu de gRPC
# OTEL_EXPORTER_OTLP_HEADERS=authorization=...   # authentification demandée par le collecteur
```

puis `docker compose up -d api`. Les autres variables `OTEL_*` standard (nom du service, échantillonnage) s'appliquent.

| Relevé | Contenu |
|---|---|
| Traces | requêtes HTTP reçues (sauf `/api/health`), appels HTTP sortants (dont le modèle de l'assistant), requêtes PostgreSQL |
| Métriques | exécution .NET, ASP.NET Core, HttpClient, Npgsql, et les mesures métier ci-dessous |
| Journaux | ceux de l'API, reliés à la trace en cours |

Les chaînes de requête des adresses sont masquées et les en-têtes HTTP ne sont pas relevés.

Mesures métier (compteur `EVAN`, `src/EVAN.Application/Observabilite/Metriques.cs`) :

| Mesure | Étiquettes | À surveiller |
|---|---|---|
| `evan.mqtt.messages` | `type` : telemetry, state, alarm, gateway, autre | un débit qui tombe à zéro : passerelle ou broker coupé |
| `evan.mqtt.messages.rejetes` | `motif` : json, incoherent | une hausse : passerelle mal configurée ou message forgé |
| `evan.alarmes.levees` | `gravite`, `regle` | le rythme des pannes |
| `evan.alarmes.ouvertes` | `gravite` | alarmes non résolues, toutes usines |
| `evan.base.file` | `file` : journal, mesures | une file qui grossit : base lente ou injoignable |
| `evan.base.perdues` | `file`, `motif` : file_pleine, refus | toute valeur non nulle : des écritures sont perdues |

La passerelle d'usine lit la même variable : OTLP vers le collecteur désigné, traces des appels JMF, métriques
d'exécution, et `evan.passerelle.file` (messages en attente du broker) et `evan.passerelle.perdus` (compteur
`EVAN.Passerelle`). Sans collecteur, les mêmes compteurs se lisent hors Docker avec
`dotnet-counters monitor -n EVAN.Api --counters EVAN`.

## 7. En-têtes et ce qui précède nginx

- Caddy pose `Strict-Transport-Security: max-age=31536000` sur ce domaine seul. `includeSubDomains` et `preload`
  engagent tous les sous-domaines, et `preload` se défait difficilement : à décider par le propriétaire du domaine,
  dans `infra/caddy/Caddyfile`.
- Les autres en-têtes de sécurité (politique de contenu, cadres, type de contenu) restent posés par nginx.
- nginx inclut `/etc/nginx/evan/relais.conf`. En local, ce fichier ne croit aucun en-tête `X-Forwarded-*` : l'adresse
  et le protocole sont ceux de la connexion. En ligne, la surcharge monte `relais-tls.conf` à sa place : nginx n'est
  plus joignable que par les conteneurs de la pile, Caddy remplace les en-têtes qu'un client enverrait, et nginx retient
  donc l'adresse du client et `https` annoncés par Caddy. Ses limites par adresse (`limit_req`) et celles de l'API
  restent par client au lieu de toutes porter sur Caddy. L'API ne change rien à sa lecture de l'adresse du client.
- L'API reçoit `X-Forwarded-Proto` (le protocole vu par le navigateur) en plus de `X-Forwarded-For`.

## 8. Avant d'ouvrir au public

La surcharge met EVAN en ligne ; elle ne fournit pas ce qui dépend du propriétaire du site. Manquent encore :

- les mentions légales et la politique de confidentialité ;
- une adresse de contact ;
- une mesure d'audience, et avec elle un bandeau cookies qui permette de refuser.

Ces pages et ce bandeau exigent des informations réelles (raison sociale, numéro SIRET, adresse, hébergeur, outil
d'audience retenu) : aucune n'est inventée ici.
