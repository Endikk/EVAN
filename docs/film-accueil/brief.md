# Film d'ouverture de l'accueil : brief

L'accueil (`/`) joue un film de 5,5 s à l'ouverture, puis se pose dans son état habituel : un seul écran, sans
défilement, la presse 3D, le titre, les deux actions et les puces. Le film est la page elle-même, en code : aucun
fichier vidéo n'est servi. Ce document tient les décisions, le concept et la bible de style. Le découpage plan par
plan est dans [storyboard.md](storyboard.md), les rondes de relecture dans [ledger.md](ledger.md).

## Le brief, ligne par ligne

Le brief reçu était vide : chaque ligne est décidée ici, avec sa raison.

| Ligne | Choix | Raison |
|---|---|---|
| mode | product | La presse flexo du kit est le vrai produit, déjà en 3D sur la page. |
| subject | EVAN, sa page d'accueil | Le film doit finir sur la page au repos, pixel pour pixel. |
| viewer | Les gens de l'entreprise qui ouvrent EVAN : direction, maintenance, chefs d'atelier | EVAN est l'outil interne d'une seule entreprise. Ils veulent savoir si l'atelier tourne, et quoi vérifier quand une machine lâche. |
| end state | Savoir qu'EVAN suit la presse en direct et montre la pièce en cause quand elle s'arrête ; cliquer « Voir la démo » ou « Une panne expliquée » | C'est la phrase de la page, montrée au lieu d'être lue. |
| length | 5,5 s, 16:9 sur ordinateur et 9:16 sur téléphone | Assez pour montrer la marche, la casse et la reprise ; il ne joue qu'une fois par navigateur. Chaque format est recomposé par la mise en page existante, jamais recadré. |
| frame rate | 60 i/s | Interface et produit. |
| brand | Dérivée du produit | Jetons de `styles/jetons.css`, logo `ui/EvanLogo.tsx` (le SVG du dépôt, jamais redessiné), Onest et JetBrains Mono installées en local. |
| facts | [`facts.json`](../../src/EVAN.Front/src/pages/landing/film/facts.json) | Seule source des mots à l'écran. Le film n'ajoute aucun mot : il anime ceux que la page affiche déjà. |
| assets | Le produit en direct | `flexo.glb` du kit, la carte machine, les puces et les boutons réels, animés en place. Aucune capture d'écran figée. |
| style | « Atelier de nuit, précision d'imprimeur » | Voir la bible plus bas. |
| sound | Silencieux | Un navigateur bloque le son d'une page qui s'ouvre, et un outil ouvert au bureau ne fait pas de bruit. Le montage suit quand même une grille à 120 BPM (un temps = 30 images) : [`timing.json`](../../src/EVAN.Front/src/pages/landing/film/timing.json). |
| autonomy | Sans arrêt | Demande directe de Lucas, en mode automatique. |
| toolchain | Le code de l'accueil : React, React Three Fiber, CSS, une horloge unique | La page est le film et doit rester cliquable pendant qu'il joue. Ni GSAP ni Remotion : une dépendance de plus pour un seul écran. Relecture rendue image par image avec Playwright et ffmpeg ([`tests/e2e/film/`](../../tests/e2e/film/)). |
| sign-off | L'accueil au repos : titre, « Voir la démo », les puces | Pas d'adresse à l'écran : outil interne, elle est déjà dans la barre du navigateur. |

## Quand le film joue

Une fois par navigateur et par version du film (`localStorage`, clé `evan.accueil.film.v8`) : un outil qu'on rouvre
chaque matin ne rejoue pas sa panne de démonstration à l'équipe de maintenance. Il ne joue pas si les animations sont
réduites (système ou réglage d'EVAN). Un clic, une touche, la molette ou un toucher le termine aussitôt : la page se
pose et l'action demandée se fait. `?film=1` force la lecture, `?film=0` l'empêche, `?film=capture` sert à la
relecture image par image.

La presse 3D se charge pendant que le titre est à l'écran. Sa première image (analyse du modèle, compilation des
shaders) bloque le navigateur un instant : tant qu'elle n'est pas dessinée, le film respire sur son affiche, quatre
fois plus lentement, sans révéler la deuxième ligne. Au bout de 3 s il repart quand même et attend la presse sur
l'image 40, le point prêt à partir. Au bout de 6 s d'attente, il abandonne : la page se pose sans lui.

## Références étudiées

Aucune référence n'était fournie. Principes retenus des intros de pages produit qui tiennent la comparaison (pages
produit d'Apple, sites de Linear et Stripe), sans rien en reprendre :

- un premier plan qui est déjà une affiche ;
- le produit réel en mouvement, jamais une illustration ;
- une seule idée qui se transforme, au lieu d'une suite d'effets ;
- la fin du film est l'interface, utilisable tout de suite.

## Concept

Trois pistes ont été écrites.

**A. « Le point final ».** Le titre dit « Jusqu'au dernier rouleau. » Son point, vert comme celui du logo, quitte la
phrase et se pose sur le moyeu du dernier rouleau de la presse, celui du rembobineur : la presse s'allume et démarre.
Quand la dorure à froid casse son film, le point rougit, court le long de la bande jusqu'à la pièce ; la presse
s'assombrit et seule la pièce reste allumée. L'étiquette de l'alarme naît au-dessus de la pièce, dit quoi vérifier,
et le bouton qui raconte la panne en détail s'allume. La presse repart, la lumière rentre dans la phrase.

**B. « La bande ».** La caméra suit la bande du dérouleur au rembobineur, chaque groupe imprime sa couleur. Écartée :
trois secondes de travelling avant de rien dire, et la page n'a pas de texte à porter pendant ce temps.

**C. « L'étiquette ».** La page s'imprime comme le ticket des puces. Écartée : elle met en avant l'imprimante, pas la
supervision.

**Retenue : A.** Elle tient en une phrase, elle est vraie (le rembobineur est l'organe 8 de la presse, la casse du
film de dorure est l'alarme CF-02 du kit) et elle se lit sans le son.

Les trois moments qu'on doit retenir :

1. Le point du titre se pose sur le dernier rouleau, et la presse démarre.
2. La presse s'arrête, la pièce en cause s'allume.
3. La panne s'allume dans le bouton qui la raconte.

L'objet qui porte le film est **le point d'état** : le point final du titre, le voyant de la presse, le repère posé sur
la pièce. Il est vert quand la presse tourne et passe au cramoisi sur le temps de la casse. Le logo, lui, ne bouge pas
: un logo rouge se lirait « EVAN est en panne ».

## Bible de style

Couleurs : celles des jetons, rien d'autre. Six au plus à l'écran :

| Rôle | Nuit | Jour |
|---|---|---|
| Fond | `--bg` #040812 | `--bg` #f4f3f1 |
| Texte | `--text` #eef2f8 | `--text` #15171c |
| Marche (point d'état) | `--ok` #2fd07f | `--ok` #0f7d4d |
| Panne | `--crit` #ff3d6e | `--crit` #c8194a |
| Action (rouge EVAN) | `--lp-rouge` | `--lp-rouge` |
| Braise (nuage, jauge) | `--accent-2` #ff7a3d | `--accent-2` #e2470f |

Polices : Onest pour tout le texte, JetBrains Mono pour les codes (CF-02). Locales, déjà chargées par la page.

Texture : le nuage de pixels existant, la seule matière de fond. Aucune particule ajoutée.

Vocabulaire de mouvement :

- Arrivée lente, sortie rapide. Aucune courbe linéaire.
- Un mouvement principal par plan, les autres le suivent avec un décalage d'un demi-temps.
- Ce qui vient vers la caméra grossit comme en perspective (1/z), pas à vitesse constante.
- La caméra recule et pousse en gardant son sujet sur les mêmes pixels : le rouleau pendant le recul, la dorure
  pendant la panne.
- Les coups (panne, reprise) tombent sur un temps. Les entrées secondaires sur un demi-temps.
- Un plan tenu respire : rotation de la presse, halo du point, jamais une image figée.

Les images de style sont rendues par le code de la page lui-même (`?film=capture`) : l'affiche (image 0), l'impact
(image 70), la pièce sous le projecteur (image 200). Voir [ledger.md](ledger.md).
