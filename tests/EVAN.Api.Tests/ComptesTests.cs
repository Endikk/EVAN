using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EVAN.Api.Endpoints;
using EVAN.Api.Securite;
using EVAN.Application.Abstractions;

namespace EVAN.Api.Tests;

/// <summary>
/// Comptes et session : installation protégée par un code, connexion par cookie, rôles, limitation des essais, réponses
/// qui ne disent pas si un compte existe, en-tête exigé sur les écritures.
/// </summary>
public class ComptesTests
{
    private static async Task<string?> Erreur(HttpResponseMessage res) => (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("erreur").GetString();

    private static async Task<string[]> Champs(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("champs").EnumerateArray().Select(c => c.GetProperty("champ").GetString()!).ToArray();

    [Fact]
    public async Task Sans_code_configure_la_route_d_installation_n_existe_pas()
    {
        await using var banc = await BancApi.Demarrer(new() { ["Evan:CodeInstallation"] = "" });
        var res = await banc.Navigateur().Post("/api/installation", new { code = "", organisation = "Imprimerie", identifiant = "a@b.fr", nom = "A", motDePasse = BancApi.MotDePasse });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task L_installation_cree_l_organisation_et_son_administrateur_connecte()
    {
        await using var banc = await BancApi.Demarrer();
        var n = banc.Navigateur();

        var res = await n.Post("/api/installation", new { code = BancApi.CodeInstallation, organisation = "Imprimerie Dupont", identifiant = " Admin@Dupont.fr ", nom = "Claire Martin", motDePasse = BancApi.MotDePasse });
        var cookie = n.DerniersSetCookie.Single(c => c.StartsWith(SessionExtensions.Cookie + "=", StringComparison.Ordinal)).ToLowerInvariant();
        var session = await n.Json("/api/session");

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.True(session.GetProperty("connecte").GetBoolean());
        Assert.Equal("admin@dupont.fr", session.GetProperty("utilisateur").GetProperty("identifiant").GetString());
        Assert.Equal("admin", session.GetProperty("utilisateur").GetProperty("role").GetString());
        Assert.Equal("Imprimerie Dupont", session.GetProperty("organisation").GetProperty("nom").GetString());
        // Le mot de passe n'est gardé que sous forme d'empreinte, et l'empreinte ne sort jamais.
        var compte = await banc.Store.CompteAsync("admin@dupont.fr");
        Assert.NotNull(compte);
        Assert.DoesNotContain(BancApi.MotDePasse, compte.Empreinte);
        Assert.DoesNotContain("empreinte", await res.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task EVAN_ne_s_installe_qu_une_fois_pour_son_entreprise()
    {
        await using var banc = await BancApi.Demarrer();
        await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");

        // Le code est encore configuré, mais l'entreprise a déjà son organisation : pas de seconde.
        var res = await banc.Navigateur().Post("/api/installation", new { code = BancApi.CodeInstallation, organisation = "Autre", identifiant = "autre@exemple.fr", nom = "Autre", motDePasse = BancApi.MotDePasse });

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Contains("déjà installé", await res.Content.ReadAsStringAsync());
        Assert.Null(await banc.Store.CompteAsync("autre@exemple.fr"));
    }

    [Fact]
    public async Task Un_code_d_installation_faux_est_refuse_puis_bloque_meme_le_bon()
    {
        await using var banc = await BancApi.Demarrer();
        var n = banc.Navigateur();
        object Demande(string code) => new { code, organisation = "Imprimerie", identifiant = "a@b.fr", nom = "A", motDePasse = BancApi.MotDePasse };

        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Forbidden, (await n.Post("/api/installation", Demande("faux"))).StatusCode);
        var bloque = await n.Post("/api/installation", Demande(BancApi.CodeInstallation));

        Assert.Equal(HttpStatusCode.TooManyRequests, bloque.StatusCode);
        Assert.True(bloque.Headers.RetryAfter is not null);
        Assert.Null(await banc.Store.CompteAsync("a@b.fr"));
    }

    [Fact]
    public async Task Un_mot_de_passe_trop_court_est_refuse_en_nommant_le_champ()
    {
        await using var banc = await BancApi.Demarrer();
        var res = await banc.Navigateur().Post("/api/installation", new { code = BancApi.CodeInstallation, organisation = "", identifiant = "pas-une-adresse", nom = "A", motDePasse = "court" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(["organisation", "identifiant", "motDePasse"], await Champs(res));
    }

    [Fact]
    public async Task La_connexion_ne_dit_pas_si_le_compte_existe()
    {
        await using var banc = await BancApi.Demarrer();
        await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");

        var inconnu = await banc.Navigateur().Post("/api/session", new { identifiant = "personne@dupont.fr", motDePasse = BancApi.MotDePasse });
        var mauvais = await banc.Navigateur().Post("/api/session", new { identifiant = "admin@dupont.fr", motDePasse = "mauvais-mot-de-passe" });

        Assert.Equal(HttpStatusCode.Unauthorized, inconnu.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, mauvais.StatusCode);
        Assert.Equal(SessionEndpoints.Refus, await Erreur(inconnu));
        Assert.Equal(SessionEndpoints.Refus, await Erreur(mauvais));
    }

    [Fact]
    public async Task Les_essais_sont_limites_par_compte_bon_mot_de_passe_compris()
    {
        await using var banc = await BancApi.Demarrer();
        await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var n = banc.Navigateur();

        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await n.Post("/api/session", new { identifiant = "admin@dupont.fr", motDePasse = $"essai-{i}-mauvais" })).StatusCode);
        var bloque = await n.Post("/api/session", new { identifiant = "ADMIN@dupont.fr", motDePasse = BancApi.MotDePasse });

        Assert.Equal(HttpStatusCode.TooManyRequests, bloque.StatusCode);
        Assert.True(bloque.Headers.RetryAfter is not null);
    }

    [Fact]
    public async Task Les_essais_sont_limites_par_adresse_sur_des_comptes_differents()
    {
        await using var banc = await BancApi.Demarrer();
        var n = banc.Navigateur();

        for (var i = 0; i < 10; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await n.Post("/api/session", new { identifiant = $"compte{i}@dupont.fr", motDePasse = "mauvais-mot-de-passe" })).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await n.Post("/api/session", new { identifiant = "autre@dupont.fr", motDePasse = "mauvais-mot-de-passe" })).StatusCode);
    }

    [Fact]
    public async Task Une_ecriture_sans_en_tete_X_Evan_est_refusee()
    {
        await using var banc = await BancApi.Demarrer();
        var n = banc.Navigateur();

        var sansEntete = await n.Post("/api/session", new { identifiant = "a@b.fr", motDePasse = "x" }, entete: false);
        var acquittement = await n.Post("/api/alarms/al-x/ack", entete: false);

        Assert.Equal(HttpStatusCode.Forbidden, sansEntete.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, acquittement.StatusCode);
        Assert.Contains(ProtectionEcritures.Entete, await Erreur(sansEntete));
    }

    [Fact]
    public async Task Une_route_reservee_repond_401_en_JSON_sans_redirection()
    {
        await using var banc = await BancApi.Demarrer();
        var res = await banc.Navigateur().Get("/api/organisation/membres");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Null(res.Headers.Location);
        Assert.Equal("Connexion requise.", await Erreur(res));
    }

    [Fact]
    public async Task Un_administrateur_cree_un_membre_qui_ne_peut_pas_en_creer_a_son_tour()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");

        var cree = await admin.Post("/api/organisation/membres", new { identifiant = "paul@dupont.fr", nom = "Paul Durand", motDePasse = BancApi.MotDePasse });
        var double_ = await admin.Post("/api/organisation/membres", new { identifiant = "PAUL@dupont.fr", nom = "Paul", motDePasse = BancApi.MotDePasse });
        var membres = await admin.Json("/api/organisation/membres");
        var paul = await banc.Navigateur().Connecter("paul@dupont.fr");
        var refuse = await paul.Post("/api/organisation/membres", new { identifiant = "x@dupont.fr", nom = "X", motDePasse = BancApi.MotDePasse });

        Assert.Equal(HttpStatusCode.Created, cree.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, double_.StatusCode);
        Assert.Equal(2, membres.GetArrayLength());
        Assert.DoesNotContain("empreinte", membres.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal("membre", (await paul.Json("/api/session")).GetProperty("utilisateur").GetProperty("role").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, refuse.StatusCode);
    }

    [Fact]
    public async Task La_deconnexion_ferme_la_session()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Delete("/api/session")).StatusCode);

        Assert.False((await admin.Json("/api/session")).GetProperty("connecte").GetBoolean());
        Assert.Equal(HttpStatusCode.Unauthorized, (await admin.Get("/api/organisation/membres")).StatusCode);
    }

    [Fact]
    public async Task Le_titulaire_change_son_mot_de_passe_en_donnant_l_actuel()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        const string nouveau = "nouveau-mot-de-passe-solide";

        var faux = await admin.Put("/api/session/mot-de-passe", new { actuel = "pas-le-bon-mot-de-passe", nouveau });
        var court = await admin.Put("/api/session/mot-de-passe", new { actuel = BancApi.MotDePasse, nouveau = "court" });
        var change = await admin.Put("/api/session/mot-de-passe", new { actuel = BancApi.MotDePasse, nouveau });

        Assert.Equal(["actuel"], await Champs(faux));
        Assert.Equal(["nouveau"], await Champs(court));
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await banc.Navigateur().Post("/api/session", new { identifiant = "admin@dupont.fr", motDePasse = BancApi.MotDePasse })).StatusCode);
        await banc.Navigateur().Connecter("admin@dupont.fr", nouveau);
    }

    [Fact]
    public async Task Sans_session_on_ne_change_aucun_mot_de_passe()
    {
        await using var banc = await BancApi.Demarrer();

        var res = await banc.Navigateur().Put("/api/session/mot-de-passe", new { actuel = "x", nouveau = "nouveau-mot-de-passe-solide" });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public void Le_code_d_installation_se_compare_sans_tenir_compte_des_espaces_autour()
    {
        Assert.True(SessionEndpoints.CodeValide("  code ", "code"));
        Assert.False(SessionEndpoints.CodeValide("cod", "code"));
        Assert.False(SessionEndpoints.CodeValide(null, "code"));
    }

    [Fact]
    public void Une_empreinte_salee_differe_a_chaque_calcul_et_reste_verifiable()
    {
        IMotsDePasse mdp = new MotsDePasse();
        var a = mdp.Hacher(BancApi.MotDePasse);
        var b = mdp.Hacher(BancApi.MotDePasse);

        Assert.NotEqual(a, b);
        Assert.True(mdp.Verifier(a, BancApi.MotDePasse));
        Assert.False(mdp.Verifier(a, "autre-mot-de-passe"));
        Assert.False(mdp.Verifier("illisible", BancApi.MotDePasse));
    }
}
