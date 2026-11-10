import { AlertOctagon, AlertTriangle, CheckCircle2, Info, LocateFixed, X } from 'lucide-react';
import { useLive, type Toast } from '@/store/live';
import { focusAlarm } from './navigation';

/**
 * Ce qui vient de se passer, dit avant le détail : le titre d'un avis est souvent technique (« EM-01 · R04 Gallus »),
 * cette ligne le traduit selon sa gravité.
 */
const QUOI: Record<Toast['gravite'], { mot: string; alarme?: string; icone: typeof Info }> = {
  critique: { mot: 'Problème', alarme: 'Panne détectée', icone: AlertOctagon },
  attention: { mot: 'À surveiller', alarme: 'Mesure hors de sa plage', icone: AlertTriangle },
  succes: { mot: 'C’est fait', icone: CheckCircle2 },
  info: { mot: 'Pour information', icone: Info },
};

/** Temps d'affichage d'un avis (miroir de store/live.ts) : le trait du bas se vide pendant ce temps. */
const DUREE_S: Record<Toast['gravite'], number> = { critique: 12, attention: 6, succes: 6, info: 6 };

export function Toasts() {
  const toasts = useLive((s) => s.toasts);
  const dismiss = useLive((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="assertive" role="status">
      {toasts.map((t) => {
        const q = QUOI[t.gravite];
        const Icone = q.icone;
        return (
          <div key={t.id} className={`toast ${t.gravite}`}>
            <span className="toast-icone" aria-hidden>
              <Icone />
            </span>
            <div>
              <span className="toast-quoi">{t.alarmeId && q.alarme ? q.alarme : q.mot}</span>
              <b>{t.titre}</b>
              {t.texte && <p>{t.texte}</p>}
              {t.alarmeId && (
                <button
                  className="btn sm"
                  onClick={() => {
                    focusAlarm(t.alarmeId!);
                    dismiss(t.id);
                  }}
                  title="Amène la vue 3D jusqu’à la pièce de la machine qui a déclenché l’alarme"
                >
                  <LocateFixed aria-hidden /> Voir la pièce en cause
                </button>
              )}
            </div>
            <button className="btn sm icon ghost" onClick={() => dismiss(t.id)} aria-label="Fermer cet avis" title="Fermer">
              <X />
            </button>
            <i className="toast-temps" aria-hidden style={{ ['--duree' as string]: `${DUREE_S[t.gravite]}s` }} />
          </div>
        );
      })}
    </div>
  );
}
