using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Exploitation;
using EVAN.Core.Domain.Machines;

namespace EVAN.Infrastructure.Simulation;

/// <summary>
/// Historique simulé des 7 derniers jours, déterministe et identique, à la milliseconde près, à celui du navigateur
/// (src/EVAN.Front/src/sim/history.ts) : même aléa, mêmes horaires d'ouverture, mêmes pannes, mêmes mesures.
/// Le contrat est vérifié par tests/EVAN.Infrastructure.Tests/SimulatedHistoryContractTests.cs (data/tests/historique.json).
/// </summary>
public sealed class HistoriqueSimule : IHistorique
{
    private const long Glissement = 6 * Duree.Minute;
    private const long Reprise = 4 * Duree.Minute;
    private static readonly string[] Equipes = ["Équipe matin", "Équipe après-midi"];
    private static readonly string[] TypesCoupesALarret = ["tension", "pression", "couple", "puissance", "vitesse"];

    private readonly Dictionary<string, IReadOnlyList<Periode>> _periodes = new();
    private readonly Dictionary<string, IReadOnlyList<TrsJour>> _trs = new();
    private readonly List<Alarme> _alarmes = new();

    public long Debut { get; }
    public long Fin { get; }
    public TimeZoneInfo Fuseau { get; }
    public IReadOnlyDictionary<string, IReadOnlyList<Periode>> Periodes => _periodes;
    public IReadOnlyList<Alarme> Alarmes => _alarmes;
    public IReadOnlyDictionary<string, IReadOnlyList<TrsJour>> Trs => _trs;

    /// <param name="maintenant">Instant de lecture : l'historique s'arrête à l'heure pleine qui le précède.</param>
    public HistoriqueSimule(IEnumerable<MachineModel> machines, long maintenant, TimeZoneInfo fuseau)
    {
        Fuseau = fuseau;
        Fin = maintenant / Duree.Heure * Duree.Heure;
        var today = Core.Domain.Exploitation.Fuseau.Minuit(fuseau, Fin);
        Debut = today - 6 * Duree.Jour;
        var models = machines.ToList();
        foreach (var model in models) Generer(model);
        ScenarioRepetitif(models, today);
        // Tri stable, comme Array.prototype.sort côté navigateur.
        var triees = _alarmes.OrderByDescending(a => a.Horodatage).ToList();
        _alarmes.Clear();
        _alarmes.AddRange(triees);
    }

    /// <summary>Fenêtres d'ouverture : 5 h–21 h en semaine, samedi matin pour l'impression, fermé le dimanche.</summary>
    private (long Debut, long Fin)? Ouverture(long dayStart, string categorie)
    {
        var jour = Core.Domain.Exploitation.Fuseau.Local(Fuseau, dayStart).DayOfWeek;
        if (jour == DayOfWeek.Sunday) return null;
        if (jour == DayOfWeek.Saturday) return categorie == "impression" ? (dayStart + 5 * Duree.Heure, dayStart + 13 * Duree.Heure) : null;
        return (dayStart + 5 * Duree.Heure, dayStart + 21 * Duree.Heure);
    }

    /// <summary>Durée tirée en minutes, arrondie à la seconde (horodatages en millisecondes entières).</summary>
    private static long Minutes(double m) => (long)Aleatoire.ArrondiJs(m * 60) * 1000;

    private static OrganeCatalogue? Def(MachineModel model, Organe o) => model.Type?.Organes.GetValueOrDefault(o.Numero.ToString());

    private void Generer(MachineModel model)
    {
        var m = model.Machine;
        var rnd = Aleatoire.Mulberry32(Aleatoire.HashString(m.Id));
        var faultOrganes = model.Organes.Where(o => Def(model, o)?.Panne is not null).ToList();
        var list = new List<Periode>();
        var jours = new List<TrsJour>();
        // Fiabilité propre à chaque machine : la numérique et la flexo récente tombent moins en panne.
        var fragilite = m.Type == "offset" ? 0.13 : m.Type == "flexo" ? 0.09 : 0.07;
        var perfBase = 0.84 + rnd() * 0.08;

        for (var d = 0; d < 7; d++)
        {
            var dayStart = Debut + d * Duree.Jour;
            var win = Ouverture(dayStart, model.Type?.Categorie ?? "atelier");
            double calageMin = 0, marcheMin = 0, panneMin = 0;
            if (win is not { } w)
            {
                list.Add(new Periode(dayStart, dayStart + Duree.Jour, "arret"));
                jours.Add(new TrsJour(dayStart, 0, 0, 0, 0, 0, 0, 0, 0));
                continue;
            }
            list.Add(new Periode(dayStart, w.Debut, "arret"));
            var t = w.Debut;
            var end = Math.Min(w.Fin, Fin);
            while (t < end)
            {
                // Calage en début de travail.
                var calage = Minutes(8 + rnd() * 17);
                list.Add(new Periode(t, Math.Min(t + calage, end), "calage"));
                calageMin += (double)Math.Min(calage, end - t) / Duree.Minute;
                t += calage;
                if (t >= end) break;
                var run = Minutes(70 + rnd() * 130);
                var runEnd = Math.Min(t + run, end);
                if (faultOrganes.Count > 0 && rnd() < fragilite)
                {
                    // Panne au milieu du travail.
                    var at = t + (long)Aleatoire.ArrondiJs((runEnd - t) * (0.3 + rnd() * 0.5) / 1000) * 1000;
                    var organe = faultOrganes[(int)Math.Floor(rnd() * faultOrganes.Count)];
                    var r = rnd();
                    var dur = Minutes(5 + r * r * 70);
                    list.Add(new Periode(t, at, "marche"));
                    marcheMin += (double)(at - t) / Duree.Minute;
                    var pEnd = Math.Min(at + dur, end);
                    var alarm = AlarmePassee(model, organe, at, pEnd, rnd);
                    _alarmes.Add(alarm);
                    list.Add(new Periode(at, pEnd, "panne", organe.Id, alarm.Id));
                    panneMin += (double)(pEnd - at) / Duree.Minute;
                    t = pEnd;
                    // Après l'intervention, la machine repart par un court calage.
                    var reprise = Math.Min(t + Reprise, runEnd);
                    if (t < reprise)
                    {
                        list.Add(new Periode(t, reprise, "calage"));
                        calageMin += (double)(reprise - t) / Duree.Minute;
                        t = reprise;
                    }
                    if (t < runEnd)
                    {
                        list.Add(new Periode(t, runEnd, "marche"));
                        marcheMin += (double)(runEnd - t) / Duree.Minute;
                    }
                }
                else
                {
                    list.Add(new Periode(t, runEnd, "marche"));
                    marcheMin += (double)(runEnd - t) / Duree.Minute;
                }
                // Une panne qui déborde la fin du travail repousse le suivant : le temps ne revient jamais en arrière.
                t = Math.Max(t, runEnd);
            }
            if (w.Fin < dayStart + Duree.Jour && w.Fin <= Fin) list.Add(new Periode(w.Fin, dayStart + Duree.Jour, "arret"));
            var ouvertureMin = (double)(Math.Min(w.Fin, Fin) - w.Debut) / Duree.Minute;
            if (ouvertureMin > 0)
            {
                var dispo = marcheMin / ouvertureMin;
                var perf = Math.Min(0.98, perfBase + (rnd() - 0.5) * 0.06);
                var qual = Math.Max(0.9, 0.985 - calageMin / ouvertureMin * 0.12 - rnd() * 0.012);
                jours.Add(new TrsJour(dayStart, dispo, perf, qual, dispo * perf * qual, ouvertureMin, marcheMin, panneMin, calageMin));
            }
            else jours.Add(new TrsJour(dayStart, 0, 0, 0, 0, ouvertureMin, marcheMin, panneMin, calageMin));
        }
        _periodes[m.Id] = list.Where(p => p.Fin > p.Debut && p.Debut < Fin).Select(p => p with { Fin = Math.Min(p.Fin, Fin) }).ToList();
        _trs[m.Id] = jours;
    }

    /// <summary>Défaut répétitif scénarisé : casse d'échenillage sur la flexo, trois fois dans la dernière journée travaillée.</summary>
    private void ScenarioRepetitif(List<MachineModel> models, long today)
    {
        var flexo = models.FirstOrDefault(x => x.Machine.Type == "flexo");
        var ech = flexo?.Organes.FirstOrDefault(o => o.Numero == 7);
        if (flexo is null || ech is null) return;
        var local = Core.Domain.Exploitation.Fuseau.Local(Fuseau, today).Date;
        for (var d = 0; d < 7; d++)
        {
            var jour = Core.Domain.Exploitation.Fuseau.Instant(Fuseau, local.AddDays(-d));
            if (Ouverture(jour, "impression") is not { } w || Math.Min(w.Fin, Fin) - w.Debut < 5 * Duree.Heure) continue;
            var rnd = Aleatoire.Mulberry32(42);
            foreach (var off in new[] { 1.1, 2.6, 4.3 })
            {
                var at = w.Debut + (long)Aleatoire.ArrondiJs(off * 3600) * 1000;
                var a = AlarmePassee(flexo, ech, at, at + 9 * Duree.Minute, rnd);
                _alarmes.Add(a);
                InsererPanne(flexo.Machine.Id, new Periode(at, at + 9 * Duree.Minute, "panne", ech.Id, a.Id));
            }
            break;
        }
    }

    private void InsererPanne(string machineId, Periode p)
    {
        var out_ = new List<Periode>();
        foreach (var q in _periodes[machineId])
        {
            if (q.Fin <= p.Debut || q.Debut >= p.Fin) out_.Add(q);
            else
            {
                if (q.Debut < p.Debut) out_.Add(q with { Fin = p.Debut });
                if (q.Fin > p.Fin) out_.Add(q with { Debut = p.Fin });
            }
        }
        out_.Add(p);
        _periodes[machineId] = out_.OrderBy(x => x.Debut).ToList();
    }

    private Alarme AlarmePassee(MachineModel model, Organe organe, long at, long end, Func<double> rnd)
    {
        var def = Def(model, organe);
        var panne = def?.Panne;
        var mesure = def?.Mesures.FirstOrDefault(x => x.Cle == panne?.Mesure);
        double? valeur = panne is null ? null : panne.Cible + (rnd() - 0.5) * Math.Abs(panne.Cible - (mesure?.Nominal ?? panne.Cible)) * 0.15;
        var id = $"h-{model.Machine.Id}-{(long)Aleatoire.ArrondiJs(at / 1000.0)}";
        // Acquittement 40 s à 4 min après l'alarme, tiré de l'identifiant pour ne pas décaler la suite de l'aléa.
        var acquitteeLe = Math.Min(end, at + (long)Aleatoire.ArrondiJs(40 + Aleatoire.HashNoise(Aleatoire.HashString(id), 1) * 200) * 1000);
        return new Alarme
        {
            Id = id,
            Code = organe.AlarmeCode ?? "EV-00",
            Message = organe.AlarmeMessage ?? "Défaut",
            Gravite = "critique",
            MachineId = model.Machine.Id,
            OrganeId = organe.Id,
            PointId = panne is null ? null : $"{organe.Id}.{panne.Mesure}",
            Horodatage = at,
            Valeur = valeur is { } v ? Arrondi(v) : null,
            Unite = mesure?.Unite,
            Seuil = mesure is null || panne is null ? null : panne.Cible > mesure.Nominal ? mesure.Seuils.AlarmeHaut : mesure.Seuils.AlarmeBas,
            Statut = "resolue",
            Regle = mesure?.Type == "alarme" ? "automate" : "seuil",
            Cause = panne?.Cause,
            FinLe = end,
            AcquitteePar = Equipes[Core.Domain.Exploitation.Fuseau.Local(Fuseau, at).Hour < 13 ? 0 : 1],
            AcquitteeLe = acquitteeLe,
        };
    }

    private static double Arrondi(double v) => Math.Abs(v) < 10 ? Math.Floor(v * 100 + 0.5) / 100 : Math.Floor(v * 10 + 0.5) / 10;

    /// <summary>Valeur historique d'une mesure à l'instant t (bruit lissé, cycles, dérives, glissement avant une panne).</summary>
    public double Valeur(MachineModel model, PointDeMesure point, long t)
    {
        if (!model.Defs.TryGetValue(point.Id, out var d)) return point.Nominal;
        var def = d.Mesure;
        var panne = d.Organe.Panne;
        var seed = Aleatoire.HashString(point.Id);
        var i = (long)Math.Floor((double)t / (5 * Duree.Minute));
        var list = this.PeriodesDe(model.Machine.Id);
        var p = HistoriqueExtensions.PeriodeA(list, t);
        var nominalSpeed = model.Type?.Vitesse.Nominale ?? def.Nominal;
        // Bruit lissé : variations lentes (nœuds toutes les 40 min, interpolés) et un peu de bruit fin.
        var k = (double)t / (40 * Duree.Minute);
        var k0 = Math.Floor(k);
        var f = k - k0;
        var smooth = Aleatoire.StableGauss(seed, (long)k0) * (1 - f) + Aleatoire.StableGauss(seed, (long)k0 + 1) * f;
        var noise = smooth * def.Bruit * 2 + Aleatoire.StableGauss(seed ^ 0x5bd1e995u, i) * def.Bruit * 0.5;
        var daily = Math.Sin((double)t / (6 * Duree.Heure) * Math.PI * 2 + seed % 7) * def.Bruit * 1.5;
        // Machine à l'arrêt : plus de tension ni de pression, températures à l'ambiante.
        if (p?.Etat == "arret" && def.Role is null && def.Dynamique is null)
        {
            if (TypesCoupesALarret.Contains(def.Type)) return Math.Max(0, Aleatoire.StableGauss(seed, i) * def.Bruit * 0.2);
            if (def.Type == "temperature") return Math.Min(def.Nominal, 20.5) + Aleatoire.StableGauss(seed, i) * 0.15;
        }
        if (def.Role == "vitesse")
        {
            if (p is null || p.Etat is "arret" or "panne") return 0;
            if (p.Etat == "calage") return Math.Max(0, nominalSpeed * 0.18 + noise);
            return Math.Max(0, nominalSpeed * (0.9 + 0.05 * Math.Sin((double)t / (47 * Duree.Minute) + seed)) + noise * 3);
        }
        if (def.Role == "alarmes") return p?.Etat == "panne" ? 1 : 0;
        if (def.Dynamique == "compteur") return Math.Floor((double)(t - Debut) / 1000 * 8);

        var v = def.Nominal + daily + noise;
        if (def.Dynamique == "decroit")
        {
            var cycle = 55 * Duree.Minute + seed % 20 * Duree.Minute;
            var ph = ((double)t + seed * 1000.0) % cycle / cycle;
            var low = (def.Seuils.AttentionBas ?? def.Nominal * 0.25) * 1.2;
            v = def.Nominal - (def.Nominal - low) * ph;
        }
        else if (def.Dynamique == "croit")
        {
            if (def.Type == "usure") v = def.Nominal - (double)(Fin - t) / Duree.Jour * (def.Nominal * 0.015);
            else
            {
                const long cycle = 70 * Duree.Minute;
                var ph = ((double)t + seed * 1000.0) % cycle / cycle;
                var high = (def.Seuils.AttentionHaut ?? def.Nominal * 2) * 0.9;
                v = def.Nominal + (high - def.Nominal) * ph;
            }
        }
        // Vieillissement d'une lampe UV : baisse lente sur la semaine (scénario de dérive de la démo).
        if (model.Machine.Id == "m-r04" && point.Cle == "puissance_uv") v = 84 - (double)(t - Debut) / (Fin - Debut) * 8.5 + noise;

        // Autour d'une panne : la mesure glisse jusqu'au seuil d'alarme, franchi à l'instant de l'alarme, puis rejoint sa valeur de défaut.
        if (panne?.Mesure == point.Cle)
        {
            var near = list.FirstOrDefault(q => q.Etat == "panne" && q.OrganeId == point.OrganeId && t >= q.Debut - Glissement && t < q.Fin);
            if (near is not null) v = AutourDePanne(v, t, near.Debut, panne, point.Seuils, def.Nominal);
        }
        return v;
    }

    private static double AutourDePanne(double v, long t, long debut, PanneDef panne, Seuils seuils, double nominal)
    {
        if (t >= debut)
        {
            if (panne.Forme == "saut") return panne.Cible;
            var depart = Chronologie.SeuilDePanne(panne, seuils, nominal) ?? v;
            return depart + (panne.Cible - depart) * Math.Min(1, (double)(t - debut) / 45_000);
        }
        if (panne.Forme == "saut") return v;
        var seuil = Chronologie.SeuilDePanne(panne, seuils, nominal) ?? panne.Cible;
        var k = Math.Max(0, 1 - (double)(debut - t) / Glissement);
        return v + (seuil - v) * Math.Pow(k, 1.6);
    }
}
