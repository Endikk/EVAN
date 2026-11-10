import { useEffect, useRef } from 'react';
import { Lock, LockOpen, ShieldCheck, X } from 'lucide-react';
import { useUi } from '@/store/ui';
import { unlockConfiguration } from './navigation';
import { CONFIG_STEPS } from './steps';

/**
 * Accès à la configuration : une fois l'usine paramétrée, le plan, les machines et les connexions ne se modifient
 * plus par mégarde. La fenêtre dit ce qu'on s'apprête à faire (les cinq étapes, celle où l'on arrive), pourquoi c'est
 * protégé, et comment revenir. L'ouverture est inscrite au journal.
 */
export function AccessDialog() {
  const request = useUi((s) => s.accessRequest);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request === null) return;
    // Sans défilement : sur téléphone, la fenêtre s'ouvre par son titre, pas par le bouton du bas.
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useUi.getState().setAccessRequest(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request]);

  if (request === null) return null;
  const fermer = () => useUi.getState().setAccessRequest(null);
  const cible = CONFIG_STEPS.find((s) => s.n === request) ?? CONFIG_STEPS[0];
  return (
    <div className="modal-backdrop" onMouseDown={fermer}>
      <div className="modal acces" role="dialog" aria-modal="true" aria-labelledby="access-title" aria-describedby="access-texte" onMouseDown={(e) => e.stopPropagation()}>
        <button className="btn sm icon ghost modal-close" onClick={fermer} aria-label="Fermer et rester en supervision" title="Fermer (Échap)">
          <X />
        </button>
        <span className="modal-icon" aria-hidden>
          <Lock />
        </span>
        <h2 id="access-title">Modifier la configuration de l’usine ?</h2>
        <p id="access-texte" className="acces-texte">
          Vous allez changer la façon dont EVAN voit l’usine : où elle se trouve, son plan, ses machines et leurs branchements. Vous arriverez sur l’étape{' '}
          <b>
            {cible.n}. {cible.titre}
          </b>
          .
        </p>

        <ol className="acces-etapes" aria-label="Les cinq étapes de la configuration">
          {CONFIG_STEPS.map((s, i) => {
            const Icone = s.icon;
            const ici = s.n === cible.n;
            return (
              <li key={s.n} className={ici ? 'ici' : ''} style={{ ['--i' as string]: i }} aria-current={ici ? 'step' : undefined}>
                <span className="acces-num" aria-hidden>
                  <Icone />
                </span>
                <span className="acces-ligne">
                  <b>
                    {s.n}. {s.titre}
                  </b>
                  <span>{s.action}</span>
                </span>
                {ici && <em className="acces-ici">Vous arrivez ici</em>}
              </li>
            );
          })}
        </ol>

        <div className="acces-pourquoi">
          <ShieldCheck aria-hidden />
          <p>
            <b>Pourquoi c’est protégé.</b> Tous les écrans de supervision reposent sur cette configuration : une machine déplacée ou débranchée par erreur
            les fausserait. L’ouverture est notée au journal, avec l’heure. Pour revenir à la supervision : {'«\u00a0Terminer\u00a0»'}, en haut à droite.
          </p>
        </div>

        <div className="acces-actions">
          <button className="btn" onClick={fermer}>
            Rester en supervision
          </button>
          <button ref={ref} className="btn primary" onClick={() => void unlockConfiguration()}>
            <LockOpen aria-hidden /> Ouvrir la configuration
          </button>
        </div>
      </div>
    </div>
  );
}
