/**
 * « À faire » : les entretiens du plan, les interventions planifiées et les dérives à traiter, rangés par urgence. Ce
 * qui est en retard d'abord, puis la semaine ; le reste du mois reste replié. Chaque rang dit combien de temps les
 * machines seront arrêtées pour le faire. Le sens de chaque rang est dans son « ? ».
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Machine } from '@/domain/types';
import { InfoTip } from '@/ui/InfoTip';
import { Details, TonGlyph } from '@/ui/explain';
import { dureeTotale, fmtArret, URGENCE_TITRE, tonEcheance, type LigneAFaire, type Urgence } from '../lib/carnet';
import { TacheLigne } from './TacheLigne';

const URGENCE_AIDE: Record<Urgence, string> = {
  retard: 'La date prévue est passée : à faire en premier.',
  semaine: 'À faire dans les sept prochains jours, interventions prévues et mesures qui dérivent comprises.',
  'plus-tard': 'Dans le mois : rien ne presse, mais on peut déjà prévoir.',
};

interface Props {
  groupes: Record<Urgence, LigneAFaire[]>;
  byId: Map<string, Machine>;
  now: number;
  avecMachine: boolean;
  onOuvrir(l: LigneAFaire, bouton: HTMLButtonElement): void;
}

/** Au-delà, la semaine se replie : les premiers entretiens suffisent pour s'organiser. Le retard reste toujours entier. */
const VISIBLES_SEMAINE = 5;

function Groupe({ u, liste, ...ligne }: { u: Urgence; liste: LigneAFaire[] } & Omit<Props, 'groupes'>) {
  const [tout, setTout] = useState(false);
  const limite = u === 'semaine' && !tout ? VISIBLES_SEMAINE : liste.length;
  const caches = liste.length - limite;
  return (
    <>
      <ul className="mt-taches" aria-label={URGENCE_TITRE[u]}>
        {liste.slice(0, limite).map((l) => (
          <TacheLigne key={l.id} l={l} machine={ligne.byId.get(l.machineId)} now={ligne.now} avecMachine={ligne.avecMachine} onOuvrir={ligne.onOuvrir} />
        ))}
      </ul>
      {(caches > 0 || tout) && (
        <button type="button" className="btn sm ghost mt-voir-plus" aria-expanded={tout} onClick={() => setTout((v) => !v)}>
          <ChevronDown aria-hidden />
          {tout ? 'Replier' : `Voir les ${caches} autres`}
        </button>
      )}
    </>
  );
}

/** Temps d'arrêt d'un rang, en clair : ce qu'il faudra arrêter de machines pour tout faire. */
function Arret({ liste }: { liste: LigneAFaire[] }) {
  return <span className="mt-groupe-arret num">{fmtArret(dureeTotale(liste))} d’arrêt</span>;
}

function TeteGroupe({ u, liste }: { u: Urgence; liste: LigneAFaire[] }) {
  const ton = tonEcheance(u);
  return (
    <h4 className={`mt-groupe-tete ton-${ton}`}>
      <TonGlyph ton={ton} />
      {/* Le nom du rang ouvre son explication : pas de « ? » de plus sur une tête de liste. */}
      <InfoTip texte={URGENCE_TITRE[u]} label={`Comprendre : ${URGENCE_TITRE[u]}`}>
        <p>{URGENCE_AIDE[u]}</p>
      </InfoTip>
      <span className="mt-compte num">{liste.length}</span>
      <Arret liste={liste} />
    </h4>
  );
}

export function TachesAFaire({ groupes, ...ligne }: Props) {
  const plusTard = groupes['plus-tard'];
  const vide = !groupes.retard.length && !groupes.semaine.length;
  return (
    <div className="mt-afaire">
      {vide && (
        <div className="empty">
          <b>Rien à faire cette semaine</b>
          <span className="muted">Toutes les tâches du plan sont à jour, aucune intervention n’est prévue.</span>
        </div>
      )}
      {(['retard', 'semaine'] as const).map((u) =>
        groupes[u].length ? (
          <section key={u} className={`mt-groupe u-${u}`}>
            <TeteGroupe u={u} liste={groupes[u]} />
            <Groupe u={u} liste={groupes[u]} {...ligne} />
          </section>
        ) : null,
      )}
      {plusTard.length > 0 && (
        <Details
          className="mt-plus-tard"
          titre={
            <>
              Plus tard <span className="mt-compte num">{plusTard.length}</span>
              <Arret liste={plusTard} />
            </>
          }
          apercu="Dans le mois, rien ne presse"
        >
          <Groupe u="plus-tard" liste={plusTard} {...ligne} />
        </Details>
      )}
    </div>
  );
}
