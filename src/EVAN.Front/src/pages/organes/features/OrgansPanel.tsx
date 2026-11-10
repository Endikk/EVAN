/**
 * Étape 4 : ce qu'on surveille sur chaque machine. En haut, ce qu'il reste à faire ; puis le choix de la machine, sa
 * fiche en chiffres, ses organes en liste compacte (dépliables, avec la bande des seuils de chaque mesure), et la
 * coche « vérifiée ». Les explications sont dans les « ? ».
 */
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { MACHINE_TYPES, machineModel } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { PanelHeader } from '@/widgets/shell/PanelHeader';
import { goToStep } from '@/widgets/shell/navigation';
import { GuideButton, StepGuide, TonGlyph, type Tache } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { Select } from '@/ui/Select';
import { basculer, machinesVerifiees, useVerifications } from '../lib/verification';
import { CustomOrgans } from './CustomOrgans';
import { FicheModele } from './FicheModele';
import { LegendeBande } from './BandeSeuils';
import { OrganCard } from './OrganCard';
import { choisirMachine, Verifier } from './Verifier';
import { GUIDE_ORGANES, guideSelon } from './guide';

/** Un organe a été visé dans la 3D pendant la session (bouton « Voir en 3D », clic sur la machine, visite guidée). */
let organeDejaVise = false;

function ChoixMachine({ machines, courante }: { machines: Machine[]; courante: Machine }) {
  const i = machines.findIndex((m) => m.id === courante.id);
  const voisine = (d: number) => machines[(i + d + machines.length) % machines.length];
  return (
    <div className="og-choix">
      <label className="field grow">
        <span>Machine</span>
        <Select value={courante.id} onChange={choisirMachine} options={machines.map((m) => ({ value: m.id, label: `${m.numero} · ${m.nom}` }))} />
      </label>
      {machines.length > 1 && (
        <div className="og-choix-fleches">
          <button type="button" className="btn icon" onClick={() => choisirMachine(voisine(-1).id)} aria-label={`Machine précédente : ${voisine(-1).numero}`}>
            <ChevronLeft />
          </button>
          <button type="button" className="btn icon" onClick={() => choisirMachine(voisine(1).id)} aria-label={`Machine suivante : ${voisine(1).numero}`}>
            <ChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}

/** Comment faire une tâche : dans le « ? », juste après son intitulé. */
function CommentFaire({ children }: { children: ReactNode }) {
  return (
    <InfoTip label="Comment faire">
      <p>{children}</p>
    </InfoTip>
  );
}

function AucuneMachine() {
  return (
    <div className="card og-vide">
      <p className="og-vide-titre">
        <TonGlyph ton="neutre" /> Aucune machine posée pour l’instant.
        <InfoTip label="Pourquoi">
          <p>Les organes se vérifient machine par machine. Posez d’abord vos machines sur le plan, à l’étape 3.</p>
        </InfoTip>
      </p>
      <button type="button" className="btn sm" onClick={() => void goToStep(3)}>
        <ArrowLeft aria-hidden /> Revenir aux machines
      </button>
    </div>
  );
}

export function OrgansPanel() {
  const machines = useProject((s) => s.machines);
  const perso = useProject((s) => s.perso);
  const configure = useProject((s) => s.configure);
  const usineId = useProject((s) => s.activeId);
  const selectedId = useUi((s) => s.selectedMachineId);
  const focus = useUi((s) => s.focus);
  const machine = machines.find((m) => m.id === selectedId) ?? machines[0];
  const model = useMemo(() => (machine ? machineModel(machine, perso[machine.id]) : null), [machine, perso]);
  const type = machine ? MACHINE_TYPES[machine.type] : undefined;
  const organeVise = focus.kind === 'organe' ? focus.organeId : undefined;

  const cochees = useVerifications((s) => s.parUsine[usineId]);
  const verifiees = useMemo(() => machinesVerifiees(cochees, machines.map((m) => m.id), configure), [cochees, machines, configure]);
  const [vise, setVise] = useState(organeDejaVise);
  useEffect(() => {
    if (!organeVise) return;
    organeDejaVise = true;
    setVise(true);
  }, [organeVise]);

  const importees = machines.filter((m) => !MACHINE_TYPES[m.type]);
  const importeesDecrites = importees.filter((m) => (perso[m.id]?.organes.length ?? 0) > 0).length;
  const nbVerifiees = machines.filter((m) => verifiees.has(m.id)).length;
  const avecMachine = !!machine;
  const guide = useMemo(
    () => guideSelon(GUIDE_ORGANES, { 'organes-fiche': avecMachine, 'organes-liste': avecMachine, 'organes-verifier': avecMachine }),
    [avecMachine],
  );

  const taches: Tache[] = [
    {
      label: (
        <>
          Vérifier les organes de chaque machine
          <CommentFaire>{machines.length ? 'Relisez la liste de ses organes, puis cochez la case en bas.' : 'Posez d’abord une machine à l’étape 3.'}</CommentFaire>
          {machines.length > 0 && (
            <span className="og-compte">
              ({nbVerifiees} sur {machines.length})
            </span>
          )}
        </>
      ),
      fait: machines.length > 0 && nbVerifiees === machines.length,
    },
    ...(importees.length
      ? [
          {
            label: (
              <>
                Décrire les organes des machines importées
                <CommentFaire>Une machine hors du kit n’a pas d’organes tant que vous ne les ajoutez pas.</CommentFaire>
                <span className="og-compte">
                  ({importeesDecrites} sur {importees.length})
                </span>
              </>
            ),
            fait: importeesDecrites === importees.length,
          },
        ]
      : []),
    {
      label: (
        <>
          Viser un organe dans la vue 3D
          <CommentFaire>Le viseur à droite d’un organe place la caméra dessus.</CommentFaire>
        </>
      ),
      fait: vise,
      facultatif: true,
    },
  ];

  return (
    <>
      <PanelHeader n={4} right={<GuideButton guide={guide} compact />} />
      <div className="panel-body stack ecran-organes">
        <div className="entree" style={{ ['--i' as string]: 0 }}>
          <StepGuide taches={taches} fin="Les organes sont vérifiés." />
        </div>

        {!machine || !model ? (
          <div className="entree" style={{ ['--i' as string]: 1 }}>
            <AucuneMachine />
          </div>
        ) : (
          <>
            <div className="entree" style={{ ['--i' as string]: 1 }}>
              <ChoixMachine machines={machines} courante={machine} />
            </div>
            <div className="entree" style={{ ['--i' as string]: 2 }} key={machine.id}>
              {type ? (
                <FicheModele machine={machine} model={model} type={type} />
              ) : (
                <Suspense fallback={<p className="og-texte faint">Lecture du modèle 3D…</p>}>
                  <CustomOrgans machine={machine} />
                </Suspense>
              )}
            </div>

            {model.organes.length > 0 && (
              <section className="og-liste entree" style={{ ['--i' as string]: 3 }} aria-labelledby="og-liste-titre" data-guide="organes-liste">
                <h3 id="og-liste-titre" className="section-title">
                  Ses organes
                  <InfoTip label="Comprendre : les organes">
                    <p>Les parties de la machine, numérotées dans l’ordre où la bande les traverse, du dérouleur au rembobineur.</p>
                    <p>Un point par mesure, gris tant que c’est normal. Dépliez un organe pour voir la bande de chaque mesure ; le viseur place la caméra dessus.</p>
                    <LegendeBande />
                  </InfoTip>
                </h3>
                <ol className="og-cartes">
                  {model.organes.map((o) => (
                    <OrganCard key={o.id} machine={machine} organe={o} points={model.points.filter((p) => p.organeId === o.id)} actif={o.id === organeVise} />
                  ))}
                </ol>
              </section>
            )}

            <div className="entree" style={{ ['--i' as string]: 4 }}>
              <Verifier
                machine={machine}
                machines={machines}
                verifiees={verifiees}
                basculer={() => useVerifications.getState().definir(usineId, basculer(verifiees, machine.id))}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
