<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/titre-sombre.svg">
    <img src="docs/media/titre-clair.svg" alt="EVAN" width="260">
  </picture>
</h1>

<p align="center">
  Supervision d'usine pour l'imprimerie d'étiquettes.<br>
  Quelle machine est en panne et, dans la machine, quel organe.
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/presse-sombre.avif">
    <img src="docs/media/presse-clair.avif" width="100%" alt="La presse flexo Gallus Labelmaster 440 en 3D. Les rouleaux tournent, puis la presse s'arrête : le reste de la machine s'estompe et l'organe 7, l'échenillage, passe au rouge avec l'étiquette « Casse d'échenillage qui arrête la machine ».">
  </picture>
</p>

<p align="center"><sub>
  La Gallus Labelmaster 440 du kit, rendue par Three.js. Le point du logo suit l'atelier : vert en marche, rouge en panne.<br>
  <a href="docs/media/presse-flexo.stl">Faire tourner la presse en 3D</a>
</sub></p>

## Ce que fait EVAN

Une entreprise retrouve son usine sur une vue satellite, relève l'emprise exacte du bâtiment, obtient un plan 3D et y
place ses machines. Elle les branche ensuite sur leurs automates. À partir de là, EVAN suit l'atelier en temps réel et
descend jusqu'à l'organe en défaut : rouleau, groupe d'impression, sécheur, couteau.

Le reste sert à exploiter. Le carnet de maintenance repère les dérives avant la panne, consigne les interventions et
rejoue les arrêts en 3D. Le diagnostic des défauts d'impression répétitifs remonte du pas mesuré jusqu'au cylindre en
cause. L'énergie se compte par état de machine, jusqu'aux kWh pour 1 000 étiquettes et au CO₂. Et « Demander à EVAN »
répond aux questions en français avec Claude, à partir des données de l'usine ; les mêmes outils sont servis en MCP.

Une organisation compte une ou plusieurs usines, chacune avec son plan, ses machines, sa passerelle et son propre flux
temps réel.

<img src="docs/media/supervision.avif" alt="Supervision de l'usine de Tours dans EVAN : indicateurs de production en haut, bâtiment en 3D sur la vue satellite avec chaque machine et son état, alarmes actives à droite.">

<sub>Supervision de l'usine d'exemple de Tours. Les chiffres viennent du simulateur de la démo.</sub>

## Le trajet d'une panne

La casse d'échenillage de l'animation est le scénario de la démo. Elle suit le chemin d'une vraie panne :

| Étape | Ce qui se passe |
|:---|:---|
| Atelier | Le détecteur de casse du squelette, sur l'échenillage, déclenche une alarme de l'automate. La presse s'arrête. |
| Passerelle | `EVAN.Gateway` la lit dans l'usine (OPC UA, Modbus TCP, S7 ou JMF) et la publie en MQTT sur TLS. La connexion est sortante : aucun port à ouvrir côté usine. |
| Back | `EVAN.Api` reçoit le message au contrat `evan/v1`. Le moteur de règles le rattache à l'organe 7 et ouvre l'alarme. |
| Écran | SignalR la pousse au navigateur : la machine passe au rouge sur le plan, l'organe s'allume dans la presse. |
| Ensuite | Trois casses en 8 h, et la règle les classe en défaut répétitif. Le carnet en garde la trace et chaque arrêt se rejoue en 3D, avec la courbe de la mesure. |

Le simulateur publie sur le même contrat que la passerelle : avec Docker, la démo suit le chemin de production à partir
du broker. Celle du navigateur embarque le même moteur de règles et tourne sans serveur. Dans l'autre sens, rien n'est
écrit dans un automate sans activation explicite sur la passerelle, un opérateur nommé et une raison.

## Lancer

### La démo, dans le navigateur seul

```bash
cd src/EVAN.Front
npm install
npm run dev                                   # http://localhost:5173/demo
```

`/demo` ouvre sans compte l'organisation d'exemple Valtiq (Tours et Crissey) et sa visite guidée en 12 chapitres.
`?visite=0` va droit à la supervision, `?visite=8` démarre au chapitre 8, `?usine=site-crissey` ouvre la seconde usine.
`/assistant` part de zéro avec sa propre usine.

### La chaîne complète, avec Docker

```bash
cp .env.example .env                          # mot de passe de la base, codes d'accès et d'installation, clé Anthropic
docker compose up --build                     # http://localhost:8088/demo
docker compose --profile edge up --build      # + serveur OPC UA de test et passerelle réelle
```

Mosquitto en TLS avec certificats clients (générés au premier lancement), PostgreSQL avec TimescaleDB, API,
simulateur, front servi par nginx. Sous Windows sans Docker, `scripts/dev.ps1` lance un broker de développement, l'API
en mémoire, le simulateur et le front.

### En ligne, en HTTPS

`docker-compose.prod.yml` place Caddy devant nginx : certificat Let's Encrypt du domaine `EVAN_DOMAINE`, HTTP redirigé
vers HTTPS, plus aucun port en clair. Prérequis, commandes, sauvegarde de la base et observabilité :
[DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

### Installer EVAN pour l'entreprise

```bash
# .env : EVAN_CODE_INSTALLATION=<16 caractères au moins>, puis docker compose up -d
curl -X POST http://localhost:8088/api/installation -H 'Content-Type: application/json' -H 'X-Evan: 1' \
  -d '{"code":"<code>","organisation":"Imprimerie Dupont","identifiant":"claire@dupont.fr","nom":"Claire Martin","motDePasse":"<12 caractères au moins>"}'
```

EVAN sert une seule entreprise : cette installation ne réussit qu'une fois, au premier lancement, et crée
l'organisation de l'entreprise avec son premier administrateur. Celui-ci se connecte ensuite sur `/compte`, crée les
comptes des équipes et récupère la configuration de chaque passerelle ; `/assistant` enregistre les usines sur le
serveur. La démo reste à part, sans compte, tant qu'elle n'est pas fermée. Le parcours complet, certificat de passerelle
compris : [EXPLOITATION.md](docs/EXPLOITATION.md) § 8. Le code d'installation peut être vidé ensuite.

### L'assistant et le MCP

`ANTHROPIC_API_KEY` active « Demander à EVAN » (modèle `claude-opus-5-5`, réglable par `Evan__Assistant__Modele`). La
clé reste sur le serveur. Le serveur MCP n'en a pas besoin :

```bash
claude mcp add --transport http evan http://localhost:8080/mcp     # poste du serveur, sans Docker
claude mcp add --transport http evan http://localhost:8088/mcp \
  --header "Authorization: Bearer <code>"                          # Docker ou réseau : EVAN_CODE_ACCES du .env
```

Hors du poste du serveur, l'assistant et le MCP exigent le code d'accès ; sans code configuré, ils refusent. Débit,
réponses simultanées et questions par jour sont bornés, voir [EXPLOITATION.md](docs/EXPLOITATION.md) § 7.

## Tests

```bash
dotnet test                                   # règles, détection, stockage TimescaleDB, exploitation, assistant, MCP, comptes,
                                              # cloisonnement, architecture
cd src/EVAN.Front && npm test                 # géodésie, règles, énergie, maintenance, défaut répétitif
cd tests/e2e && npm ci && npm test            # bout en bout dans Chromium, sur la pile Docker (http://localhost:8088)
```

Le moteur de règles et l'historique simulé existent deux fois, dans le navigateur pour la démo hors ligne et dans le
back. `data/tests/` décrit les cas une fois et les deux suites les rejouent à l'identique. Les tests du stockage lancent
leur propre TimescaleDB par Testcontainers et sont ignorés sans Docker. Le bout en bout demande Chromium
(`npx playwright install chromium`, une fois). Détails : [ARCHITECTURE.md](docs/ARCHITECTURE.md) § 9.

## Dépôt

```
src/
  EVAN.Core            domaine et contrat MQTT evan/v1, sans aucune dépendance
  EVAN.Application     cas d'usage (supervision, test de liaison, exploitation, assistant) et ports
  EVAN.Messaging       transport MQTT partagé : TLS mutuel, reconnexion
  EVAN.Infrastructure  TimescaleDB ou mémoire, ingestion, données de référence
  EVAN.Api             REST, SignalR, assistant (SSE), composition du back
  EVAN.Mcp             outils de l'assistant en Model Context Protocol, sur /mcp
  EVAN.Simulator       machines simulées, publiées en MQTT
  EVAN.Gateway         passerelle edge : OPC UA, Modbus TCP, S7, JMF vers MQTT
  EVAN.Front           React et TypeScript (Vite)
tests/                 une suite par projet, plus les règles d'architecture
data/                  catalogue, organisation d'exemple, kit machines (modèles glTF), cas de test communs
infra/                 Dockerfiles, Mosquitto, nginx
```

Le back cible .NET 10. Avec un SDK 9, `Directory.Build.props` bascule seul en net9.0.

| | |
|---|---|
| Front | React 19, TypeScript, Vite, React Three Fiber, MapLibre GL, Recharts, zustand |
| Géo | IGN Géoplateforme (BD ORTHO, BD TOPO, géocodage), annuaire des entreprises, OpenStreetMap, GeographicLib |
| Back | ASP.NET Core, SignalR, Clean Architecture, versions NuGet centralisées |
| IA | Claude par le SDK officiel d'Anthropic, Microsoft.Extensions.AI, serveur MCP (SDK C# officiel, Streamable HTTP) |
| Données | PostgreSQL et TimescaleDB (Npgsql, Dapper, COPY binaire) |
| Messages | MQTT (Mosquitto, MQTTnet), TLS mutuel, JSON versionné |
| Passerelle | OPC UA (OPC Foundation), Modbus TCP (FluentModbus), S7 (S7netplus), JDF/JMF |

## Pour aller plus loin

[Architecture et arborescence](docs/ARCHITECTURE.md) ·
[Chaîne machine vers back](docs/COMMUNICATION.md) ·
[Exploitation, assistant et MCP](docs/EXPLOITATION.md) ·
[Mise en ligne](docs/DEPLOIEMENT.md) ·
[Lisibilité de l'interface](docs/UX.md) ·
[Scénario de démo](docs/DEMO.md) ·
[Kit machines](data/kit/README.md)

<sub>Données : © IGN (BD TOPO®, BD ORTHO®), © contributeurs OpenStreetMap, imagerie © Esri. Modèles 3D du kit
(`data/kit/`) : rendus illustratifs, proportions approximatives, sans logo de marque.</sub>
