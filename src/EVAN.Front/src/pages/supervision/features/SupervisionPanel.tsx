/**
 * Panneau de droite de la supervision : trois onglets (alarmes, machines, journal), ou, quand une machine est choisie,
 * ce qui se passe dans cette machine. Pendant une panne, l'explication de la détection reste en tête.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { useLive } from '@/store/live';
import { DetectionTrace } from './DetectionTrace';
import { Alarmes } from './Alarmes';
import { Machines } from './Machines';
import { Journal } from './Journal';
import { MachineDetail } from './MachineDetail';
import { etatAtelier, parUrgence } from '../lib/atelier';

type Onglet = 'alarmes' | 'machines' | 'journal';

function retourUsine() {
  useUi.getState().selectMachine(undefined);
  useUi.getState().setFocus({ kind: 'site' });
}

export function SupervisionPanel() {
  const machines = useProject((s) => s.machines);
  const live = useLive((s) => s.machines);
  const alarms = useLive((s) => s.alarms);
  const events = useLive((s) => s.events);
  const trace = useLive((s) => s.trace);
  const selected = useUi((s) => s.selectedMachineId);
  const [onglet, setOnglet] = useState<Onglet>('alarmes');

  const actives = useMemo(() => parUrgence(alarms), [alarms]);
  const atelier = useMemo(() => etatAtelier(machines, live), [machines, live]);
  const machine = selected ? machines.find((m) => m.id === selected) : undefined;
  const pannes = actives.filter((a) => a.gravite === 'critique').length;

  const onglets: [Onglet, string, string?][] = [
    ['alarmes', 'Alarmes', actives.length ? String(actives.length) : undefined],
    ['machines', 'Machines'],
    ['journal', 'Journal'],
  ];

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
            <div className="seg sv-onglets" role="tablist" aria-label="Vue du panneau">
              {onglets.map(([k, libelle, compte]) => (
                <button
                  key={k}
                  role="tab"
                  id={`sv-onglet-${k}`}
                  aria-controls="sv-onglet-contenu"
                  aria-selected={onglet === k}
                  aria-pressed={onglet === k}
                  onClick={() => setOnglet(k)}
                >
                  {libelle}
                  {compte && <span className={`sv-compte ${pannes && k === 'alarmes' ? 'crit' : ''}`}>{compte}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="panel-body stack sv-panneau-corps">
        {trace && <DetectionTrace trace={trace} />}

        {machine ? (
          <div className="sv-glisse" key={machine.id}>
            <MachineDetail id={machine.id} />
          </div>
        ) : (
          <div id="sv-onglet-contenu" role="tabpanel" aria-labelledby={`sv-onglet-${onglet}`} className="sv-glisse" key={onglet}>
            {onglet === 'alarmes' ? <Alarmes alarmes={actives} enSuivi={!!trace && !trace.termine} /> : onglet === 'machines' ? <Machines atelier={atelier} /> : <Journal evenements={events} alarmes={alarms} />}
          </div>
        )}
      </div>
    </>
  );
}
