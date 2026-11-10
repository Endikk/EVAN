# Film d'ouverture de l'accueil : registre des relectures

Chaque ronde est relue par des critiques neufs, qui n'ont rien vu de la fabrication : images (toutes les 0,2 s, image
par image autour des passages), lecture sans le son (une planche à 2 i/s, rien d'autre), synchro et faits, revue de
directeur. On corrige d'abord le défaut le plus grave, on rend à nouveau, et la ronde suivante recontrôle tout.

Rendu : `?film=capture`, puis `node tests/e2e/film/capture.mjs` (Chromium, rendu Metal), image par image, encodé par
ffmpeg en H.264, 60 i/s. Bureau 1728×1000, téléphone 390×844 à 2x, thème clair 1440×900.

## Ronde 0 : storyboard (version 1)

Verdict : one more pass.

| Problème relevé | Correction | Avant | Après |
|---|---|---|---|
| Le « dernier rouleau » n'est jamais payé : le point devient le rouleau, puis six objets différents portent la suite. | Le point reste un point d'état de bout en bout : titre, moyeu du rouleau, course jusqu'à la dorure, retour au titre. | 6 objets porteurs | 1 |
| Fenêtre circulaire sur un disque vert : effet daté, et le vert meurt en rouleau beige. | Fenêtre supprimée. | iris | aucun |
| Étiquette rangée et retour au vert sur la même image : on lit « ranger l'alarme répare la presse ». | La puce reste rouge jusqu'à la reprise. | 0 image d'écart | 30 images |
| La casse arrive avant qu'on ait vu la marche. | La presse tient à pleine vitesse avant la casse. | 0 image | 45 images (voir ronde 1) |
| Un outil ouvert chaque matin rejouerait 7 s et une fausse panne. | Une fois par navigateur et par version (`localStorage`). | une fois par onglet | une fois par navigateur |
| Logo rouge pendant la panne : se lit « EVAN en erreur ». | Le logo ne change pas. | rouge | intact |
| Titre géant sur le nuage orange sans plaque. | Le nuage arrive avec la presse. | dès l'image 0 | dès l'impact |
| Les écrans de la presse affichent 152 m/min quand la carte dit 0. | Écrans redessinés en direct avec la vitesse et l'état (`features/EcransPresse.tsx`). | 152 figé | même nombre que la carte |

## Ronde 1 : premier rendu (version 2)

Verdicts : images one more pass, synchro et faits one more pass, directeur one more pass, lecture sans le son
« compris ».

| Problème relevé | Correction | Avant | Après (rendu 2) |
|---|---|---|---|
| Passages opaque / pâli en une image (f301, f451). | Fondu de 18 images de la mise en évidence (`MachineModel`, prop `fondu`), profondeur gardée, socle et bâti opaques. | 22,8 % et 32,2 % des pixels changent en une image | plus aucun saut hors mouvement de caméra ; le plus fort est un panoramique à 16 % |
| La lumière de la presse s'allume d'un coup (f121). | Allumage sur 36 images, en traversée. | 5 images | 36 images |
| Étiquette vide pendant son vol (f404), puce vide à l'arrivée (f416). | L'étiquette garde son texte, prend la hauteur de la puce par une mise à l'échelle et s'y fond pendant que la puce rougit. | texte effacé dès 40 % du vol | texte lisible jusqu'aux 6 dernières images |
| La phrase promet « ce qu'il faut vérifier », le film ne le dit jamais. | L'étiquette déplie « Contrôler le passage du film », tiré du catalogue, et « Alarme simulée ». | absent | 77 images lisibles |
| Lent : casse à 4,5 s, 1,05 s d'attente avant, 4 s de vide sur 8. | Casse à 3,5 s ; tenue 0,75 s ; reprise avancée à 7,0 s, 15 images posées à la fin. | casse f270 | casse f210 |
| Carte « En marche » pendant que la vitesse chute. | La carte passe en panne 3 images après la casse. | 15 images d'écart | 3 |
| Ligne 2 qui touche le bord droit (f18-f22), point du « i » visible sous le masque. | Le titre recule à sa taille de deux lignes avant que la seconde monte ; masque de 140 %. | x = 1727 sur 1728 | dans la marge |
| Presse visible derrière le titre plein cadre (f36). | La presse apparaît quand le titre se range (images 50 à 80). | dès f20 | dès f50 |
| Point final du titre absent 6 s : une coquille. | Le point reste dans la phrase ; seule sa lumière verte voyage, et revient. | absent f90-f470 | toujours là |
| Lumière trop petite pour être suivie. | Plus grosse sur la presse (rayon ×2,1, 9 px au moins) et étirée par sa vitesse. | 13-16 px | 19-21 px, étirée en vol |
| Étiquette CF-02 trop petite au moment fort. | 15 px au lieu de 12. | 13 px | 15 px |
| « Voir sur la presse » à 4,25:1 en thème clair. | Couleur secondaire, panneau à 97 %. | 4,25:1 | 7,4:1 (#4a4f5a sur #f4f3f1) |
| Pastille CF-02 visible 2 images après son repère ; onde et pièce une image après le coup. | Ce qui part sur un coup est déjà en mouvement sur l'image du coup. | +2 / +1 | 0 (à recontrôler) |
| La presse éteinte paraît sale sur fond clair. | De jour, la lumière éteinte reste à 45 %. | 12 % | 45 % |

Gardé malgré une demande : le nuage de pixels orange (demandé coupé par le directeur). Il fait partie de la page au
repos, choisie avant ce film ; pendant le film il ne coule qu'au démarrage de la presse et s'éteint presque pendant la
panne.

## Ronde 2 : deuxième rendu (version 3)

Verdicts : images one more pass, synchro et faits one more pass, directeur one more pass, lecture sans le son
« compris ».

| Problème relevé | Correction | Avant | Après (rendu 3) |
|---|---|---|---|
| Presse « en verre » pendant la panne, pièce rose bonbon : un visualiseur de CAO. | Projecteur : la presse s'assombrit, la pièce reste éclairée. | transparence à 50 % | presse opaque |
| La panne dure 3 s, le film 8 s. | Film de 7 s, casse à 3 s. | casse f210, fin f480 | casse f180, fin f420 |
| La consigne cache la pièce en cause. | Étiquette posée au-dessus de la pièce, consigne au-dessus d'elle. | 3 450 pixels rouges visibles sur 6 687 | pièce dégagée à l'arrêt (voir ronde 3) |
| L'étiquette percute « Voir sur la presse » en descendant. | Trajet qui descend puis entre de côté. | traverse l'intitulé | voir ronde 3 |
| Voyant de la colonne rouge 19 images après la reprise. | L'état de la presse suit la reprise, plus la fin du fondu. | +19 images | 0 |
| Carte « En marche » 2 à 3 images après la casse. | La carte bascule sur l'image de la casse. | +3 | 0 |
| Écrans de la machine sans mention de simulation. | « simulation » dans leur bandeau. | absente | présente |
| Socle qui change de teinte d'un coup à la fin du fondu. | Socle et bâti gardés opaques. | 16 % de pixels en une image | fondu continu |

## Ronde 3 : troisième rendu (version 4)

Verdicts : images one more pass, synchro et faits one more pass, directeur one more pass, lecture sans le son
« compris ».

| Problème relevé | Correction | Avant | Après (rendu 4) |
|---|---|---|---|
| Le point vert, héros du film, fait 8 px et passe inaperçu ; l'allumage se lit comme une texture qui finit de charger. | Presse vraiment éteinte avant l'impact, puis allumée de proche en proche depuis le rouleau touché (`features/EclairagePresse.tsx`, dans les shaders de la presse) ; lumière posée à 20 px, 30 px à mi-vol, étirée par sa vitesse ; pouls sur le point du titre avant son départ. | 8-16 px, allumage global | 20-30 px, balayage de 0,5 s |
| Dézoom du titre plein cadre : le tic de keynote. | Titre à sa place dès l'image 0. | titre ×2,7 puis rangé | titre posé |
| Une quatrième couleur, le rose de la pièce. | La pièce prend le rouge d'alerte de la carte (#ff3d6e) sous le projecteur ; plus de surbrillance du modèle. | rose #febfcd | rouge de la carte |
| Deux étiquettes empilées, l'action au-dessus du nom. | Une seule étiquette : le nom, puis la consigne, « simulée » dans l'en-tête. | 2 blocs | 1 |
| La pièce reste rose quand la carte dit « En marche ». | La pièce s'éteint avant la reprise ; carte, lumière, écrans et voyant basculent sur l'image de la reprise. | 6 images d'écart | 0 |
| Le voyant de la colonne bascule une image après la carte. | L'état des voyants est lu à chaque image, comme la vitesse. | +1 | 0 |
| Les barres des écrans sont un historique inventé. | Les barres sont l'historique réel de la vitesse affichée. | 14 valeurs fixes | 15 valeurs mesurées |
| Étiquette qui naît sur la pièce, et la traverse en vol. | Elle naît en place au-dessus, s'écarte de côté, descend à gauche du panneau et entre dans la puce à l'horizontale. | traverse la pièce et l'intitulé | ni l'un ni l'autre |
| Puces à 3:1 pendant leur entrée sur le nuage. | Le panneau entre opaque, découvert par le bas. | 3:1 | jamais sous son contraste final |
| Puce encore rouge 12 images après la reprise. | Elle s'éteint en 12 images dès la reprise. | jusqu'à f372 | éteinte à f342 |
| Images quasi figées au début. | Silhouette de la presse un peu plus visible pendant que la caméra tourne, pouls du point. | suite de 23 images | 14 images au plus |

Film ramené à 6,5 s : casse à 2,5 s, reprise à 5,5 s.

Mesures du rendu 4 (bureau) : 390 images, 6,500 s, 1728×1000, 60 i/s ; plus longue suite quasi figée 14 images
(0,23 s) ; aucun saut d'une image hors mouvement continu (le plus fort, 24 %, est le rallumage de la presse sur
15 images). Lecture réelle sur le build de production : 60 i/s pendant tout le film, les seules images lentes tombent
pendant l'attente sur l'affiche, avant le chargement de la presse.

## Rondes 4 à 8 : rendus 4 à 8 (versions 5 à 8)

Verdicts : lecture sans le son « compris » à chaque ronde ; images, synchro et directeur one more pass. Vérification finale du rendu 10 : synchro et faits « ship » ; images, un défaut bloquant (la lumière passait sur la carte au téléphone), corrigé et vérifié. Les directeurs
successifs se sont contredits sur trois points de goût (ouverture noire ou silhouette, retour du point au titre ou non,
vol de l'étiquette ou non) ; les choix retenus sont dans la dernière colonne et motivés plus bas.

| Problème relevé | Correction | Avant | Après (rendu 9) |
|---|---|---|---|
| L'ouverture sur une presse sous-exposée se lit comme une 3D qui charge mal. | Presse éteinte fondue dans le fond par son alpha (invisible la nuit, fantôme pâle le jour) ; la page est complète dès l'image 0. | silhouette grise | noir franc, page lisible |
| Le bord du balayage d'allumage dessine une ligne de diaporama ; la presse n'apparaît que 6 à 8 images après l'impact. | Front large de 3 m qui entre sur le rouleau dès la première image. | +8 images | 0 |
| Paragraphe, boutons, puces et carte entrent l'un après l'autre : effet gabarit. | Paragraphe, boutons et puces présents dès l'image 0, seule la carte entre avec la presse. | 4 entrées | 1 |
| La lumière étirée en comète (« Flash »). | Plus d'étirement ; elle grossit en venant vers la caméra. | étirement ×2,6 | aucun |
| La carte nomme la pièce avant que la lumière l'atteigne. | « En panne » à la casse, « En panne : dorure à froid » quand la lumière arrive. | +30 images d'avance | 0 |
| Le vol de l'étiquette vers la puce frôle l'intitulé « Voir sur la presse » (relevé quatre fois). | Le vol est supprimé : la puce s'allume avec l'étiquette, l'étiquette s'efface sur place. | collision sur 3 à 6 images | aucune |
| La consigne se coupe en bas et rétrécit avant de s'effacer. | Marge basse comptée dans la hauteur dépliée ; l'étiquette s'efface entière. | texte coupé | marge de 9 px |
| La pièce en « cage » rose : le cadre de la station est teinté avec les rouleaux. | Seuls les rouleaux de la dorure prennent le rouge d'alerte. | rayon 0,3 m | 0,2 m |
| Le socle passe sous le titre pendant la poussée, puis un recul corrige. | Une seule approche lente pendant la panne (30 % du chemin), retour à la reprise. | poussée ×0,8 puis dérive | ×0,94 |
| « En marche » alors que la pièce est rouge et la presse sombre. | La pièce et la puce s'éteignent et la presse se rallume juste avant la reprise. | 3 à 6 images de rouge | 0 |
| Les barres des écrans réécrivent l'historique à la dernière image. | Historique qui continue, à la même cadence, après le film. | saut à la fin | continu |
| Le voyant rouge s'allume 10 images après la casse (clignotement de l'horloge 3D). | Clignotement calé sur la grille du film, allumé sur l'image de la casse. | +10 | 0 |
| Le voyant vert éteint se lit allumé ; allumé, il sature au blanc. | `setVoyant` (partagé avec tous les écrans 3D) : éteint à peine teinté, allumé à 1,8 au lieu de 3,2. | éteint à 25 % de sa couleur, lueur 0,05 | éteint à 10 %, sans lueur |
| Contraste de « Gallus Labelmaster 440 · simulation » en thème clair. | Couleur secondaire. | 4,3:1 | 7,4:1 |

Choix tranchés entre critiques contradictoires :

- **Ouverture noire plutôt que silhouette.** Une silhouette sous-exposée a été lue deux fois comme un rendu raté ; le
  noir franc avec la page complète se lit comme une page posée qui attend sa machine.
- **Retour du point au titre.** Supprimé au rendu 6 (invisible), rétabli au rendu 9 avec une lumière plus grosse : la
  boucle se ferme, le point final se rallume à son arrivée.
- **Pas de vol de l'étiquette.** Quatre relectures ont trouvé une collision ; le lien entre l'alarme et le bouton passe
  par la couleur et le moment, sans trajet.
- **Le nuage de pixels reste**, comme le style de la presse : ils appartiennent à la page au repos, choisie avant ce
  film.

## Revue de code

Une revue indépendante n'a rien trouvé de bloquant pour la sécurité ni pour les autres écrans. Corrigé : uniformes de
l'éclairage reliés une seule fois (une bascule jour / nuit pendant le film les coupait) ; film arrêté si la 3D échoue
ou si WebGL manque ; `?film=capture` réservé au développement ; arrêt si les animations réduites sont demandées en
cours de route ; la barre d'adresse d'un téléphone ne coupe plus le film ; police des écrans lue une fois.

## Mesures du rendu final (rendu 10, version 8)

| Mesure | Valeur |
|---|---|
| Durée, taille, cadence | 5,500 s ; 330 images ; 1728×1000 et 780×1688 ; 60 i/s |
| Plus longue suite figée (pleine résolution) | 6 images (0,1 s) |
| Point d'état au repos | #2fd07f, le jeton --ok |
| Contraste du texte le plus faible | 4,98:1 (thème clair, « vitesse de la bande ») |
| Lecture réelle, build de production | 60 i/s pendant le film ; seules images lentes pendant l'attente de la presse, sur l'affiche |
| Retour de la lumière | #2fd07f plein jusqu'au point du titre (le voile du texte est levé à la reprise) |
| Son | aucun (choix du brief) : pas de mesure de sonie |
| Tests | 24 tests du film (repères, continuité, faits tracés), 249 au total |
