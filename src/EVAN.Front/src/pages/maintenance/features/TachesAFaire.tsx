/**
 * « À faire » : les entretiens du plan rangés par urgence. Ce qui est en retard d'abord, puis la semaine ; le reste du
 * mois reste replié. Le sens de chaque rang est dans son « ? ».
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Echeance } from '@/analytics/maintenance';
import type { Machine } from '@/domain/types';
import { InfoTip } from '@/ui/InfoTip';
import { Details, TonGlyph } from '@/ui/explain';
import { URGENCE_TITRE, tonEcheance, type Urgence } from '../lib/carnet';
import { TacheLigne } from './TacheLigne';

const URGENCE_AIDE: Record<Urgence, string> = {
  retard: 'La date prévue est passée : à faire en premier.',
  semaine: 'À faire dans les sept prochains jours.',
  'plus-tard': 'Dans le mois : rien ne presse, mais on peut déjà prévoir.',
};

interface Props {
  groupes: Record<Urgence, Echeance[]>;
  byId: Map<string, Machine>;
  now: number;
  avecMachine: boolean;
  onOuvrir(e: Echeance, bouton: HTMLButtonElement): void;
}

/** Au-delà, la semaine se replie : les premiers entretiens suffisent pour s'organiser. Le retard reste toujours entier. */
const VISIBLES_SEMAINE = 5;

function Groupe({ u, liste, ...ligne }: { u: Urgence; liste: Echeance[] } & Omit<Props, 'groupes'>) {
  const [tout, setTout] = useState(false);
  const limite = u === 'semaine' && !tout ? VISIBLES_SEMAINE : liste.length;
  const caches = liste.length - limite;
  return (
    <>
      <ul className="mt-taches" aria-label={URGENCE_TITRE[u]}>
        {liste.slice(0, limite).map((e) => (
          <TacheLigne key={e.id} e={e} urgence={u} machine={ligne.byId.get(e.machineId)} now={ligne.now} avecMachine={ligne.avecMachine} onOuvrir={ligne.onOuvrir} />
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

function TeteGroupe({ u, n }: { u: Urgence; n: number }) {
  const ton = tonEcheance(u);
  return (
    <h4 className={`mt-groupe-tete ton-${ton}`}>
      <TonGlyph ton={ton} />
      {URGENCE_TITRE[u]}
      <span className="mt-compte num">{n}</span>
      <InfoTip label={`Comprendre : ${URGENCE_TITRE[u]}`}>
        <p>{URGENCE_AIDE[u]}</p>
      </InfoTip>
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
          <span className="muted">Toutes les tâches du plan sont à jour.</span>
        </div>
      )}
      {(['retard', 'semaine'] as const).map((u) =>
        groupes[u].length ? (
          <section key={u} className={`mt-groupe u-${u}`}>
            <TeteGroupe u={u} n={groupes[u].length} />
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
