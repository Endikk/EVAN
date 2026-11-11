using EVAN.Application.Abstractions;
using EVAN.Application.Usines;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;
using EVAN.Core.Domain.Sites;
using Microsoft.Extensions.Logging;

namespace EVAN.Application.Live;

/// <summary>
/// Cas d'usage temps réel : ingestion de la télémétrie, évaluation des règles, alarmes,
/// actions opérateur (acquitter, résoudre), pannes simulées pour la démonstration.
/// Les écritures en base passent par une file unique et ordonnée ; l'état en mémoire ne dépend jamais de la base.
/// </summary>
public sealed class LiveService : IAsyncDisposable
{
    private const int MaxEvents = 500;
    /// <summary>Au-delà de cet écart avec l'heure de réception, l'horodatage d'un message est jugé faux (horloge, an 1).</summary>
    private static readonly TimeSpan EcartHorlogeMax = TimeSpan.FromDays(1);
    /// <summary>Reprise au redémarrage : alarmes non résolues de cette période.</summary>
    private static readonly TimeSpan RepriseAlarmes = TimeSpan.FromDays(7);
    /// <summary>
    /// Délai pendant lequel une clôture s'annule. L'avis qui propose « Annuler » reste 10 s à l'écran (12 s côté
    /// simulateur du navigateur) ; la marge couvre le trajet de la requête.
    /// </summary>
    public static readonly TimeSpan AnnulationCloture = TimeSpan.FromSeconds(30);

    private volatile Registre _registre = Registre.Vide;
    /// <summary>Un chargement d'usine à la fois : chacun part de l'instantané laissé par le précédent.</summary>
    private readonly object _chargement = new();
    private readonly ReferenceData _data;
    private readonly IStore _store;
    private readonly IRealtimeNotifier _notifier;
    private readonly IMessageBus _bus;
    private readonly ILogger<LiveService> _log;
    private readonly LiveOptions _options;
    private readonly TimeProvider _time;
    private readonly StoreWriter _writer;

    public LiveService(ReferenceData data, IStore store, IRealtimeNotifier notifier, IMessageBus bus, ILogger<LiveService> log, LiveOptions? options = null, TimeProvider? time = null)
    {
        _data = data;
        _store = store;
        _notifier = notifier;
        _bus = bus;
        _log = log;
        _options = options ?? new LiveOptions();
        _time = time ?? TimeProvider.System;
        _writer = new StoreWriter(store, log, _options.NouvelEssai);
        // Chaque usine a son propre état temps réel : ses alarmes, son journal et sa trace ne se mélangent pas.
        foreach (var usine in data.Demo.Usines) Enregistrer(new UsineChargee(data.Demo.Organisation.Id, usine, null), usine.Machines.Select(data.Model).ToList());
    }

    /// <summary>Usines chargées, dans l'ordre de chargement : celles de la démo d'abord, la première servant de défaut.</summary>
    public IReadOnlyCollection<string> SiteIds => _registre.Ordre;

    /// <summary>Organisation de la démonstration (data/demo.json).</summary>
    public Organisation Organisation => _data.Demo.Organisation;

    /// <summary>Usine chargée, de la démo ou d'une organisation réelle.</summary>
    public DemoUsine? Site(string siteId) => _registre.Usines.GetValueOrDefault(siteId)?.Usine;

    public UsineChargee? Usine(string siteId) => _registre.Usines.GetValueOrDefault(siteId);

    /// <summary>Toutes les usines chargées, toutes organisations confondues (à filtrer avant de les montrer).</summary>
    public IReadOnlyList<UsineChargee> Usines
    {
        get
        {
            var registre = _registre;
            return registre.Ordre.Select(id => registre.Usines[id]).ToList();
        }
    }

    /// <summary>Organisation propriétaire d'une usine chargée, ou null si l'usine est inconnue.</summary>
    public string? OrganisationDe(string siteId) => _registre.Usines.GetValueOrDefault(siteId)?.OrganisationId;

    /// <summary>Usine d'une machine (identifiants uniques dans toute l'installation), ou null.</summary>
    public string? SiteDeMachine(string machineId) => _registre.SiteDeMachine.GetValueOrDefault(machineId);

    /// <summary>Usine d'un point de mesure, ou null.</summary>
    public string? SiteDePoint(string pointId) => _registre.SiteDePoint.GetValueOrDefault(pointId);

    /// <summary>Usine d'une alarme gardée en mémoire (2000 par usine au plus), ou null.</summary>
    public string? SiteDeAlarme(string alarmId)
    {
        foreach (var site in _registre.Sites.Values)
        {
            lock (site.Gate)
            {
                if (site.Alarms.FindIndex(a => a.Id == alarmId) >= 0) return site.SiteId;
            }
        }
        return null;
    }

    private long Now() => Clock.Ms(_time.GetUtcNow());

    /// <summary>
    /// Charge l'usine enregistrée d'une organisation, ou la recharge après une nouvelle configuration : l'ingestion
    /// reconnaît aussitôt ses machines et ses points, sans redémarrage. Alarmes, journal et dernières valeurs des
    /// points toujours présents sont gardés.
    /// </summary>
    public void Charger(UsineEnregistree usine)
    {
        var c = usine.Configuration;
        var organes = c.Organes.GroupBy(o => o.MachineId).ToDictionary(g => g.Key, g => g.Select(o => o.VersDomaine()).ToList());
        var points = c.Points.GroupBy(p => p.MachineId).ToDictionary(g => g.Key, g => g.ToList());
        var models = c.Machines.Select(m => _data.Model(m, organes.GetValueOrDefault(m.Id) ?? [], points.GetValueOrDefault(m.Id) ?? [])).ToList();
        var description = new DemoUsine { Site = c.Site, Batiments = c.Batiments, Zones = c.Zones, Machines = c.Machines };
        Enregistrer(new UsineChargee(usine.OrganisationId, description, c), models);
    }

    private void Enregistrer(UsineChargee usine, IReadOnlyList<MachineModel> models)
    {
        var s = usine.Usine.Site;
        lock (_chargement)
        {
            var registre = _registre;
            if (registre.Usines.TryGetValue(s.Id, out var connue) && connue.OrganisationId != usine.OrganisationId)
                throw new InvalidOperationException($"L'usine {s.Id} appartient à une autre organisation.");
            if (registre.Sites.TryGetValue(s.Id, out var site))
            {
                // Usine reconfigurée : le prochain lot de diffusion part même sans changement de valeur.
                lock (site.Gate)
                {
                    Remplir(site, s.Passerelle, models);
                    site.Resend = true;
                }
            }
            else
            {
                site = new SiteRuntime { SiteId = s.Id };
                site.Engine = new RulesEngine(site);
                Remplir(site, s.Passerelle, models);
            }
            _registre = registre.Avec(site, usine, models);
        }
    }

    /// <summary>
    /// À appeler sous le verrou du site : remplace ses machines, organes et points ; oublie l'état des machines et des
    /// points qui n'existent plus.
    /// </summary>
    private static void Remplir(SiteRuntime site, string? passerelle, IReadOnlyList<MachineModel> models)
    {
        site.Passerelle = passerelle;
        site.Models.Clear();
        site.Organes.Clear();
        site.Points.Clear();
        site.Defs.Clear();
        foreach (var model in models)
        {
            site.Models[model.Machine.Id] = model;
            foreach (var o in model.Organes) site.Organes[o.Id] = o;
            foreach (var p in model.Points) site.Points[p.Id] = p;
            foreach (var (k, v) in model.Defs) site.Defs[k] = v;
        }
        foreach (var id in site.Values.Keys.Where(id => !site.Points.ContainsKey(id)).ToList())
        {
            site.Values.Remove(id);
            site.Dirty.Remove(id);
        }
        foreach (var id in site.Prod.Keys.Concat(site.Effective.Keys).Concat(site.LastSeen.Keys).Where(id => !site.Models.ContainsKey(id)).Distinct().ToList())
        {
            site.Prod.Remove(id);
            site.Effective.Remove(id);
            site.LastSeen.Remove(id);
            site.MachineGateway.Remove(id);
        }
    }

    public void HandleTelemetry(TelemetryMessage msg, DateTimeOffset receivedAt)
    {
        if (!_registre.Sites.TryGetValue(msg.SiteId, out var site)) return;
        var rows = new List<MeasurementRow>(msg.Metrics.Count);
        lock (site.Gate)
        {
            // Sous le verrou : une nouvelle configuration de l'usine peut remplacer ses machines à tout moment.
            if (!site.Models.ContainsKey(msg.MachineId)) return;
            // Rejeu QoS 1 (même Seq, même horodatage) : déjà évalué et écrit, on l'ignore.
            if (!site.FirstDelivery(msg)) return;
            site.LastSeen[msg.MachineId] = receivedAt;
            if (msg.GatewayId is { Length: > 0 } gateway) site.MachineGateway[msg.MachineId] = gateway;
            var enService = site.Prod.TryGetValue(msg.MachineId, out var prod) && prod.Facteur > 0.05;
            foreach (var metric in msg.Metrics)
            {
                if (!site.Points.TryGetValue(metric.Point, out var point)) continue;
                var ts = Horodatage(site, msg.MachineId, metric.Ts ?? msg.Ts, receivedAt);
                var t = Clock.Ms(ts);
                site.Current = (msg, metric, Clock.Ms(receivedAt), t);
                var niveau = site.Engine.Evaluate(point, metric.Value, t, enService);
                site.Values[point.Id] = new PointLive(metric.Value, t, niveau);
                site.Dirty.Add(point.Id);
                rows.Add(new MeasurementRow(ts, point.Id, metric.Value, (short)(metric.Quality == "good" ? 0 : 1)));
            }
            site.Current = null;
            UpdateEffective(site, msg.MachineId);
        }
        _store.Enqueue(rows);
        Dispatch(site);
    }

    /// <summary>Horodatage d'une mesure ; s'il s'écarte de plus d'un jour de la réception (horloge fausse, an 1), la réception le remplace.</summary>
    private DateTimeOffset Horodatage(SiteRuntime site, string machineId, DateTimeOffset ts, DateTimeOffset receivedAt)
    {
        if ((ts - receivedAt).Duration() <= EcartHorlogeMax) return ts;
        if (site.BadClocks.Add(machineId))
            _log.LogWarning("Horodatage incohérent reçu pour {Machine} ({Ts:O}) : l'heure de réception le remplace", machineId, ts);
        return receivedAt;
    }

    public void HandleState(StateMessage msg, DateTimeOffset? receivedAt = null)
    {
        if (!_registre.Sites.TryGetValue(msg.SiteId, out var site)) return;
        lock (site.Gate)
        {
            site.Prod[msg.MachineId] = msg;
            if (site.Models.ContainsKey(msg.MachineId)) site.LastSeen[msg.MachineId] = receivedAt ?? _time.GetUtcNow();
            UpdateEffective(site, msg.MachineId);
        }
        Dispatch(site);
    }

    /// <summary>
    /// Présence d'une passerelle (evan/v1/{site}/gateway/{gw}/status). « offline », publié par le broker à sa place
    /// (dernière volonté), passe aussitôt hors ligne les machines qu'elle alimente.
    /// </summary>
    public void HandleGatewayStatus(string siteId, string gatewayId, string status, DateTimeOffset receivedAt)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site)) return;
        bool change;
        lock (site.Gate)
        {
            if (status == "offline")
            {
                change = !site.GatewaysOffline.ContainsKey(gatewayId);
                site.GatewaysOffline[gatewayId] = receivedAt;
            }
            else
            {
                change = site.GatewaysOffline.Remove(gatewayId);
            }
        }
        if (change) _log.LogInformation("Passerelle {Gateway} du site {Site} : {Status}", gatewayId, siteId, status);
    }

    /// <summary>Alarme native de l'automate : prise telle quelle (règle « automate »), sans passer par les seuils.</summary>
    public void HandlePlcAlarm(PlcAlarmMessage msg)
    {
        if (!_registre.Sites.TryGetValue(msg.SiteId, out var site)) return;
        lock (site.Gate)
        {
            var organeId = ReferenceData.OrganeId(msg.MachineId, msg.Organe ?? 0);
            var t = Clock.Ms(msg.Ts);
            var existing = site.Alarms.FirstOrDefault(a => a.MachineId == msg.MachineId && a.Code == msg.Code && a.Statut != "resolue");
            if (msg.Active && existing is null)
            {
                site.Emit(new Alarme
                {
                    Id = $"al-{Guid.NewGuid():N}"[..19],
                    Code = msg.Code,
                    Message = msg.Message ?? $"Défaut automate {msg.Code}",
                    Gravite = "critique",
                    MachineId = msg.MachineId,
                    OrganeId = organeId,
                    Horodatage = t,
                    Regle = "automate",
                    Cause = site.Organes.GetValueOrDefault(organeId)?.Methode,
                }, "raised");
            }
            else if (!msg.Active && existing is not null)
            {
                site.Emit(existing with { Statut = "resolue", FinLe = t }, "cleared");
            }
            UpdateEffective(site, msg.MachineId);
        }
        Dispatch(site);
    }

    /// <summary>État affiché (panne, attention, ou état de production) ; chaque changement est historisé (etats_machine).</summary>
    private void UpdateEffective(SiteRuntime site, string machineId)
    {
        var prod = site.Prod.GetValueOrDefault(machineId);
        // Appelé à chaque message : l'état des alarmes n'est recalculé qu'après un changement de la liste (2000 au plus).
        var etat = site.Alarms.Etat(machineId) ?? prod?.Etat ?? "arret";
        if (site.Effective.TryGetValue(machineId, out var cur) && cur.Etat == etat) return;
        var now = _time.GetUtcNow();
        site.Effective[machineId] = (etat, Clock.Ms(now));
        if (site.Models.ContainsKey(machineId)) _writer.MachineState(machineId, etat, prod?.Vitesse ?? 0, now);
    }

    private MachineLive ToLive(SiteRuntime site, string machineId, DateTimeOffset now)
    {
        var prod = site.Prod.GetValueOrDefault(machineId);
        var eff = site.Effective.TryGetValue(machineId, out var e) ? e : (Etat: "arret", Depuis: Clock.Ms(now));
        // Liaison perdue : l'état reste le dernier connu (le front affiche « liaison perdue » par-dessus), la machine ne tourne plus à l'écran.
        var horsLigne = site.Offline(machineId, now, _options.LiaisonPerdue);
        return new MachineLive(eff.Etat, prod?.Vitesse ?? 0, horsLigne ? 0 : prod?.Facteur ?? 0, eff.Depuis, prod?.Bonnes ?? 0, prod?.Gache ?? 0)
        {
            HorsLigne = horsLigne ? true : null,
        };
    }

    private Dictionary<string, MachineLive> Machines(SiteRuntime site, DateTimeOffset now) => site.Models.Keys.ToDictionary(id => id, id => ToLive(site, id, now));

    /// <summary>
    /// Envoie hors verrou les alarmes, traces et événements produits pendant l'évaluation. Les écritures en base sont
    /// mises en file sous le verrou du site : leur ordre est celui des changements.
    /// </summary>
    private void Dispatch(SiteRuntime site)
    {
        List<(Alarme Alarm, string Kind)> emitted;
        List<Evenement> events;
        DetectionTrace? trace = null;
        lock (site.Gate)
        {
            // Cas courant, un message sans alarme ni étape de trace : rien à écrire ni à diffuser.
            if (site.Emitted.Count == 0 && !(site.TraceChanged && site.Trace is not null)) return;
            events = new List<Evenement>();
            emitted = site.Emitted.ToList();
            site.Emitted.Clear();
            foreach (var (alarm, kind) in emitted)
            {
                // Une alarme reprise au démarrage est déjà en base : on ne fait que la rediffuser.
                if (kind == "reopened") _writer.AlarmReopened(site.SiteId, alarm);
                else if (kind != "restored") _writer.Alarm(site.SiteId, alarm);
                if (kind == "raised")
                {
                    var m = site.Models.GetValueOrDefault(alarm.MachineId)?.Machine;
                    events.Add(AddEvent(site, "alarme", $"{alarm.Code} · {m?.Numero} {m?.Nom} · {alarm.Message}", alarm.MachineId, null));
                }
            }
            if (site.TraceChanged && site.Trace is not null)
            {
                if (site.Trace.Termine) site.Trace.Steps.Add(new TraceStep("signalr", "Diffusion temps réel", Now(), "SignalR → groupe du site"));
                trace = site.Trace with { Steps = site.Trace.Steps.ToList() };
                site.TraceChanged = false;
            }
        }
        foreach (var (alarm, _) in emitted) Fire(_notifier.AlarmAsync(site.SiteId, alarm));
        foreach (var e in events) Fire(_notifier.EventAsync(site.SiteId, e));
        if (trace is not null) Fire(_notifier.TraceAsync(site.SiteId, trace));
    }

    private void Fire(Task task) => task.ContinueWith(t => _log.LogWarning(t.Exception, "Diffusion temps réel en échec"), TaskContinuationOptions.OnlyOnFaulted);

    /// <summary>Diffusion d'une action opérateur : un écran injoignable ne fait pas échouer l'action, déjà enregistrée.</summary>
    private async Task NotifyAsync(Func<Task> envoi)
    {
        try
        {
            await envoi();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Diffusion temps réel en échec");
        }
    }

    /// <summary>Commande vers le simulateur ou une passerelle : un broker coupé est journalisé, l'action côté supervision tient.</summary>
    private async Task CommandAsync<T>(string topic, T payload)
    {
        try
        {
            if (!await _bus.PublishAsync(topic, payload)) _log.LogWarning("Commande non transmise sur {Topic} : broker injoignable", topic);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Commande non transmise sur {Topic}", topic);
        }
    }

    /// <summary>
    /// Valeurs modifiées depuis le dernier envoi et état de toutes les machines (diffusion à 1 Hz). Un passage hors ligne
    /// ou un retour en ligne produit un lot même si rien d'autre n'a changé.
    /// </summary>
    public (Dictionary<string, PointLive> Values, Dictionary<string, MachineLive> Machines)? TakeTelemetry(string siteId)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site)) return null;
        var now = _time.GetUtcNow();
        lock (site.Gate)
        {
            var machines = Machines(site, now);
            var offline = machines.Where(m => m.Value.HorsLigne == true).Select(m => m.Key).ToHashSet();
            var bascule = !offline.SetEquals(site.OfflineSent);
            if (site.Dirty.Count == 0 && site.Prod.Count == 0 && !bascule && !site.Resend) return null;
            site.OfflineSent = offline;
            site.Resend = false;
            var values = site.Dirty.ToDictionary(id => id, id => site.Values[id]);
            site.Dirty.Clear();
            return (values, machines);
        }
    }

    /// <summary>Lot non envoyé (diffusion en échec) : ses valeurs repartent au lot suivant, avec l'état des machines.</summary>
    public void RequeueTelemetry(string siteId, IEnumerable<string> pointIds)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site)) return;
        lock (site.Gate)
        {
            foreach (var id in pointIds)
            {
                if (site.Values.ContainsKey(id)) site.Dirty.Add(id);
            }
            site.Resend = true;
        }
    }

    public object? Snapshot(string siteId)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site)) return null;
        var now = _time.GetUtcNow();
        lock (site.Gate)
        {
            return new
            {
                machines = Machines(site, now),
                values = new Dictionary<string, PointLive>(site.Values),
                alarms = site.Alarms.Take(300).ToList(),
                events = site.Events.Take(300).ToList(),
            };
        }
    }

    /// <summary>État temps réel d'une usine, copié hors verrou : machines, dernières valeurs, alarmes, journal.</summary>
    public VueDirecte? Direct(string siteId)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site)) return null;
        var now = _time.GetUtcNow();
        lock (site.Gate)
        {
            return new VueDirecte(
                Machines(site, now),
                new Dictionary<string, PointLive>(site.Values),
                site.Alarms.ToList(),
                site.Events.ToList());
        }
    }

    public IReadOnlyList<Alarme> ActiveAlarms(string siteId)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site)) return Array.Empty<Alarme>();
        lock (site.Gate) return site.Alarms.Where(a => a.Statut != "resolue").ToList();
    }

    public async Task<Alarme?> AcknowledgeAsync(string alarmId, string by)
    {
        foreach (var site in _registre.Sites.Values)
        {
            Alarme updated;
            Evenement e;
            lock (site.Gate)
            {
                // Lecture, contrôle et écriture sous le même verrou : une alarme résolue ou évincée entre-temps n'est pas ressuscitée.
                var i = site.Alarms.FindIndex(a => a.Id == alarmId);
                if (i < 0) continue;
                if (site.Alarms[i].Statut != "active") return null;
                updated = site.Alarms[i] with { Statut = "acquittee", AcquitteePar = by, AcquitteeLe = Now() };
                site.Alarms[i] = updated;
                _writer.Alarm(site.SiteId, updated);
                e = AddEvent(site, "action", $"Alarme {updated.Code} acquittée", updated.MachineId, by);
            }
            await NotifyAsync(() => _notifier.AlarmAsync(site.SiteId, updated));
            await NotifyAsync(() => _notifier.EventAsync(site.SiteId, e));
            return updated;
        }
        return null;
    }

    /// <summary>
    /// Intervention terminée : toutes les alarmes de la machine sont closes, le simulateur rétablit la mesure. Les points
    /// de la machine entrent en retour à la normale (rien n'est levé tant que la mesure revient). La clôture reste
    /// annulable quelques secondes par la même organisation (<paramref name="organisation"/>, null pour la démo sans compte).
    /// </summary>
    public async Task<Alarme?> ResolveAsync(string alarmId, string by, string? organisation = null)
    {
        foreach (var site in _registre.Sites.Values)
        {
            Alarme resolved;
            Evenement e;
            lock (site.Gate)
            {
                var i = site.Alarms.FindIndex(a => a.Id == alarmId);
                if (i < 0) continue;
                var target = site.Alarms[i];
                var now = Now();
                var ouvertes = site.Alarms.Where(a => a.MachineId == target.MachineId && a.Statut != "resolue").ToList();
                if (ouvertes.Count > 0) site.Clotures[target.MachineId] = new Cloture(now, target.MachineId, ouvertes, organisation);
                foreach (var a in ouvertes)
                {
                    site.Engine.Resolve(a.Id, now);
                    var j = site.Alarms.FindIndex(x => x.Id == a.Id);
                    if (j >= 0 && site.Alarms[j].Statut != "resolue")
                    {
                        site.Alarms[j] = site.Alarms[j] with { Statut = "resolue", FinLe = now };
                        site.Emitted.Add((site.Alarms[j], "cleared"));
                    }
                }
                if (site.Models.TryGetValue(target.MachineId, out var model))
                {
                    foreach (var p in model.Points) site.Engine.BeginRecovery(p.Id, now);
                }
                if (site.Trace?.MachineId == target.MachineId) site.Trace = null;
                UpdateEffective(site, target.MachineId);
                resolved = site.Alarms.FirstOrDefault(a => a.Id == alarmId) ?? target with { Statut = "resolue", FinLe = now };
                e = AddEvent(site, "action", $"Intervention terminée, {target.Code} résolue. Redémarrage.", target.MachineId, by);
            }
            Dispatch(site);
            await NotifyAsync(() => _notifier.EventAsync(site.SiteId, e));
            await CommandAsync(Topics.SimulatorCommand(site.SiteId, "resolve"), new ResolveCommand(resolved.MachineId));
            return resolved;
        }
        return null;
    }

    /// <summary>
    /// Annule une clôture faite à l'instant (« Intervention terminée » cliquée trop tôt) : les alarmes que cette clôture a
    /// fermées sur la machine retrouvent leur état d'avant et le moteur de règles les tient de nouveau. Null si l'alarme
    /// est inconnue, ou si sa machine n'a pas été close dans les <see cref="AnnulationCloture"/> par cette même
    /// organisation (null pour la démo sans compte) : rien n'est alors modifié.
    /// </summary>
    public async Task<Alarme?> ReopenAsync(string alarmId, string by, string? organisation)
    {
        foreach (var site in _registre.Sites.Values)
        {
            Alarme rouverte;
            Evenement e;
            List<int> organes;
            lock (site.Gate)
            {
                var i = site.Alarms.FindIndex(a => a.Id == alarmId);
                if (i < 0) continue;
                var machineId = site.Alarms[i].MachineId;
                var now = Now();
                if (!site.Clotures.TryGetValue(machineId, out var cloture) || cloture.Organisation != organisation
                    || now - cloture.T > (long)AnnulationCloture.TotalMilliseconds || cloture.Alarmes.All(a => a.Id != alarmId))
                    return null;
                site.Clotures.Remove(machineId);
                foreach (var avant in cloture.Alarmes)
                {
                    // Une alarme évincée de la liste depuis, ou déjà rouverte, reste comme elle est.
                    var j = site.Alarms.FindIndex(a => a.Id == avant.Id);
                    if (j < 0 || site.Alarms[j].Statut != "resolue") continue;
                    site.Alarms[j] = avant;
                    site.Engine.Restore(avant);
                    site.Emitted.Add((avant, "reopened"));
                }
                UpdateEffective(site, machineId);
                rouverte = site.Alarms[site.Alarms.FindIndex(a => a.Id == alarmId)];
                // Organes des pannes rouvertes, levées sur une mesure : le simulateur y remet le défaut, comme le simulateur du
                // navigateur. Un défaut de l'automate vient de la machine elle-même, et la passerelle d'une usine réelle
                // n'écoute pas ce sujet.
                organes = cloture.Alarmes.Where(a => a.Gravite == "critique" && a.Regle != "automate")
                    .Select(a => OrganeNumero(a.OrganeId)).OfType<int>().Distinct().ToList();
                e = AddEvent(site, "action", $"Clôture annulée, {rouverte.Code} rouverte.", machineId, by);
            }
            Dispatch(site);
            await NotifyAsync(() => _notifier.EventAsync(site.SiteId, e));
            foreach (var organe in organes)
                await CommandAsync(Topics.SimulatorCommand(site.SiteId, "fault"), new FaultCommand(rouverte.MachineId, organe, "reouverture"));
            return rouverte;
        }
        return null;
    }

    /// <summary>Numéro d'un organe « {machine}.o{numero} », ou null s'il n'a pas cette forme.</summary>
    private static int? OrganeNumero(string organeId)
    {
        var i = organeId.LastIndexOf(".o", StringComparison.Ordinal);
        return i >= 0 && int.TryParse(organeId.AsSpan(i + 2), out var n) ? n : null;
    }

    /// <summary>Panne de démonstration : choisit une machine en production et un organe, commande le simulateur, ouvre une trace.</summary>
    public async Task<FaultResult?> SimulateFaultAsync(string siteId, string? machineId, int? organeNumero)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site) || !_bus.IsConnected) return null;
        FaultResult result;
        string label;
        var maintenant = _time.GetUtcNow();
        lock (site.Gate)
        {
            // Une machine dont rien n'arrive (non jouée par le simulateur, liaison perdue) ne montrerait pas la panne :
            // elle n'est pas candidate, sinon l'API répondrait 200 et rien ne bougerait à l'écran.
            var candidates = site.Models.Values
                .Where(m => machineId is null || m.Machine.Id == machineId)
                .Where(m => !site.Offline(m.Machine.Id, maintenant, _options.LiaisonPerdue))
                .Where(m => site.Effective.GetValueOrDefault(m.Machine.Id).Etat is not ("panne" or "arret"))
                .Where(m => m.Type is not null && m.Type.Organes.Values.Any(o => o.Panne is not null))
                .ToList();
            if (candidates.Count == 0) return null;
            var model = candidates[Random.Shared.Next(candidates.Count)];
            var organs = model.Organes
                .Where(o => model.Type!.Organes.TryGetValue(o.Numero.ToString(), out var oc) && oc.Panne is not null)
                .Where(o => organeNumero is null || o.Numero == organeNumero)
                .ToList();
            if (organs.Count == 0) return null;
            var organe = organs[Random.Shared.Next(organs.Count)];
            result = new FaultResult(model.Machine.Id, organe.Id, organe.AlarmeCode);
            label = $"{organe.Nom} · {model.Machine.Numero} {model.Machine.Nom}";
            site.Trace = new DetectionTrace
            {
                Id = $"tr-{Guid.NewGuid():N}"[..12],
                MachineId = model.Machine.Id,
                OrganeId = organe.Id,
                Debut = Now(),
                Steps = new List<TraceStep> { new("defaut", "Défaut physique", Now(), label) },
            };
            site.TraceChanged = true;
        }
        var organeNum = int.Parse(result.OrganeId[(result.OrganeId.LastIndexOf(".o", StringComparison.Ordinal) + 2)..]);
        await _bus.PublishAsync(Topics.SimulatorCommand(siteId, "fault"), new FaultCommand(result.MachineId, organeNum, "demo"));
        Dispatch(site);
        await LogEventAsync(siteId, "action", $"Panne simulée injectée sur {label}", result.MachineId, "Démo");
        return result;
    }

    /// <summary>Événement du journal : en mémoire et en file d'écriture tout de suite, diffusé ensuite (un échec de diffusion ne le perd pas).</summary>
    public async Task LogEventAsync(string siteId, string type, string message, string? machineId = null, string? auteur = null)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site)) return;
        Evenement e;
        lock (site.Gate) e = AddEvent(site, type, message, machineId, auteur);
        await NotifyAsync(() => _notifier.EventAsync(siteId, e));
    }

    /// <summary>À appeler sous le verrou du site.</summary>
    private Evenement AddEvent(SiteRuntime site, string type, string message, string? machineId, string? auteur)
    {
        var e = new Evenement($"ev-{Guid.NewGuid():N}"[..15], type, Now(), message, machineId, auteur);
        site.Events.Insert(0, e);
        if (site.Events.Count > MaxEvents) site.Events.RemoveAt(site.Events.Count - 1);
        _writer.Event(site.SiteId, e);
        return e;
    }

    /// <summary>
    /// Reprise après un redémarrage, une fois la base prête : usines enregistrées par les organisations, puis alarmes
    /// non résolues des 7 derniers jours et 500 derniers événements de chaque site. Le moteur de règles reprend l'alarme en cours de chaque point pour ne pas la doubler.
    /// Rejouable sans doublon (identifiants déjà connus ignorés).
    /// </summary>
    public async Task RestoreAsync(CancellationToken ct)
    {
        // Usines enregistrées par les organisations : chargées avant la reprise, pour que leurs alarmes soient relues aussi.
        foreach (var usine in await _store.UsinesAsync(ct))
        {
            try
            {
                Charger(usine);
            }
            catch (InvalidOperationException ex)
            {
                _log.LogError(ex, "Usine {Site} non chargée", usine.SiteId);
            }
        }
        var since = _time.GetUtcNow() - RepriseAlarmes;
        foreach (var site in _registre.Sites.Values)
        {
            var alarms = await _store.UnresolvedAlarmsAsync(site.SiteId, since, ct);
            var events = await _store.EventsAsync(site.SiteId, DateTimeOffset.UnixEpoch, ct);
            lock (site.Gate)
            {
                var now = Now();
                var reprises = alarms.Where(a => a.Statut != "resolue" && site.Models.ContainsKey(a.MachineId)).ToList();
                foreach (var a in reprises) site.Restore(a, now);
                var connus = site.Events.Select(e => e.Id).ToHashSet();
                var journal = site.Events.Concat(events.Where(e => !connus.Contains(e.Id))).OrderByDescending(e => e.Horodatage).Take(MaxEvents).ToList();
                site.Events.Clear();
                site.Events.AddRange(journal);
                foreach (var machineId in reprises.Select(a => a.MachineId).Distinct()) UpdateEffective(site, machineId);
            }
            Dispatch(site);
            if (alarms.Count > 0) _log.LogInformation("Site {Site} : {Count} alarmes ouvertes relues en base", site.SiteId, alarms.Count);
        }
    }

    public async Task ResetAsync(string siteId)
    {
        if (!_registre.Sites.TryGetValue(siteId, out var site)) return;
        lock (site.Gate)
        {
            // Les alarmes ouvertes sont closes en base aussi : sinon le prochain démarrage de l'API les reprendrait.
            var fin = Now();
            foreach (var a in site.Alarms.Where(a => a.Statut != "resolue"))
                _writer.Alarm(site.SiteId, a with { Statut = "resolue", FinLe = fin });
            site.Alarms.Clear();
            site.Events.Clear();
            site.Clotures.Clear();
            site.Trace = null;
            site.Engine.Reset();
        }
        await _bus.PublishAsync(Topics.SimulatorCommand(siteId, "reset"), new { siteId });
    }

    /// <summary>Arrêt : les écritures en file partent en base (5 s au plus).</summary>
    public ValueTask DisposeAsync() => _writer.DisposeAsync();
}
