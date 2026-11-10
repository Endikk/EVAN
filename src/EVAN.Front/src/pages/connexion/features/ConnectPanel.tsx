/**
 * Étape 5 : brancher chaque machine à EVAN, en quatre temps numérotés (protocole, adresse, test de liaison,
 * variables). En haut, ce qu'il reste à faire ; en bas, l'accès à l'automate, en lecture seule par défaut.
 * La visite guidée pilote cet écran par deux évènements : evan:connect-autoplay et evan:connect-write-demo.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { useLive } from '@/store/live';
import { machineModel } from '@/domain/catalog';
import type { Connexion, Machine, Protocole } from '@/domain/types';
import { PanelHeader } from '@/widgets/shell/PanelHeader';
import { goToStep } from '@/widgets/shell/navigation';
import { GuideButton, StepGuide, TonGlyph, type Tache } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { Select } from '@/ui/Select';
import { uid } from '@/sim/random';
import { ENTETE_ECRITURE } from '@/api/http';
import { DEFAUTS, nomProtocole } from '../lib/protocoles';
import { autoMatch, browseVariables, nbReliees, type Association, type Variable } from '../lib/variables';
import type { LigneTest } from '../lib/diagnostic';
import { aideDuTemps, FilDesTemps, TEMPS } from './Temps';
import { ChoixProtocole } from './ChoixProtocole';
import { Adresse } from './Adresse';
import { TestLiaison } from './TestLiaison';
import { Variables } from './Variables';
import { AccesAutomate } from './AccesAutomate';
import { GUIDE_CONNEXION, guideSelon } from './guide';

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const DERNIER = TEMPS.length - 1;

const estBranchee = (c?: Connexion) => c?.etat === 'connectee';

/** Prochaine machine à brancher après celle-ci, en reprenant au début de la liste. */
function suivanteABrancher(machines: Machine[], courante: string, connexions: Record<string, Connexion>): Machine | undefined {
  const i = machines.findIndex((m) => m.id === courante);
  return [...machines.slice(i + 1), ...machines.slice(0, Math.max(0, i))].find((m) => !estBranchee(connexions[m.id]));
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
    <div className="card cx-vide">
      <p className="cx-vide-titre">
        <TonGlyph ton="neutre" /> Aucune machine à brancher pour l’instant.
        <InfoTip label="Pourquoi">
          <p>Chaque machine se branche une à une. Posez d’abord vos machines sur le plan, à l’étape 3.</p>
        </InfoTip>
      </p>
      <button type="button" className="btn sm" onClick={() => void goToStep(3)}>
        <ArrowLeft aria-hidden /> Revenir aux machines
      </button>
    </div>
  );
}

export function ConnectPanel() {
  const machines = useProject((s) => s.machines);
  const connexions = useProject((s) => s.connexions);
  const perso = useProject((s) => s.perso);
  const passerelle = useProject((s) => s.site?.passerelle);
  const source = useLive((s) => s.source);
  const selectedId = useUi((s) => s.selectedMachineId);
  const machine = machines.find((m) => m.id === selectedId) ?? machines[0];
  const existing = machine ? connexions[machine.id] : undefined;
  const model = useMemo(() => (machine ? machineModel(machine, perso[machine.id]) : null), [machine, perso]);

  const [wiz, setWiz] = useState(0);
  const [atteint, setAtteint] = useState(0);
  const [proto, setProto] = useState<Protocole>(existing?.protocole ?? 'opcua');
  const [params, setParams] = useState<Record<string, string>>(existing?.parametres ?? DEFAUTS.opcua);
  const [log, setLog] = useState<LigneTest[]>([]);
  const [testing, setTesting] = useState(false);
  const [vars, setVars] = useState<Variable[]>([]);
  const [assoc, setAssoc] = useState<Association>({});
  const [enregistree, setEnregistree] = useState(false);
  const [writeAsk, setWriteAsk] = useState(false);
  const [reason, setReason] = useState('');
  const auto = useRef(false);

  const aller = (i: number) => {
    setWiz(i);
    setAtteint((a) => Math.max(a, i));
  };

  // Changement de machine : l'assistant repart de son état enregistré (une machine branchée s'ouvre sur ses variables).
  useEffect(() => {
    const debut = existing?.etat === 'connectee' ? DERNIER : 0;
    setWiz(debut);
    setAtteint(debut);
    setProto(existing?.protocole ?? 'opcua');
    setParams(existing?.parametres ?? DEFAUTS.opcua);
    setLog([]);
    setVars([]);
    setAssoc({});
    setEnregistree(false);
    setWriteAsk(false);
  }, [machine?.id]);

  useEffect(() => {
    if (wiz === DERNIER && machine && model && !vars.length) {
      const v = browseVariables(machine, proto, model.points, model.organes);
      setVars(v);
      const saved = existing?.associations ?? {};
      // Connexion existante sans association enregistrée : proposition automatique.
      setAssoc(Object.keys(saved).length ? Object.fromEntries(Object.entries(saved).map(([k, p]) => [k, { pointId: p, score: 1 }])) : autoMatch(v, model.points, model.organes));
    }
  }, [wiz, machine, model, proto, vars.length, existing]);

  const choisirProtocole = (p: Protocole) => {
    if (p === proto) return;
    setProto(p);
    setParams(DEFAUTS[p]);
    // Les variables dépendent du protocole : elles seront relues au dernier temps.
    setVars([]);
    setAssoc({});
    setLog([]);
    setAtteint(0);
  };

  const runTest = async () => {
    if (!machine || !model) return;
    setTesting(true);
    setLog([]);
    const push = async (t: string, ms: number, ok = true) => {
      await wait(ms);
      setLog((l) => [...l, { t, ok }]);
    };
    if (source === 'api') {
      // Test réel par la passerelle : seules ses étapes s'affichent, et le premier échec arrête la liste.
      try {
        const res = await fetch('/api/connections/test', {
          method: 'POST',
          headers: { ...ENTETE_ECRITURE, 'Content-Type': 'application/json' },
          body: JSON.stringify({ machineId: machine.id, protocole: proto, parametres: params, siteId: useProject.getState().activeId }),
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status === 400 || res.status === 404) {
          // Demande refusée par l'API (passerelle d'une autre usine, protocole inconnu, bornes) : on montre sa raison.
          const refus = (await res.json().catch(() => null)) as { detail?: string; erreur?: string } | null;
          await push(`Test refusé : ${refus?.detail ?? refus?.erreur ?? `réponse ${res.status}`}`, 200, false);
          setTesting(false);
          return;
        }
        if (!res.ok) throw new Error(`réponse ${res.status}`);
        const body = (await res.json()) as { steps: { label: string; ok: boolean }[] };
        for (const st of body.steps) {
          await push(st.label, 260, st.ok);
          if (!st.ok) break;
        }
        if (body.steps.length && body.steps.every((st) => st.ok)) await push('Liaison validée par la passerelle. Aucune écriture possible vers l’automate.', 200);
      } catch (err) {
        await push(`Test impossible : la passerelle n’a pas répondu (${err instanceof Error ? err.message : 'erreur réseau'}).`, 200, false);
      }
      setTesting(false);
      setAtteint((a) => Math.max(a, 2));
      return;
    }
    // Démo hors ligne : déroulé d'un test, sans connexion réelle ni mesure. Aucun chiffre n'y est inventé.
    const host = params.endpoint?.replace(/^opc\.tcp:\/\//, '').split(':')[0] ?? params.hote ?? params.url?.replace(/^https?:\/\//, '').split(/[:/]/)[0] ?? 'local';
    await push('Test simulé (démo hors ligne) : aucune connexion réelle n’est ouverte.', 200);
    await push(`Passerelle edge « ${useProject.getState().site?.passerelle ?? 'passerelle-01'} » : demande de test reçue (MQTT, TLS)`, 350);
    await push(`Résolution de ${host}`, 400);
    if (proto === 'opcua') {
      await push(`Connexion TCP ${params.endpoint}`, 450);
      await push(`GetEndpoints : sélection ${params.securite} / ${params.politique}`, 500);
      await push('Certificat du serveur présenté, à approuver par l’administrateur', 450);
      await push(`Session ouverte (${params.auth}), droits : lecture seule`, 450);
      await push(`Parcours de l’espace d’adressage : variables du modèle de la machine`, 650);
    } else if (proto === 'modbus') {
      await push(`Connexion TCP ${params.hote}:${params.port}`, 450);
      await push(`Lecture test des registres de maintien (unité ${params.unite})`, 500);
      await push(`Table d’échange : variables du modèle de la machine`, 500);
    } else if (proto === 's7') {
      await push(`Connexion ISO-on-TCP ${params.hote} rack ${params.rack} slot ${params.slot}`, 500);
      await push('Lecture test d’un bloc de données', 450);
      await push(`Mnémoniques : variables du modèle de la machine`, 500);
    } else if (proto === 'jmf') {
      await push(`POST ${params.url} KnownDevices`, 500);
      await push(`Abonnement aux signaux Status et Notification (${params.intervalle} ms)`, 500);
      await push('Les mesures par organe demandent l’accès OPC UA à l’automate.', 450);
    } else {
      await push(`Abonnement ${params.topic ?? 'sim/#'}`, 500);
    }
    await push('Liaison simulée. Aucune écriture possible vers l’automate.', 300);
    setTesting(false);
    setAtteint((a) => Math.max(a, 2));
  };

  const save = () => {
    if (!machine || !model) return;
    const reliees = Object.fromEntries(vars.filter((v) => assoc[v.id]).map((v) => [v.id, assoc[v.id].pointId]));
    const c: Connexion = {
      id: existing?.id ?? uid('cx'),
      machineId: machine.id,
      protocole: proto,
      parametres: params,
      etat: 'connectee',
      associations: reliees,
      lectureSeule: existing?.lectureSeule ?? true,
    };
    useProject.getState().setConnexion(c);
    const byPoint = new Map(Object.entries(reliees).map(([k, p]) => [p, k]));
    useProject.getState().setPerso(machine.id, {
      organes: model.organes,
      points: model.points.map((p) => (byPoint.has(p.id) ? { ...p, protocole: proto, adresse: byPoint.get(p.id) } : p)),
    });
    setEnregistree(true);
    useLive.getState().pushToast({ gravite: 'succes', titre: `${machine.numero} connectée`, texte: `${Object.keys(reliees).length} variables associées en ${nomProtocole(proto)}.` });
  };

  // Démonstration automatique (visite guidée).
  useEffect(() => {
    const h = async () => {
      if (auto.current || !machine || !model) return;
      auto.current = true;
      setProto('opcua');
      aller(0);
      await wait(900);
      aller(1);
      const target = `opc.tcp://10.20.1.${21 + machines.indexOf(machine)}:4840`;
      for (let i = 10; i <= target.length; i += 2) {
        setParams({ ...DEFAUTS.opcua, endpoint: target.slice(0, i) });
        await wait(40);
      }
      setParams({ ...DEFAUTS.opcua, endpoint: target });
      await wait(700);
      aller(2);
      await runTest();
      await wait(800);
      aller(3);
      await wait(900);
      const v = browseVariables(machine, 'opcua', model.points, model.organes);
      setVars(v);
      setAssoc({});
      const m = autoMatch(v, model.points, model.organes);
      for (const [k, val] of Object.entries(m)) {
        setAssoc((a) => ({ ...a, [k]: val }));
        await wait(110);
      }
      auto.current = false;
    };
    const listener = () => void h();
    window.addEventListener('evan:connect-autoplay', listener);
    return () => window.removeEventListener('evan:connect-autoplay', listener);
  });

  // Visite guidée : demande d'écriture vers l'automate, raison saisie, puis abandon (rien n'est autorisé).
  useEffect(() => {
    const h = async () => {
      document.querySelector('[data-tour="ecriture"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setWriteAsk(true);
      const raison = 'Réglage de consigne validé par la maintenance';
      for (let i = 1; i <= raison.length; i += 2) {
        setReason(raison.slice(0, i));
        await wait(35);
      }
      setReason(raison);
      await wait(2600);
      setWriteAsk(false);
      setReason('');
    };
    const listener = () => void h();
    window.addEventListener('evan:connect-write-demo', listener);
    return () => window.removeEventListener('evan:connect-write-demo', listener);
  }, []);

  const branchees = machines.filter((m) => estBranchee(connexions[m.id])).length;
  const reliees = nbReliees(vars, assoc) || Object.keys(existing?.associations ?? {}).length;
  const ecritureQuelquePart = Object.values(connexions).some((c) => c.lectureSeule === false);
  const taches: Tache[] = [
    {
      label: (
        <>
          Brancher chaque machine à EVAN
          <CommentFaire>{machines.length ? 'Pour chaque machine, suivez les quatre temps ci-dessous, puis enregistrez.' : 'Posez d’abord une machine à l’étape 3.'}</CommentFaire>
          {machines.length > 0 && (
            <span className="cx-compte">
              ({branchees} sur {machines.length})
            </span>
          )}
        </>
      ),
      fait: machines.length > 0 && branchees === machines.length,
    },
    ...(machine
      ? [
          {
            label: (
              <>
                Relier les variables de <span className="mono">{machine.numero}</span> à ses organes
                <CommentFaire>Dernier temps de l’assistant : « Associer automatiquement », puis vérifier.</CommentFaire>
              </>
            ),
            fait: reliees > 0,
          },
        ]
      : []),
    {
      label: (
        <>
          Laisser EVAN en lecture seule
          <CommentFaire>EVAN lit les valeurs sans jamais commander la machine. Si une écriture a été autorisée, revenez en lecture seule dès que le besoin est passé.</CommentFaire>
        </>
      ),
      fait: !ecritureQuelquePart,
      facultatif: true,
      // Une écriture autorisée sort de la normale : elle reste en vue, en ambre.
      aide: ecritureQuelquePart && (
        <span className="cx-tache-alerte">
          <TonGlyph ton="warn" />
          Une machine a l’écriture autorisée.
        </span>
      ),
    },
  ];

  const avecMachine = !!machine;
  const presents = { 'connexion-etapes': avecMachine, 'connexion-variables': avecMachine && wiz === DERNIER, 'connexion-test': avecMachine && wiz === 2, 'connexion-acces': avecMachine };
  const tete = <PanelHeader n={5} right={<GuideButton guide={guideSelon(GUIDE_CONNEXION, presents)} compact />} />;
  if (!machine || !model) {
    return (
      <>
        {tete}
        <div className="panel-body stack ecran-connexion">
          <div className="entree" style={{ ['--i' as string]: 0 }}>
            <StepGuide taches={taches} />
          </div>
          <div className="entree" style={{ ['--i' as string]: 1 }}>
            <AucuneMachine />
          </div>
        </div>
      </>
    );
  }

  const suivante = enregistree ? suivanteABrancher(machines, machine.id, connexions) : undefined;
  const ecritureIci = existing?.lectureSeule === false;
  const testOk = log.length > 0 && !testing && log.every((l) => l.ok !== false);
  const testEchec = log.some((l) => l.ok === false);

  return (
    <>
      {tete}
      <div className="panel-body stack ecran-connexion">
        <div className="entree" style={{ ['--i' as string]: 0 }}>
          <StepGuide taches={taches} fin="Les machines sont branchées." />
        </div>

        <div className="cx-machine entree" style={{ ['--i' as string]: 1 }}>
          <label className="field">
            <span>Machine</span>
            <Select
              value={machine.id}
              onChange={(id) => useUi.getState().selectMachine(id)}
              options={machines.map((m) => ({ value: m.id, label: `${m.numero} · ${m.nom}${estBranchee(connexions[m.id]) ? ' · branchée' : ''}` }))}
            />
          </label>
          <p key={`${machine.id}-${existing?.etat}`} className={`cx-machine-etat ${ecritureIci ? 'ton-warn' : ''}`}>
            <TonGlyph ton={ecritureIci ? 'warn' : estBranchee(existing) ? 'ok' : 'neutre'} />
            {estBranchee(existing) && existing ? (
              <span>
                Branchée en {nomProtocole(existing.protocole)} · {ecritureIci ? 'écriture autorisée' : 'lecture seule'}
              </span>
            ) : (
              <span>Pas encore branchée</span>
            )}
          </p>
        </div>

        <section className="cx-assistant entree" style={{ ['--i' as string]: 2 }} aria-label={`Brancher ${machine.numero}, temps ${wiz + 1} sur ${TEMPS.length}`}>
          <FilDesTemps courant={wiz} atteint={atteint} aller={aller} />
          <h3 key={wiz} className="cx-pas-titre">
            <span className="cx-pas-num">{wiz + 1}</span> {TEMPS[wiz].titre}
            <InfoTip label={`Comprendre : ${TEMPS[wiz].titre.toLowerCase()}`}>{aideDuTemps(wiz, proto, machine.numero)}</InfoTip>
            <small>{TEMPS[wiz].sous}</small>
          </h3>

          {wiz === 0 && <ChoixProtocole choisi={proto} choisir={choisirProtocole} />}
          {wiz === 1 && (
            <Adresse protocole={proto} params={params} changer={(k, v) => setParams((p) => ({ ...p, [k]: v }))} passerelle={passerelle} />
          )}
          {wiz === 2 && <TestLiaison log={log} enCours={testing} lancer={() => void runTest()} numero={machine.numero} passerelle={passerelle} simule={source !== 'api'} />}
          {wiz === 3 && (
            <>
              <Variables
                vars={vars}
                assoc={assoc}
                model={model}
                relier={(variableId, pointId) =>
                  setAssoc((s) => {
                    const n = { ...s };
                    if (pointId) n[variableId] = { pointId, score: 1 };
                    else delete n[variableId];
                    return n;
                  })
                }
                associerAuto={() => setAssoc(autoMatch(vars, model.points, model.organes))}
              />
              <button type="button" className="btn primary cx-enregistrer" onClick={save} disabled={!nbReliees(vars, assoc)}>
                <CheckCircle2 aria-hidden /> Enregistrer la connexion
              </button>
              {enregistree && (
                <div className="cx-enregistree" role="status">
                  <p>
                    <CheckCircle2 aria-hidden /> <span className="mono">{machine.numero}</span> est branchée : ses valeurs remontent en direct.
                  </p>
                  {suivante && (
                    <button type="button" className="btn sm" onClick={() => useUi.getState().selectMachine(suivante.id)}>
                      Machine suivante à brancher : <span className="mono">{suivante.numero}</span> <ArrowRight aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          <div className="wizard-nav cx-nav">
            <button type="button" className="btn sm ghost" onClick={() => aller(Math.max(0, wiz - 1))} disabled={wiz === 0}>
              <ArrowLeft aria-hidden /> Temps précédent
            </button>
            {wiz < DERNIER && (
              <button
                type="button"
                className={`btn sm ${wiz !== 2 || testOk ? 'primary' : ''}`}
                onClick={() => aller(Math.min(DERNIER, wiz + 1))}
                disabled={wiz === 2 && (testing || !log.length)}
              >
                {wiz === 2 && testEchec ? 'Continuer quand même' : `Suivant : ${TEMPS[wiz + 1].titre.toLowerCase()}`} <ArrowRight aria-hidden />
              </button>
            )}
          </div>
          {wiz === 2 && !testOk && !testEchec && !testing && <p className="cx-nav-aide">Lancez le test pour passer aux variables.</p>}
        </section>

        <div className="entree" style={{ ['--i' as string]: 3 }}>
          <AccesAutomate machine={machine} connexion={existing} demande={writeAsk} setDemande={setWriteAsk} raison={reason} setRaison={setReason} />
        </div>
      </div>
    </>
  );
}
