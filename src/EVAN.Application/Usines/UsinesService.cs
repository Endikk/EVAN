using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Application.Validation;
using EVAN.Core.Domain.Catalog;

namespace EVAN.Application.Usines;

/// <summary>
/// Issue d'un enregistrement : la configuration gardée, ou ce qui l'empêche. Introuvable : l'usine appartient à une
/// autre organisation (ou à la démo), et rien ne doit le laisser deviner. Conflit : un identifiant est déjà pris.
/// </summary>
public sealed record ResultatUsine(ConfigurationUsine? Configuration, IReadOnlyList<ErreurChamp> Erreurs, bool Introuvable = false, bool Conflit = false)
{
    internal static readonly ResultatUsine Inconnue = new(null, [], Introuvable: true);
}

/// <summary>
/// Usines des organisations réelles : enregistrement de la configuration complète (validée, puis écrite en base, puis
/// rechargée dans le temps réel pour que l'ingestion reconnaisse les nouvelles machines sans redémarrage), et relecture.
/// Le contrôle d'accès (l'utilisateur est-il de cette organisation ?) est fait par l'appelant ; ce service garantit
/// qu'une organisation ne réécrit jamais l'usine ni les identifiants d'une autre.
/// </summary>
public sealed class UsinesService(IStore store, LiveService live, ReferenceData data)
{
    /// <summary>Un enregistrement à la fois : le contrôle des identifiants pris reste vrai jusqu'à l'écriture.</summary>
    private readonly SemaphoreSlim _ecriture = new(1, 1);

    public async Task<ResultatUsine> EnregistrerAsync(string organisationId, string siteId, ConfigurationUsine? saisie, CancellationToken ct = default)
    {
        if (!Modifiable(organisationId, siteId)) return ResultatUsine.Inconnue;
        var erreurs = ValidationUsine.Verifier(siteId, saisie, data.Catalogue);
        if (erreurs.Count > 0) return new ResultatUsine(null, erreurs);
        await _ecriture.WaitAsync(ct);
        try
        {
            if (!Modifiable(organisationId, siteId)) return ResultatUsine.Inconnue;
            var config = Normaliser(organisationId, saisie!);
            var conflits = Conflits(organisationId, config);
            if (conflits.Count > 0) return new ResultatUsine(null, conflits, Conflit: true);
            var usine = new UsineEnregistree(organisationId, config);
            await store.EnregistrerUsineAsync(usine, ct);
            live.Charger(usine);
            return new ResultatUsine(config, []);
        }
        catch (IdentifiantPrisException ex)
        {
            // L'usine existe en base sous une autre organisation : même réponse que pour une usine inconnue.
            return ex.Champ == "site.id" ? ResultatUsine.Inconnue : new ResultatUsine(null, [new ErreurChamp(ex.Champ, ex.Message)], Conflit: true);
        }
        finally
        {
            _ecriture.Release();
        }
    }

    /// <summary>Nouvelle usine, ou usine déjà à cette organisation.</summary>
    private bool Modifiable(string organisationId, string siteId) => live.OrganisationDe(siteId) is not { } proprietaire || proprietaire == organisationId;

    /// <summary>
    /// Configuration telle qu'elle sera gardée : l'organisation est celle du compte (jamais celle annoncée par le client),
    /// la passerelle reste celle déjà attribuée à l'usine, ou en reçoit une si le front n'en donne pas.
    /// </summary>
    private ConfigurationUsine Normaliser(string organisationId, ConfigurationUsine c)
    {
        var passerelle = c.Site.Passerelle ?? live.Site(c.Site.Id)?.Site.Passerelle ?? PasserelleLibre(c.Site.Id);
        return c with { Site = c.Site with { OrganisationId = organisationId, Passerelle = passerelle } };
    }

    /// <summary>Identifiant de passerelle proposé pour une usine : « gw- » et l'identifiant de l'usine, rendu unique.</summary>
    private string PasserelleLibre(string siteId)
    {
        var racine = $"gw-{(siteId.StartsWith("site-", StringComparison.Ordinal) ? siteId[5..] : siteId)}";
        racine = racine[..Math.Min(racine.Length, 60)];
        var prises = live.Usines.Select(u => u.Usine.Site.Passerelle).OfType<string>().ToHashSet();
        var id = racine;
        for (var n = 2; prises.Contains(id); n++) id = $"{racine}-{n}";
        return id;
    }

    /// <summary>
    /// Identifiants déjà pris par une autre usine : la base, les sujets MQTT et les séries les veulent uniques dans
    /// toute l'installation. Une usine d'une autre organisation n'est jamais nommée.
    /// </summary>
    private List<ErreurChamp> Conflits(string organisationId, ConfigurationUsine c)
    {
        var autres = live.Usines.Where(u => u.Usine.Site.Id != c.Site.Id).ToList();
        string Chez(UsineChargee u) => u.OrganisationId == organisationId ? $"l'usine « {u.Usine.Site.Nom} »" : "une autre usine";
        Dictionary<string, UsineChargee> Index(Func<UsineChargee, IEnumerable<string>> ids)
        {
            var index = new Dictionary<string, UsineChargee>();
            foreach (var u in autres) foreach (var id in ids(u)) index.TryAdd(id, u);
            return index;
        }
        var batiments = Index(u => u.Usine.Batiments.Select(b => b.Id));
        var zones = Index(u => u.Usine.Zones.Select(z => z.Id));
        var machines = Index(u => u.Usine.Machines.Select(m => m.Id));
        var connexions = Index(u => u.Configuration?.Connexions.Select(x => x.Id) ?? []);
        var passerelles = Index(u => u.Usine.Site.Passerelle is { } gw ? [gw] : []);

        var erreurs = new List<ErreurChamp>();
        void Verifier<T>(List<T> liste, string champ, Func<T, string> id, Func<T, string> nom, Dictionary<string, UsineChargee> index)
        {
            for (var i = 0; i < liste.Count; i++)
                if (index.TryGetValue(id(liste[i]), out var u)) erreurs.Add(new ErreurChamp($"{champ}[{i}].id", $"{nom(liste[i])} : identifiant déjà utilisé par {Chez(u)}."));
        }
        Verifier(c.Batiments, "batiments", b => b.Id, b => $"Bâtiment « {b.Nom} »", batiments);
        Verifier(c.Zones, "zones", z => z.Id, z => $"Zone « {z.Nom} »", zones);
        Verifier(c.Machines, "machines", m => m.Id, m => $"Machine {m.Numero}", machines);
        Verifier(c.Connexions, "connexions", x => x.Id, x => "Connexion", connexions);
        if (c.Site.Passerelle is { } passerelle && passerelles.TryGetValue(passerelle, out var autre))
            erreurs.Add(new ErreurChamp("site.passerelle", $"Passerelle {passerelle} : déjà attribuée à {Chez(autre)}."));
        return erreurs.Take(ValidationUsine.ErreursMax).ToList();
    }

    /// <summary>Configuration d'une usine chargée ; celle d'une usine de la démo est reconstituée depuis le catalogue.</summary>
    public ConfigurationUsine? Configuration(string siteId)
    {
        if (live.Usine(siteId) is not { } u) return null;
        if (u.Configuration is { } config) return config;
        var models = u.Usine.Machines.Select(data.Model).ToList();
        var organes = models.SelectMany(m => m.Organes).Select(o => new OrganeConfig(
            o.Id, o.MachineId, o.Numero, o.Nom, o.Noeud3d, o.Position, Methode: o.Methode,
            Alarme: o.AlarmeCode is { } code ? new AlarmeOrgane(code, o.AlarmeMessage ?? "") : null)).ToList();
        return new ConfigurationUsine(u.Usine.Site, u.Usine.Batiments, u.Usine.Zones, u.Usine.Machines, organes, models.SelectMany(m => m.Points).ToList(), [], Configure: true);
    }
}
