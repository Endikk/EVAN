# Kit machines : base de connaissances

Ce que le kit sait des machines d'une imprimerie d'étiquettes : le parcours d'une commande, les huit types de machines,
leurs modèles 3D, la façon de les raccorder et de remonter à la cause d'une panne. L'organisation de la démo, Valtiq, est
une entreprise fictive : ses usines sont posées sur des emprises réelles de la BD TOPO, mais son nom, son parc et ses
mesures sont inventés pour la démonstration.

Chaque type de machine porte un niveau de fiabilité, repris sur sa fiche dans EVAN :

- **Modèle identifié** : la marque et le modèle sont connus, organes et caractéristiques viennent du constructeur.
- **Machine type** : le procédé est connu, pas encore le modèle ; les organes sont ceux d'une machine type.
- **À confirmer** : machine supposée d'après les produits fabriqués, à vérifier sur place.

Les données structurées sont dans `machines.json` et les modèles 3D dans `modeles/*.glb`.

---

## 1. Parcours d'une commande et données produites

1. **Devis et BAT** : format, matière, adhésif, couleurs, quantités, mandrin. Données : devis, client, prix, BAT validé.
2. **Prépresse** : préparation des fichiers, amalgame, gravure des plaques. Données : fichiers, plaques, outils de découpe.
3. **Impression** : offset, flexo ou numérique selon la série. Données : temps de calage, vitesse, gâche.
4. **Découpe et ennoblissement** : découpe rotative, dorure à froid, vernis, pelliculage. Données : outil, rendement, rebuts.
5. **Façonnage** : refente en bobines, planches, paravent. Données : bobines, mandrins, lots.
6. **Contrôle et expédition** : conditionnement. Données : traçabilité, bon de livraison, facture, délai.

---

## 2. Les huit types de machines

### 2.1 Presse flexo Gallus Labelmaster 440 (modèle identifié)

- Presse flexo conventionnelle, laize 440 mm, 8 groupes d'impression, 3 postes de découpe, dorure à froid intégrée.
- Plateforme Labelmaster : jusqu'à 200 m/min, 1,4 m de bande entre groupes (peu de gâche), servomoteurs directs,
  cylindres et anilox sans engrenage, préréglages automatisés, pupitre tactile.
- Séchage UV et air chaud. Télémaintenance **Gallus Remote Access**.
- Un éditeur de MIS (Cerm) documente une intégration avec les presses Gallus en **JDF/JMF** : envoi des instructions de
  travail vers la presse, retour des compteurs en temps réel pour la consommation de matière, la gâche et la surproduction.

### 2.2 Rotatives offset étiquettes (machine type)

- Le cœur du parc. Marques, âge et nombre de couleurs sont à relever sur place.

### 2.3 Prépresse et gravure de plaques (machine type)

- L'offset et la flexo exigent des plaques, donc un flux prépresse, un graveur de plaques et un développement. Le
  logiciel de flux est à identifier.

### 2.4 Impression numérique (machine type)

- Petites séries, données variables, quadrichromie numérique. Technologie (jet d'encre ou toner) et modèle à relever.

### 2.5 Refendeuses-rembobineuses (à confirmer)

- Indispensables pour livrer des bobines au métrage du client.

### 2.6 Ligne paravent (à confirmer)

- Étiquettes pliées en zigzag pour les imprimantes en continu.

### 2.7 Feuilleteuse de planches (à confirmer)

- Planches A4, A5 et mini-feuilles pour imprimantes laser et jet d'encre.

### 2.8 Atelier imprimantes et RFID (à confirmer)

- Encodage des puces, données variables, tests et réparation des imprimantes thermiques posées chez les clients.

### 2.9 Imprimantes installées chez les clients

- Un parc entretenu à distance : base d'un suivi des pannes et d'un réassort automatique d'étiquettes et de rubans.

### Modèles 3D fournis

Fichiers `modeles/<id>.glb` (glTF 2.0, mètres, Y vertical, socle d'atelier inclus) :

| Fichier | Contenu |
|---|---|
| flexo.glb | Presse flexo 8 groupes, dorure à froid, 3 découpes, échenillage, rembobineur |
| offset.glb | Rotative offset 6 groupes avec encrage, mouillage, plaque, blanchet |
| ctp.glb | Chargeur de plaques, graveur, développeuse, poste PAO |
| digital.glb | Presse jet d'encre CMJN, séchage UV, finition en ligne |
| slitter.glb | Refendeuse avec table lumineuse et couteaux circulaires |
| paravent.glb | Perforation transversale et pliage zigzag |
| sheeter.glb | Coupe en planches A4, convoyeur, pile |
| rfid.glb | Établi avec imprimante encodeuse RFID, antenne de contrôle, logiciel |

Les rendus sont illustratifs : proportions approximatives, aucun logo ni design de marque.

Conventions dans les fichiers :

- `rotatif_N` : pièces qui tournent autour de leur axe Y local, vitesse dans `extras.vitesseRadS`.
- `bande_N` : bandes d'étiquettes. Pour les animer, décaler la texture en U de 0,5 / 0,11 par seconde (vitesse de bande
  de 0,5 m/s, pas d'étiquette de 0,11 m).
- `voyant_vert`, `voyant_orange`, `voyant_rouge` : colonne lumineuse.
- `ecran_ihm` : écrans de pilotage.
- `diag_N_nom` : nœuds vides aux points de diagnostic.
- `repere_nom` : nœuds vides aux repères.

---

## 3. Connectivité machines

### Architecture cible, du capteur à l'ERP

1. **Machines** : automates, variateurs, capteurs, pupitres, caméras.
2. **Passerelle** : OPC UA, Siemens S7, Modbus TCP, JMF ; boîtier IoT pour les machines anciennes.
3. **Données** : bus MQTT et base historique horodatée.
4. **Applications** : ERP et MIS, CRM, tableaux de bord TRS, alertes.
5. **IA** : le serveur MCP interroge ces données (« pourquoi la presse 3 s'est-elle arrêtée hier ? »).

### Par machine

| Machine | Pilotage et protocoles | Données à récupérer | Localiser une panne |
|---|---|---|---|
| Gallus Labelmaster 440 | Servos directs, pupitre tactile, Gallus Remote Access, JDF/JMF avec un MIS | Compteurs, matière, gâche, états, alarmes | Alarme par axe donc par groupe ; défaut répétitif comparé aux circonférences |
| Rotatives offset | Automate à identifier (Siemens, B&R, Beckhoff ou autre) ; OPC UA, S7 ou Modbus ; passerelle si ancienne | Vitesse, états, alarmes, mouillage (pH, conductivité, température) | Journal d'alarmes ; chimie du mouillage ; fantôme au pas d'un rouleau |
| Prépresse et CTP | Dossiers surveillés, JDF, journaux du graveur et de la développeuse | Plaques par commande, plaques refaites, délais de BAT | Bande sur plaque = diode ; conductivité du bain |
| Numérique | Portail ou API constructeur, JDF | Encre par travail, événements, compteurs | Mire de buses ; raie fixe = buse ou tête |
| Refendeuses | Automate ; fichiers de défauts d'inspection | Comptage par bobine, tension, métrage par lame | Fichier de défauts de la presse ; usure des lames |
| Ligne paravent | Automate | Plis, bourrages, repérage de perforation | Dérive du repérage ou couteau abîmé |
| Feuilleteuse | Automate | Feuilles, doubles feuilles, longueur de coupe | Longueur mesurée en continu |
| Atelier RFID | Administration réseau des imprimantes (outils et API constructeurs, SNMP) ; Codesoft, BarTender | Journal d'encodage, échecs de puce, compteurs de tête | Taux d'échec par lot d'inlays et par imprimante |
| Imprimantes clients | Mêmes outils, avec l'accord du client | État, consommation d'étiquettes et de ruban | Alertes à distance |

---

## 4. Diagnostic : savoir d'où vient la panne

### Cinq méthodes

1. **Partir du journal d'alarmes** : chaque arrêt est daté et rattaché à une station par l'automate.
2. **Lire les axes** : avec un servomoteur par cylindre (cas de la Gallus), chaque défaut de variateur désigne un groupe précis.
3. **Mesurer le pas d'un défaut répétitif** : un défaut qui revient tous les X mm vient du cylindre ou du rouleau de circonférence X.
4. **Suivre les dérives** : puissance UV, chimie du mouillage, tension, usure des outils. La tendance alerte avant la panne.
5. **Croiser production et qualité** : arrêts par commande, matière, outil et équipe ; le TRS montre où se perd le temps.

### Points de diagnostic par organe

Les 43 points détaillés (capteurs, pannes typiques, méthode, connexion, alarme simulée) sont dans `machines.json`, champ
`points_diagnostic`. Les plus importants :

- **Dérouleur** : la tension en fonction du diamètre ; un décrochage toujours au même diamètre désigne le frein ou le capteur.
- **Groupe flexo** : erreur de poursuite d'axe, repérage, cliché abîmé ; l'alarme du variateur désigne le groupe.
- **Encrage** : viscosité, densité, heures de racle ; une dérive lente signale l'usure, un saut un incident.
- **Séchage** : puissance UV dans le temps ; la baisse se voit des semaines avant le défaut.
- **Mouillage offset** : pH, conductivité et température expliquent la plupart des voilages.
- **Découpe** : casses d'échenillage rapprochées de l'outil et de la pression ; une même plaque qui casse partout est usée.
- **Rembobineur** : comptage machine contre quantité commandée, soit la gâche réelle.
- **Graveur de plaques** : bande fixe = diode ; bourrage récurrent sur une référence = la plaque.
- **Numérique** : raie fixe = buse ou tête, localisée par la mire.
- **Refendeuse** : le fichier de défauts de l'inspection permet d'arrêter pile sur chaque défaut.
- **RFID** : un taux d'échec qui bondit désigne le lot d'inlays ; une hausse progressive, la calibration ou l'antenne.

---

## 5. Limites

- Une seule machine correspond à un modèle du commerce (la Gallus Labelmaster 440). Les autres sont des machines types.
- Les protocoles indiqués pour les machines types sont les standards du secteur, à confirmer sur place.
- L'entreprise, ses usines, ses zones, ses machines et ses mesures sont fictives. Seules les emprises des bâtiments sont
  réelles (BD TOPO, IGN), retenues pour leur forme.

## Sources

- Gallus Labelmaster, fiche produit : https://www.gallus-group.com/en/labelprinting/products/gallus-labelmaster
- Gallus Labelmaster, brochure : https://www.gallus-group.com/media/downloads/flyer-gallus-labelmaster-en.pdf
- Cerm, intégration des presses Gallus : https://cerm.net/partnerintegrations/production/gallus
