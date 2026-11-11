using System.Globalization;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;

namespace EVAN.Core.Domain.Alarms;

/// <summary>
/// Moteur de règles d'alarme (même logique que src/EVAN.Front/src/sim/rules.ts) :
/// seuils avec escalade et hystérésis, dérive par régression linéaire glissante (R² élevé exigé),
/// défauts répétitifs (même code, même machine, 3 fois en 8 h), signaux discrets de l'automate.
/// </summary>
public sealed class RulesEngine
{
    public interface IContext
    {
        Organe? Organe(PointDeMesure point);
        (MesureDef Mesure, OrganeCatalogue Organe)? Def(PointDeMesure point);
        int CountRecent(string machineId, string code, long since);
        void Emit(Alarme alarm, string kind);
    }

    private sealed class State
    {
        public string Niveau = "ok";
        public int OkTicks;
        public readonly Queue<(long T, double V)> Buf = new();
        public Alarme? Alarm;
        public Alarme? Drift;
        public long LastDrift;
        /// <summary>Début du retour à la normale après une intervention, tant qu'il dure.</summary>
        public long? RepriseDepuis;
        /// <summary>Échantillons consécutifs revenus dans la plage pendant la reprise.</summary>
        public int RepriseOk;
    }

    private const int DriftWindow = 90;
    /// <summary>Échantillons dans la plage qui terminent le retour à la normale (comme l'hystérésis).</summary>
    private const int RepriseTicks = 3;
    /// <summary>Au-delà, la mesure est de nouveau jugée même si elle n'est pas revenue : une réparation qui n'a pas tenu se voit.</summary>
    private const long RepriseMaxMs = 60_000;
    private const double DriftHorizonS = 30 * 60;
    private const long RepeatWindowMs = 8L * 3600 * 1000;
    private const int RepeatCount = 3;

    private static readonly Dictionary<string, string> CodeType = new()
    {
        ["tension"] = "TB", ["temperature"] = "TH", ["pression"] = "PR", ["vitesse"] = "SP", ["reperage"] = "RG",
        ["puissance"] = "PW", ["taux"] = "RT", ["comptage"] = "CT", ["diametre"] = "DM", ["usure"] = "WR", ["alarme"] = "AL",
    };

    private readonly IContext _ctx;
    private readonly Dictionary<string, State> _state = new();

    public RulesEngine(IContext ctx) => _ctx = ctx;

    public static string Classify(double v, Seuils s)
    {
        if ((s.AlarmeHaut is { } ah && v >= ah) || (s.AlarmeBas is { } ab && v <= ab)) return "alarme";
        if ((s.AttentionHaut is { } th && v >= th) || (s.AttentionBas is { } tb && v <= tb)) return "attention";
        return "ok";
    }

    private static double? Crossed(double v, Seuils s, string niveau) => niveau switch
    {
        "alarme" => s.AlarmeHaut is { } ah && v >= ah ? ah : s.AlarmeBas,
        "attention" => s.AttentionHaut is { } th && v >= th ? th : s.AttentionBas,
        _ => null,
    };

    private static int Rank(string n) => n == "alarme" ? 2 : n == "attention" ? 1 : 0;

    public (string Code, string? Message) CodeFor(PointDeMesure p)
    {
        var def = _ctx.Def(p);
        var organe = _ctx.Organe(p);
        if (def is { } d && d.Organe.Panne?.Mesure == p.Cle && organe?.AlarmeCode is { } code) return (code, organe.AlarmeMessage);
        return ($"{CodeType.GetValueOrDefault(p.Type, "EV")}-{organe?.Numero ?? 0}{p.Cle.Length % 10}", null);
    }

    public string Evaluate(PointDeMesure p, double v, long t, bool enService)
    {
        if (!_state.TryGetValue(p.Id, out var s)) _state[p.Id] = s = new State();
        var niveau = Classify(v, p.Seuils);
        if (s.RepriseDepuis is { } depuis)
        {
            // Après une intervention, la mesure revient vers sa valeur normale en quelques secondes : elle n'est pas
            // jugée pendant ce retour (sinon une alarme « à surveiller » renaissait aussitôt sur la machine qu'on venait
            // de réparer), comme côté front (simulator.ts, RulesEngine.forget). Revenue, ou le délai passé, elle repart
            // d'une page blanche, sans que sa remontée soit lue comme une dérive.
            s.RepriseOk = niveau == "ok" ? s.RepriseOk + 1 : 0;
            if (s.RepriseOk < RepriseTicks && t - depuis < RepriseMaxMs) return "ok";
            _state[p.Id] = s = new State();
        }
        s.Buf.Enqueue((t, v));
        while (s.Buf.Count > DriftWindow) s.Buf.Dequeue();

        var alarmRank = s.Alarm is null ? 0 : s.Alarm.Gravite == "critique" ? 2 : 1;
        if (niveau != "ok" && Rank(niveau) > alarmRank)
        {
            if (s.Alarm is not null) _ctx.Emit(s.Alarm with { Statut = "resolue", FinLe = t, Message = $"{s.Alarm.Message} (escaladée)" }, "cleared");
            s.Alarm = Raise(p, v, t, niveau);
            if (s.Drift is not null)
            {
                _ctx.Emit(s.Drift with { Statut = "resolue", FinLe = t }, "cleared");
                s.Drift = null;
            }
            s.OkTicks = 0;
        }
        else if (niveau != "ok")
        {
            s.OkTicks = 0;
        }
        else if (s.Alarm is not null)
        {
            // Hystérésis : 3 échantillons dans la plage ; une alarme critique attend l'intervention.
            if (++s.OkTicks >= 3 && s.Alarm.Gravite != "critique")
            {
                _ctx.Emit(s.Alarm with { Statut = "resolue", FinLe = t }, "cleared");
                s.Alarm = null;
            }
        }
        s.Niveau = niveau;

        // Pas de dérive sur les consommables et compteurs (bobine qui se vide, usure, comptage) : leur pente est normale.
        var attendue = _ctx.Def(p)?.Mesure.Dynamique is not null;
        if (enService && !attendue && niveau == "ok" && s.Alarm is null && s.Buf.Count >= DriftWindow * 2 / 3 && t - s.LastDrift > 10_000)
        {
            s.LastDrift = t;
            CheckDrift(p, s, t);
        }
        return niveau;
    }

    private void CheckDrift(PointDeMesure p, State s, long t)
    {
        double n = s.Buf.Count, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
        var t0 = s.Buf.Peek().T;
        foreach (var (bt, bv) in s.Buf)
        {
            var x = (bt - t0) / 1000.0;
            sx += x;
            sy += bv;
            sxx += x * x;
            sxy += x * bv;
            syy += bv * bv;
        }
        var den = n * sxx - sx * sx;
        var deny = n * syy - sy * sy;
        if (den <= 0) return;
        var slope = (n * sxy - sx * sy) / den;
        var r2 = deny > 0 ? Math.Pow(n * sxy - sx * sy, 2) / (den * deny) : 0;
        var last = s.Buf.Last().V;
        var target = slope > 0 ? p.Seuils.AlarmeHaut : p.Seuils.AlarmeBas;
        var range = Math.Abs((p.Seuils.AlarmeHaut ?? p.Nominal * 1.5) - (p.Seuils.AlarmeBas ?? p.Nominal * 0.5));
        if (range == 0) range = 1;
        var significant = Math.Abs(slope) * 60 > range * 0.01 && r2 > 0.75;
        if (target is null || !significant)
        {
            if (s.Drift is not null)
            {
                _ctx.Emit(s.Drift with { Statut = "resolue", FinLe = t }, "cleared");
                s.Drift = null;
            }
            return;
        }
        var eta = (target.Value - last) / slope;
        if (eta <= 0 || eta >= DriftHorizonS) return;
        // Arrondi à la demie supérieure, comme Math.round du front (Math.Round arrondit au pair).
        var minutes = Math.Max(1, (int)Math.Round(eta / 60, MidpointRounding.AwayFromZero));
        var message = $"Dérive : {p.Libelle.ToLowerInvariant()} atteindra {Nombre(target.Value)} {p.Unite} dans ~{minutes} min";
        if (s.Drift is not null)
        {
            s.Drift = s.Drift with { Message = message, Valeur = last };
            _ctx.Emit(s.Drift, "updated");
            return;
        }
        var def = _ctx.Def(p);
        s.Drift = new Alarme
        {
            Id = NewId(),
            Code = $"DR-{CodeFor(p).Code}",
            Message = message,
            Gravite = "attention",
            MachineId = p.MachineId,
            OrganeId = p.OrganeId,
            PointId = p.Id,
            Horodatage = t,
            Valeur = last,
            Unite = p.Unite,
            Seuil = target,
            Regle = "derive",
            Cause = def?.Organe.Panne?.Mesure == p.Cle
                ? def.Value.Organe.Panne!.Cause
                : $"Tendance régulière sur {_ctx.Organe(p)?.Nom ?? "l’organe"} : intervenir avant le franchissement du seuil.",
        };
        _ctx.Emit(s.Drift, "raised");
    }

    private Alarme Raise(PointDeMesure p, double v, long t, string niveau)
    {
        var def = _ctx.Def(p);
        var organe = _ctx.Organe(p);
        var (code, message) = CodeFor(p);
        var critique = niveau == "alarme";
        var regle = p.Type == "alarme" ? "automate" : "seuil";
        int? repetitions = null;
        if (critique)
        {
            var count = _ctx.CountRecent(p.MachineId, code, t - RepeatWindowMs) + 1;
            if (count >= RepeatCount)
            {
                regle = "repetitif";
                repetitions = count;
            }
        }
        var baseMsg = message ?? $"{p.Libelle} {(critique ? "hors limite" : "proche de la limite")}";
        var alarm = new Alarme
        {
            Id = NewId(),
            Code = code,
            Message = repetitions is { } r ? $"{baseMsg} · {r}ᵉ fois en 8 h" : baseMsg,
            Gravite = critique ? "critique" : "attention",
            MachineId = p.MachineId,
            OrganeId = p.OrganeId,
            PointId = p.Id,
            Horodatage = t,
            Valeur = v,
            Unite = p.Unite,
            Seuil = Crossed(v, p.Seuils, niveau),
            Regle = regle,
            Repetitions = repetitions,
            Cause = def?.Organe.Panne?.Mesure == p.Cle ? def.Value.Organe.Panne!.Cause : organe?.Methode ?? "Mesure hors plage : contrôler le capteur puis l’organe.",
        };
        _ctx.Emit(alarm, "raised");
        return alarm;
    }

    /// <summary>Clôture manuelle (intervention terminée) : la règle repart de zéro sur ces points.</summary>
    public void Resolve(string alarmId, long t)
    {
        foreach (var s in _state.Values)
        {
            if (s.Alarm?.Id == alarmId)
            {
                _ctx.Emit(s.Alarm with { Statut = "resolue", FinLe = t }, "cleared");
                s.Alarm = null;
                s.Niveau = "ok";
                s.OkTicks = 0;
                s.Buf.Clear();
            }
            if (s.Drift?.Id == alarmId)
            {
                _ctx.Emit(s.Drift with { Statut = "resolue", FinLe = t }, "cleared");
                s.Drift = null;
            }
        }
    }

    /// <summary>
    /// Reprise au redémarrage d'une alarme encore ouverte en base : son point la garde, la règle ne lève pas une seconde
    /// alarme pour le même franchissement et la clôture (hystérésis ou intervention) se fait sur celle-ci.
    /// </summary>
    public void Restore(Alarme alarm)
    {
        if (alarm.PointId is null) return;
        if (!_state.TryGetValue(alarm.PointId, out var s)) _state[alarm.PointId] = s = new State();
        // Clôture annulée : le point n'est plus en retour à la normale, il garde l'alarme rouverte.
        s.RepriseDepuis = null;
        s.RepriseOk = 0;
        if (alarm.Regle == "derive")
        {
            s.Drift ??= alarm;
            return;
        }
        if (s.Alarm is not null) return;
        s.Alarm = alarm;
        s.Niveau = alarm.Gravite == "critique" ? "alarme" : "attention";
        s.OkTicks = 0;
    }

    /// <summary>
    /// Début du retour à la normale d'un point après une intervention : jusqu'à ce que la mesure soit revenue dans sa
    /// plage (ou une minute au plus), elle ne lève rien, puis le moteur oublie tout ce qu'il en savait.
    /// </summary>
    public void BeginRecovery(string pointId, long t)
    {
        Forget(pointId);
        _state[pointId] = new State { RepriseDepuis = t };
    }

    /// <summary>Oublie tout ce que le moteur sait d'un point (niveau, alarme tenue, tampon de dérive), comme forget côté front.</summary>
    public void Forget(string pointId) => _state.Remove(pointId);

    public void Reset() => _state.Clear();

    private static string NewId() => $"al-{Guid.NewGuid():N}"[..19];

    /// <summary>Séparateurs du front (Intl fr-FR) : virgule décimale, espace fine insécable entre les milliers.</summary>
    private static readonly NumberFormatInfo Francais = new() { NumberDecimalSeparator = ",", NumberGroupSeparator = "\u202F", NumberGroupSizes = [3] };

    /// <summary>Nombre écrit comme fmt() de rules.ts : deux décimales au plus sous 10, aucune au-delà.</summary>
    internal static string Nombre(double v) => v.ToString(Math.Abs(v) < 10 ? "#,0.##" : "#,0", Francais);
}
