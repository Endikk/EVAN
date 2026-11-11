using System.Net;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using EVAN.Api.Realtime;
using EVAN.Api.Securite;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;

namespace EVAN.Api.Tests;

/// <summary>
/// Le temps réel d'un compte retiré ou dont le mot de passe a été réinitialisé se coupe tout de suite : un WebSocket
/// déjà ouvert ne repasse pas par le cookie, il faut donc le fermer côté serveur.
/// </summary>
public class SessionsTempsReelTests
{
    private static readonly object Moi = new { motDePasse = BancApi.MotDePasse };

    private sealed class Connexion(string id, string? compte) : HubCallerContext
    {
        public bool Coupee { get; private set; }
        public override string ConnectionId => id;
        public override string? UserIdentifier => compte;
        public override ClaimsPrincipal? User { get; } = compte is null
            ? new ClaimsPrincipal(new ClaimsIdentity())
            : new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, compte)], "test"));
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort() => Coupee = true;
    }

    [Fact]
    public void Fermer_coupe_les_connexions_de_ce_compte_seulement()
    {
        var registre = new SessionsTempsReel();
        var paul1 = new Connexion("cx-1", "cpt-paul");
        var paul2 = new Connexion("cx-2", "cpt-paul");
        var claire = new Connexion("cx-3", "cpt-claire");
        var anonyme = new Connexion("cx-4", null);
        foreach (var c in new[] { paul1, paul2, claire, anonyme }) registre.Suivre(c);

        var fermees = registre.Fermer("cpt-paul");

        Assert.Equal(2, fermees);
        Assert.True(paul1.Coupee);
        Assert.True(paul2.Coupee);
        Assert.False(claire.Coupee);
        Assert.False(anonyme.Coupee);
        Assert.Equal(0, registre.Fermer("cpt-paul"));
    }

    [Fact]
    public void Une_connexion_terminee_n_est_plus_suivie()
    {
        var registre = new SessionsTempsReel();
        var paul = new Connexion("cx-1", "cpt-paul");
        registre.Suivre(paul);

        registre.Oublier(paul);

        Assert.Equal(0, registre.Fermer("cpt-paul"));
        Assert.False(paul.Coupee);
    }

    private static Task Envoyer(WebSocket ws, string texte) =>
        ws.SendAsync(Encoding.UTF8.GetBytes(texte), WebSocketMessageType.Text, true, CancellationToken.None);

    /// <summary>Vrai si le serveur ferme la connexion (trame de fermeture, message « close » ou coupure) avant le délai.</summary>
    private static async Task<bool> FermeeAvant(WebSocket ws, TimeSpan delai)
    {
        using var limite = new CancellationTokenSource(delai);
        var tampon = new byte[4096];
        try
        {
            while (true)
            {
                var r = await ws.ReceiveAsync(tampon, limite.Token);
                if (r.MessageType == WebSocketMessageType.Close) return true;
                // Message de fermeture du protocole SignalR (type 7) envoyé avant de couper.
                if (Encoding.UTF8.GetString(tampon, 0, r.Count).Contains("\"type\":7", StringComparison.Ordinal)) return true;
            }
        }
        catch (OperationCanceledException) when (limite.IsCancellationRequested)
        {
            return false;
        }
        catch (Exception ex) when (ex is WebSocketException or IOException or OperationCanceledException)
        {
            return true;
        }
    }

    [Fact]
    public async Task Le_hub_d_un_membre_retire_se_ferme_tout_de_suite()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var creation = await admin.Post("/api/organisation/membres", new { identifiant = "paul@dupont.fr", nom = "Paul", motDePasse = BancApi.MotDePasse });
        var paulId = (await creation.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
        var paul = await banc.Navigateur().Connecter("paul@dupont.fr");
        var client = banc.Serveur.CreateWebSocketClient();
        client.ConfigureRequest = r => r.Headers.Cookie = paul.EnteteCookie;
        using var ws = await client.ConnectAsync(new Uri(banc.Serveur.BaseAddress, SupervisionHub.Route), CancellationToken.None);
        await Envoyer(ws, "{\"protocol\":\"json\",\"version\":1}\u001e");
        var tampon = new byte[1024];
        var poignee = await ws.ReceiveAsync(tampon, CancellationToken.None);
        Assert.Equal("{}\u001e", Encoding.UTF8.GetString(tampon, 0, poignee.Count));
        Assert.False(await FermeeAvant(ws, TimeSpan.FromMilliseconds(300)));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Delete($"/api/organisation/membres/{paulId}", Moi)).StatusCode);

        Assert.True(await FermeeAvant(ws, TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task Pas_de_temps_reel_avant_d_avoir_change_le_mot_de_passe_provisoire()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var creation = await admin.Post("/api/organisation/membres", new { identifiant = "paul@dupont.fr", nom = "Paul", motDePasse = BancApi.MotDePasse });
        var paulId = (await creation.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
        var reponse = await admin.Post($"/api/organisation/membres/{paulId}/mot-de-passe", Moi);
        var provisoire = (await reponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("motDePasse").GetString()!;
        var paul = await banc.Navigateur().Connecter("paul@dupont.fr", provisoire);
        var client = banc.Serveur.CreateWebSocketClient();
        client.ConfigureRequest = r => r.Headers.Cookie = paul.EnteteCookie;

        using var ws = await client.ConnectAsync(new Uri(banc.Serveur.BaseAddress, SupervisionHub.Route), CancellationToken.None);
        await Envoyer(ws, "{\"protocol\":\"json\",\"version\":1}\u001e");

        Assert.True(await FermeeAvant(ws, TimeSpan.FromSeconds(5)));
    }
}
