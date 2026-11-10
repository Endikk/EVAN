/**
 * « Comment lire cet écran » pour l'historique : un bloc par zone, dans l'ordre de l'écran, et un petit schéma
 * animé de l'efficacité (TRS). Le schéma reprend les vraies proportions de la période (temps de marche, vitesse,
 * bonnes étiquettes) : la barre du temps d'ouverture se découpe sous les yeux du lecteur.
 */
import type { CSSProperties } from 'react';
import type { GuideEcran } from '@/ui/explain';
import { pourcent } from '../lib/phrases';

interface Parts {
  D?: number;
  P?: number;
  Q?: number;
}

/** La barre du temps d'ouverture, rognée à chaque étape : arrêts, lenteur, étiquettes jetées. Reste l'efficacité. */
export function SchemaTrs({ D, P, Q }: Parts) {
  if (D === undefined || P === undefined || Q === undefined) return null;
  const etapes = [
    { texte: 'Le temps où l’atelier est ouvert', part: 1, perte: undefined },
    { texte: 'Moins les arrêts', part: D, perte: 'pannes, réglages' },
    { texte: 'Moins la lenteur', part: D * P, perte: 'la machine tourne moins vite' },
    { texte: 'Moins les étiquettes jetées', part: D * P * Q, perte: 'défaut, fin de bobine' },
  ];
  return (
    <figure className="schema-trs" aria-label={`Sur la période, il reste ${pourcent(D * P * Q)} du temps d’ouverture une fois retirés les arrêts, la lenteur et les étiquettes jetées.`}>
      {etapes.map((e, i) => (
        <div key={e.texte} className={`st-ligne ${i === etapes.length - 1 ? 'st-fin' : ''}`} style={{ '--i': i } as CSSProperties}>
          <div className="st-textes">
            <span>{e.texte}</span>
            {e.perte && <small>{e.perte}</small>}
          </div>
          <div className="st-piste" aria-hidden>
            {i > 0 && <i className="st-avant" style={{ width: `${etapes[i - 1].part * 100}%` }} />}
            <i className="st-barre" style={{ '--de': i > 0 ? etapes[i - 1].part : 1, '--a': e.part } as CSSProperties} />
          </div>
        </div>
      ))}
      <figcaption>
        Ce qui reste, c’est l’efficacité : <b>{pourcent(D * P * Q)}</b> sur la période.
      </figcaption>
    </figure>
  );
}

export function guideHistorique(parts: Parts): GuideEcran {
  return {
    id: 'historique',
    titre: 'L’historique de l’atelier',
    resume:
      'Cet écran raconte les jours passés : où le temps s’est perdu et quelles alarmes se sont déclenchées. Lisez d’abord la phrase du haut, puis descendez bloc par bloc.',
    blocs: [
      {
        titre: 'La phrase du haut',
        cible: 'verdict',
        texte: 'Elle résume la période choisie : la part du temps où les machines ont vraiment produit, puis la machine qui s’arrête le plus. Elle change dès que vous changez la période ou la machine.',
      },
      {
        titre: 'Période et machine',
        cible: 'filtres',
        texte: 'Choisissez 24 heures ou 7 jours, et une machine si vous voulez ne regarder qu’elle. Tout l’écran suit ce choix. Cliquer une barre ou une machine sur la carte fait la même chose.',
      },
      {
        titre: 'Efficacité des machines',
        cible: 'rep-trs',
        schema: <SchemaTrs {...parts} />,
        texte: (
          <>
            <p>
              Partez du temps où l’atelier est ouvert. Retirez les arrêts (une panne, un changement de clichés), puis le temps perdu quand la machine tourne moins vite que
              prévu, puis les étiquettes jetées. Ce qui reste, c’est le temps vraiment utile : l’efficacité, qu’on appelle TRS.
            </p>
            <p>85 % est un repère souvent cité pour les usines les plus performantes. La jauge le marque d’un trait.</p>
          </>
        ),
      },
      {
        titre: 'Temps perdu en pannes',
        cible: 'rep-panne',
        texte: 'Le total des arrêts non prévus, comme une casse de bande ou un outil de découpe usé. Les réglages ne comptent pas ici.',
      },
      {
        titre: 'Temps pour réparer',
        cible: 'rep-mttr',
        texte: 'Le temps moyen entre l’alarme et la remise en route. S’il monte, regardez si les pièces et les bonnes personnes sont disponibles au bon moment.',
      },
      {
        titre: 'Les autres chiffres',
        cible: 'autres-chiffres',
        texte: 'Disponibilité, vitesse et bonnes étiquettes sont les trois parts de l’efficacité. Suivent le temps passé en réglages, les alarmes critiques, le délai avant qu’une alarme soit prise en charge et le nombre de machines comptées. Le « ? » de chacun dit ce qu’il mesure.',
      },
      {
        titre: 'Temps d’arrêt par machine',
        cible: 'arrets-machines',
        texte: 'Une barre par machine, de la plus arrêtée à la moins arrêtée. La partie pleine, ce sont les pannes. La partie hachurée, ce sont les réglages (calage) : changer de clichés ou d’encres avant une nouvelle série. Cliquez une machine pour ne regarder qu’elle dans tout l’écran, cliquez-la de nouveau pour revenir à l’atelier.',
      },
      {
        titre: 'Carte des arrêts',
        cible: 'carte',
        texte: 'Le plan de l’atelier vu de dessus. Plus une machine est rouge foncé, plus elle a passé de temps en panne. Le chiffre sous chaque machine donne ces heures.',
      },
      {
        titre: 'Pannes par organe',
        cible: 'organes',
        texte: 'Quelle partie de la machine tombe le plus en panne, le séchage UV ou la découpe par exemple. C’est là qu’un entretien fait avant la panne rapporte le plus.',
      },
      {
        titre: 'Les pannes qui reviennent',
        cible: 'recurrentes',
        texte: 'Chaque barre est une panne précise sur une machine, comptée en nombre de fois ou en temps perdu. Une panne qui revient souvent est le signe d’une cause qui n’a pas été réglée : c’est par elle qu’il faut commencer.',
      },
      {
        titre: 'Efficacité, machine par machine',
        cible: 'trs-machines',
        texte: 'La même efficacité que plus haut, calculée pour chaque machine. Le trait pointillé marque le repère de 85 %. Survolez une barre pour voir ce qui la fait baisser.',
      },
      {
        titre: 'Efficacité, jour par jour',
        cible: 'trs-jours',
        texte: 'La courbe orange, la plus épaisse, est l’efficacité. Les trois autres disent d’où viennent les pertes : temps de marche, vitesse, bonnes étiquettes. La plus basse montre ce qui coûte le plus.',
      },
      {
        titre: 'Courbe de mesure',
        cible: 'courbe',
        texte: (
          <>
            <p>Une mesure relevée en continu sur un organe, par exemple la tension de bande au rembobineur.</p>
            <p>
              La bande grise est la plage normale : tant que la courbe y reste, tout va bien. La ligne rouge est la limite d’alarme. Les petits carrés rouges en haut
              marquent les alarmes levées sur cette mesure. Les creux viennent souvent des arrêts de la machine, la nuit ou le dimanche.
            </p>
          </>
        ),
      },
      {
        titre: 'Alarmes critiques par jour',
        cible: 'alarmes-jour',
        texte: 'Combien d’alarmes critiques chaque jour. Une alarme critique arrête la machine. Un jour qui dépasse nettement les autres mérite un coup d’œil au journal juste en dessous.',
      },
      {
        titre: 'Journal des alarmes',
        cible: 'journal',
        texte: (
          <>
            <p>Toutes les alarmes, de la plus récente à la plus ancienne, avec leur durée. Le carré marque une alarme critique, le triangle une alarme d’attention.</p>
            <p>
              Une alarme résolue reste grise. Celles qui ne sont pas réglées portent un mot en couleur : « Pas prise en charge » ou « Prise en charge ». Cliquez une alarme
              pour savoir ce qui s’est passé, sur quel organe et quoi vérifier. Le bouton d’export donne un fichier à ouvrir dans un tableur.
            </p>
          </>
        ),
      },
    ],
    termes: ['trs', 'disponibilite', 'performance', 'qualite', 'mttr', 'calage', 'organe', 'pointMesure', 'seuil', 'defautRepetitif', 'acquittement'],
  };
}
