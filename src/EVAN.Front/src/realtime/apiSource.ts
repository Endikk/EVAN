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
import { useProject } from '@/store/project';
import type { CarnetDistant, FaultResult, RealtimeSource } from './source';

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
  private post(url: string, body?: unknown): Promise<Response> {
    return this.envoyer('POST', url, body);
  }

  /** Écriture vers l'API (POST, PUT, DELETE), bornée dans le temps. Lève ActionNonTransmise sans réponse ou sur un 5xx. */
  private async envoyer(method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
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
    const a = useLive.getState().alarms.find((x) => x.id === alarmId);
    try {
      const res = await this.post(`/api/alarms/${alarmId}/resolve`);
      if (!res.ok) throw new ActionNonTransmise(`Refusé par le serveur (${res.status})`);
    } catch (err) {
      this.signaler('Clôture non transmise', err);
      return;
    }
    // Un clic trop tôt se rattrape, comme dans la démo hors ligne (LocalSimulator.resolve) : l'avis de clôture propose
    // de rouvrir l'alarme pendant 10 s. Le serveur l'accepte de l'organisation qui vient de clore, 30 s au plus.
    const numero = a && useProject.getState().machines.find((m) => m.id === a.machineId)?.numero;
    useLive.getState().pushToast({
      gravite: 'succes',
      titre: `${a?.code ?? 'Alarme'} résolue`,
      texte: numero ? `${numero} redémarre après calage.` : 'La machine redémarre après calage.',
      alarmeId: alarmId,
      // Un avis de réussite n'est pas une panne d'exercice, même quand l'alarme close en était une.
      exercice: false,
      action: { libelle: 'Annuler', faire: () => void this.reopen(alarmId) },
    });
  }

  /** Annule une clôture faite à l'instant : le serveur rouvre les alarmes de la machine, le hub les renvoie ouvertes. */
  async reopen(alarmId: string) {
    let res: Response;
    try {
      res = await this.post(`/api/alarms/${alarmId}/reopen`);
    } catch (err) {
      this.signaler('Clôture non annulée', err);
      return;
    }
    if (res.ok) return;
    // 409 : délai passé, ou clôture faite depuis une autre organisation. Rien n'a changé : l'alarme reste close.
    useLive.getState().pushToast({
      gravite: 'attention',
      titre: 'Clôture non annulée',
      texte: res.status === 409 ? 'Le délai pour annuler est passé : l’alarme reste close.' : `Refusée par le serveur (${res.status}).`,
      alarmeId: alarmId,
    });
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
    this.carnetEcrire(`sa:${s.id}`, 'POST', 'interventions', s, 'Intervention non enregistrée sur le serveur');
  }

  /**
   * Carnet côté serveur : chaque écriture du carnet du navigateur part aussi vers EVAN.Api, pour que l'assistant et le
   * serveur MCP voient le même carnet. Une écriture que le serveur ne prend pas est signalée ; le navigateur, lui, garde
   * la sienne. Une saisie ou une intervention planifiée déjà absente du serveur (404 à la suppression) n'est pas une erreur.
   */
  readonly carnet: CarnetDistant = {
    corriger: (s) => this.carnetEcrire(`sa:${s.id}`, 'PUT', `interventions/${encodeURIComponent(s.id)}`, s, 'Correction non enregistrée sur le serveur'),
    supprimer: (id) =>
      this.carnetEcrire(`sa:${id}`, 'DELETE', `interventions/${encodeURIComponent(id)}`, undefined, 'Suppression non enregistrée sur le serveur'),
    restaurer: (s) => this.carnetEcrire(`sa:${s.id}`, 'POST', 'interventions', s, 'Intervention non remise sur le serveur'),
    planifier: (p) => this.carnetEcrire(`pv:${p.id}`, 'POST', 'interventions/prevues', p, 'Planification non enregistrée sur le serveur'),
    annulerPrevue: (id) =>
      this.carnetEcrire(`pv:${id}`, 'DELETE', `interventions/prevues/${encodeURIComponent(id)}`, undefined, 'Annulation non enregistrée sur le serveur'),
  };

  /**
   * Dernière écriture partie pour chaque saisie et chaque intervention planifiée. La suivante l'attend : le serveur
   * reçoit les gestes dans l'ordre où ils ont été faits. Sans cela, « Annuler » juste après « Consigner » envoyait le
   * DELETE avant que le POST soit arrivé, et la saisie retirée du navigateur restait au serveur.
   */
  private enCours = new Map<string, Promise<void>>();

  private carnetEcrire(cle: string, method: 'POST' | 'PUT' | 'DELETE', chemin: string, body: unknown, titre: string) {
    const ecriture = (this.enCours.get(cle) ?? Promise.resolve())
      .then(() => this.envoyer(method, `/api/sites/${this.siteId}/${chemin}`, body))
      .then((res) => {
        if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new ActionNonTransmise(`Refusée par le serveur (${res.status})`);
      })
      // Une écriture en échec est signalée et ne bloque pas la suivante.
      .catch((err) => this.signaler(titre, err))
      .finally(() => {
        if (this.enCours.get(cle) === ecriture) this.enCours.delete(cle);
      });
    this.enCours.set(cle, ecriture);
  }

  reset() {
    this.post(`/api/demo/${this.siteId}/reset`).catch((err) => this.signaler('Remise à zéro non transmise', err));
  }
}
