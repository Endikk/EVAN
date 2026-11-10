# Film d'ouverture de l'accueil : storyboard

60 images par seconde, grille à 120 BPM : un temps vaut 30 images (T0 = image 0, T11 = image 330). Toutes les valeurs
viennent de [`timing.json`](../../src/EVAN.Front/src/pages/landing/film/timing.json). Le film est muet : chaque plan
doit se comprendre sans le son.

Version 9 : 5,5 s. La page ouvre dans le noir, au ras de la presse. Une rampe de lumière parcourt la machine du
dérouleur au dernier rouleau, la caméra la suit de près, puis recule d'un seul mouvement jusqu'à la vue de repos
pendant que la page se pose autour. La panne des versions 8 et antérieures est retirée (historique dans
[ledger.md](ledger.md)).

| Images | À l'écran | Rôle | Temps fort | Ce qui passe au plan suivant |
|---|---|---|---|---|
| 0 à 210 | Noir. La caméra glisse au ras de la presse, de biais, sur une courbe qui passe par cinq poses : le dérouleur de près, les groupes d'impression et leurs encres, l'écran « IMPRESSION FLEXO », la découpe et son écran, le dernier rouleau presque de face. Une rampe de lumière chaude avance juste devant le regard : ce qu'elle a passé reste allumé, ce qu'elle n'a pas atteint reste fondu dans le fond. Les rouleaux prennent de la vitesse, les écrans comptent jusqu'à 150 m/min. | Montrer la machine en entier, de près, avant toute promesse. | T0, la rampe | Le dernier rouleau, seul dans la lumière. |
| 210 à 246 | Impact sur le moyeu du dernier rouleau : un point vert s'allume, une onde part de lui. | Le point de vie d'EVAN se pose sur la machine. | T7 (impact) | Le point vert. |
| 210 à 300 | Recul d'une seule courbe jusqu'à la vue de repos, le dernier rouleau épinglé à l'écran ; l'ombre au sol et le nuage de pixels arrivent. À 235, « Supervision d'usine » et « Toute votre usine. » montent ; à 255, « Jusqu'au dernier rouleau » ; le point vert quitte le moyeu en arc et devient le point final du titre (255 à 285). | Relier la machine à la phrase. | T8 | Le titre complet. |
| 270 à 330 | La phrase, les deux boutons, puis les trois vues de la presse. La page tient jusqu'à 330. | Rendre l'accueil habituel. | T11 (fin) | L'accueil, cliquable. |

## Ce qu'on doit pouvoir raconter sans le son

Une presse sort du noir, de proche en proche, sous une lumière qui la parcourt jusqu'au bout. Sur son dernier
rouleau, un point vert s'allume. On recule, on la voit entière, et ce point vert vient finir la phrase « Toute votre
usine. Jusqu'au dernier rouleau. »

## Téléphone (9:16)

Même découpage. Le travelling se lit dans la bande de la scène, au milieu de l'écran ; au recul, la mise en page
empilée se pose : le titre en haut, la presse au centre, les vues et les boutons en bas.
