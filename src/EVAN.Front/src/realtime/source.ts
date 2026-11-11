/**
 * Source temps réel du front. Deux implémentations, même contrat :
 *  - LocalSimulator : tout tourne dans le navigateur (démo hors ligne) ;
 *  - ApiSource : hub SignalR d'EVAN.Api, alimenté par MQTT (simulateur .NET ou passerelle réelle).
 */
import { useEffect } from 'react';
import { useLive } from '@/store/live';
import type { Evenement } from '@/domain/types';
import type { Prevue, Saisie } from '@/analytics/maintenance';

export interface FaultResult {
  machineId: string;
  organeId: string;
  code?: string;
}

export interface RealtimeSource {
  readonly kind: 'local' | 'api';
  start(): void;
  stop(): void;
  injectFault(machineId?: string, organeNumero?: number): Promise<FaultResult | null>;
  acknowledge(alarmId: string): Promise<void>;
  resolve(alarmId: string): Promise<void>;
  /**
   * Annule une clôture faite à l'instant (« Intervention terminée » cliquée trop tôt) : l'alarme redevient ouverte,
   * avec la machine en panne. Le simulateur local et l'API d'EVAN (POST /api/alarms/{id}/reopen) savent le faire.
   */
  reopen?(alarmId: string): Promise<void>;
  /** Journalise une action utilisateur (autorisation d'écriture, acquittement…). */
  logEvent(e: Omit<Evenement, 'id'>): void;
  /** Intervention consignée au carnet de maintenance : journal de l'usine, et back s'il est branché. */
  logIntervention(s: Saisie, machineLabel: string): void;
  /**
   * Carnet tenu aussi par le serveur (API d'EVAN) : corrections, suppressions et interventions planifiées y partent
   * pour que l'assistant et le serveur MCP voient le même carnet. Absent pour le simulateur local.
   */
  carnet?: CarnetDistant;
  reset(): void;
}

/** Écritures du carnet envoyées au serveur. Un échec est signalé par un avis ; le carnet du navigateur reste à jour. */
export interface CarnetDistant {
  corriger(s: Saisie): void;
  supprimer(id: string): void;
  /** Remet une saisie retirée (« Annuler » d'une suppression). */
  restaurer(s: Saisie): void;
  /** Planifie une intervention, ou la déplace (même identifiant). */
  planifier(p: Prevue): void;
  /** Annule une intervention planifiée, ou la retire une fois consignée. */
  annulerPrevue(id: string): void;
}

let current: RealtimeSource | null = null;
let starting: Promise<RealtimeSource> | null = null;
/** Incrémenté à chaque arrêt : une source dont le démarrage a été dépassé ne s'allume pas. */
let generation = 0;

/** Deux essais : une API qui démarre (Docker) ou un réseau lent ne font pas basculer pour toute la session sur le simulateur. */
const DETECT_TIMEOUTS_MS = [1500, 3000];

/** Teste l'API (démarrée par Docker Compose) ; sinon simulateur local. */
async function detectApi(siteId: string | undefined): Promise<boolean> {
  if (new URLSearchParams(location.search).get('source') === 'local') return false;
  for (const [i, timeout] of DETECT_TIMEOUTS_MS.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(timeout) });
      // Front servi seul (Vite sans back : page HTML en 200, ou 404) : ce n'est pas l'API, inutile de réessayer.
      if (res.status === 404 || (res.ok && !res.headers.get('content-type')?.includes('json'))) return false;
      if (!res.ok) continue;
      const body = (await res.json()) as { service?: string; sites?: string[] };
      return body.service === 'evan-api' && (!siteId || !body.sites || body.sites.includes(siteId));
    } catch {
      // Délai dépassé ou réseau : essai suivant.
    }
  }
  return false;
}

export async function ensureSource(siteId?: string): Promise<RealtimeSource> {
  if (current) return current;
  if (starting) return starting;
  const gen = generation;
  const p = (async () => {
    let src: RealtimeSource;
    if (await detectApi(siteId)) {
      const { ApiSource } = await import('./apiSource');
      src = new ApiSource(siteId ?? 'site-demo');
    } else {
      const { LocalSimulator } = await import('@/sim/simulator');
      src = new LocalSimulator();
    }
    // Arrêt demandé pendant la détection (démontage, double montage en développement) : on n'allume rien.
    if (gen !== generation) return src;
    src.start();
    current = src;
    return src;
  })();
  starting = p;
  return p;
}

export function getSource(): RealtimeSource | null {
  return current;
}

export function stopSource() {
  generation++;
  current?.stop();
  current = null;
  starting = null;
  useLive.setState({ connected: false, lastDataAt: undefined, machines: {}, values: {}, alarms: [], events: [], trace: undefined });
}

/** Démarre la source pour la page courante et l'arrête en la quittant. */
export function useRealtime(siteId?: string) {
  useEffect(() => {
    void ensureSource(siteId);
    return () => stopSource();
  }, [siteId]);
}
