using System.Net;
using System.Security.Claims;
using System.Text.Json;
using EVAN.Api.Realtime;
using EVAN.Api.Securite;
using EVAN.Application.Assistant;
using EVAN.Application.Live;
using EVAN.Core.Contracts;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;

namespace EVAN.Api.Tests;

/// <summary>
/// Accès croisé : un utilisateur de l'organisation A reçoit 404 sur chaque route d'une usine de B (sans compte aussi),
/// et ne rejoint pas son groupe sur le hub. B, lui, y accède. La démo reste ouverte sans compte tant qu'elle est activée.
/// </summary>
public class CloisonnementTests
{
    private sealed record Usines(BancApi Banc, Navigateur A, Navigateur B, string Machine, string Point, string Alarme);

    /// <summary>Deux organisations, une usine chacune ; une alarme ouverte dans l'usine de B.</summary>
    private static async Task<Usines> Preparer(BancApi banc)
    {
        var a = await banc.Organisation("Imprimerie Arnaud", "admin@arnaud.fr");
        var b = await banc.Organisation("Étiquettes Bernard", "admin@bernard.fr");
        Assert.Equal(HttpStatusCode.OK, (await a.Put("/api/sites/site-a", UsineExemple.Creer(banc.Data, "site-a", "a"))).StatusCode);
        var config = UsineExemple.Creer(banc.Data, "site-b", "b");
        Assert.Equal(HttpStatusCode.OK, (await b.Put("/api/sites/site-b", config)).StatusCode);
        var alarme = UsineExemple.Alarme(banc.Live, "site-b", "m-b-1");
        return new Usines(banc, a, b, "m-b-1", config.Points.First(p => p.MachineId == "m-b-1").Id, alarme);
    }

    /// <summary>Chaque route qui désigne une ressource de l'usine B, avec un corps valide quand il en faut un.</summary>
    private static IEnumerable<(HttpMethod Methode, string Url, object? Corps)> RoutesDeB(Usines u, BancApi banc)
    {
        var maintenant = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        yield return (HttpMethod.Get, "/api/sites/site-b", null);
        yield return (HttpMethod.Get, "/api/sites/site-b/live", null);
        yield return (HttpMethod.Get, "/api/sites/site-b/alarms", null);
        yield return (HttpMethod.Get, "/api/sites/site-b/events", null);
        yield return (HttpMethod.Post, "/api/sites/site-b/events", new { type = "action", message = "Intrusion" });
        yield return (HttpMethod.Get, "/api/sites/site-b/maintenance", null);
        yield return (HttpMethod.Get, "/api/sites/site-b/energie", null);
        yield return (HttpMethod.Get, "/api/sites/site-b/arrets", null);
        yield return (HttpMethod.Get, "/api/sites/site-b/interventions", null);
        yield return (HttpMethod.Post, "/api/sites/site-b/interventions", new { id = "sa-b", machineId = u.Machine, type = "curative", date = maintenant, duree = 10, titre = "Intrusion" });
        // Pour B, la saisie qu'il vient de consigner ; pour les autres, elle n'a jamais existé.
        yield return (HttpMethod.Put, "/api/sites/site-b/interventions/sa-b", new { machineId = u.Machine, type = "curative", date = maintenant, duree = 15, titre = "Intrusion" });
        yield return (HttpMethod.Delete, "/api/sites/site-b/interventions/sa-b", null);
        yield return (HttpMethod.Get, "/api/sites/site-b/interventions/prevues", null);
        yield return (HttpMethod.Post, "/api/sites/site-b/interventions/prevues", new { id = "pv-b", machineId = u.Machine, titre = "Intrusion", date = maintenant + 86_400_000, duree = 30 });
        yield return (HttpMethod.Delete, "/api/sites/site-b/interventions/prevues/pv-b", null);
        yield return (HttpMethod.Get, "/api/sites/site-b/passerelle/config", null);
        yield return (HttpMethod.Post, "/api/demo/site-b/fault", new { });
        yield return (HttpMethod.Post, "/api/demo/site-b/reset", new { });
        yield return (HttpMethod.Get, $"/api/points/{u.Point}/series", null);
        yield return (HttpMethod.Get, $"/api/machines/{u.Machine}/defaut-repetitif?pas=339.5", null);
        yield return (HttpMethod.Get, $"/api/alarms/{u.Alarme}/chronologie", null);
        yield return (HttpMethod.Post, $"/api/alarms/{u.Alarme}/ack", new { });
        yield return (HttpMethod.Post, $"/api/alarms/{u.Alarme}/resolve", new { });
        // Juste après la clôture : B l'annule, A ne voit même pas l'alarme.
        yield return (HttpMethod.Post, $"/api/alarms/{u.Alarme}/reopen", new { });
        yield return (HttpMethod.Post, "/api/connections/test", new { machineId = u.Machine, protocole = "opcua", parametres = new Dictionary<string, string>(), siteId = "site-b" });
        // En dernier : pour B, elle remplace les machines que les routes précédentes désignent.
        yield return (HttpMethod.Put, "/api/sites/site-b", UsineExemple.Creer(banc.Data, "site-b", "intrus"));
    }

    [Fact]
    public async Task Un_utilisateur_de_A_recoit_404_sur_chaque_route_d_une_usine_de_B()
    {
        await using var banc = await BancApi.Demarrer();
        var u = await Preparer(banc);

        foreach (var (methode, url, corps) in RoutesDeB(u, banc))
        {
            var res = await u.A.Envoyer(methode, url, corps);
            Assert.True(res.StatusCode == HttpStatusCode.NotFound, $"{methode} {url} : {(int)res.StatusCode} pour l'organisation A");
        }
        // Rien n'a bougé chez B : alarme toujours active, configuration intacte.
        Assert.Equal("active", banc.Live.Direct("site-b")!.Alarmes.Single(a => a.Id == u.Alarme).Statut);
        Assert.Equal(["m-b-1", "m-b-2"], banc.Live.Site("site-b")!.Machines.Select(m => m.Id));
    }

    [Fact]
    public async Task Sans_compte_les_routes_d_une_usine_reelle_repondent_404_ou_401()
    {
        await using var banc = await BancApi.Demarrer();
        var u = await Preparer(banc);
        var anonyme = banc.Navigateur();

        foreach (var (methode, url, corps) in RoutesDeB(u, banc))
        {
            var res = await anonyme.Envoyer(methode, url, corps);
            // 401 : les routes réservées à un compte (configuration, passerelle) le disent avant tout, sans rien révéler.
            Assert.True(res.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Unauthorized, $"{methode} {url} : {(int)res.StatusCode} sans compte");
        }
    }

    [Fact]
    public async Task L_organisation_B_accede_a_ses_propres_routes()
    {
        await using var banc = await BancApi.Demarrer();
        var u = await Preparer(banc);

        foreach (var (methode, url, corps) in RoutesDeB(u, banc).Where(r => !r.Url.StartsWith("/api/demo/", StringComparison.Ordinal)))
        {
            var res = await u.B.Envoyer(methode, url, corps);
            Assert.True(res.IsSuccessStatusCode, $"{methode} {url} : {(int)res.StatusCode} pour l'organisation B");
        }
    }

    [Fact]
    public async Task Les_listes_ne_montrent_que_les_usines_de_son_organisation()
    {
        await using var banc = await BancApi.Demarrer();
        var u = await Preparer(banc);

        var sites = (await u.A.Json("/api/sites")).EnumerateArray().Select(s => s.GetProperty("id").GetString()).ToList();
        var sante = (await u.A.Json("/api/health")).GetProperty("sites").EnumerateArray().Select(s => s.GetString()).ToList();
        var anonyme = (await banc.Navigateur().Json("/api/health")).GetProperty("sites").EnumerateArray().Select(s => s.GetString()).ToList();

        Assert.Equal(["site-a"], sites);
        Assert.Contains("site-a", sante);
        Assert.DoesNotContain("site-b", sante);
        Assert.Equal(["site-tours", "site-crissey"], anonyme);
    }

    [Fact]
    public async Task Le_hub_refuse_le_groupe_d_une_usine_d_une_autre_organisation()
    {
        await using var banc = await BancApi.Demarrer();
        await Preparer(banc);
        var orgA = banc.Live.OrganisationDe("site-a")!;
        var groupes = new Groupes();
        var hub = Hub(banc, groupes, new ClaimsPrincipal(new ClaimsIdentity([new Claim(Identite.Organisation, orgA)], "test")));

        await Assert.ThrowsAsync<HubException>(() => hub.Join("site-b"));
        await Assert.ThrowsAsync<HubException>(() => hub.Join("site-inconnu"));
        await hub.Join("site-a");
        await hub.Join("site-tours");

        Assert.Equal(["site-a", "site-tours"], groupes.Rejoints);
    }

    [Fact]
    public async Task Demo_fermee_ses_usines_ne_se_voient_plus_sans_compte()
    {
        await using var banc = await BancApi.Demarrer(new() { ["Evan:DemoEnabled"] = "false" });
        var anonyme = banc.Navigateur();
        var groupes = new Groupes();

        Assert.Equal(HttpStatusCode.NotFound, (await anonyme.Get("/api/sites/site-tours/live")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonyme.Get("/api/points/m-r01.o1.tension/series")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonyme.Get("/api/organisation")).StatusCode);
        await Assert.ThrowsAsync<HubException>(() => Hub(banc, groupes, new ClaimsPrincipal(new ClaimsIdentity())).Join("site-tours"));
    }

    [Fact]
    public async Task La_demo_reste_ouverte_sans_compte()
    {
        await using var banc = await BancApi.Demarrer();
        var anonyme = banc.Navigateur();
        var alarme = UsineExemple.Alarme(banc.Live, "site-tours", "m-r01");

        Assert.Equal(HttpStatusCode.OK, (await anonyme.Get("/api/sites/site-tours/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonyme.Post($"/api/alarms/{alarme}/ack")).StatusCode);
        Assert.Equal("Superviseur", banc.Live.Direct("site-tours")!.Alarmes.Single(a => a.Id == alarme).AcquitteePar);
        Assert.Equal("Valtiq (exemple)", (await anonyme.Json("/api/organisation")).GetProperty("organisation").GetProperty("nom").GetString());
    }

    [Fact]
    public async Task Les_outils_de_l_assistant_et_du_MCP_ne_lisent_pas_une_usine_reelle()
    {
        await using var banc = await BancApi.Demarrer();
        await Preparer(banc);
        var outils = banc.Services.GetRequiredService<EvanTools>();
        string Lire(object reponse) => JsonSerializer.Serialize(reponse, EvanTools.JsonOutils);

        Assert.Contains("erreur", Lire(outils.EtatUsine("site-b")));
        Assert.Contains("erreur", Lire(outils.Machines("Usine b")));
        Assert.Contains("erreur", Lire(outils.Alarmes("site-b")));
        Assert.DoesNotContain("site-b", Lire(outils.Organisation()));
        Assert.Contains("erreur", Lire(outils.Mesure("m-b-1", "tension")));
        Assert.Contains("erreur", Lire(outils.CarnetMaintenance("site-b")));
    }

    [Fact]
    public async Task Une_intervention_planifiee_d_une_usine_reelle_reste_hors_de_l_assistant_et_du_MCP()
    {
        await using var banc = await BancApi.Demarrer();
        var u = await Preparer(banc);
        var demain = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 86_400_000;
        var planifiee = await u.B.Post("/api/sites/site-b/interventions/prevues", new { id = "pv-b", machineId = u.Machine, titre = "Changement du cylindre de B", date = demain, duree = 30 });
        Assert.Equal(HttpStatusCode.Created, planifiee.StatusCode);
        var outils = banc.Services.GetRequiredService<EvanTools>();
        string Lire(object reponse) => JsonSerializer.Serialize(reponse, EvanTools.JsonOutils);

        // Ni par l'usine, ni par la machine, ni au détour d'une usine de la démo.
        Assert.Contains("erreur", Lire(outils.CarnetMaintenance("site-b")));
        Assert.Contains("erreur", Lire(outils.CarnetMaintenance(null, u.Machine)));
        foreach (var usine in new[] { "site-tours", "site-crissey" })
        {
            var carnet = Lire(outils.CarnetMaintenance(usine));
            Assert.Contains("interventionsPlanifiees", carnet);
            Assert.DoesNotContain("pv-b", carnet);
            Assert.DoesNotContain("cylindre de B", carnet);
        }
    }

    // ---------- Hub sans transport : contexte, groupes et clients simulés ----------

    private static SupervisionHub Hub(BancApi banc, Groupes groupes, ClaimsPrincipal user) =>
        new(banc.Live, banc.Services.GetRequiredService<AccesUsines>()) { Context = new Contexte(user), Groups = groupes, Clients = new ClientsSimules() };

    private sealed class Groupes : IGroupManager
    {
        public readonly List<string> Rejoints = new();
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken ct = default)
        {
            Rejoints.Add(groupName);
            return Task.CompletedTask;
        }
        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class Contexte(ClaimsPrincipal user) : HubCallerContext
    {
        public override string ConnectionId => "connexion-test";
        public override string? UserIdentifier => null;
        public override ClaimsPrincipal? User => user;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort() { }
    }

    private sealed class ClientsSimules : IHubCallerClients
    {
        private sealed class Proxy : ISingleClientProxy
        {
            public Task SendCoreAsync(string method, object?[] args, CancellationToken ct = default) => Task.CompletedTask;
            public Task<T> InvokeCoreAsync<T>(string method, object?[] args, CancellationToken ct = default) => throw new NotSupportedException();
        }

        private static readonly Proxy Un = new();
        ISingleClientProxy IHubCallerClients.Caller => Un;
        IClientProxy IHubCallerClients<IClientProxy>.Caller => Un;
        ISingleClientProxy IHubCallerClients.Client(string connectionId) => Un;
        IClientProxy IHubClients<IClientProxy>.Client(string connectionId) => Un;
        public IClientProxy Others => Un;
        public IClientProxy All => Un;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => Un;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => Un;
        public IClientProxy Group(string groupName) => Un;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Un;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => Un;
        public IClientProxy OthersInGroup(string groupName) => Un;
        public IClientProxy User(string userId) => Un;
        public IClientProxy Users(IReadOnlyList<string> userIds) => Un;
    }
}
