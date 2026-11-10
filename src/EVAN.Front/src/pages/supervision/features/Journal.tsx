/**
 * Onglet « Journal » : ce qui s'est passé depuis l'ouverture de la page, du plus récent au plus ancien, en phrases
 * au passé avec leur sujet en tête (la machine, la personne ou EVAN). Une icône dit de quel genre d'événement il s'agit.
 */
import { BellRing, Cog, Info, Plug, UserRound } from 'lucide-react';
import type { Alarme, Evenement, TypeEvenement } from '@/domain/types';
import { fmtHM } from '@/ui/format';
import { ligneJournal } from '../lib/journal';

const NB_MAX = 40;

const GENRE: Record<TypeEvenement, { icone: typeof Info; mot: string }> = {
  alarme: { icone: BellRing, mot: 'Alarme' },
  etat: { icone: Cog, mot: 'Machine' },
  action: { icone: UserRound, mot: 'Action' },
  connexion: { icone: Plug, mot: 'Connexion' },
  systeme: { icone: Info, mot: 'EVAN' },
};

/** Gravité de l'alarme levée par un événement : même machine, même instant. */
function graviteDe(e: Evenement, alarmes: Alarme[]) {
  if (e.type !== 'alarme') return undefined;
  return alarmes.find((a) => a.machineId === e.machineId && a.horodatage === e.horodatage)?.gravite;
}

export function Journal({ evenements, alarmes }: { evenements: Evenement[]; alarmes: Alarme[] }) {
  if (!evenements.length) {
    return <p className="sv-vide faint">Rien pour l’instant. Alarmes et changements d’état s’inscriront ici.</p>;
  }
  return (
    <ol className="sv-journal" aria-label="Ce qui s’est passé, du plus récent au plus ancien">
      {evenements.slice(0, NB_MAX).map((e) => {
        const g = GENRE[e.type];
        const l = ligneJournal(e, graviteDe(e, alarmes));
        return (
          <li key={e.id} className={`sv-ev ${e.type}`}>
            <time dateTime={new Date(e.horodatage).toISOString()}>{fmtHM(e.horodatage)}</time>
            <span className="sv-ev-icone" title={g.mot}>
              <g.icone aria-hidden />
              <span className="sr-only">{g.mot} :</span>
            </span>
            <p>
              {l.sujet && <b>{l.sujet} </b>}
              {l.texte}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
