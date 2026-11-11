/**
 * Panneau de droite de la supervision : trois onglets (alarmes, machines, journal), ou, quand une machine est choisie,
 * ce qui se passe dans cette machine. La fiche (que faire) vient d'abord ; l'explication de la détection suit, repliée
 * une fois l'alarme levée. Tant que la mesure ne fait que se dérégler, elle reste en tête : c'est la seule nouvelle.
 * Une usine sans machine propose de les poser.
 */
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, Factory } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { useLive } from '@/store/live';
import { requestConfiguration } from '@/widgets/shell/navigation';
import { DetectionTrace } from './DetectionTrace';
import { Alarmes } from './Alarmes';
import { Machines } from './Machines';
import { Journal } from './Journal';
import { MachineDetail } from './MachineDetail';
import { etatAtelier, parUrgence } from '../lib/atelier';

type Onglet = 'alarmes' | 'machines' | 'journal';
const ONGLETS: Onglet[] = ['alarmes', 'machines', 'journal'];

function retourUsine() {
  useUi.getState().selectMachine(undefined);
  useUi.getState().setFocus({ kind: 'site' });
}

/** Usine sans machine (assistant terminé trop tôt) : la supervision n'a rien à montrer, elle mène à l'étape 3. */
function SansMachine() {
  return (
    <div className="sv-calme entree">
      <span className="sv-calme-suivi" aria-hidden>
        <Factory />
      </span>
      <b className="sv-calme-titre">Aucune machine dans cette usine</b>
      <p>Posez les machines sur le plan pour les suivre ici en direct.</p>
      <button className="btn sm primary" onClick={() => requestConfiguration(3)}>
        <Factory /> Poser les machines
      </button>
    </div>
  );
}

export function SupervisionPanel() {
  const machines = useProject((s) => s.machines);
  const live = useLive((s) => s.machines);
  const alarms = useLive((s) => s.alarms);
  const events = useLive((s) => s.events);
  const trace = useLive((s) => s.trace);
  const selected = useUi((s) => s.selectedMachineId);
  const tourEnCours = useUi((s) => s.tour.playing);
  const [onglet, setOnglet] = useState<Onglet>('alarmes');
  const corps = useRef<HTMLDivElement>(null);
  const tabs = useRef<Partial<Record<Onglet, HTMLButtonElement | null>>>({});

  const actives = useMemo(() => parUrgence(alarms), [alarms]);
  const atelier = useMemo(() => etatAtelier(machines, live), [machines, live]);
  const machine = selected ? machines.find((m) => m.id === selected) : undefined;
  // La trace d'une panne ne s'affiche que sur sa machine (ou sur toute l'usine) : pendant une seconde panne, le détail
  // de la première machine ne raconte pas la détection de l'autre.
  const traceIci = trace && (!machine || trace.machineId === machine.id) ? trace : undefined;
  const enSuivi = !!traceIci && !traceIci.termine;

  // Chaque vue repart du haut : le défilement d'un onglet (ou d'une autre machine) ne laisse pas la suivante à mi-hauteur.
  useLayoutEffect(() => {
    if (corps.current) corps.current.scrollTop = 0;
  }, [onglet, machine?.id]);

  const onglets: [Onglet, string, string?][] = [
    ['alarmes', 'Alarmes', actives.length ? String(actives.length) : undefined],
    ['machines', 'Machines'],
    ['journal', 'Journal'],
  ];

  // Onglets au clavier (motif ARIA « tabs ») : les flèches passent d'un onglet à l'autre, Début et Fin vont aux bouts.
  const auClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ONGLETS.indexOf(onglet);
    const cible =
      e.key === 'ArrowRight' ? ONGLETS[(i + 1) % ONGLETS.length]
      : e.key === 'ArrowLeft' ? ONGLETS[(i + ONGLETS.length - 1) % ONGLETS.length]
      : e.key === 'Home' ? ONGLETS[0]
      : e.key === 'End' ? ONGLETS[ONGLETS.length - 1]
      : undefined;
    if (!cible) return;
    e.preventDefault();
    setOnglet(cible);
    tabs.current[cible]?.focus();
  };

  const detection = traceIci && <DetectionTrace key={`${traceIci.id}-${traceIci.termine ? 'fin' : 'suivi'}`} trace={traceIci} replie={traceIci.termine && !tourEnCours} />;

  return (
    <>
      <div className="panel-head sv-panneau-tete" data-guide="sv-panneau">
        {machine ? (
          <>
            <button className="btn sm ghost sv-retour" onClick={retourUsine}>
              <ArrowLeft /> Toute l’usine
            </button>
            <h2>Ce qui se passe dans {machine.numero}</h2>
          </>
        ) : (
          <>
            <h2>L’atelier en direct</h2>
            {machines.length > 0 && (
              <div className="seg sv-onglets" role="tablist" aria-label="Vue du panneau" onKeyDown={auClavier}>
                {onglets.map(([k, libelle, compte]) => (
                  <button
                    key={k}
                    ref={(el) => {
                      tabs.current[k] = el;
                    }}
                    role="tab"
                    id={`sv-onglet-${k}`}
                    aria-controls="sv-onglet-contenu"
                    aria-selected={onglet === k}
                    tabIndex={onglet === k ? 0 : -1}
                    onClick={() => setOnglet(k)}
                  >
                    {libelle}
                    {compte && <span className="sv-compte">{compte}</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="panel-body stack sv-panneau-corps" ref={corps}>
        {enSuivi && detection}

        {!machines.length ? (
          <SansMachine />
        ) : machine ? (
          <div className="sv-glisse" key={machine.id}>
            <MachineDetail id={machine.id} />
          </div>
        ) : (
          <div id="sv-onglet-contenu" role="tabpanel" aria-labelledby={`sv-onglet-${onglet}`} className="sv-glisse" key={onglet}>
            {onglet === 'alarmes' ? <Alarmes alarmes={actives} enSuivi={enSuivi} /> : onglet === 'machines' ? <Machines atelier={atelier} /> : <Journal evenements={events} alarmes={alarms} />}
          </div>
        )}

        {!enSuivi && detection}
      </div>
    </>
  );
}
