/**
 * Temps 1 : la langue que parle l'automate. Une pastille par protocole, son nom en vue ; ce qu'il sait faire est dans
 * son « ? ». Les pastilles se comportent en boutons (sans en être), pour que leur « ? » n'y soit pas imbriqué.
 */
import type { KeyboardEvent } from 'react';
import type { Protocole } from '@/domain/types';
import { InfoTip } from '@/ui/InfoTip';
import { PROTOCOLES } from '../lib/protocoles';

export function ChoixProtocole({ choisi, choisir }: { choisi: Protocole; choisir: (p: Protocole) => void }) {
  const auClavier = (e: KeyboardEvent, p: Protocole) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    choisir(p);
  };
  return (
    <div className="cx-pas">
      <div className="cx-protos" role="group" aria-label="Protocoles">
        {PROTOCOLES.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            className="cx-proto"
            aria-pressed={choisi === p.id}
            onClick={() => choisir(p.id)}
            onKeyDown={(e) => auClavier(e, p.id)}
          >
            <span className="cx-proto-rond" aria-hidden />
            <span className="cx-proto-nom">
              <b>{p.nom}</b>
              <InfoTip label={`Comprendre : ${p.nom}`}>
                <p>{p.phrase}</p>
              </InfoTip>
              {p.conseille && <span className="chip">Conseillé</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
