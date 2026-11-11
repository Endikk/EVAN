using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EVAN.Api.Securite;
using EVAN.Application.Abstractions;
using EVAN.Application.Comptes;
using Microsoft.Extensions.DependencyInjection;

namespace EVAN.Api.Tests;

/// <summary>
/// Gestion des membres par un administrateur : retrait d'un compte et mot de passe provisoire. Autorisation vérifiée
/// par le serveur (administrateur de la même organisation), jamais sur soi-même ni sur le dernier administrateur,
/// sessions du compte visé fermées tout de suite, mot de passe généré par le serveur et montré une seule fois.
/// </summary>
public class MembresTests
{
    private const string Url = "/api/organisation/membres";
    /// <summary>Corps des actions sur un compte : le mot de passe de l'administrateur qui agit.</summary>
    private static readonly object Moi = new { motDePasse = BancApi.MotDePasse };

    private static async Task<string?> Erreur(HttpResponseMessage res) => (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("erreur").GetString();

    /// <summary>Crée un compte dans l'organisation de l'administrateur et rend son identifiant technique.</summary>
    private static async Task<string> Creer(Navigateur admin, string identifiant, string role = "membre")
    {
        var res = await admin.Post(Url, new { identifiant, nom = identifiant.Split('@')[0], motDePasse = BancApi.MotDePasse, role });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }

    private static async Task<bool> Connecte(Navigateur n) => (await n.Json("/api/session")).GetProperty("connecte").GetBoolean();

    private static async Task<string> IdDe(Navigateur admin, string identifiant) =>
        (await admin.Json(Url)).EnumerateArray().Single(m => m.GetProperty("identifiant").GetString() == identifiant).GetProperty("id").GetString()!;

    [Fact]
    public async Task Un_membre_retire_perd_sa_session_tout_de_suite_et_ne_se_reconnecte_plus()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");
        var paul = await banc.Navigateur().Connecter("paul@dupont.fr");
        Assert.True(await Connecte(paul));

        var res = await admin.Delete($"{Url}/{paulId}", Moi);

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        // Le cookie de Paul est encore dans son navigateur : le serveur ne le reconnaît plus.
        Assert.False(await Connecte(paul));
        Assert.Equal(HttpStatusCode.Unauthorized, (await paul.Put("/api/session/mot-de-passe", new { actuel = BancApi.MotDePasse, nouveau = "nouveau-mot-de-passe-solide" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await banc.Navigateur().Post("/api/session", new { identifiant = "paul@dupont.fr", motDePasse = BancApi.MotDePasse })).StatusCode);
        Assert.Null(await banc.Store.CompteAsync("paul@dupont.fr"));
        Assert.Equal(1, (await admin.Json(Url)).GetArrayLength());
    }

    [Fact]
    public async Task Un_ancien_cookie_ne_rouvre_pas_le_compte_recree_a_la_meme_adresse()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");
        var paul = await banc.Navigateur().Connecter("paul@dupont.fr");

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Delete($"{Url}/{paulId}", Moi)).StatusCode);
        await Creer(admin, "paul@dupont.fr");

        // Même adresse, autre compte : la session ouverte sur l'ancien ne vaut pas pour le nouveau.
        Assert.False(await Connecte(paul));
        // Le même navigateur se reconnecte normalement : le cookie refusé est remplacé par le nouveau.
        await paul.Connecter("paul@dupont.fr");
        Assert.True(await Connecte(paul));
    }

    [Fact]
    public async Task Un_membre_ne_retire_personne_et_ne_donne_aucun_mot_de_passe()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        await Creer(admin, "paul@dupont.fr");
        var adminId = await IdDe(admin, "admin@dupont.fr");
        var paul = await banc.Navigateur().Connecter("paul@dupont.fr");

        var retrait = await paul.Delete($"{Url}/{adminId}", Moi);
        var provisoire = await paul.Post($"{Url}/{adminId}/mot-de-passe", Moi);

        Assert.Equal(HttpStatusCode.Forbidden, retrait.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, provisoire.StatusCode);
        Assert.NotNull(await banc.Store.CompteAsync("admin@dupont.fr"));
        await banc.Navigateur().Connecter("admin@dupont.fr");
    }

    [Fact]
    public async Task Sans_session_on_ne_retire_aucun_compte()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");

        var anonyme = banc.Navigateur();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonyme.Delete($"{Url}/{paulId}", Moi)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonyme.Post($"{Url}/{paulId}/mot-de-passe", Moi)).StatusCode);
        Assert.NotNull(await banc.Store.CompteAsync("paul@dupont.fr"));
    }

    [Fact]
    public async Task Un_administrateur_n_agit_pas_sur_un_compte_d_une_autre_organisation()
    {
        await using var banc = await BancApi.Demarrer();
        var dupont = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var martin = await banc.Organisation("Cartonnerie Martin", "admin@martin.fr");
        var jeanId = await Creer(martin, "jean@martin.fr");
        var adminMartinId = await IdDe(martin, "admin@martin.fr");
        var jean = await banc.Navigateur().Connecter("jean@martin.fr");

        // Changer l'identifiant dans l'adresse ne donne rien : même réponse qu'un compte qui n'existe pas.
        var retrait = await dupont.Delete($"{Url}/{jeanId}", Moi);
        var retraitAdmin = await dupont.Delete($"{Url}/{adminMartinId}", Moi);
        var provisoire = await dupont.Post($"{Url}/{jeanId}/mot-de-passe", Moi);
        var inconnu = await dupont.Delete($"{Url}/cpt-inexistant", Moi);

        Assert.Equal(HttpStatusCode.NotFound, retrait.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, retraitAdmin.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, provisoire.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, inconnu.StatusCode);
        Assert.Equal(await Erreur(inconnu), await Erreur(retrait));
        Assert.True(await Connecte(jean));
        await banc.Navigateur().Connecter("jean@martin.fr");
        await banc.Navigateur().Connecter("admin@martin.fr");
    }

    [Fact]
    public async Task Un_administrateur_ne_se_retire_pas_lui_meme_ni_ne_se_donne_un_mot_de_passe_provisoire()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        await Creer(admin, "claire@dupont.fr", "admin");
        var moi = await IdDe(admin, "admin@dupont.fr");

        var retrait = await admin.Delete($"{Url}/{moi}", Moi);
        var provisoire = await admin.Post($"{Url}/{moi}/mot-de-passe", Moi);

        Assert.Equal(HttpStatusCode.Conflict, retrait.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, provisoire.StatusCode);
        Assert.Contains("propre compte", await Erreur(retrait));
        Assert.True(await Connecte(admin));
        await banc.Navigateur().Connecter("admin@dupont.fr");
    }

    [Fact]
    public async Task Deux_administrateurs_qui_se_retirent_l_un_l_autre_en_laissent_un()
    {
        await using var banc = await BancApi.Demarrer();
        var claire = await banc.Organisation("Imprimerie Dupont", "claire@dupont.fr");
        var marcId = await Creer(claire, "marc@dupont.fr", "admin");
        var claireId = await IdDe(claire, "claire@dupont.fr");
        var marc = await banc.Navigateur().Connecter("marc@dupont.fr");

        Assert.Equal(HttpStatusCode.NoContent, (await marc.Delete($"{Url}/{claireId}", Moi)).StatusCode);
        // Claire n'a plus de compte : sa session tombe avant d'atteindre la route.
        var riposte = await claire.Delete($"{Url}/{marcId}", Moi);

        Assert.Equal(HttpStatusCode.Unauthorized, riposte.StatusCode);
        Assert.NotNull(await banc.Store.CompteAsync("marc@dupont.fr"));
    }

    [Fact]
    public async Task Le_stockage_ne_retire_jamais_le_dernier_administrateur()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var organisation = await BancApi.OrganisationDe(admin);
        var adminId = await IdDe(admin, "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");

        // Cas que la route n'atteint pas seule (elle refuse de se viser soi-même), tenu aussi par le stockage : deux
        // retraits croisés simultanés ne laissent pas l'organisation sans administrateur.
        IComptesStore store = banc.Store;
        Assert.Equal(IssueMembre.DernierAdministrateur, await store.RetirerCompteAsync(organisation, adminId, adminId));
        Assert.Equal(IssueMembre.Refuse, await store.RetirerCompteAsync(organisation, paulId, adminId));
        // Une organisation dont l'auteur n'est pas administrateur : refusé avant toute recherche du compte visé.
        Assert.Equal(IssueMembre.Refuse, await store.RetirerCompteAsync("org-autre", adminId, paulId));
        Assert.NotNull(await banc.Store.CompteAsync("admin@dupont.fr"));
        Assert.NotNull(await banc.Store.CompteAsync("paul@dupont.fr"));
    }

    [Fact]
    public async Task Le_mot_de_passe_provisoire_vient_du_serveur_remplace_l_ancien_et_ferme_les_sessions()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");
        var paul = await banc.Navigateur().Connecter("paul@dupont.fr");

        var res = await admin.Post($"{Url}/{paulId}/mot-de-passe", Moi);
        var corps = await res.Content.ReadFromJsonAsync<JsonElement>();
        var provisoire = corps.GetProperty("motDePasse").GetString()!;

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        // Rien d'autre dans la réponse, et rien qu'un cache intermédiaire garderait.
        Assert.Single(corps.EnumerateObject());
        Assert.True(res.Headers.CacheControl?.NoStore);
        Assert.True(provisoire.Length >= ComptesService.MotDePasseMin);
        // Gardé sous forme d'empreinte seulement.
        var compte = await banc.Store.CompteAsync("paul@dupont.fr");
        Assert.DoesNotContain(provisoire, compte!.Empreinte);
        Assert.True(banc.Services.GetRequiredService<IMotsDePasse>().Verifier(compte.Empreinte, provisoire));
        // Une session ouverte avec l'ancien mot de passe tombe ; l'ancien ne marche plus, le provisoire si.
        Assert.False(await Connecte(paul));
        Assert.Equal(HttpStatusCode.Unauthorized, (await banc.Navigateur().Post("/api/session", new { identifiant = "paul@dupont.fr", motDePasse = BancApi.MotDePasse })).StatusCode);
        var nouvelle = await banc.Navigateur().Connecter("paul@dupont.fr", provisoire);
        Assert.True(await Connecte(nouvelle));
        // L'administrateur, lui, reste connecté.
        Assert.True(await Connecte(admin));
    }

    [Fact]
    public async Task Deux_mots_de_passe_provisoires_ne_se_ressemblent_pas()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");

        async Task<string> Provisoire() =>
            (await (await admin.Post($"{Url}/{paulId}/mot-de-passe", Moi)).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("motDePasse").GetString()!;
        var a = await Provisoire();
        var b = await Provisoire();

        Assert.NotEqual(a, b);
        Assert.Matches(MotDePasseProvisoire.Forme, a);
    }

    [Fact]
    public async Task Les_actions_sur_les_comptes_sont_limitees_par_administrateur()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");

        // La création compte aussi : elle calcule une empreinte, comme le mot de passe provisoire.
        for (var i = 1; i < ActionsMembres.Rafale; i++)
            Assert.Equal(HttpStatusCode.OK, (await admin.Post($"{Url}/{paulId}/mot-de-passe", Moi)).StatusCode);
        var bloque = await admin.Post($"{Url}/{paulId}/mot-de-passe", Moi);
        var retrait = await admin.Delete($"{Url}/{paulId}", Moi);

        Assert.Equal(HttpStatusCode.TooManyRequests, bloque.StatusCode);
        Assert.True(bloque.Headers.RetryAfter is not null);
        Assert.Equal(HttpStatusCode.TooManyRequests, retrait.StatusCode);
        Assert.NotNull(await banc.Store.CompteAsync("paul@dupont.fr"));
    }

    [Fact]
    public async Task Un_identifiant_hors_bornes_repond_comme_un_compte_inconnu()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");

        var res = await admin.Delete($"{Url}/{new string('x', 500)}", Moi);

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
