# Lisibilité de l'interface : moins de texte, des actions nommées

Passe du 8 octobre 2026 sur l'espace de travail (`/demo`, `/assistant`). Constat de départ, captures à l'appui : des
paragraphes d'explication sous chaque titre de carte et chaque indicateur, une rangée d'icônes sans libellé dans la
barre du haut, des étiquettes 3D qui se chevauchent, et quelques défauts qui rendaient l'écran peu fiable (barre du
haut qui déborde sur téléphone, menus rognés, boutons aplatis).

## Principes retenus

1. **À l'écran, la donnée ; l'explication à la demande.** Une définition (MTBF, TRS, disponibilité), une méthode de
   calcul (Karney, régression) ou la provenance des données passe dans une aide contextuelle (i) à côté du titre. Le
   texte qui reste est chiffré : « 14 machines », « dont 1 défaut répétitif », « pic 487 kW le lun. 5 ».
2. **Une action visible porte un mot.** Les icônes seules ne restent que là où le libellé ne tient plus (≤ 1 200 px),
   avec leur nom en infobulle et pour les lecteurs d'écran.
3. **Le détail technique se déplie.** Nœuds 3D, sujets MQTT, variables OPC UA, mesures dérivées : utiles au paramétrage
   ou à l'entretien technique, repliés par défaut.
4. **L'état du système ne ment pas.** La pastille de flux dit « Reconnexion… » quand le hub décroche, au lieu de garder
   « Temps réel », et « Données figées » quand le hub reste ouvert mais que plus rien n'arrive depuis 5 s. Une machine
   dont la passerelle ou l'automate ne répond plus s'affiche éteinte, marquée « Liaison perdue », pas dans son dernier
   état connu. Historique, maintenance et énergie portent la mention « Historique simulé » tant qu'ils sont calculés
   sur les sept jours générés pour la démonstration. Un test de connexion ne montre que les étapes réellement
   exécutées par la passerelle ; en démo hors ligne, il se présente comme simulé et n'avance aucun chiffre. Une action
   qui n'atteint pas le serveur (acquittement, intervention) le signale au lieu de rester sans effet visible.
   L'assistant hors ligne le dit en une phrase et ne propose pas de suggestions inactives.

## Expliquer sans encombrer : solutions comparées

| Solution | Pour | Contre | Retenue |
|---|---|---|---|
| Texte sous chaque titre (avant) | Toujours visible | Double la hauteur des cartes ; on ne le lit qu'une fois | Non |
| Attribut `title` natif | Zéro code | Délai d'affichage, invisible au toucher et au clavier | Pour les compléments mineurs seulement (jauge d'échéance) |
| Bulle d'aide (i) maison, `ui/InfoTip.tsx` | Survol, focus clavier, toucher ; rendue dans le `body`, jamais rognée par une carte qui défile | Un composant de plus | **Oui** |
| Bibliothèque (Radix, Floating UI) | Positionnement avancé | Dépendance pour un seul besoin, déjà couvert en 80 lignes | Non |

## Ce qui a changé

| Zone | Avant | Après |
|---|---|---|
| Barre du haut | 7 icônes muettes à 1 440 px (visite, flux, panne, réglages, fusée, animations, thème), pastille « Démo », horloge | Actions nommées : **Demander à EVAN**, état du flux, **Simuler une panne**, **Configurer** ; le reste dans un menu **⋯** (visite guidée, commencer avec mon usine, thème sombre, animations) |
| Téléphone | Barre qui défile, menus d'usine rognés | Tout tient sur 390 px ; « Simuler une panne » et « Configurer » passent dans le menu ⋯ ; menus en position fixe |
| Supervision | Deux boutons « panne » (barre et panneau) | Un seul, dans la barre |
| Plan 3D | « R01 Gallus Labelmaster 440 » sur chaque machine, étiquettes superposées | Le numéro et l'état ; le nom au survol ou à la sélection, le code d'alarme en panne |
| Parcours de détection | Paragraphe, puis 10 maillons avec variable, sujet MQTT et QoS | « Détecté en 7,2 s · à l'écran en 325 ms », maillons et temps ; détail technique dépliable ; masquable une fois l'alarme levée |
| Historique, Maintenance, Énergie, Vue d'ensemble | Sous-titre explicatif sous chaque carte et chaque indicateur | Aide (i) ; barres par machine sur une ligne (le nom passe dans l'infobulle) ; échéances sur deux lignes au lieu de quatre ; conseils d'économie dans l'aide |
| Configuration | « Configuration · étape 1 sur 5 · Localiser » + rail + puce, trois boutons « Terminer » | « Étape 1 / 5 » ; sous-titre du rail pour l'étape en cours seulement ; « Terminer » dans la barre et à la dernière étape |
| Étape 1 | Paragraphe Karney, 10 mesures, mode d'emploi en un bloc | Surface, précision (i), 4 mesures clés, « Toutes les mesures » dépliable, mode d'emploi en trois lignes |
| Étape 4 | Nom d'organe tronqué, chemin du nœud 3D sur chaque organe | Nom complet, bouton « viser » en icône, nœud 3D dans l'organe déplié |
| Étape 5 | Deux barres de navigation empilées, bouton « Enregistrer la connexion » aplati | Navigation de l'assistant dans le panneau ; les blocs du panneau ne rétrécissent plus |
| Assistant hors ligne | Instructions de développement (script, variable, MCP) et six suggestions inactives | « Assistant hors ligne » en une phrase, marche à suivre dépliable ; disponibilité revérifiée à chaque ouverture |

## Pistes non traitées

- **Toasts** : la notification d'alarme recouvre le bandeau d'indicateurs ; la placer sous le bandeau ou dans le panneau.
- **Légende des états** (bas du plan) : redondante avec les pastilles une fois la démo connue ; la replier derrière un
  bouton « Légende ».
- **Visite guidée** : la légende narrée recouvre la légende des états en bas à gauche.
- **Indicateurs de supervision** à 1 280 px : « 0 critique · 0 attention » passe sur deux lignes.
