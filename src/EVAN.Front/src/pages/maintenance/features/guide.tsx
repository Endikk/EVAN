/**
 * « Comment lire cet écran » pour le carnet de maintenance : un bloc par zone, dans l'ordre de l'écran, et trois
 * petits schémas animés pour les notions qui se comprennent mieux en image (temps entre deux pannes, barre d'un
 * entretien, tendance prolongée jusqu'au seuil).
 */
import { useId } from 'react';
import type { GuideEcran } from '@/ui/explain';

/** Une ligne du temps de marche : deux pannes, l'intervalle entre elles et le temps de réparation. */
function SchemaPannes() {
  return (
    <svg className="mt-schema mt-schema-pannes" viewBox="0 0 320 92" role="img" aria-label="La machine tourne, tombe en panne, est réparée, repart, puis retombe en panne.">
      <g className="sp-seg" style={{ ['--d' as string]: '0ms' }}>
        <rect x="8" y="38" width="118" height="14" rx="3" className="sp-marche" />
      </g>
      <g className="sp-seg" style={{ ['--d' as string]: '250ms' }}>
        <rect x="128" y="38" width="38" height="14" rx="3" className="sp-panne" />
      </g>
      <g className="sp-seg" style={{ ['--d' as string]: '500ms' }}>
        <rect x="168" y="38" width="118" height="14" rx="3" className="sp-marche" />
      </g>
      <g className="sp-seg" style={{ ['--d' as string]: '750ms' }}>
        <rect x="288" y="38" width="24" height="14" rx="3" className="sp-panne" />
      </g>
      <g className="sp-legende" style={{ ['--d' as string]: '1000ms' }}>
        <path d="M168 30v-8h118v8" className="sp-accolade" />
        <text x="227" y="15" textAnchor="middle">temps entre deux pannes</text>
      </g>
      <g className="sp-legende" style={{ ['--d' as string]: '1250ms' }}>
        <path d="M128 60v8h38v-8" className="sp-accolade" />
        <text x="147" y="84" textAnchor="middle">temps pour réparer</text>
      </g>
    </svg>
  );
}

/** La barre d'un entretien : consommée jusqu'au trait prévu, puis la part en retard au-delà, hachurée comme à l'écran. */
function SchemaBarre() {
  const hachures = `mt-hachures-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className="mt-schema mt-schema-barre" viewBox="0 0 320 70" role="img" aria-label="Une barre se remplit depuis le dernier passage jusqu'au trait prévu, puis dépasse : c'est le retard.">
      <defs>
        <pattern id={hachures} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="5" className="sb-hachure" />
        </pattern>
      </defs>
      <rect x="8" y="28" width="304" height="10" rx="3" className="sb-fond" />
      <rect x="8" y="28" width="240" height="10" rx="3" className="sb-fait" />
      <rect x="248" y="28" width="52" height="10" rx="2" className="sb-trop" fill={`url(#${hachures})`} />
      <path d="M248 20v26" className="sb-prevu" />
      <text x="8" y="62">dernier passage</text>
      <text x="248" y="14" textAnchor="middle">prévu</text>
      <text x="300" y="62" textAnchor="end">
        en retard
      </text>
    </svg>
  );
}

/** La mesure relevée qui baisse, la tendance prolongée qui se dessine jusqu'au seuil, et la date limite. */
function SchemaTendance() {
  // Le masque dévoile la tendance pointillée de gauche à droite, comme si elle se traçait.
  const masque = `mt-masque-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className="mt-schema mt-schema-tendance" viewBox="0 0 320 110" role="img" aria-label="La mesure baisse, sa tendance prolongée croise le seuil : c'est la date limite pour intervenir.">
      <path d="M8 76h304" className="st-seuil" />
      <text x="312" y="94" textAnchor="end">
        seuil
      </text>
      <path d="M8 22l10 3 8-4 10 6 9-2 9 5 10-1 8 5 10 1 9 4 8-1 10 5 9 2" className="st-mesure" />
      <defs>
        <mask id={masque}>
          <path d="M126 46L232 76" className="st-masque" pathLength={1} />
        </mask>
      </defs>
      <path d="M126 46L232 76" className="st-projection" mask={`url(#${masque})`} />
      <circle cx="232" cy="76" r="5" className="st-point" />
      <path d="M126 10v90" className="st-auj" />
      <text x="130" y="104">aujourd’hui</text>
      <text x="236" y="66" className="st-texte-point">
        date limite
      </text>
    </svg>
  );
}

export const GUIDE_MAINTENANCE: GuideEcran = {
  id: 'maintenance',
  titre: 'Carnet de maintenance',
  resume:
    'Cet écran répond à une question : quel entretien faire en premier ? Il range les tâches du plan par urgence et prévient quand une mesure glisse vers sa limite. Plus bas, le journal garde la trace de ce qui a été fait sur les machines.',
  blocs: [
    {
      titre: 'La phrase du haut',
      cible: 'verdict',
      texte: (
        <p>
          Elle dit s’il y a des entretiens en retard et lequel faire d’abord. Elle se recalcule dès qu’un entretien est consigné. Le triangle devant la phrase signale
          un retard de quelques jours ; le carré, plus d’une semaine.
        </p>
      ),
    },
    {
      titre: 'Les chiffres du haut',
      cible: 'reperes',
      schema: <SchemaPannes />,
      texte: (
        <>
          <p>Le grand chiffre, à gauche, compte les entretiens à faire d’ici sept jours, dont ceux déjà en retard. Un clic mène à la liste.</p>
          <p>
            À côté, deux chiffres disent comment se portent les machines : combien de temps elles tournent en moyenne entre deux pannes (plus c’est long, mieux
            c’est), et combien de temps il faut pour les remettre en route (plus c’est court, mieux c’est).
          </p>
          <p>
            Les autres chiffres, comme le délai de réponse aux alarmes ou la part de l’entretien, sont sur la ligne juste en dessous. Un clic sur le nom de
            chaque chiffre dit ce qu’il compte et comment il est calculé.
          </p>
        </>
      ),
    },
    {
      titre: 'Consigner une intervention',
      cible: 'consigner',
      texte: (
        <p>
          Après un entretien, une réparation ou un simple constat, notez-le ici. Une tâche du plan consignée repart de zéro : sa barre se vide et sa prochaine date
          se recalcule. Un avis laisse ensuite dix secondes pour annuler.
        </p>
      ),
    },
    {
      titre: 'À faire',
      cible: 'a-faire',
      schema: <SchemaBarre />,
      texte: (
        <>
          <p>
            Chaque ligne dit quoi faire, où (le numéro de la machine, puis l’organe), quand, et combien de temps la machine sera arrêtée. En retard d’abord,
            puis cette semaine ; le reste du mois est replié. Chaque rang additionne ses temps d’arrêt. Une mesure qui dérive avance la date de la tâche de son
            organe, et une intervention planifiée se range à son jour.
          </p>
          <p>
            La barre compte l’usure depuis le dernier passage, en heures de marche ou en jours. Le trait marque l’échéance : quand la barre le dépasse, la part
            en trop, hachurée, est le retard. Par exemple, les lampes UV d’une presse flexo se changent toutes les 1 500 heures de marche.
          </p>
          <p>
            Un clic sur la ligne ouvre le détail de la tâche : le compteur chiffré, son rythme, ce qui peut lâcher sur l’organe, les pannes et passages récents.
            On peut l’y planifier. Une intervention planifiée se consigne d’un clic le jour venu, se déplace ou s’annule.
          </p>
        </>
      ),
    },
    {
      titre: 'Maintenance prévisionnelle',
      cible: 'prevision',
      schema: <SchemaTendance />,
      texte: (
        <>
          <p>
            EVAN suit certaines mesures, comme la puissance des lampes UV, et repère celles qui glissent lentement vers leur limite. Il prolonge la tendance en
            pointillés jusqu’au seuil : le point où elles se croisent est la date avant laquelle intervenir, avant la panne.
          </p>
          <p>Le « ? » de chaque dérive donne son rythme par jour, sa valeur actuelle, son seuil et l’organe concerné.</p>
          <p>
            « Planifier l’intervention » choisit le jour où intervenir : elle rejoint « À faire » à sa date, rattachée à la tâche du plan sur le même organe,
            et n’entre au journal qu’une fois faite et consignée.
          </p>
        </>
      ),
    },
    {
      titre: 'Par machine',
      cible: 'par-machine',
      texte: (
        <p>
          Les machines une par une, avec ce qui est en retard et ce qui est à faire cette semaine. Un clic sur une machine filtre tout l’écran sur elle : son plan
          complet, sur toute la largeur, son prochain entretien, ses pannes et son temps entre deux pannes.
        </p>
      ),
    },
    {
      titre: 'Journal des interventions',
      cible: 'journal',
      texte: (
        <>
          <p>
            Tout ce qui a été fait sur les machines, jour par jour, une ligne par intervention. Les réparations après panne y entrent seules ; les entretiens et
            observations, quand quelqu’un les consigne. Les filtres comptent chaque type.
          </p>
          <p>
            Un clic sur une ligne déplie l’organe, l’intervenant et ce qui a été fait. Une intervention consignée à l’écran s’y corrige ou s’y supprime.
            « Revoir » rejoue la panne en 3D : la mesure qui dérape, l’alarme, la réparation, le redémarrage.
          </p>
        </>
      ),
    },
    {
      titre: 'Défaut répétitif',
      cible: 'defaut-repetitif',
      texte: (
        <p>
          Une tache ou un défaut de découpe qui revient à intervalle régulier sur la bande vient d’une pièce qui tourne, un cylindre ou un rouleau. Mesurez
          l’écart entre deux défauts : EVAN cherche la pièce dont un tour fait cette longueur et la montre dans la machine en 3D.
        </p>
      ),
    },
  ],
  termes: ['mtbf', 'mttr', 'acquittement', 'preventif', 'curatif', 'organe', 'previsionnel', 'derive', 'seuil', 'defautRepetitif'],
};
