using EVAN.Application.Observabilite;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;

namespace EVAN.Application.Live;

/// <summary>État temps réel d'un site : dernières valeurs, états machine, alarmes, journal, trace de détection.</summary>
internal sealed class SiteRuntime : RulesEngine.IContext
{
    private const int MaxAlarms = 2000;
    /// <summary>Messages retenus par machine pour reconnaître un rejeu QoS 1 (quelques minutes à 1 Hz).</summary>
    private const int FenetreRejeu = 512;

    public required string SiteId { get; init; }
    /// <summary>Passerelle déclarée du site : celle des machines qui n'ont pas encore publié de télémétrie.</summary>
    public string? Passerelle { get; set; }
    public readonly object Gate = new();
    public readonly Dictionary<string, MachineModel> Models = new();
    public readonly Dictionary<string, PointDeMesure> Points = new();
    public readonly Dictionary<string, Organe> Organes = new();
    public readonly Dictionary<string, (MesureDef Mesure, OrganeCatalogue Organe)> Defs = new();
    public readonly Dictionary<string, PointLive> Values = new();
    public readonly Dictionary<string, StateMessage> Prod = new();
    public readonly Dictionary<string, (string Etat, long Depuis)> Effective = new();
    public readonly AlarmesSite Alarms = new();
    public readonly List<Evenement> Events = new();
    public readonly HashSet<string> Dirty = new();
    public readonly List<(Alarme Alarm, string Kind)> Emitted = new();
    public DetectionTrace? Trace;
    public bool TraceChanged;
    public RulesEngine Engine = null!;

    // Liaison : heure de réception côté API (pas celle du message), passerelle de chaque machine, passerelles hors ligne.
    public readonly Dictionary<string, DateTimeOffset> LastSeen = new();
    public readonly Dictionary<string, string> MachineGateway = new();
    public readonly Dictionary<string, DateTimeOffset> GatewaysOffline = new();
    /// <summary>Machines diffusées hors ligne au dernier lot : une bascule déclenche un lot, même sans autre changement.</summary>
    public HashSet<string> OfflineSent = new();
    /// <summary>Lot précédent non envoyé : le suivant part même sans changement.</summary>
    public bool Resend;
    /// <summary>Machines dont l'horloge aberrante a déjà été signalée (une fois chacune).</summary>
    public readonly HashSet<string> BadClocks = new();
    private readonly Dictionary<string, (HashSet<(long, DateTimeOffset)> Vus, Queue<(long, DateTimeOffset)> Ordre)> _recus = new();

    /// <summary>Contexte du message en cours d'évaluation, pour horodater la trace de bout en bout (Sample : horodatage retenu).</summary>
    public (TelemetryMessage Msg, Metric Metric, long ReceivedAt, long Sample)? Current;

    public Organe? Organe(PointDeMesure point) => Organes.GetValueOrDefault(point.OrganeId);
    public (MesureDef Mesure, OrganeCatalogue Organe)? Def(PointDeMesure point) => Defs.TryGetValue(point.Id, out var d) ? d : null;

    public int CountRecent(string machineId, string code, long since) =>
        Alarms.Count(a => a.MachineId == machineId && a.Code == code && a.Gravite == "critique" && a.Horodatage >= since);

    public void Emit(Alarme alarm, string kind)
    {
        var i = Alarms.FindIndex(a => a.Id == alarm.Id);
        if (i >= 0)
        {
            var prev = Alarms[i];
            Alarms[i] = kind == "cleared"
                ? alarm with { Statut = "resolue", AcquitteePar = prev.AcquitteePar, AcquitteeLe = prev.AcquitteeLe }
                : alarm with { Statut = prev.Statut, AcquitteePar = prev.AcquitteePar, AcquitteeLe = prev.AcquitteeLe };
            alarm = Alarms[i];
        }
        else
        {
            Alarms.Insert(0, alarm);
            Evict();
        }
        Emitted.Add((alarm, kind));
        if (kind != "raised") return;
        TraceAlarm(alarm);
        Metriques.AlarmeLevee(alarm);
    }

    /// <summary>Au-delà de la limite, la plus ancienne alarme résolue part d'abord ; une alarme ouverte seulement s'il ne reste qu'elles.</summary>
    private void Evict()
    {
        while (Alarms.Count > MaxAlarms)
        {
            var i = Alarms.FindLastIndex(a => a.Statut == "resolue");
            Alarms.RemoveAt(i >= 0 ? i : Alarms.Count - 1);
        }
    }

    /// <summary>
    /// Alarme non résolue relue en base au redémarrage. Si la règle en a déjà levé une pour le même défaut depuis le
    /// démarrage, l'ancienne est close (elle serait restée « active » en base pour toujours) ; sinon le moteur la reprend.
    /// </summary>
    public void Restore(Alarme alarm, long now)
    {
        if (Alarms.Any(a => a.Id == alarm.Id)) return;
        var remplacee = Alarms.Any(a => a.Statut != "resolue" && a.MachineId == alarm.MachineId && a.Code == alarm.Code && a.PointId == alarm.PointId);
        var reprise = remplacee ? alarm with { Statut = "resolue", FinLe = now } : alarm;
        if (!remplacee) Engine.Restore(alarm);
        var i = Alarms.FindIndex(a => a.Horodatage < reprise.Horodatage);
        Alarms.Insert(i < 0 ? Alarms.Count : i, reprise);
        Evict();
        Emitted.Add((reprise, remplacee ? "cleared" : "restored"));
    }

    /// <summary>Faux si ce message (même Seq, même horodatage) a déjà été traité : rejeu QoS 1 après une reconnexion.</summary>
    public bool FirstDelivery(TelemetryMessage msg)
    {
        if (msg.Seq == 0) return true;
        if (!_recus.TryGetValue(msg.MachineId, out var recus)) _recus[msg.MachineId] = recus = (new(), new());
        var cle = (msg.Seq, msg.Ts);
        if (!recus.Vus.Add(cle)) return false;
        recus.Ordre.Enqueue(cle);
        if (recus.Ordre.Count > FenetreRejeu) recus.Vus.Remove(recus.Ordre.Dequeue());
        return true;
    }

    /// <summary>
    /// Liaison perdue : jamais vue, rien reçu depuis <paramref name="delai"/>, ou passerelle annoncée hors ligne sans
    /// donnée reçue depuis (des données plus récentes prouvent qu'elle est revenue).
    /// </summary>
    public bool Offline(string machineId, DateTimeOffset now, TimeSpan delai)
    {
        if (!LastSeen.TryGetValue(machineId, out var vu) || now - vu > delai) return true;
        var passerelle = MachineGateway.GetValueOrDefault(machineId) ?? Passerelle;
        return passerelle is not null && GatewaysOffline.TryGetValue(passerelle, out var depuis) && depuis >= vu;
    }

    private void TraceAlarm(Alarme a)
    {
        if (Trace is null || Trace.Termine || Trace.MachineId != a.MachineId || Current is not { } cur) return;
        var steps = Trace.Steps;
        var now = Clock.Now();
        if (!steps.Any(s => s.Etape == "capteur"))
        {
            var sample = cur.Sample;
            var plc = cur.Msg.Trace is not null && cur.Msg.Trace.TryGetValue("plc", out var p) ? Clock.Ms(p) : sample;
            var gw = cur.Msg.Trace is not null && cur.Msg.Trace.TryGetValue("gateway", out var g) ? Clock.Ms(g) : plc;
            var point = Points.GetValueOrDefault(a.PointId ?? "");
            steps.Add(new TraceStep("capteur", "Capteur", sample, $"{point?.Libelle ?? "Mesure"} = {a.Valeur:0.##} {a.Unite}"));
            steps.Add(new TraceStep("automate", "Automate", plc, "Horodatage source de la variable"));
            steps.Add(new TraceStep("passerelle", "Passerelle edge", gw, $"Publication MQTT par {cur.Msg.GatewayId ?? "la passerelle"}"));
            steps.Add(new TraceStep("mqtt", "MQTT (TLS)", cur.ReceivedAt, Topics.Telemetry(SiteId, a.MachineId)));
            steps.Add(new TraceStep("ingestion", "Ingestion", now, "Mise en file vers TimescaleDB"));
        }
        steps.Add(new TraceStep("regles", a.Gravite == "critique" ? "Moteur de règles · alarme" : "Moteur de règles · attention",
            now, $"Règle {a.Regle}{(a.Seuil is { } s ? $" : {s:0.##} {a.Unite} franchi" : "")}"));
        if (a.Gravite == "critique")
        {
            steps.Add(new TraceStep("alarme", $"Alarme {a.Code}", now, $"{a.Message} · machine arrêtée"));
            Trace = Trace with { Code = a.Code, Termine = true };
        }
        TraceChanged = true;
    }
}
