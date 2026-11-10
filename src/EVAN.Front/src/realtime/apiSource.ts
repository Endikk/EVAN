/**
 * Source temps réel branchée sur EVAN.Api : SignalR pour le flux, REST pour les actions.
 * Le hub pousse des lots (1 Hz) au format du contrat evan.realtime/1 (voir docs/COMMUNICATION.md).
 *
 * La connexion ne renonce jamais : après une coupure longue (API redéployée, réseau d'usine), elle réessaie toutes les
 * 10 s. « Temps réel » ne s'affiche qu'une fois la connexion inscrite au groupe de l'usine, seul moment où les données
 * arrivent vraiment.
 */
import * as signalR from '@microsoft/signalr';
import type { Alarme, Evenement } from '@/domain/types';
import type { Saisie } from '@/analytics/maintenance';
import { ENTETE_ECRITURE } from '@/api/http';
import { useLive, pushSample, type DetectionTrace, type MachineLive, type PointLive } from '@/store/live';
import type { FaultResult, RealtimeSource } from './source';

interface SnapshotDto {
  machines: Record<string, MachineLive>;
  values: Record<string, PointLive>;
  alarms: Alarme[];
  events: Evenement[];
}

/** Délais entre deux tentatives : vite d'abord, puis toutes les 10 s, sans fin. */
const RETRY_MS = [0, 1000, 2000, 5000];
const RETRY_MAX_MS = 10_000;
const retryDelay = (attempt: number) => RETRY_MS[attempt] ?? RETRY_MAX_MS;
/** Une alarme levée depuis plus longtemps n'est pas annoncée par un toast (reprise après redémarrage). */
const TOAST_RECENTE_MS = 60_000;
/** Une action sans réponse au bout de ce délai est considérée comme non transmise. */
const ACTION_TIMEOUT_MS = 8000;

/** Échec d'une action envoyée à l'API (réseau, délai, erreur serveur). */
export class ActionNonTransmise extends Error {}

export class ApiSource implements RealtimeSource {
  readonly kind = 'api' as const;
  private hub?: signalR.HubConnection;
  /** Posé par stop() : les messages d'un hub arrêté n'écrivent plus dans le store (changement d'usine). */
  private stopped = false;
  private retryTimer?: number;
  /** Tentatives depuis le dernier Join réussi : l'attente s'allonge jusqu'à 10 s, même si le serveur refuse le Join. */
  private attempt = 0;

  constructor(private siteId: string) {}

  start() {
    const hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/supervision')
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => retryDelay(ctx.previousRetryCount) })
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    this.hub = hub;
    const live =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (!this.stopped) fn(...args);
      };

    hub.on(
      'snapshot',
      live((s: SnapshotDto) => {
        useLive.setState({ machines: s.machines, values: s.values, alarms: s.alarms, events: s.events, lastDataAt: Date.now() });
      }),
    );
    hub.on(
      'telemetry',
      live((batch: { values: Record<string, PointLive>; machines: Record<string, MachineLive> }) => {
        for (const [id, p] of Object.entries(batch.values)) pushSample(id, p.t, p.v);
        useLive.setState((st) => ({
          tick: st.tick + 1,
          lastDataAt: Date.now(),
          values: { ...st.values, ...batch.values },
          machines: { ...st.machines, ...batch.machines },
        }));
      }),
    );
    hub.on(
      'alarm',
      live((a: Alarme) => {
        const connue = useLive.getState().alarms.some((x) => x.id === a.id);
        useLive.setState((st) => {
          const i = st.alarms.findIndex((x) => x.id === a.id);
          const alarms = i >= 0 ? st.alarms.map((x) => (x.id === a.id ? a : x)) : [a, ...st.alarms];
          return { alarms };
        });
        // Toast pour une alarme qui vient d'être levée, pas pour une alarme ancienne rediffusée (API redémarrée qui
        // relit ses alarmes ouvertes, mise à jour d'une alarme déjà à l'écran).
        if (a.statut === 'active' && !connue && Date.now() - a.horodatage < TOAST_RECENTE_MS) {
          useLive.getState().pushToast({ gravite: a.gravite === 'critique' ? 'critique' : 'attention', titre: a.code, texte: a.message, alarmeId: a.id });
        }
      }),
    );
    hub.on(
      'event',
      live((e: Evenement) => useLive.setState((st) => ({ events: [e, ...st.events].slice(0, 300) }))),
    );
    hub.on(
      'trace',
      live((t: DetectionTrace) => {
        // L'horodatage d'affichage est pris ici : c'est la dernière étape de la chaîne.
        const now = Date.now();
        const steps = t.termine ? [...t.steps, { etape: 'ecran' as const, libelle: 'Écran de supervision', detail: 'Reçu par ce navigateur', t: now }] : t.steps;
        const sample = t.steps.filter((s) => s.etape === 'capteur').pop()?.t;
        useLive.setState({ trace: { ...t, steps, simule: false, latence: t.termine && sample ? now - sample : undefined } });
      }),
    );
    // Données de la session précédente : « Données figées » ne doit pas s'afficher au retour, avant le premier lot.
    hub.onreconnecting(live(() => useLive.setState({ connected: false, lastDataAt: undefined })));
    hub.onreconnected(live(() => void this.join(hub)));
    // Fermeture définitive (démarrage raté, groupe refusé) : nouvelle tentative tant que la source n'est pas arrêtée.
    hub.onclose(live(() => this.schedule(hub)));

    useLive.setState({ source: 'api', connected: false });
    void this.connect(hub);
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    void this.hub?.stop();
  }

  private schedule(hub: signalR.HubConnection) {
    if (this.stopped) return;
    useLive.setState({ connected: false, lastDataAt: undefined });
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => void this.connect(hub), retryDelay(this.attempt++));
  }

  /** Premier démarrage ou reprise après fermeture : withAutomaticReconnect ne couvre ni l'un ni l'autre. */
  private async connect(hub: signalR.HubConnection) {
    if (this.stopped || hub.state !== signalR.HubConnectionState.Disconnected) return;
    try {
      await hub.start();
    } catch {
      this.schedule(hub);
      return;
    }
    await this.join(hub);
  }

  /** Inscription au groupe de l'usine. En cas d'échec, la connexion est fermée pour repartir de zéro. */
  private async join(hub: signalR.HubConnection) {
    try {
      await hub.invoke('Join', this.siteId);
      this.attempt = 0;
      if (!this.stopped) useLive.setState({ connected: true });
    } catch {
      if (this.stopped) return;
      useLive.setState({ connected: false });
      void hub.stop();
    }
  }

  /** POST vers l'API, borné dans le temps. Lève ActionNonTransmise si la requête n'aboutit pas (réseau ou 5xx). */
  private async post(url: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: body === undefined ? ENTETE_ECRITURE : { ...ENTETE_ECRITURE, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(ACTION_TIMEOUT_MS),
      });
    } catch {
      throw new ActionNonTransmise('API injoignable');
    }
    if (res.status >= 500) throw new ActionNonTransmise(`Erreur du serveur (${res.status})`);
    return res;
  }

  /** Signale l'échec d'une action : rien n'a changé côté serveur, l'écran ne doit pas laisser croire le contraire. */
  private signaler(titre: string, err: unknown) {
    useLive.getState().pushToast({
      gravite: 'critique',
      titre,
      texte: `${err instanceof Error ? err.message : 'Erreur inconnue'}. Réessayez quand la connexion est rétablie.`,
    });
  }

  async injectFault(machineId?: string, organeNumero?: number): Promise<FaultResult | null> {
    const res = await this.post(`/api/demo/${this.siteId}/fault`, { machineId, organeNumero });
    if (res.ok) return (await res.json()) as FaultResult;
    // 409 : aucune machine disponible (toutes en défaut) ou simulateur injoignable. Le reste n'a pas abouti.
    if (res.status === 409) return null;
    throw new ActionNonTransmise(res.status === 429 ? 'Trop de demandes rapprochées, patientez quelques secondes' : `Refusée par le serveur (${res.status})`);
  }

  async acknowledge(alarmId: string) {
    try {
      const res = await this.post(`/api/alarms/${alarmId}/ack`);
      if (!res.ok) throw new ActionNonTransmise(`Refusé par le serveur (${res.status})`);
    } catch (err) {
      this.signaler('Acquittement non transmis', err);
    }
  }

  async resolve(alarmId: string) {
    try {
      const res = await this.post(`/api/alarms/${alarmId}/resolve`);
      if (!res.ok) throw new ActionNonTransmise(`Refusé par le serveur (${res.status})`);
    } catch (err) {
      this.signaler('Clôture non transmise', err);
    }
  }

  logEvent(e: Omit<Evenement, 'id'>) {
    this.post(`/api/sites/${this.siteId}/events`, e)
      .then((res) => {
        if (!res.ok) throw new ActionNonTransmise(`Refusé par le serveur (${res.status})`);
      })
      .catch((err) => this.signaler('Événement non journalisé', err));
  }

  logIntervention(s: Saisie) {
    // Le back consigne l'intervention et l'inscrit au journal de l'usine (l'événement revient par le hub).
    this.post(`/api/sites/${this.siteId}/interventions`, s)
      .then((res) => {
        if (!res.ok) throw new ActionNonTransmise(`Refusée par le serveur (${res.status})`);
      })
      .catch((err) => this.signaler('Intervention non enregistrée sur le serveur', err));
  }

  reset() {
    this.post(`/api/demo/${this.siteId}/reset`).catch((err) => this.signaler('Remise à zéro non transmise', err));
  }
}
