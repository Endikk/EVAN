using EVAN.Core.Contracts;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;
using EVAN.Infrastructure.Simulation;

namespace EVAN.Simulator;

/// <summary>
/// Une machine simulée : cycle de production (marche, calage, arrêt), mesures autour de leur nominale
/// avec bruit et dynamique (bobine qui se vide, usure qui monte), panne injectée selon le catalogue.
/// Même comportement que le simulateur du navigateur (src/EVAN.Front/src/sim/simulator.ts).
/// </summary>
public sealed class MachineSimulator
{
    private sealed class PointSim
    {
        public required PointDeMesure Point { get; init; }
        public required MesureDef Def { get; init; }
        public required OrganeCatalogue Organe { get; init; }
        public double Value;
        public (PanneDef Panne, double From, DateTimeOffset Start, double Cible, string Forme)? Fault;
        public bool Recovering;
    }

    private readonly List<PointSim> _points = new();
    private readonly Random _rnd;
    private readonly double _nominale;
    private readonly double _comptage;
    private string _prod = "marche";
    private DateTimeOffset _until = DateTimeOffset.MinValue;
    private double _bonnes;
    private double _gache;
    private readonly double _phase;

    public Machine Machine { get; }
    public double Vitesse { get; private set; }
    public bool InFault => _points.Any(p => p.Fault is not null && !p.Recovering);

    public MachineSimulator(MachineModel model, int index)
    {
        Machine = model.Machine;
        _rnd = new Random(index * 7919 + 17);
        _nominale = model.Type?.Vitesse.Nominale ?? 100;
        _comptage = model.Type?.Vitesse.Unite == "m/min" ? 1 / 0.11 : 1;
        _phase = index * 1.7;
        Vitesse = _nominale * 0.92;
        foreach (var p in model.Points)
        {
            var (def, organe) = model.Defs[p.Id];
            // Démo : lampe UV de R04 en fin de vie, qui dérive doucement (détection par tendance).
            var initial = Machine.Id == "m-r04" && def.Cle == "puissance_uv" ? 76.5 : Initial(def, p.Id, index);
            _points.Add(new PointSim { Point = p, Def = def, Organe = organe, Value = initial });
        }
        if (Machine.Id == "m-pv01")
        {
            _prod = "arret";
            _until = DateTimeOffset.MaxValue;
            Vitesse = 0;
        }
    }

    private double Gauss() => (_rnd.NextDouble() + _rnd.NextDouble() + _rnd.NextDouble() + _rnd.NextDouble() - 2) * 1.732;

    /// <summary>
    /// Valeur de départ. L'usure part de là où l'historique simulé s'arrête (comme le simulateur du navigateur) : la
    /// supervision et le carnet de maintenance montrent le même compteur.
    /// </summary>
    private static double Initial(MesureDef d, string pointId, int index) => d.Type == "usure" ? HistoriqueSimule.NiveauUsure(pointId, d.Nominal) : d.Dynamique switch
    {
        "decroit" => d.Nominal - (d.Nominal - (d.Seuils.AttentionBas ?? d.Nominal * 0.2) * 1.2) * (index * 0.37 % 0.8),
        "compteur" => 18_000 + index * 4_250,
        _ => d.Nominal,
    };

    public bool Inject(int organeNumero, DateTimeOffset now)
    {
        var organeId = ReferenceData.OrganeId(Machine.Id, organeNumero);
        var target = _points.FirstOrDefault(p => p.Point.OrganeId == organeId && p.Organe.Panne?.Mesure == p.Point.Cle);
        if (target?.Organe.Panne is not { } panne) return false;
        if (_prod != "marche") _prod = "marche";
        target.Fault = (panne, target.Value, now, panne.Cible, panne.Forme);
        target.Recovering = false;
        foreach (var (cle, val) in panne.Lie ?? new())
        {
            var linked = _points.FirstOrDefault(p => p.Point.OrganeId == organeId && p.Point.Cle == cle);
            if (linked is not null) linked.Fault = (panne, linked.Value, now, val, "saut");
        }
        return true;
    }

    public void Resolve(DateTimeOffset now)
    {
        foreach (var p in _points.Where(p => p.Fault is not null)) p.Recovering = true;
        _prod = "calage";
        _until = now.AddSeconds(6);
    }

    /// <summary>Avance d'un pas ; renvoie les mesures et l'état de production.</summary>
    public (List<Metric> Metrics, StateMessage State) Step(string siteId, DateTimeOffset now, double dt)
    {
        var panne = InFault && _points.Any(p => p.Fault is not null && Overshoots(p));
        if (!panne)
        {
            if (_prod != "marche" && now > _until) _prod = "marche";
            else if (_prod == "marche" && _rnd.NextDouble() < 1.0 / 420 && !InFault)
            {
                _prod = "calage";
                _until = now.AddSeconds(14 + _rnd.NextDouble() * 14);
            }
        }
        var target = panne || _prod == "arret" ? 0 : _prod == "calage" ? _nominale * 0.18 : _nominale * (0.92 + 0.04 * Math.Sin(now.ToUnixTimeMilliseconds() / 37_000.0 + _phase));
        Vitesse += (target - Vitesse) * (panne ? 0.45 : 0.25);
        var produit = Vitesse / 60 * dt * _comptage;
        if (_prod == "calage") _gache += produit;
        else
        {
            _bonnes += produit * 0.985;
            _gache += produit * 0.015;
        }
        var facteur = _nominale > 0 ? Vitesse / _nominale : 0;

        var metrics = new List<Metric>(_points.Count);
        foreach (var p in _points)
        {
            p.Value = Next(p, now, dt, facteur);
            metrics.Add(new Metric(p.Point.Id, Math.Round(p.Value, 4), p.Point.Unite));
        }
        var state = new StateMessage
        {
            SiteId = siteId,
            MachineId = Machine.Id,
            Ts = now,
            Etat = panne ? "marche" : _prod,
            Vitesse = Math.Round(Vitesse, 2),
            Facteur = Math.Round(facteur, 3),
            Bonnes = Math.Round(_bonnes),
            Gache = Math.Round(_gache),
        };
        return (metrics, state);
    }

    /// <summary>La mesure en défaut a-t-elle dépassé son seuil d'alarme (la machine s'arrête alors) ?</summary>
    private static bool Overshoots(PointSim p) =>
        (p.Point.Seuils.AlarmeHaut is { } h && p.Value >= h) || (p.Point.Seuils.AlarmeBas is { } b && p.Value <= b);

    private double Next(PointSim p, DateTimeOffset now, double dt, double facteur)
    {
        var d = p.Def;
        if (d.Role == "vitesse") return Math.Max(0, Vitesse * (d.Nominal / _nominale) + (Vitesse > 0 ? Gauss() * d.Bruit : 0));
        if (d.Role == "alarmes") return InFault ? 1 : 0;
        if (p.Fault is { } f && !p.Recovering)
        {
            var k = Math.Clamp((now - f.Start).TotalSeconds / Math.Max(0.5, f.Panne.Duree), 0, 1);
            return f.Forme switch
            {
                "saut" => (now - f.Start).TotalMilliseconds > 600 ? f.Cible + Gauss() * d.Bruit * 0.3 : f.From,
                "rampe" => f.From + (f.Cible - f.From) * (k < 0.5 ? 2 * k * k : 1 - Math.Pow(-2 * k + 2, 2) / 2) + Gauss() * d.Bruit,
                _ => d.Nominal + (f.Cible - d.Nominal) * k * (0.55 + 0.45 * Math.Sin(now.ToUnixTimeMilliseconds() / 1700.0 * Math.PI * 2)) + Gauss() * d.Bruit,
            };
        }
        if (p.Recovering)
        {
            var v = p.Value + (d.Nominal - p.Value) * 0.35;
            if (Math.Abs(v - d.Nominal) < Math.Max(d.Bruit * 2, Math.Abs(d.Nominal) * 0.01))
            {
                p.Fault = null;
                p.Recovering = false;
            }
            return v;
        }
        var val = p.Value;
        switch (d.Dynamique)
        {
            case "compteur":
                return val + Vitesse / 60 * dt * _comptage;
            case "decroit" when facteur > 0:
                val -= Math.Max(0.02, d.Nominal * 0.0016 * facteur) * dt;
                if (val < (d.Seuils.AttentionBas ?? d.Nominal * 0.2) * 1.15) val = d.Nominal;
                return val + Gauss() * d.Bruit * 0.2;
            case "croit" when facteur > 0:
                if (d.Type == "usure") return val + 0.0004 * facteur * dt;
                val += d.Nominal * 0.0012 * facteur * dt;
                return val > (d.Seuils.AttentionHaut ?? d.Nominal * 2) * 0.95 ? d.Nominal : val;
            case "decroit" or "croit":
                return val;
        }
        if (Machine.Id == "m-r04" && d.Cle == "puissance_uv") return Math.Max(70.8, val - 0.02 * dt) + Gauss() * 0.05;
        return val + (d.Nominal - val) * 0.15 + Gauss() * d.Bruit;
    }
}
