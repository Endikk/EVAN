/**
 * Moteur de règles d'alarme (même logique que EVAN.Core/Domain/Alarms/RulesEngine.cs côté serveur) :
 *  - seuil   : attention puis alarme, avec hystérésis au retour ;
 *  - dérive  : régression linéaire glissante, alerte si le seuil d'alarme sera franchi avant l'horizon ;
 *  - répétitif : même code sur la même machine plusieurs fois dans la fenêtre ;
 *  - automate : signal discret remonté par l'automate (bourrage, casse…).
 */
import type { Alarme, Organe, PointDeMesure, Seuils } from '@/domain/types';
import type { OrganeDef } from '@/domain/catalog';
import type { Niveau } from '@/store/live';
import { uid } from './random';

export function classify(v: number, s: Seuils): Niveau {
  if ((s.alarmeHaut !== undefined && v >= s.alarmeHaut) || (s.alarmeBas !== undefined && v <= s.alarmeBas)) return 'alarme';
  if ((s.attentionHaut !== undefined && v >= s.attentionHaut) || (s.attentionBas !== undefined && v <= s.attentionBas)) return 'attention';
  return 'ok';
}

/** Seuil franchi (le plus proche dans le sens de l'écart). */
export function crossedThreshold(v: number, s: Seuils, niveau: Niveau): number | undefined {
  if (niveau === 'alarme') return s.alarmeHaut !== undefined && v >= s.alarmeHaut ? s.alarmeHaut : s.alarmeBas;
  if (niveau === 'attention') return s.attentionHaut !== undefined && v >= s.attentionHaut ? s.attentionHaut : s.attentionBas;
  return undefined;
}

export interface RulesContext {
  organe(point: PointDeMesure): Organe | undefined;
  def(point: PointDeMesure): OrganeDef | undefined;
  /** Nombre d'alarmes critiques du même code sur la machine depuis `since` (historique + session). */
  countRecent(machineId: string, code: string, since: number): number;
  emit(alarm: Alarme, kind: 'raised' | 'cleared' | 'updated'): void;
}

interface PointState {
  niveau: Niveau;
  okTicks: number;
  buf: { t: number; v: number }[];
  alarm?: Alarme;
  drift?: Alarme;
  lastDrift: number;
}

const DRIFT_WINDOW = 90; // échantillons
const DRIFT_HORIZON_S = 30 * 60;
const REPEAT_WINDOW_MS = 8 * 3600 * 1000;
const REPEAT_COUNT = 3;

const CODE_TYPE: Record<string, string> = {
  tension: 'TB',
  temperature: 'TH',
  pression: 'PR',
  vitesse: 'SP',
  reperage: 'RG',
  puissance: 'PW',
  taux: 'RT',
  comptage: 'CT',
  diametre: 'DM',
  usure: 'WR',
  alarme: 'AL',
};

export class RulesEngine {
  private state = new Map<string, PointState>();
  constructor(private ctx: RulesContext) {}

  reset() {
    this.state.clear();
  }

  private st(id: string): PointState {
    let s = this.state.get(id);
    if (!s) {
      s = { niveau: 'ok', okTicks: 0, buf: [], lastDrift: 0 };
      this.state.set(id, s);
    }
    return s;
  }

  codeFor(point: PointDeMesure): { code: string; message?: string } {
    const def = this.ctx.def(point);
    if (def?.alarme && def.panne?.mesure === point.cle) return { code: def.alarme.code, message: def.alarme.message };
    const organe = this.ctx.organe(point);
    return { code: `${CODE_TYPE[point.type] ?? 'EV'}-${organe?.numero ?? 0}${point.cle.length % 10}` };
  }

  /** Évalue un échantillon. `enService` : la machine produit (pas d'alerte de dérive à l'arrêt). */
  evaluate(point: PointDeMesure, v: number, t: number, enService: boolean): Niveau {
    const s = this.st(point.id);
    const niveau = classify(v, point.seuils);
    s.buf.push({ t, v });
    if (s.buf.length > DRIFT_WINDOW) s.buf.shift();

    const alarmRank = s.alarm ? (s.alarm.gravite === 'critique' ? 2 : 1) : 0;
    if (niveau !== 'ok' && severityRank(niveau) > alarmRank) {
      // Nouvelle alarme, ou escalade : l'attention en cours est close et remplacée par la critique.
      if (s.alarm) this.ctx.emit({ ...s.alarm, statut: 'resolue', finLe: t, message: `${s.alarm.message} (escaladée)` }, 'cleared');
      s.alarm = this.raise(point, v, t, niveau);
      if (s.drift) {
        this.ctx.emit({ ...s.drift, statut: 'resolue', finLe: t }, 'cleared');
        s.drift = undefined;
      }
      s.okTicks = 0;
    } else if (niveau !== 'ok') {
      s.okTicks = 0;
    } else if (s.alarm) {
      s.okTicks++;
      // Hystérésis : 3 échantillons consécutifs dans la plage. Les alarmes critiques restent
      // actives jusqu'à l'intervention (résolution explicite).
      if (s.okTicks >= 3 && s.alarm.gravite !== 'critique') {
        this.ctx.emit({ ...s.alarm, statut: 'resolue', finLe: t }, 'cleared');
        s.alarm = undefined;
      }
    }
    s.niveau = niveau;

    // Dérive : toutes les 10 s, sur une fenêtre pleine, si la mesure est encore dans la plage.
    // Pas sur les consommables et compteurs (bobine qui se vide, usure, comptage) : leur pente est normale.
    const attendue = !!this.ctx.def(point)?.mesures.find((m) => m.cle === point.cle)?.dynamique;
    if (enService && !attendue && niveau === 'ok' && !s.alarm && s.buf.length >= DRIFT_WINDOW * 0.66 && t - s.lastDrift > 10_000) {
      s.lastDrift = t;
      this.checkDrift(point, s, t);
    }
    return niveau;
  }

  private checkDrift(point: PointDeMesure, s: PointState, t: number) {
    const n = s.buf.length;
    const t0 = s.buf[0].t;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const p of s.buf) {
      const x = (p.t - t0) / 1000;
      sx += x;
      sy += p.v;
      sxx += x * x;
      sxy += x * p.v;
      syy += p.v * p.v;
    }
    const den = n * sxx - sx * sx;
    const deny = n * syy - sy * sy;
    if (den <= 0) return;
    const slope = (n * sxy - sx * sy) / den; // unité par seconde
    // Coefficient de détermination : une vraie dérive est régulière (R² élevé), le bruit ne l'est pas.
    const r2 = deny > 0 ? (n * sxy - sx * sy) ** 2 / (den * deny) : 0;
    const last = s.buf[n - 1].v;
    const sd = point.seuils;
    const target = slope > 0 ? sd.alarmeHaut : sd.alarmeBas;
    const range = Math.abs((sd.alarmeHaut ?? point.nominal * 1.5) - (sd.alarmeBas ?? point.nominal * 0.5)) || 1;
    const significant = Math.abs(slope) * 60 > range * 0.01 && r2 > 0.75;
    if (target === undefined || !significant) {
      if (s.drift) {
        this.ctx.emit({ ...s.drift, statut: 'resolue', finLe: t }, 'cleared');
        s.drift = undefined;
      }
      return;
    }
    const eta = (target - last) / slope;
    if (eta > 0 && eta < DRIFT_HORIZON_S) {
      const minutes = Math.max(1, Math.round(eta / 60));
      const def = this.ctx.def(point);
      const message = `Dérive : ${point.libelle.toLowerCase()} atteindra ${fmt(target)} ${point.unite} dans ~${minutes} min`;
      if (s.drift) {
        this.ctx.emit({ ...s.drift, message, valeur: last }, 'updated');
        s.drift = { ...s.drift, message, valeur: last };
      } else {
        const organe = this.ctx.organe(point);
        s.drift = {
          id: uid('al'),
          code: `DR-${this.codeFor(point).code}`,
          message,
          gravite: 'attention',
          machineId: point.machineId,
          organeId: point.organeId,
          pointId: point.id,
          horodatage: t,
          valeur: last,
          unite: point.unite,
          seuil: target,
          statut: 'active',
          regle: 'derive',
          cause:
            def?.panne?.mesure === point.cle
              ? def.panne.cause
              : `Tendance régulière sur ${organe?.nom ?? 'l’organe'} : intervenir avant le franchissement du seuil.`,
        };
        this.ctx.emit(s.drift, 'raised');
      }
    }
  }

  private raise(point: PointDeMesure, v: number, t: number, niveau: Niveau): Alarme {
    const organe = this.ctx.organe(point);
    const def = this.ctx.def(point);
    const { code, message } = this.codeFor(point);
    const seuil = crossedThreshold(v, point.seuils, niveau);
    const discrete = point.type === 'alarme';
    const critique = niveau === 'alarme';
    let regle: Alarme['regle'] = discrete ? 'automate' : 'seuil';
    let repetitions: number | undefined;
    if (critique) {
      const n = this.ctx.countRecent(point.machineId, code, t - REPEAT_WINDOW_MS) + 1;
      if (n >= REPEAT_COUNT) {
        regle = 'repetitif';
        repetitions = n;
      }
    }
    const base = message ?? `${point.libelle} ${critique ? 'hors limite' : 'proche de la limite'}`;
    const alarm: Alarme = {
      id: uid('al'),
      code,
      message: repetitions ? `${base} · ${repetitions}ᵉ fois en 8 h` : base,
      gravite: critique ? 'critique' : 'attention',
      machineId: point.machineId,
      organeId: point.organeId,
      pointId: point.id,
      horodatage: t,
      valeur: v,
      unite: point.unite,
      seuil,
      statut: 'active',
      regle,
      repetitions,
      cause:
        def?.panne?.mesure === point.cle
          ? def.panne.cause
          : organe?.methode ?? 'Mesure hors plage : contrôler le capteur puis l’organe.',
    };
    this.ctx.emit(alarm, 'raised');
    return alarm;
  }

  /**
   * Oublie tout ce que le moteur sait d'un point (niveau, tampon de dérive) : après une intervention, la mesure qui
   * revient à la normale repart d'une page blanche, sans que sa remontée soit lue comme une dérive.
   */
  forget(pointId: string) {
    this.state.delete(pointId);
  }

  /**
   * Remet une alarme sous la garde du moteur (clôture annulée) : il la tient de nouveau pour en cours sur son point,
   * au lieu d'en lever une seconde au prochain échantillon hors limite.
   */
  restore(alarm: Alarme) {
    if (!alarm.pointId) return;
    const s = this.st(alarm.pointId);
    if (alarm.regle === 'derive') s.drift = alarm;
    else {
      s.alarm = alarm;
      s.niveau = alarm.gravite === 'critique' ? 'alarme' : 'attention';
    }
    s.okTicks = 0;
  }

  /** Clôture manuelle (intervention terminée). */
  resolve(alarmId: string, t: number) {
    for (const s of this.state.values()) {
      if (s.alarm?.id === alarmId) {
        this.ctx.emit({ ...s.alarm, statut: 'resolue', finLe: t }, 'cleared');
        s.alarm = undefined;
        s.niveau = 'ok';
        s.okTicks = 0;
        s.buf = [];
      }
      if (s.drift?.id === alarmId) {
        this.ctx.emit({ ...s.drift, statut: 'resolue', finLe: t }, 'cleared');
        s.drift = undefined;
      }
    }
  }
}

function severityRank(n: Niveau) {
  return n === 'alarme' ? 2 : n === 'attention' ? 1 : 0;
}

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0 }).format(v);
}
