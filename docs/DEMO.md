# Démo — scénario

`/demo` s'ouvre sans compte sur l'organisation d'exemple (usine de Tours) et lance une **visite guidée de toute
l'application en 12 chapitres** (environ 4 min 30) : la mise en service (chapitres 1 à 5), puis l'exploitation
(6 à 11) et l'accès protégé au paramétrage (12).

- **Pendant la visite** : un clic dans la scène la met en pause, la légende reste ; ▶ reprend le chapitre, ⏮ et ⏭
  passent au chapitre voisin, une pastille saute directement à un chapitre, × ferme la visite. Le menu ⋯ de la barre
  du haut › « Visite guidée » la relance (ou la reprend là où elle s'était arrêtée).
- **Liens directs** : `?visite=8` démarre au chapitre 8 (maintenance) ; `?visite=0` désactive le démarrage
  automatique et ouvre la supervision.

| Chapitre | Ce qu'on montre | Ce qu'il faut dire |
|---|---|---|
| 1 · Localiser | Recherche « Valtiq » (annuaire SIRENE), vol jusqu'à Tours ; l'adresse « ZI du Menneton, avenue Thérèse Voisin » ne désigne que la rue : bâtiments candidats lettrés le long de la voie, le bon est confirmé ; tracé animé de l'emprise, zoom : cotes des murs, halo d'incertitude | « Le point SIRENE est à 270 m de l'usine : EVAN ne s'y fie pas, il propose les bâtiments de la rue. 5 999 m² au sol, à ± 3 % avec la précision de l'IGN ; en replaçant les sommets sur l’orthophoto au zoom 19, on descend vers 1 %. Avec la prépresse, 6 971 m² pour 7 000 annoncés. » |
| 2 · Plan | Fondu carte → 3D au même point de vue, murs qui montent (9,2 m BD TOPO), murs côté caméra transparents ; bascule en plan 2D (même scène vue de dessus : cotes des murs, nord, échelle), zones | « Le plan se génère tout seul à partir du contour. En 2D, ce sont les mêmes machines 3D vues de dessus, à l'échelle. » |
| 3 · Machines | Bibliothèque du kit, glisser-déposer avec aimantation 50 cm, R09 posée dans la zone stock et tournée d'un quart de tour | « Chaque modèle vient du kit glTF ; on peut importer le sien. » |
| 4 · Organes | Gallus Labelmaster 440 : 9 organes repérés dans le modèle (nœuds `diag_N`), points de mesure et seuils ; la caméra vise les organes 1, 2 et 4 | « L'alarme du variateur désigne l'axe, donc le groupe. » |
| 5 · Connexion | OPC UA, adresse, test de liaison (session chiffrée, lecture seule), association automatique des variables ; demande d'écriture vers l'automate : raison obligatoire, puis abandon | « La passerelle ne fait que lire ; écrire exige une raison et laisse une trace. » |
| 6 · Supervision | La visite termine la configuration : espace d'exploitation, bandeau d'indicateurs ; fiche de R04 (organes en direct, dérive de la lampe UV) ; **Simuler une panne** : parcours de détection, machine rouge qui pulse, zoom continu jusqu'à l'organe, fiche d'alarme, acquittement et résolution | « Capteur, automate, passerelle, MQTT, règles, alarme, écran : chaque maillon est horodaté. » |
| 7 · Historique | Arrêts par machine, carte des arrêts ; filtre sur R01 : courbe de tension avec seuils et alarmes ; journal d'alarmes (défauts répétitifs, export CSV) | « La casse d'échenillage revient sur la Gallus : défaut répétitif, l'outil est à contrôler. » |
| 8 · Maintenance | Tâches à planifier ou en retard ; maintenance prévisionnelle (la lampe UV de R04 datée) ; « Consigner » sur « Remplacer les lampes UV » : bon prérempli, compteur remis à zéro ; **Revoir la panne** DC-07 (dérive, alarme, puis acquittement, intervention, redémarrage en accéléré) ; **défaut répétitif** de 381 mm sur R01, aspect « Découpe » → cylindre magnétique P2, montré dans la 3D | « Le plan systématique dit que la lampe de R04 est à jour ; la mesure dit qu'elle faiblit chaque jour : on la change avant le défaut de séchage. Un défaut qui revient tous les 381 mm, c'est le développement d'un cylindre ; trois pièces l'ont, l'aspect du défaut les départage. » |
| 9 · Énergie | Puissance appelée en direct, 38 MWh sur 7 jours, 1,26 kWh pour 1 000 étiquettes ; courbe de charge et pic ; gisements : calages, veille (≈ 15 k€/an), R07 plus gourmande que les autres rotatives ; énergie par machine | « Sans compteur posé, on voit déjà où part l'énergie : la veille de nuit coûte quinze mille euros par an. Avec des compteurs Modbus, la même chaîne mesure au lieu d'estimer. » |
| 10 · Plusieurs usines | Vue d'ensemble Tours et Crissey (TRS, pannes, énergie, maintenance, plans teintés, machines comparables) ; ouverture de Crissey en 3D (son bâtiment, ses 8 machines, sa passerelle `crissey-01`), retour à Tours | « Une organisation, plusieurs usines : chacune a sa passerelle, son flux et ses alarmes ; mêmes indicateurs, même calcul d'une usine à l'autre. » |
| 11 · Demander à EVAN | Le panneau s'ouvre ; avec le back et la clé, la visite pose « Pourquoi R01 Gallus Labelmaster 440 s'est-elle arrêtée ces dernières 24 heures ? » et attend la réponse sourcée ; sans back, le panneau dit qu'il est hors ligne | « Claude ne devine rien : il interroge les outils d'EVAN, on voit lesquels, et ses références s'ouvrent dans l'application. La clé reste sur le serveur. » |
| 12 · Et après | Fenêtre d'accès à la configuration (ouverture journalisée), puis « Commencer avec mon usine » | « Une fois l'usine paramétrée, l'atelier ne voit que la supervision ; modifier le plan demande un accès et laisse une trace. » |

## Hors visite

| Écran | Ce qu'on montre | Ce qu'il faut dire |
|---|---|---|
| **MCP** | Dans Claude Desktop ou Claude Code branché sur `http://localhost:8080/mcp` : « Que faut-il planifier cette semaine à Tours ? » | « Les dix outils de l'assistant, en lecture seule, pour n'importe quel client MCP. Le protocole ne dépend pas du langage : une application PHP ou .NET peut s'y brancher. » |
| **Liens directs** | `/demo/maintenance`, `/demo/energie`, `/demo/organisation`, `/demo/historique`, `/demo?usine=site-crissey` | Pour revenir sur un écran pendant les questions, sans relancer la visite. Le bouton retour du navigateur revient à l'écran précédent. |

Prérequis : l'assistant et le MCP passent par le back (`scripts/dev.ps1`) ; l'assistant demande `ANTHROPIC_API_KEY`. Sans
back, le panneau « Demander à EVAN » l'explique et tout le reste fonctionne.

**Plusieurs usines.** Le sélecteur en haut à gauche (« Valtiq (exemple) · Tours ») liste les deux usines de
l'organisation : Tours et **Crissey · Ateliers Brennac** (48 rue Paul Sabatier, près de Chalon-sur-Saône : gravure et signalétique
industrielles). Un clic bascule toute l'application sur Crissey : son bâtiment (BD TOPO, 4 842 m²), ses zones, ses
8 machines, sa passerelle `crissey-01` et son propre flux ; « Simuler une panne » y déclenche une alarme qui reste à
Crissey. À dire : « Une organisation, plusieurs usines : chacune a sa passerelle, son flux et ses alarmes ; le contrat
MQTT est le même, seul le site change dans le sujet. » Lien direct : `/demo?usine=site-crissey`.

« Commencer avec mon usine » (menu ⋯ de la barre du haut) ouvre `/assistant` : on donne d'abord **le nom de son organisation**, puis on cherche
l'adresse, le nom d'entreprise ou des coordonnées GPS (un lien Google Maps se colle tel quel), on choisit le bâtiment et
on suit les mêmes étapes. « Ajouter une usine », dans le sélecteur, recommence à l'étape 1 pour une autre usine. Tout est
conservé dans le navigateur.

## Points d'attention

- Valtiq est une entreprise fictive. Ses usines sont posées sur des **emprises réelles** de la BD TOPO, retenues pour
  leur forme (à Crissey, le RNB relie le bâtiment au 48 rue Paul Sabatier) ; le nom, les zones, les machines et les
  mesures sont illustratifs.
- Le kit ne contient ni graveuse laser ni fraiseuse : à Crissey, ce sont les machines du kit (graveur de plaques CTP,
  presses, refendeuse, feuilleteuse, RFID) nommées selon l'activité de gravure et de signalétique.
- Seule la Gallus Labelmaster 440 est un modèle du commerce ; les autres sont des machines types (voir `fiabilite`
  dans le kit).
- La carte a besoin d'Internet (tuiles IGN/Esri, BD TOPO, recherche). Le reste de la démo fonctionne hors ligne, sauf
  l'assistant, qui appelle l'API de Claude depuis le back.
- Puissances par état, plan de maintenance et diamètres des cylindres sont des **ordres de grandeur** (catalogue) ; le
  facteur CO₂ et le prix de l'électricité se modifient à l'écran.
- Tester l'assistant avec la vraie clé avant la démonstration : `curl http://localhost:8080/api/assistant` doit répondre
  `"disponible": true` et `"acces": "local"`. Pour une démo depuis un autre poste, définir un code d'accès
  (`Evan__Assistant__CodeAcces`) : le panneau le demande avant la première question.
