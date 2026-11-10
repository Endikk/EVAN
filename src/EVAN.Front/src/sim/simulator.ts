/**
 * Simulateur intégré au navigateur : joue le rôle des machines, de la passerelle et du back
 * quand l'API n'est pas joignable (démo hors ligne, tests). Même contrat que EVAN.Simulator :
 * télémétrie à 1 Hz, états machine, alarmes issues du moteur de règles, trace de détection.
 */
import type { Alarme, EtatMachine, Evenement, Machine, Organe, PointDeMesure } from '@/domain/types';
import { machineModel, type MesureDef, type OrganeDef, type PanneDef } from '@/domain/catalog';
import { useLive, pushSample, clearSeries, type DetectionTrace, type MachineLive, type PointLive, type TraceStep } from '@/store/live';
import { useProject } from '@/store/project';
import { RulesEngine } from './rules';
import { getHistory } from './history';
import { clamp, easeInOut, gauss, uid } from './random';
import type { RealtimeSource, FaultResult } from '@/realtime/source';
import type { Saisie } from '@/analytics/maintenance';

interface Fault {
  pointId: string;
  def: PanneDef;
  from: number;
  start: number;
  recovering?: number;
}

interface PointRt {
  point: PointDeMesure;
  def: MesureDef;
  organe: Organe;
  odef: OrganeDef;
  value: number;
  fault?: Fault;
}

interface MachineRt {
  machine: Machine;
  prod: 'marche' | 'calage' | 'arret';
  until: number;
  vitesse: number;
  nominale: number;
  bonnes: number;
  gache: number;
  depuis: number;
  etat: EtatMachine;
  phase: number;
  points: PointRt[];
  /** Mètres → étiquettes (pas de 0,11 m) pour les compteurs. */
  facteurComptage: number;
}

const TICK_MS = 1000;
// Latences typiques de la chaîne (ms) affichées dans la trace en mode simulé.
const LAT = { automate: 8, passerelle: 250, mqtt: 18, ingestion: 6, regles: 2, signalr: 24 };

/** Mêmes éléments, dans le même ordre (les alarmes et événements sont remplacés, jamais modifiés en place). */
function sameItems<T>(a: readonly T[], b: readonly T[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export class LocalSimulator implements RealtimeSource {
  readonly kind = 'local' as const;
  private timer?: number;
  private machines = new Map<string, MachineRt>();
  private points = new Map<string, PointRt>();
  private engine: RulesEngine;
  private alarms: Alarme[] = [];
  private events: Evenement[] = [];
  private trace?: DetectionTrace;
  private startedAt = Date.now();
  private unsub?: () => void;

  constructor() {
    this.engine = new RulesEngine({
      organe: (p) => this.points.get(p.id)?.organe,
      def: (p) => this.points.get(p.id)?.odef,
      countRecent: (machineId, code, since) => {
        const past = getHistory(useProject.getState().machines).alarmes;
        const all = [...past, ...this.alarms];
        return all.filter((a) => a.machineId === machineId && a.code === code && a.gravite === 'critique' && a.horodatage >= since).length;
      },
      emit: (a, kind) => this.onAlarm(a, kind),
    });
  }

  start() {
    this.sync();
    this.unsub = useProject.subscribe((s, prev) => {
      if (s.machines !== prev.machines || s.perso !== prev.perso) this.sync();
    });
    useLive.setState({ source: 'local', connected: true });
    this.loop();
  }

  stop() {
    window.clearTimeout(this.timer);
    this.unsub?.();
  }

  private loop = () => {
    this.step(Date.now());
    this.timer = window.setTimeout(this.loop, TICK_MS);
  };

  /** Recrée les machines simulées à partir du projet courant (ajouts, suppressions). */
  sync() {
    const { machines } = useProject.getState();
    const keep = new Set(machines.map((m) => m.id));
    for (const id of [...this.machines.keys()]) if (!keep.has(id)) this.machines.delete(id);
    machines.forEach((m, index) => {
      const existing = this.machines.get(m.id);
      if (existing && existing.machine.type === m.type) {
        existing.machine = m;
        // Seuils modifiés à l'étape 4 : pris en compte à chaud par le moteur de règles.
        const model = machineModel(m, useProject.getState().perso[m.id]);
        for (const p of existing.points) {
          const np = model.points.find((x) => x.id === p.point.id);
          if (np) p.point = np;
        }
        return;
      }
      const model = machineModel(m, useProject.getState().perso[m.id]);
      const nominale = model.type?.vitesse.nominale ?? 100;
      const rt: MachineRt = {
        machine: m,
        prod: 'marche',
        until: 0,
        vitesse: nominale * 0.92,
        nominale,
        bonnes: 0,
        gache: 0,
        depuis: Date.now() - (20 + index * 7) * 60_000,
        etat: 'marche',
        phase: index * 1.7,
        points: [],
        facteurComptage: model.type?.vitesse.unite === 'm/min' ? 1 / 0.11 : 1,
      };
      // Ambiance : la ligne paravent n'a pas de travail planifié, une rotative est en calage.
      if (m.id === 'm-pv01') {
        rt.prod = 'arret';
        rt.until = Infinity;
        rt.vitesse = 0;
      } else if (m.id === 'm-r06') {
        rt.prod = 'calage';
        rt.until = Date.now() + 25_000;
      }
      for (const o of model.organes) {
        const odef = model.defs[o.id];
        if (!odef) continue;
        for (const def of odef.mesures) {
          const point = model.points.find((p) => p.id === `${o.id}.${def.cle}`);
          if (!point) continue;
          const p: PointRt = { point, def, organe: o, odef, value: initialValue(def, index) };
          // Démo : lampe UV de R04 en fin de vie, qui dérive doucement (détection par tendance).
          if (m.id === 'm-r04' && def.cle === 'puissance_uv') p.value = 76.5;
          rt.points.push(p);
          this.points.set(point.id, p);
        }
      }
      this.machines.set(m.id, rt);
    });
  }

  private step(now: number) {
    const dt = TICK_MS / 1000;
    const values: Record<string, PointLive> = {};
    const machinesLive: Record<string, MachineLive> = {};

    for (const rt of this.machines.values()) {
      const panne = this.alarms.some((a) => a.machineId === rt.machine.id && a.gravite === 'critique' && a.statut !== 'resolue');
      const attention = this.alarms.some((a) => a.machineId === rt.machine.id && a.gravite === 'attention' && a.statut !== 'resolue');

      // Cycle de production : calages ponctuels pour animer l'atelier.
      if (!panne) {
        if (rt.prod !== 'marche' && now > rt.until) {
          this.setProd(rt, 'marche', now, rt.prod === 'calage' ? 'Fin de calage, production lancée' : undefined);
        } else if (rt.prod === 'marche' && Math.random() < 1 / 420 && !this.anyFault(rt)) {
          this.setProd(rt, 'calage', now, 'Calage d’un nouveau travail');
          rt.until = now + (14 + Math.random() * 14) * 1000;
        }
      }
      const target = panne ? 0 : rt.prod === 'arret' ? 0 : rt.prod === 'calage' ? rt.nominale * 0.18 : rt.nominale * (0.92 + 0.04 * Math.sin(now / 37_000 + rt.phase));
      rt.vitesse += (target - rt.vitesse) * (panne ? 0.45 : 0.25);
      if (Math.abs(rt.vitesse - target) < 0.05) rt.vitesse = target;
      const produced = (rt.vitesse / 60) * dt * rt.facteurComptage;
      if (rt.prod === 'calage') rt.gache += produced;
      else rt.bonnes += produced * 0.985;
      if (rt.prod === 'marche') rt.gache += produced * 0.015;

      const etat: EtatMachine = panne ? 'panne' : attention ? 'attention' : rt.prod;
      if (etat !== rt.etat) {
        rt.etat = etat;
        rt.depuis = now;
      }
      const enService = rt.vitesse > rt.nominale * 0.05;
      const facteur = rt.nominale ? rt.vitesse / rt.nominale : 0;

      for (const p of rt.points) {
        p.value = this.nextValue(rt, p, now, dt, facteur, panne);
        const niveau = this.engine.evaluate(p.point, p.value, now, enService);
        values[p.point.id] = { v: p.value, t: now, niveau };
        pushSample(p.point.id, now, p.value);
      }
      machinesLive[rt.machine.id] = {
        etat: rt.etat,
        vitesse: rt.vitesse,
        facteur,
        depuis: rt.depuis,
        bonnes: rt.bonnes,
        gache: rt.gache,
      };
    }
    useLive.setState((s) => ({
      tick: s.tick + 1,
      lastDataAt: Date.now(),
      machines: machinesLive,
      values,
      // Nouvelle liste seulement si elle a changé : sinon tout abonné aux alarmes (l'espace de travail entier)
      // se re-rendrait chaque seconde.
      alarms: sameItems(s.alarms, this.alarms) ? s.alarms : [...this.alarms],
      events: sameItems(s.events, this.events) ? s.events : [...this.events],
      trace: this.trace ? { ...this.trace, steps: [...this.trace.steps] } : undefined,
    }));
  }

  private anyFault(rt: MachineRt) {
    return rt.points.some((p) => p.fault && !p.fault.recovering);
  }

  private setProd(rt: MachineRt, prod: MachineRt['prod'], now: number, message?: string) {
    rt.prod = prod;
    if (message) this.event({ type: 'etat', machineId: rt.machine.id, message: `${rt.machine.numero} · ${message}`, horodatage: now });
  }

  private nextValue(rt: MachineRt, p: PointRt, now: number, dt: number, facteur: number, panne: boolean): number {
    const { def } = p;
    if (def.role === 'vitesse') return Math.max(0, rt.vitesse * (def.nominal / rt.nominale) + (rt.vitesse > 0 ? gauss() * def.bruit : 0));
    if (def.role === 'alarmes') return this.alarms.filter((a) => a.machineId === rt.machine.id && a.statut !== 'resolue').length;

    const f = p.fault;
    if (f && !f.recovering) {
      const k = clamp((now - f.start) / (f.def.duree * 1000), 0, 1);
      const { cible } = f.def;
      if (f.def.forme === 'saut') return now - f.start > 600 ? cible + gauss() * def.bruit * 0.3 : f.from;
      if (f.def.forme === 'rampe') return f.from + (cible - f.from) * easeInOut(k) + gauss() * def.bruit;
      const amp = (cible - def.nominal) * k;
      return def.nominal + amp * (0.55 + 0.45 * Math.sin((now / 1700) * Math.PI * 2)) + gauss() * def.bruit;
    }
    if (f?.recovering) {
      const v = p.value + (def.nominal - p.value) * 0.35;
      if (Math.abs(v - def.nominal) < Math.max(def.bruit * 2, Math.abs(def.nominal) * 0.01)) p.fault = undefined;
      return v;
    }

    let v = p.value;
    if (def.dynamique === 'compteur') return v + (rt.vitesse / 60) * dt * rt.facteurComptage;
    if (def.dynamique === 'decroit' && facteur > 0) {
      v -= Math.max(0.02, (def.nominal * 0.0016) * facteur) * dt;
      const low = def.seuils.attentionBas ?? def.nominal * 0.2;
      if (v < low * 1.15) {
        v = def.nominal;
        this.event({ type: 'etat', machineId: rt.machine.id, message: `${rt.machine.numero} · ${p.organe.nom} : changement de bobine`, horodatage: now });
      }
      return v + gauss() * def.bruit * 0.2;
    }
    if (def.dynamique === 'croit' && facteur > 0) {
      if (def.type === 'usure') return v + 0.0004 * facteur * dt;
      v += def.nominal * 0.0012 * facteur * dt;
      const high = def.seuils.attentionHaut ?? def.nominal * 2;
      if (v > high * 0.95) v = def.nominal;
      return v;
    }
    // Démo : dérive lente de la puissance UV de R04 (franchit le seuil d’attention vers 3 min, reste au-dessus du seuil d’alarme).
    if (rt.machine.id === 'm-r04' && def.cle === 'puissance_uv' && !panne) return Math.max(70.8, v - 0.02 * dt) + gauss() * 0.05;
    // Retour progressif vers la nominale + bruit.
    return v + (def.nominal - v) * 0.15 + gauss() * def.bruit;
  }

  private onAlarm(a: Alarme, kind: 'raised' | 'cleared' | 'updated') {
    const i = this.alarms.findIndex((x) => x.id === a.id);
    if (i >= 0) {
      const prev = this.alarms[i];
      this.alarms[i] = kind === 'cleared' ? { ...prev, ...a, statut: 'resolue' } : { ...a, statut: prev.statut, acquitteePar: prev.acquitteePar, acquitteeLe: prev.acquitteeLe };
    } else {
      this.alarms.unshift(a);
      if (this.alarms.length > 200) this.alarms.pop();
    }
    const rt = this.machines.get(a.machineId);
    const name = rt ? `${rt.machine.numero} ${rt.machine.nom}` : a.machineId;
    if (kind === 'raised') {
      this.event({ type: 'alarme', machineId: a.machineId, horodatage: a.horodatage, message: `${a.code} · ${name} · ${a.message}` });
      useLive.getState().pushToast({
        gravite: a.gravite === 'critique' ? 'critique' : 'attention',
        titre: `${a.code} · ${name}`,
        texte: a.message,
        alarmeId: a.id,
      });
      this.traceAlarm(a);
    }
  }

  /** Ajoute les étapes de la chaîne de détection à la trace en cours. */
  private traceAlarm(a: Alarme) {
    const tr = this.trace;
    if (!tr || tr.termine || tr.machineId !== a.machineId) return;
    const p = a.pointId ? this.points.get(a.pointId) : undefined;
    const rt = this.machines.get(a.machineId);
    const proto = useProject.getState().connexions[a.machineId]?.protocole ?? 'opcua';
    const t0 = a.horodatage;
    const unit = a.unite ? ` ${a.unite}` : '';
    const steps: TraceStep[] = [];
    if (!tr.steps.some((s) => s.etape === 'capteur')) {
      steps.push(
        { etape: 'capteur', libelle: 'Capteur', detail: `${p?.point.libelle ?? 'Mesure'} = ${fmt(a.valeur)}${unit}`, t: t0 },
        { etape: 'automate', libelle: 'Automate', detail: 'Variable rafraîchie au cycle automate (10 ms)', t: t0 + LAT.automate },
        {
          etape: 'passerelle',
          libelle: 'Passerelle edge',
          detail:
            proto === 'jmf'
              ? 'Signal JMF reçu de la presse'
              : proto === 'modbus'
                ? 'Lecture Modbus TCP (scrutation 500 ms)'
                : `Notification OPC UA (abonnement, publication 250 ms) · ${p?.point.adresse ?? `ns=2;s=${rt?.machine.numero}.${p?.point.cle}`}`,
          t: t0 + LAT.automate + LAT.passerelle,
        },
        {
          etape: 'mqtt',
          libelle: 'MQTT (TLS)',
          detail: `evan/v1/${useProject.getState().site?.id ?? 'site'}/${a.machineId}/telemetry · QoS 1`,
          t: t0 + LAT.automate + LAT.passerelle + LAT.mqtt,
        },
        { etape: 'ingestion', libelle: 'Ingestion', detail: 'Écriture série temporelle (hypertable mesures)', t: t0 + LAT.automate + LAT.passerelle + LAT.mqtt + LAT.ingestion },
      );
    }
    const base = t0 + LAT.automate + LAT.passerelle + LAT.mqtt + LAT.ingestion;
    const rule =
      a.regle === 'derive' ? 'Règle de dérive' : a.regle === 'automate' ? 'Défaut remonté par l’automate' : a.regle === 'repetitif' ? 'Seuil + défaut répétitif' : 'Règle de seuil';
    steps.push({
      etape: 'regles',
      libelle: a.gravite === 'critique' ? 'Moteur de règles · alarme' : 'Moteur de règles · attention',
      detail: `${rule}${a.seuil !== undefined ? ` : ${fmt(a.seuil)}${unit} franchi` : ''}`,
      t: base + LAT.regles,
    });
    if (a.gravite === 'critique') {
      steps.push(
        { etape: 'alarme', libelle: `Alarme ${a.code}`, detail: `${a.message} · machine arrêtée`, t: base + LAT.regles + 1 },
        { etape: 'signalr', libelle: 'Diffusion temps réel', detail: 'SignalR → groupe du site', t: base + LAT.regles + 1 + LAT.signalr },
        { etape: 'ecran', libelle: 'Écran de supervision', detail: 'Machine en rouge sur le plan, organe localisé', t: base + LAT.regles + 1 + LAT.signalr + 16 },
      );
      tr.code = a.code;
      tr.termine = true;
      tr.latence = base + LAT.regles + 1 + LAT.signalr + 16 - t0;
    }
    tr.steps.push(...steps);
  }

  logEvent(e: Omit<Evenement, 'id'>) {
    this.event(e);
    useLive.setState({ events: [...this.events] });
  }

  logIntervention(s: Saisie, machineLabel: string) {
    this.logEvent({ type: 'action', machineId: s.machineId, horodatage: Date.now(), message: `Intervention consignée · ${machineLabel} · ${s.titre}`, auteur: s.auteur });
  }

  private event(e: Omit<Evenement, 'id'>) {
    this.events.unshift({ ...e, id: uid('ev') });
    if (this.events.length > 300) this.events.pop();
  }

  async injectFault(machineId?: string, organeNumero?: number): Promise<FaultResult | null> {
    const candidates = [...this.machines.values()].filter(
      (rt) =>
        rt.etat !== 'panne' &&
        rt.prod !== 'arret' &&
        !this.anyFault(rt) &&
        rt.points.some((p) => p.odef.panne) &&
        (!machineId || rt.machine.id === machineId),
    );
    const rt = candidates[Math.floor(Math.random() * candidates.length)];
    if (!rt) return null;
    const organs = [...new Set(rt.points.filter((p) => p.odef.panne && (!organeNumero || p.organe.numero === organeNumero)).map((p) => p.organe.id))];
    const organeId = organs[Math.floor(Math.random() * organs.length)];
    const target = rt.points.find((p) => p.organe.id === organeId && p.def.cle === p.odef.panne?.mesure);
    if (!target?.odef.panne) return null;
    const now = Date.now();
    // Une machine à l'arrêt ou en calage repart pour que la panne survienne en production.
    if (rt.prod !== 'marche') this.setProd(rt, 'marche', now);
    target.fault = { pointId: target.point.id, def: target.odef.panne, from: target.value, start: now };
    for (const [cle, val] of Object.entries(target.odef.panne.lie ?? {})) {
      const linked = rt.points.find((p) => p.organe.id === organeId && p.def.cle === cle);
      if (linked) linked.fault = { pointId: linked.point.id, def: { ...target.odef.panne, mesure: cle, cible: val, forme: 'saut' }, from: linked.value, start: now };
    }
    this.trace = {
      id: uid('tr'),
      machineId: rt.machine.id,
      organeId,
      debut: now,
      termine: false,
      simule: true,
      steps: [{ etape: 'defaut', libelle: 'Défaut physique', detail: `${target.organe.nom} · ${rt.machine.numero} ${rt.machine.nom}`, t: now }],
    };
    this.event({ type: 'action', machineId: rt.machine.id, horodatage: now, message: `Panne simulée injectée sur ${rt.machine.numero} · ${target.organe.nom}`, auteur: 'Démo' });
    return { machineId: rt.machine.id, organeId, code: target.odef.alarme?.code };
  }

  async acknowledge(alarmId: string) {
    const now = Date.now();
    this.alarms = this.alarms.map((a) => (a.id === alarmId && a.statut === 'active' ? { ...a, statut: 'acquittee', acquitteePar: 'Superviseur (démo)', acquitteeLe: now } : a));
    const a = this.alarms.find((x) => x.id === alarmId);
    if (a) this.event({ type: 'action', machineId: a.machineId, horodatage: now, message: `Alarme ${a.code} acquittée`, auteur: 'Superviseur (démo)' });
    useLive.setState({ alarms: [...this.alarms], events: [...this.events] });
  }

  async resolve(alarmId: string) {
    const a = this.alarms.find((x) => x.id === alarmId);
    if (!a) return;
    const now = Date.now();
    for (const p of this.points.values()) if (p.point.machineId === a.machineId && p.fault) p.fault.recovering = now;
    this.engine.resolve(alarmId, now);
    // Les autres alarmes actives de la même machine sont closes avec l'intervention.
    for (const other of this.alarms.filter((x) => x.machineId === a.machineId && x.statut !== 'resolue')) this.engine.resolve(other.id, now);
    this.alarms = this.alarms.map((x) => (x.machineId === a.machineId && x.statut !== 'resolue' ? { ...x, statut: 'resolue', finLe: now } : x));
    const rt = this.machines.get(a.machineId);
    if (rt) {
      rt.prod = 'calage';
      rt.until = now + 6000;
    }
    this.event({ type: 'action', machineId: a.machineId, horodatage: now, message: `Intervention terminée, ${a.code} résolue. Redémarrage.`, auteur: 'Maintenance (démo)' });
    useLive.getState().pushToast({ gravite: 'succes', titre: `${a.code} résolue`, texte: `${rt?.machine.numero ?? ''} redémarre après calage.` });
    if (this.trace?.machineId === a.machineId) this.trace = undefined;
    useLive.setState({ alarms: [...this.alarms], events: [...this.events], trace: undefined });
  }

  reset() {
    this.alarms = [];
    this.events = [];
    this.trace = undefined;
    this.engine.reset();
    this.machines.clear();
    this.points.clear();
    clearSeries();
    this.startedAt = Date.now();
    this.sync();
  }

  uptime() {
    return Date.now() - this.startedAt;
  }
}

function initialValue(def: MesureDef, index: number): number {
  if (def.dynamique === 'decroit') {
    const low = (def.seuils.attentionBas ?? def.nominal * 0.2) * 1.2;
    return def.nominal - (def.nominal - low) * ((index * 0.37) % 0.8);
  }
  if (def.dynamique === 'compteur') return 18_000 + index * 4_250;
  return def.nominal + gauss() * def.bruit;
}

function fmt(v?: number) {
  if (v === undefined) return 'n.d.';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 }).format(v);
}
