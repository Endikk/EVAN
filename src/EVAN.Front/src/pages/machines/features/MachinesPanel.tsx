/**
 * Étape 3 : poser les machines. En haut, ce qu'il reste à faire (calculé sur les machines posées) ; puis la machine
 * qu'on vient de poser ou de sélectionner ; la bibliothèque, avec le geste montré à qui n'a encore rien posé ; et la
 * liste des machines de l'usine.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { niveauDe, nomNiveau } from '@/domain/niveaux';
import { useNiveauxUsine } from '@/store/niveau';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import type { Machine } from '@/domain/types';
import { PanelHeader } from '@/widgets/shell/PanelHeader';
import { GuideButton, StepGuide, TonGlyph, type Tache } from '@/ui/explain';
import { etatPose, numerotationOk, problemeNumeros, type EtatPose } from '../lib/taches';
import { Bibliotheque } from './Bibliotheque';
import { MachinePosee } from './MachinePosee';
import { GUIDE_MACHINES, guideSelon } from './guide';

/** Machine ajoutée depuis l'ouverture de l'écran : c'est elle qui s'allume une fois. */
function useDernierePose(machines: Machine[]): string | undefined {
  const connues = useRef<Set<string> | null>(null);
  const [derniere, setDerniere] = useState<string>();
  useEffect(() => {
    const ids = new Set(machines.map((m) => m.id));
    const avant = connues.current;
    connues.current = ids;
    if (!avant) return;
    const ajout = machines.find((m) => !avant.has(m.id));
    if (ajout) setDerniere(ajout.id);
  }, [machines]);
  return derniere;
}

function taches(e: EtatPose): Tache[] {
  const nomsDoubles = e.nomsEnDouble[0];
  const probleme = problemeNumeros(e);
  return [
    {
      label: 'Poser vos machines sur le plan',
      comment: 'Glissez une carte de la bibliothèque sur le plan, à l’endroit de la machine. Sur tablette : touchez la carte, puis le plan.',
      compte: e.total > 0 && `${e.total} posée${e.total > 1 ? 's' : ''}`,
      fait: e.total > 0,
    },
    {
      label: 'Donner à chacune un numéro unique',
      comment: 'EVAN les numérote seul (R01, R02…). Vous pouvez changer chaque numéro.',
      fait: numerotationOk(e),
      // Un numéro manquant ou en double empêche d'avancer : il reste en vue, en ambre.
      aide: probleme && (
        <span className="mc-tache-alerte">
          <TonGlyph ton="warn" />
          {probleme}
        </span>
      ),
    },
    {
      label: 'Distinguer les machines du même type par leur nom',
      comment: nomsDoubles
        ? `${nomsDoubles.n} machines s’appellent « ${nomsDoubles.nom} » : sélectionnez-les une à une et donnez-leur le nom qu’on emploie à l’atelier.`
        : 'Sélectionnez une machine, puis changez son nom.',
      fait: e.total > 0 && !nomsDoubles,
      facultatif: true,
    },
  ];
}

function ListeMachines({ machines, selectedId, derniere, enDouble }: { machines: Machine[]; selectedId?: string; derniere?: string; enDouble: Set<string> }) {
  const zones = useProject((s) => s.zones);
  const etages = useNiveauxUsine() > 1;
  if (!machines.length) return null;
  return (
    <section className="mc-liste" aria-labelledby="mc-liste-titre" data-guide="machines-liste">
      <h3 id="mc-liste-titre" className="section-title">
        Machines posées <span className="mc-liste-compte num">{machines.length}</span>
      </h3>
      <ul className="list">
        {machines.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className={`item mc-item ${m.id === derniere ? 'vient-d-arriver' : ''}`}
              aria-current={m.id === selectedId ? 'true' : undefined}
              onClick={() => {
                useUi.getState().selectMachine(m.id);
                useUi.getState().setFocus({ kind: 'machine', machineId: m.id });
              }}
            >
              <span className="mono mc-item-numero">{m.numero || '?'}</span>
              <span className="grow truncate">
                <span className="t">{m.nom}</span>
                <span className="s">
                  {zones.find((z) => z.id === m.zoneId)?.nom ?? 'Hors des zones dessinées'}
                  {etages ? ` · ${nomNiveau(niveauDe(m))}` : null}
                </span>
              </span>
              {enDouble.has(m.numero.trim()) && <span className="chip warn">Numéro en double</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MachinesPanel() {
  const machines = useProject((s) => s.machines);
  const selectedId = useUi((s) => s.selectedMachineId);
  const sel = machines.find((m) => m.id === selectedId);
  const etat = useMemo(() => etatPose(machines), [machines]);
  const enDouble = useMemo(() => new Set(etat.numerosEnDouble), [etat]);
  const derniere = useDernierePose(machines);
  const guide = useMemo(() => guideSelon(GUIDE_MACHINES, { 'machines-fiche': !!sel, 'machines-liste': machines.length > 0 }), [sel, machines.length]);

  return (
    <>
      <PanelHeader n={3} right={<GuideButton guide={guide} compact />} />
      <div className="panel-body stack ecran-machines">
        <div className="entree" style={{ ['--i' as string]: 0 }}>
          <StepGuide taches={taches(etat)} fin="Les machines sont posées." />
        </div>
        {sel && (
          <div className="entree" style={{ ['--i' as string]: 1 }}>
            <MachinePosee key={sel.id} machine={sel} nouvelle={sel.id === derniere} numeroEnDouble={enDouble.has(sel.numero.trim())} />
          </div>
        )}
        <div className="entree" style={{ ['--i' as string]: 2 }}>
          <Bibliotheque debutant={machines.length === 0} />
        </div>
        <div className="entree" style={{ ['--i' as string]: 3 }}>
          <ListeMachines machines={machines} selectedId={selectedId} derniere={derniere} enDouble={enDouble} />
        </div>
      </div>
    </>
  );
}
