/**
 * Onglet « Alarmes » : une ligne compacte par alarme, la plus urgente en haut. La gravité se lit par la forme (carré :
 * panne, triangle : à surveiller), le quoi en gras, le où et le code dessous, depuis quand à droite, et ce qu'il faut
 * faire en une ligne, parce que c'est ce qui sert à agir. Sans alarme : une forme, un titre, une ligne ; ce que ferait
 * EVAN si une mesure sortait de sa limite est dans le « ? ».
 */
import type { ReactNode } from 'react';
import { Activity, ArrowRight, ChevronRight, Hand } from 'lucide-react';
import type { Alarme } from '@/domain/types';
import { useProject } from '@/store/project';
import { useLive } from '@/store/live';
import { StatusIcon } from '@/ui/status';
import { InfoTip } from '@/ui/InfoTip';
import { fmtDuration } from '@/ui/format';
import { focusAlarm } from '@/widgets/shell/navigation';
import { lieuAlarme } from '../lib/lieu';

/** Que faire, en une ligne : l'étape qui vient. */
function aFaire(a: Alarme): string {
  if (a.statut === 'acquittee') return 'Réparer, puis signaler la fin';
  return a.gravite === 'critique' ? 'Prendre en charge, puis aller voir l’organe' : 'Prendre en charge, vérifier avant la panne';
}

/** État sans alarme : une forme, un titre et son « ? », une ligne. */
function Vide({ forme, titre, ligne, aide }: { forme: ReactNode; titre: string; ligne: string; aide?: ReactNode }) {
  return (
    <div className="sv-calme entree">
      {forme}
      <b className="sv-calme-titre">
        {titre}
        {aide && <InfoTip label={`Comprendre : ${titre}`}>{aide}</InfoTip>}
      </b>
      <p>{ligne}</p>
    </div>
  );
}

const COCHE = (
  <svg className="sv-calme-coche" viewBox="0 0 40 40" width="40" height="40" aria-hidden>
    <circle cx="20" cy="20" r="17" />
    <path d="M12.5 20.5 18 26l10-11" />
  </svg>
);

/** `enSuivi` : une mesure se dérègle et la détection est en cours, l'alarme n'est pas encore levée. */
export function Alarmes({ alarmes, enSuivi = false }: { alarmes: Alarme[]; enSuivi?: boolean }) {
  const machines = useProject((s) => s.machines);
  const perso = useProject((s) => s.perso);
  // « 3 min » avance avec l'horloge du flux temps réel.
  useLive((s) => s.tick);
  const now = Date.now();

  if (!alarmes.length && enSuivi) {
    return (
      <Vide
        forme={
          <span className="sv-calme-suivi" aria-hidden>
            <Activity />
          </span>
        }
        titre="Pas encore d’alarme"
        ligne="EVAN suit la mesure ci-dessus."
        aide={<p>Si la mesure franchit sa limite, l’alarme apparaîtra ici.</p>}
      />
    );
  }
  if (!alarmes.length) {
    return (
      <Vide
        forme={COCHE}
        titre="Rien à signaler"
        ligne="Toutes les mesures sont dans leurs limites."
        aide={
          <>
            <p>Si une mesure sort de sa limite, EVAN déclenche une alarme : la machine passe en rouge, la caméra plonge vers la pièce en cause et une fiche dit quoi faire.</p>
            <p>Pour le voir : « Simuler une panne », en haut à droite.</p>
          </>
        }
      />
    );
  }
  return (
    <ul className="sv-alarmes" aria-label="Alarmes à traiter, la plus urgente en haut">
      {alarmes.map((a) => {
        const crit = a.gravite === 'critique';
        const prise = a.statut === 'acquittee';
        const l = lieuAlarme(a, machines, perso);
        const gravite = crit ? 'Panne' : 'À surveiller';
        const Icone = prise ? Hand : ArrowRight;
        return (
          <li key={a.id}>
            <button className={`sv-alarme ${crit ? 'crit' : 'warn'} ${prise ? 'prise' : ''}`} onClick={() => focusAlarm(a.id)}>
              <span className={`sv-alarme-forme st st-${crit ? 'panne' : 'attention'}`} title={gravite}>
                <StatusIcon etat={crit ? 'panne' : 'attention'} size={12} animate={crit && a.statut === 'active'} />
              </span>
              <span className="sr-only">{gravite} :</span>
              <b className="sv-alarme-quoi">{a.message}</b>
              <span className="sv-alarme-depuis num" title={`Depuis ${fmtDuration(now - a.horodatage)}`}>
                <span className="sr-only">depuis </span>
                {fmtDuration(now - a.horodatage)}
              </span>
              <span className="sv-alarme-ou">
                <span className="truncate">
                  <b>{l.numero}</b> {l.machine?.nom}
                  {l.organe ? ` · ${l.organe}` : ''}
                </span>
                <span className="sv-alarme-code mono">{a.code}</span>
              </span>
              <span className="sv-alarme-faire" title={prise && a.acquitteePar ? `Prise en charge par ${a.acquitteePar}` : undefined}>
                <Icone aria-hidden />
                {prise && <span className="sr-only">Prise en charge{a.acquitteePar ? ` par ${a.acquitteePar}` : ''}. </span>}
                <span className="truncate">{aFaire(a)}</span>
              </span>
              <ChevronRight className="sv-alarme-voir" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
