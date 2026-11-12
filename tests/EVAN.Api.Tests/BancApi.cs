using System.Net.Http.Json;
using System.Text.Json;
using EVAN.Application;
using EVAN.Application.Abstractions;
using EVAN.Application.Comptes;
using EVAN.Application.Live;
using EVAN.Application.Usines;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;
using EVAN.Core.Domain.Sites;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace EVAN.Api.Tests;

/// <summary>
/// L'API complète sur un serveur de test : la même chaîne de requêtes que Program (UseEvanApi), stockage en mémoire,
/// broker et historique simulés. Un code d'installation est configuré pour créer des organisations.
/// </summary>
internal sealed class BancApi : IAsyncDisposable
{
    public const string CodeInstallation = "code-installation-de-test";
    public const string MotDePasse = "mot-de-passe-solide-42";

    private sealed class Bus : IMessageBus
    {
        public bool IsConnected => true;
        public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default) => Task.FromResult(true);
        public Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default) where TReply : class =>
            Task.FromResult<TReply?>(null);
    }

    private readonly WebApplication _app;
    public MemoryStore Store { get; }
    public LiveService Live => _app.Services.GetRequiredService<LiveService>();
    public ReferenceData Data => _app.Services.GetRequiredService<ReferenceData>();
    public IServiceProvider Services => _app.Services;
    /// <summary>Serveur de test, pour ouvrir un WebSocket vers le hub avec le cookie d'un navigateur.</summary>
    public TestServer Serveur => _app.GetTestServer();

    private BancApi(WebApplication app, MemoryStore store)
    {
        _app = app;
        Store = store;
    }

    /// <param name="remplacer">Services enregistrés après ceux de l'API, qui remplacent les siens.</param>
    public static async Task<BancApi> Demarrer(Dictionary<string, string?>? reglages = null, TimeProvider? horloge = null,
        Action<IServiceCollection>? remplacer = null)
    {
        var builder = WebApplication.CreateBuilder();
        // Horloge réglable (durée des sessions, expiration du mot de passe provisoire) : enregistrée avant les modules,
        // qui n'ajoutent la leur que si aucune n'est déjà là.
        if (horloge is not null) builder.Services.AddSingleton(horloge);
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Evan:CodeInstallation"] = CodeInstallation });
        builder.Configuration.AddInMemoryCollection(reglages ?? []);
        var store = new MemoryStore();
        builder.Services
            .AddSingleton(JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data")))
            .AddSingleton<IStore>(store)
            .AddSingleton<IComptesStore>(store)
            .AddSingleton<IMessageBus, Bus>()
            .AddSingleton<IHistoryReader, SimulatedHistoryReader>()
            .AddEvanApplication()
            .AddEvanApi(builder.Configuration);
        remplacer?.Invoke(builder.Services);
        var app = builder.Build();
        app.UseEvanApi();
        await app.StartAsync();
        return new BancApi(app, store);
    }

    public Navigateur Navigateur() => new(_app.GetTestClient());

    private bool _installe;

    /// <summary>
    /// Une organisation et son administrateur connecté. La première passe par la route d'installation ; celle-ci ne sert
    /// qu'une fois, les suivantes (tests d'accès croisé) entrent donc directement dans le stockage.
    /// </summary>
    public async Task<Navigateur> Organisation(string nom, string admin)
    {
        var n = Navigateur();
        if (!_installe)
        {
            var res = await n.Post("/api/installation", new { code = CodeInstallation, organisation = nom, identifiant = admin, nom = $"Admin {nom}", motDePasse = MotDePasse });
            Assert.Equal(System.Net.HttpStatusCode.Created, res.StatusCode);
            _installe = true;
            return n;
        }
        var organisation = new Organisation($"org-{Guid.NewGuid():N}", nom);
        var empreinte = Services.GetRequiredService<IMotsDePasse>().Hacher(MotDePasse);
        var compte = new Compte($"cpt-{Guid.NewGuid():N}", organisation.Id, admin.Trim().ToLowerInvariant(), $"Admin {nom}", Roles.Admin, empreinte, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        Assert.True(await Store.CreerOrganisationAsync(organisation, compte));
        return await n.Connecter(admin);
    }

    /// <summary>Organisation de l'utilisateur connecté (lue dans sa session).</summary>
    public static async Task<string> OrganisationDe(Navigateur n)
    {
        var session = await n.Json("/api/session");
        return session.GetProperty("organisation").GetProperty("id").GetString()!;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();
}

/// <summary>Client HTTP qui garde ses cookies (le client du serveur de test ne le fait pas) et pose X-Evan sur les écritures.</summary>
internal sealed class Navigateur(HttpClient http)
{
    private readonly Dictionary<string, string> _cookies = new();
    public IReadOnlyList<string> DerniersSetCookie { get; private set; } = [];
    /// <summary>En-tête Cookie que ce navigateur joindrait à sa prochaine requête.</summary>
    public string EnteteCookie => string.Join("; ", _cookies.Select(kv => $"{kv.Key}={kv.Value}"));

    public async Task<HttpResponseMessage> Envoyer(HttpMethod methode, string url, object? corps = null, bool entete = true)
    {
        using var req = new HttpRequestMessage(methode, url);
        if (corps is not null) req.Content = JsonContent.Create(corps, corps.GetType());
        if (entete && methode != HttpMethod.Get) req.Headers.Add("X-Evan", "1");
        if (_cookies.Count > 0) req.Headers.Add("Cookie", string.Join("; ", _cookies.Select(kv => $"{kv.Key}={kv.Value}")));
        var res = await http.SendAsync(req);
        DerniersSetCookie = res.Headers.TryGetValues("Set-Cookie", out var valeurs) ? valeurs.ToList() : [];
        foreach (var cookie in DerniersSetCookie)
        {
            var paire = cookie.Split(';')[0];
            var egal = paire.IndexOf('=');
            var (nom, valeur) = (paire[..egal], paire[(egal + 1)..]);
            if (valeur.Length == 0 || cookie.Contains("expires=Thu, 01 Jan 1970", StringComparison.OrdinalIgnoreCase)) _cookies.Remove(nom);
            else _cookies[nom] = valeur;
        }
        return res;
    }

    public Task<HttpResponseMessage> Get(string url) => Envoyer(HttpMethod.Get, url);
    public Task<HttpResponseMessage> Post(string url, object? corps = null, bool entete = true) => Envoyer(HttpMethod.Post, url, corps ?? new { }, entete);
    public Task<HttpResponseMessage> Put(string url, object corps) => Envoyer(HttpMethod.Put, url, corps);
    public Task<HttpResponseMessage> Delete(string url) => Envoyer(HttpMethod.Delete, url);
    public Task<HttpResponseMessage> Delete(string url, object corps) => Envoyer(HttpMethod.Delete, url, corps);

    /// <summary>Autre navigateur qui part avec les cookies actuels de celui-ci : un cookie volé, ou gardé d'avant.</summary>
    public Navigateur Copie()
    {
        var copie = new Navigateur(http);
        foreach (var (nom, valeur) in _cookies) copie._cookies[nom] = valeur;
        return copie;
    }

    public async Task<JsonElement> Json(string url)
    {
        var res = await Get(url);
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    public async Task<Navigateur> Connecter(string identifiant, string motDePasse = BancApi.MotDePasse)
    {
        var res = await Post("/api/session", new { identifiant, motDePasse });
        Assert.Equal(System.Net.HttpStatusCode.OK, res.StatusCode);
        return this;
    }
}

/// <summary>Horloge que le test avance à la main (durée des sessions, expiration du mot de passe provisoire).</summary>
internal sealed class HorlogeReglable(DateTimeOffset depart) : TimeProvider
{
    private DateTimeOffset _maintenant = depart;

    public HorlogeReglable() : this(DateTimeOffset.UtcNow) { }

    public override DateTimeOffset GetUtcNow() => _maintenant;

    public void Avancer(TimeSpan duree) => _maintenant += duree;
}

/// <summary>Configuration d'usine valide, comme l'assistant du front l'envoie : machines du kit, organes et points du catalogue.</summary>
internal static class UsineExemple
{
    public static ConfigurationUsine Creer(ReferenceData data, string siteId, string prefixe, int machines = 2)
    {
        var bat = new Batiment($"bat-{prefixe}-1", siteId, "Bâtiment A", [[2.0, 48.0], [2.001, 48.0], [2.001, 48.001], [2.0, 48.001]], [1, 1, 1, 1], 8, 1, "manuel");
        var zone = new Zone($"zone-{prefixe}-1", bat.Id, "Atelier", "atelier", [[0, 0], [40, 0], [40, 20], [0, 20]]);
        string[] types = ["flexo", "offset"];
        var liste = Enumerable.Range(1, machines)
            .Select(i => new Machine($"m-{prefixe}-{i}", bat.Id, zone.Id, types[(i - 1) % 2], $"Presse {i}", $"R{i:00}", [5.0 * i, 5.0], 0, new ModeleRef($"/kit/modeles/{types[(i - 1) % 2]}.glb"), 1_790_000_000_000))
            .ToList();
        var models = liste.Select(data.Model).ToList();
        var organes = models.SelectMany(m => m.Organes).Select(o => new OrganeConfig(o.Id, o.MachineId, o.Numero, o.Nom, $"diag_{o.Numero}", o.Position,
            ["Capteur"], ["Panne"], o.Methode, o.AlarmeCode is { } code ? new AlarmeOrgane(code, o.AlarmeMessage ?? "") : null)).ToList();
        var points = models.SelectMany(m => m.Points).ToList();
        var premier = points.First(p => p.MachineId == liste[0].Id);
        var connexion = new Connexion($"cx-{prefixe}-1", liste[0].Id, "opcua", new() { ["endpoint"] = "opc.tcp://10.20.1.21:4840", ["securite"] = "SignAndEncrypt" },
            "connectee", new() { [$"ns=2;s={liste[0].Numero}.Tension"] = premier.Id });
        var site = new Site(siteId, "org-annoncee-par-le-client", $"Usine {prefixe}", "1 rue de l'Usine, 27000 Évreux", [2.0, 48.0], new Repere([2.0, 48.0], 0));
        return new ConfigurationUsine(site, [bat], [zone], liste, organes, points, [connexion], Configure: true);
    }

    /// <summary>Alarme critique levée par l'automate sur la première machine de l'usine : elle existe en mémoire du temps réel.</summary>
    public static string Alarme(LiveService live, string siteId, string machineId)
    {
        live.HandlePlcAlarm(new Core.Contracts.PlcAlarmMessage { SiteId = siteId, MachineId = machineId, Code = "AU-1", Message = "Arrêt d'urgence", Active = true, Ts = DateTimeOffset.UtcNow, Organe = 1 });
        return live.ActiveAlarms(siteId).Single(a => a.MachineId == machineId).Id;
    }
}
