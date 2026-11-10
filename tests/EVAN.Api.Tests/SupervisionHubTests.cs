using System.Security.Claims;
using EVAN.Api.Endpoints;
using EVAN.Api.Realtime;
using EVAN.Api.Securite;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;

namespace EVAN.Api.Tests;

/// <summary>Hub de supervision : on ne rejoint que le groupe d'une usine existante, et l'on y reçoit son instantané.</summary>
public class SupervisionHubTests
{
    private sealed class Groupes : IGroupManager
    {
        public readonly List<string> Rejoints = new();

        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        {
            Rejoints.Add(groupName);
            return Task.CompletedTask;
        }

        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class Contexte : HubCallerContext
    {
        public override string ConnectionId => "cx-test";
        public override string? UserIdentifier => null;
        public override ClaimsPrincipal? User => null;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort() { }
    }

    /// <summary>L'appelant seul compte ici : il reçoit l'instantané. Le reste n'est jamais sollicité par Join.</summary>
    private sealed class ClientsSimules : IHubCallerClients
    {
        public readonly Appelant Moi = new();
        public IClientProxy Caller => Moi;
        ISingleClientProxy IHubCallerClients.Caller => Moi;
        public IClientProxy Others => throw new NotSupportedException();
        public IClientProxy All => throw new NotSupportedException();
        public IClientProxy OthersInGroup(string groupName) => throw new NotSupportedException();
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => throw new NotSupportedException();
        public IClientProxy Client(string connectionId) => throw new NotSupportedException();
        ISingleClientProxy IHubCallerClients.Client(string connectionId) => throw new NotSupportedException();
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => throw new NotSupportedException();
        public IClientProxy Group(string groupName) => throw new NotSupportedException();
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => throw new NotSupportedException();
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => throw new NotSupportedException();
        public IClientProxy User(string userId) => throw new NotSupportedException();
        public IClientProxy Users(IReadOnlyList<string> userIds) => throw new NotSupportedException();
    }

    private sealed class Appelant : ISingleClientProxy
    {
        public readonly List<string> Recus = new();

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            Recus.Add(method);
            return Task.CompletedTask;
        }

        public Task<T> InvokeCoreAsync<T>(string method, object?[] args, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private static (SupervisionHub Hub, Groupes Groupes, ClientsSimules Clients) Hub()
    {
        var groupes = new Groupes();
        var clients = new ClientsSimules();
        var live = BancUsines.LiveSeul();
        // Démo ouverte (réglage par défaut) : les usines du banc sont celles de la démo, visibles sans compte.
        var acces = new AccesUsines(live, new ConfigurationBuilder().Build());
        var hub = new SupervisionHub(live, acces) { Context = new Contexte(), Groups = groupes, Clients = clients };
        return (hub, groupes, clients);
    }

    [Theory]
    [InlineData(BancUsines.Tours)]
    [InlineData(BancUsines.Crissey)]
    public async Task Une_usine_existante_se_rejoint_avec_son_instantane(string siteId)
    {
        var (hub, groupes, clients) = Hub();

        await hub.Join(siteId);

        Assert.Equal([siteId], groupes.Rejoints);
        Assert.Equal(["snapshot"], clients.Moi.Recus);
    }

    [Theory]
    [InlineData("site-ailleurs")]
    [InlineData("")]
    [InlineData("SITE-TOURS")]
    public async Task Une_usine_inconnue_ne_se_rejoint_pas(string siteId)
    {
        var (hub, groupes, clients) = Hub();

        await Assert.ThrowsAsync<HubException>(() => hub.Join(siteId));

        Assert.Empty(groupes.Rejoints);
        Assert.Empty(clients.Moi.Recus);
    }

    [Fact]
    public async Task Un_identifiant_hors_bornes_est_refuse_sans_etre_cherche()
    {
        var (hub, groupes, _) = Hub();

        await Assert.ThrowsAsync<HubException>(() => hub.Join(new string('s', Bornes.Identifiant + 1)));
        await Assert.ThrowsAsync<HubException>(() => hub.Join(null!));

        Assert.Empty(groupes.Rejoints);
    }
}
