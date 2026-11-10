# Communication machine → back

## 1. La chaîne

| Maillon | Rôle | Implémentation |
|---|---|---|
| **Machine** | automate (Siemens, Beckhoff, B&R, Rockwell…), variateurs, capteurs | — |
| **Passerelle edge** | service .NET installé dans l'usine, sur le réseau atelier | `src/EVAN.Gateway` (+ `EVAN.Messaging`) |
| **Broker MQTT** | point de rendez-vous ; seul service exposé | Mosquitto (EMQX possible), `infra/mosquitto` |
| **Back** | ingestion, séries temporelles, règles d'alarme, diffusion | `src/EVAN.Api` (+ Application, Infrastructure) |
| **Écran** | supervision temps réel | `src/EVAN.Front` via SignalR |
| **Simulateur** | joue les machines pour la démo et les tests | `src/EVAN.Simulator` (et `src/EVAN.Front/src/sim` hors ligne) |

## 2. Protocoles côté machine

Ordre de préférence :

1. **OPC UA par abonnement** (S7-1500, TwinCAT, B&R, Rockwell avec serveur OPC UA…). La passerelle crée une
   souscription ; l'automate envoie chaque changement de valeur, **horodaté à la source**, à l'intervalle de
   publication (250 ms par défaut). Session `SignAndEncrypt` (Basic256Sha256), certificat applicatif de la passerelle
   créé dans `pki/own`, certificats serveurs à approuver (`pki/trusted`), jamais d'acceptation automatique en usine.
   Le compte OPC UA utilisé doit n'avoir que des droits de lecture côté automate.
2. **Modbus TCP** pour les automates anciens : scrutation (500 ms), adresses `HR 40101 float32`, `IR 30001 int16`.
3. **Siemens S7 (ISO-on-TCP)** pour les S7-300/400 sans OPC UA : `DB10.DBD0` (REAL), `DB10.DBW4`, `DB10.DBX8.0`.
4. **JDF/JMF** pour les presses qui le proposent (Gallus, Heidelberg…) : requête `Status` périodique → état de la
   presse (Running, Setup, Down…), vitesse, compteurs de production et de gâche. Les mesures par organe demandent
   l'accès OPC UA à l'automate de la presse (à négocier avec le constructeur).

Chaque connexion associe une **variable** de l'automate à un **point de mesure** EVAN (étape 5 de l'assistant),
avec facteur d'échelle et décalage.

## 3. Contrat MQTT `evan/v1`

Connexion **sortante uniquement**, TLS 1.2+ sur le port 8883, **certificat client par passerelle** (mTLS) ; le CN du
certificat est l'identité MQTT, utilisée par les ACL (`infra/mosquitto/acl`). QoS 1.

| Sujet | Émetteur | Contenu |
|---|---|---|
| `evan/v1/{site}/{machine}/telemetry` | passerelle | `evan.telemetry/1` : lot de mesures |
| `evan/v1/{site}/{machine}/state` | passerelle | `evan.state/1` : marche / calage / arrêt, vitesse, compteurs |
| `evan/v1/{site}/{machine}/alarm` | passerelle | `evan.plc-alarm/1` : alarme native de l'automate |
| `evan/v1/{site}/gateway/{gw}/status` | passerelle | présence (retenu) ; « offline » par message de dernière volonté |
| `evan/v1/{site}/gateway/{gw}/cmd/test` | back | demande de test de liaison |
| `evan/v1/{site}/gateway/{gw}/cmd/write` | back | demande d'écriture (refusée par défaut) |
| `evan/v1/{site}/gateway/{gw}/reply/{id}` | passerelle | réponse à une commande |
| `evan/v1/{site}/sim/cmd/{fault,resolve,reset}` | back | commandes du simulateur (démo) |

Télémétrie :

```json
{
  "schema": "evan.telemetry/1",
  "siteId": "site-tours",
  "machineId": "m-r01",
  "gatewayId": "tours-01",
  "seq": 18234,
  "ts": "2026-10-07T09:41:12.250Z",
  "metrics": [
    { "point": "m-r01.o1.tension", "value": 183.4, "unit": "N", "quality": "good", "ts": "2026-10-07T09:41:12.120Z" },
    { "point": "m-r01.o9.vitesse", "value": 142.0, "unit": "m/min" }
  ],
  "trace": { "plc": "2026-10-07T09:41:12.120Z", "gateway": "2026-10-07T09:41:12.262Z" }
}
```

- `ts` de chaque mesure = horodatage source (OPC UA `SourceTimestamp`) ; `trace` = horodatages des maillons, qui
  permettent d'afficher la **latence réelle** dans le parcours de détection.
- Version dans le sujet (`v1`) **et** dans le message (`schema`) : un changement incompatible crée `evan/v2` sans casser
  les passerelles déjà installées.
- **Sparkplug B** (protobuf, `spBv1.0/{groupe}/DDATA/{edge}/{device}`, NBIRTH/DBIRTH, métriques nommées) est une
  alternative si le client a déjà un écosystème Sparkplug (Ignition, HiveMQ…) : il suffit d'ajouter un adaptateur
  d'ingestion à côté de `MqttIngestionService`, le reste du back ne change pas.

## 4. Fiabilité

- **Coupure réseau** : la passerelle garde les messages dans une file bornée (50 000 par défaut, les plus anciens
  abandonnés au-delà) et les envoie dans l'ordre de chaque sujet au retour, par paquets publiés en parallèle. Un message
  refusé 5 fois par un broker joignable est abandonné (journalisé). Reconnexion avec attente progressive (1 → 30 s).
- **État machine** : publié à chaque changement et, inchangé, toutes les 2 s (`Gateway:StateHeartbeatMs`). Ce battement
  doit rester sous le délai de liaison perdue du back.
- **Coupure automate** : reconnexion de la source toutes les 10 s ; la passerelle reste « online » mais n'annonce plus
  l'état de la machine. Sans donnée reçue depuis 5 s (`Evan:LiaisonPerdueSecondes`), le back la diffuse avec
  `horsLigne: true` (dernier état gardé, facteur 0) ; le champ disparaît au retour des données.
- **Back** : les mesures passent par une file vers TimescaleDB, écrites par lots en **COPY binaire** ; si la base est
  indisponible, les lots sont conservés et retentés, et toute perte (file pleine, lot refusé 5 fois) est comptée et
  journalisée. Alarmes, journal et états machine passent par une file ordonnée, retentée. Au redémarrage, les alarmes
  ouvertes (7 jours) et le journal sont relus en base. Un message rejoué en QoS 1 (même `seq`, même `ts`) est ignoré.
- **Présence** : statut retenu « online » toutes les 30 s et à chaque reconnexion ; si la passerelle disparaît, le broker
  publie « offline » et le back passe aussitôt ses machines hors ligne.

## 5. Back : ingestion, règles, diffusion

1. `MqttIngestionService` reçoit les messages et horodate la réception.
2. `LiveService` évalue chaque mesure avec le **moteur de règles** :
   - **seuil** : attention puis alarme critique (escalade), hystérésis au retour ; une alarme critique attend
     l'intervention (« Intervention terminée ») ;
   - **dérive** : régression linéaire sur 90 échantillons, **R² > 0,75** exigé ; alerte si le seuil d'alarme sera
     franchi dans les 30 minutes (« puissance UV atteindra 62 % dans ~12 min ») ; les consommables et compteurs
     (bobine qui se vide, usure) en sont exclus ;
   - **répétitif** : même code sur la même machine 3 fois en 8 h → règle « défaut répétitif » ;
   - **automate** : alarmes natives (signal discret, Alarms & Conditions, JMF `Down`) prises telles quelles.
3. Chaque alarme est rattachée à l'**organe** et porte la **cause probable** du catalogue.
4. Diffusion SignalR : lot de valeurs modifiées à 1 Hz, alarmes, événements et trace de détection immédiatement.

## 6. Sécurité

- Aucune connexion entrante vers l'usine ; la passerelle ne joint que le broker.
- mTLS : le broker vérifie le certificat de chaque client ; chaque client vérifie le broker contre **l'autorité EVAN**
  (et le nom d'hôte).
- ACL par identité : une passerelle n'écrit que pour son site et ne lit que ses propres commandes. Pour l'usine d'une
  organisation réelle, `infra/mosquitto/ajouter-passerelle.sh <usine> <passerelle>` signe son certificat et donne son
  bloc d'ACL ; sa configuration se télécharge depuis EVAN (voir [EXPLOITATION.md](EXPLOITATION.md) § 8). **Une passerelle par
  usine** (`tours-01`, `crissey-01`…) : celle d'une usine ne peut ni publier pour l'autre ni lire ses commandes ; le
  back adresse le test de liaison à la passerelle du site concerné.
- **Lecture seule par défaut** :
  - `Gateway:AllowWrites = false` : toute demande d'écriture est refusée ;
  - même activée, une écriture exige un **opérateur et une raison** ;
  - chaque demande, acceptée ou refusée, est écrite dans `audit/ecritures.jsonl` (ajout seul) et dans le journal des
    événements ;
  - seul OPC UA peut écrire, via le garde-fou ; Modbus, S7 et JMF sont strictement en lecture.
- Côté interface, l'autorisation d'écriture demande une raison et est journalisée (étape 5).
- **Tests de liaison bornés** : un test ouvre une connexion depuis le réseau de l'usine et renvoie ce qu'il y lit
  (registres Modbus, inventaire OPC UA). La passerelle n'accepte que deux sortes de cibles :
  - l'hôte d'une connexion déclarée dans `Gateway:Connections` ;
  - une entrée de `Gateway:AllowedTestTargets` : nom d'hôte exact, adresse IP, plage CIDR IPv4 ou IPv6. Vide par
    défaut : sans elle, seules les machines déclarées se testent.

  Le reste est refusé avant toute connexion, journalisé en avertissement, et revient à l'écran avec l'étape « Adresse
  hors de la liste autorisée de cette passerelle », la même pour un nom introuvable, pour ne rien laisser voir du DNS de
  l'usine. Un nom qui n'est pas déclaré tel quel est résolu, et chacune de ses adresses doit entrer dans la liste ; la
  source joint ensuite l'adresse vérifiée (Modbus, S7, OPC UA par l'URL, JMF par la connexion TCP en gardant le nom
  dans l'en-tête `Host`), si bien qu'un DNS qui change de réponse entre le contrôle et la connexion ne déplace pas la
  cible. Le test OPC UA ouvre sa session sur l'hôte et le port demandés quel que soit le point d'accès annoncé par le
  serveur ; le test JMF ne suit ni relais ni redirection et lit 1 Mo au plus.

  ```json
  "Gateway": {
    "AllowedTestTargets": [ "10.20.1.0/24", "fd00:20::/64", "presse-gallus.atelier" ]
  }
  ```

  En variables d'environnement : `Gateway__AllowedTestTargets__0=10.20.1.0/24`. Une entrée illisible est ignorée,
  avec un avertissement au démarrage.
- Côté back, `POST /api/connections/test` adresse la demande à la passerelle de l'usine visée et à aucune autre (une
  autre passerelle est refusée en 400), n'accepte que les protocoles d'EVAN (`opcua`, `modbus`, `s7`, `jmf`, plus `mqtt`
  et `simulateur` que la passerelle réelle refuse d'elle-même et que seule la démonstration simule) et borne
  identifiants et paramètres (16 au plus, 512 caractères par valeur). Le hub SignalR ne fait rejoindre que le groupe
  d'une usine existante.

## 7. Tester la chaîne

- **Sans Docker** : `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1` (broker de développement, API en mémoire,
  simulateur, front) → `/demo` affiche « Temps réel ».
- **Docker** : `docker compose up --build` (broker TLS, TimescaleDB, API, simulateur, front) → http://localhost:8088/demo.
- **Profil edge** : `docker compose --profile edge up --build` ajoute le serveur OPC UA de test de Microsoft et la vraie
  passerelle, qui alimente la ligne paravent (PV01) par abonnement OPC UA. Le serveur `opcplc` est l'hôte d'une
  connexion déclarée : il reste testable depuis l'étape 5 sans rien ajouter à `Gateway:AllowedTestTargets`.
- **Tests** : `dotnet test` à la racine (règles, chaîne de détection de bout en bout, règles d'architecture) et `npm test` dans `src/EVAN.Front`.
