/**
 * Temps 3 : le test de liaison, montré comme un trajet EVAN → passerelle → automate. Pendant le test, une impulsion
 * parcourt le tronçon en cours ; un tronçon qui passe se trace en vert, un tronçon qui casse se barre, et l'écran dit
 * ce qui bloque et quoi vérifier. Ce que fait le test est dans le « ? » du titre ; le détail ligne à ligne (le
 * journal) reste replié.
 */
import { Check, Cpu, Monitor, PlugZap, Router, X, type LucideIcon } from 'lucide-react';
import { Details, TonGlyph } from '@/ui/explain';
import { lireTest, type EtatTroncon, type LigneTest } from '../lib/diagnostic';

function Noeud({ icone: Icone, nom, sous, etat }: { icone: LucideIcon; nom: string; sous?: string; etat?: 'ok' | 'echec' }) {
  return (
    <span className={`cx-noeud ${etat ?? ''}`}>
      <span className="cx-noeud-icone">
        <Icone aria-hidden />
      </span>
      <span className="cx-noeud-nom">{nom}</span>
      {sous && <span className="cx-noeud-sous mono">{sous}</span>}
    </span>
  );
}

function Troncon({ etat }: { etat: EtatTroncon }) {
  return (
    <span className={`cx-troncon ${etat}`} aria-hidden>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none">
        <line className="cx-t-fond" x1="0" y1="6" x2="100" y2="6" vectorEffect="non-scaling-stroke" />
        {(etat === 'encours' || etat === 'ok') && (
          <line key={etat} className="cx-t-trait" x1="0" y1="6" x2="100" y2="6" pathLength={100} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {etat === 'echec' && (
        <span className="cx-t-casse">
          <X />
        </span>
      )}
    </span>
  );
}

interface Props {
  log: LigneTest[];
  enCours: boolean;
  lancer: () => void;
  numero: string;
  passerelle?: string;
  simule: boolean;
}

export function TestLiaison({ log, enCours, lancer, numero, passerelle, simule }: Props) {
  const l = lireTest(log, enCours);
  const [t1, t2] = l.troncons;
  // Un test simulé réussi ne prouve rien sur la machine : il le dit en titre, en ambre, au lieu de « la liaison passe ».
  const simuleReussi = l.etat === 'ok' && simule;
  const resume =
    l.etat === 'attente'
      ? 'Pas encore testé.'
      : l.etat === 'encours'
        ? 'Test en cours.'
        : simuleReussi
          ? 'Test simulé : la liaison n’a pas été vérifiée.'
          : l.etat === 'ok'
            ? 'La liaison passe, en lecture seule.'
            : 'La liaison ne passe pas.';

  return (
    <div className="cx-pas" data-guide="connexion-test">
      <div className={`cx-lien etat-${l.etat}`} role="img" aria-label={`Trajet EVAN, passerelle, automate. ${resume}`}>
        <Noeud icone={Monitor} nom="EVAN" etat={t1 === 'ok' ? 'ok' : undefined} />
        <Troncon etat={t1} />
        <Noeud icone={Router} nom="Passerelle" sous={passerelle} etat={t1 === 'echec' ? 'echec' : t1 === 'ok' ? 'ok' : undefined} />
        <Troncon etat={t2} />
        <Noeud icone={Cpu} nom="Automate" sous={numero} etat={t2 === 'echec' ? 'echec' : t2 === 'ok' ? 'ok' : undefined} />
      </div>

      <div className={`cx-test-verdict etat-${simuleReussi ? 'simule' : l.etat}`} role="status" aria-live="polite">
        {simuleReussi ? <TonGlyph ton="warn" /> : l.etat === 'ok' && <Check aria-hidden />}
        <p>
          {resume}
          {l.etat === 'encours' && l.derniere && <span className="cx-test-ligne">{l.derniere}</span>}
        </p>
      </div>
      {simuleReussi && <p className="cx-simule">En démonstration, aucune connexion réelle n’est ouverte : l’adresse est bien formée, mais personne n’a répondu à cette adresse.</p>}

      {l.etat === 'echec' && (
        <div className="cx-echec">
          <p>
            <b>Ce qui bloque :</b> {l.cause}
          </p>
          <p>
            <b>Que faire :</b> {l.conseil}
          </p>
        </div>
      )}

      <button type="button" className={`btn cx-tester ${l.etat === 'ok' ? '' : 'primary'}`} onClick={lancer} disabled={enCours}>
        <PlugZap aria-hidden /> {enCours ? 'Test en cours…' : log.length ? 'Relancer le test' : 'Tester la liaison'}
      </button>

      {log.length > 0 && !enCours && (
        <Details titre="Voir le détail du test" apercu={`${log.length} étape${log.length > 1 ? 's' : ''}`}>
          <ol className="cx-journal">
            {log.map((ligne, i) => (
              <li key={i} className={ligne.ok === false ? 'echec' : 'ok'}>
                {ligne.ok === false ? <X aria-label="Échec" /> : <Check aria-label="Passé" />}
                <span>{ligne.t}</span>
              </li>
            ))}
          </ol>
        </Details>
      )}
    </div>
  );
}
