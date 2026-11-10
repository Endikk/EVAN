/**
 * L'accès à l'automate : lecture seule par défaut, calme ; l'écriture autorisée passe en ambre. Ce que veut dire
 * chaque mode est dans le « ? » du titre. Autoriser l'écriture demande une raison, inscrite au journal ; revenir en
 * lecture seule aussi.
 */
import { AlertTriangle, Lock, Unlock } from 'lucide-react';
import { useProject } from '@/store/project';
import type { Connexion, Machine } from '@/domain/types';
import { getSource } from '@/realtime/source';
import { InfoTip } from '@/ui/InfoTip';

const RAISON_MIN = 8;

interface Props {
  machine: Machine;
  connexion?: Connexion;
  demande: boolean;
  setDemande: (v: boolean) => void;
  raison: string;
  setRaison: (v: string) => void;
}

export function AccesAutomate({ machine, connexion, demande, setDemande, raison, setRaison }: Props) {
  const ecriture = connexion?.lectureSeule === false;
  const branchee = connexion?.etat === 'connectee';

  const journaliser = (message: string) =>
    getSource()?.logEvent({ type: 'action', horodatage: Date.now(), machineId: machine.id, message, auteur: 'Superviseur' });

  return (
    <section className={`card cx-acces ${ecriture ? 'ecriture' : ''}`} aria-labelledby="cx-acces-titre" data-tour="ecriture" data-guide="connexion-acces">
      <header className="cx-acces-tete">
        <span className="cx-acces-icone" aria-hidden>
          {ecriture ? <Unlock /> : <Lock />}
        </span>
        <div className="grow">
          <h3 id="cx-acces-titre">
            Accès à l’automate
            <InfoTip label="Comprendre : l’accès à l’automate">
              <p>
                {ecriture
                  ? 'EVAN peut envoyer des consignes à cet automate. Chaque écriture est inscrite au journal.'
                  : 'EVAN lit les valeurs, il ne commande jamais la machine.'}
              </p>
              <p>Autoriser l’écriture demande une raison, inscrite au journal. On revient en lecture seule à tout moment.</p>
            </InfoTip>
          </h3>
          <p className={`cx-acces-mode ${ecriture ? 'ton-warn' : ''}`}>{ecriture ? 'Écriture autorisée' : 'Lecture seule'}</p>
        </div>
      </header>

      {ecriture && connexion ? (
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            useProject.getState().setConnexion({ ...connexion, lectureSeule: true });
            journaliser(`${machine.numero} : retour en lecture seule`);
          }}
        >
          <Lock aria-hidden /> Revenir en lecture seule
        </button>
      ) : demande ? (
        <div className="cx-demande">
          <p className="cx-demande-alerte">
            <AlertTriangle aria-hidden /> Une écriture peut modifier le comportement de la machine. Dites pourquoi : la raison est inscrite au journal.
          </p>
          <label className="field">
            <span>Raison (obligatoire)</span>
            <input className="input" placeholder="Ex. réglage de consigne validé par la maintenance" value={raison} onChange={(e) => setRaison(e.target.value)} />
          </label>
          <div className="row wrap">
            <button
              type="button"
              className="btn sm danger"
              disabled={raison.trim().length < RAISON_MIN || !connexion}
              onClick={() => {
                if (!connexion) return;
                useProject.getState().setConnexion({ ...connexion, lectureSeule: false });
                journaliser(`${machine.numero} : écriture autorisée. Raison : ${raison.trim()}`);
                setDemande(false);
                setRaison('');
              }}
            >
              Autoriser et journaliser
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setDemande(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="cx-acces-action">
          <button type="button" className="btn sm" onClick={() => setDemande(true)} disabled={!branchee}>
            <Unlock aria-hidden /> Autoriser l’écriture…
          </button>
          {!branchee && <small>Possible une fois la machine branchée.</small>}
        </div>
      )}
    </section>
  );
}
