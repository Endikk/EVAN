using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EVAN.Api.Securite;
using EVAN.Application.Abstractions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace EVAN.Api.Tests;

/// <summary>
/// Révocation des sessions et garde-fous des comptes : changement de son mot de passe, déconnexion, durée absolue,
/// mot de passe de l'administrateur exigé pour agir sur un compte, changement forcé après un mot de passe provisoire,
/// cache de la validation, coût des empreintes, journal des actions sur les comptes.
/// </summary>
public class SecuriteSessionTests
{
    private const string Membres = "/api/organisation/membres";
    private const string Nouveau = "nouveau-mot-de-passe-solide";
    private static readonly object Moi = new { motDePasse = BancApi.MotDePasse };

    private static async Task<JsonElement> Corps(HttpResponseMessage res) => await res.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task<bool> Connecte(Navigateur n) => (await n.Json("/api/session")).GetProperty("connecte").GetBoolean();

    private static async Task<string> Creer(Navigateur admin, string identifiant)
    {
        var res = await admin.Post(Membres, new { identifiant, nom = identifiant.Split('@')[0], motDePasse = BancApi.MotDePasse });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await Corps(res)).GetProperty("id").GetString()!;
    }

    private static async Task<string> Provisoire(Navigateur admin, string compteId)
    {
        var res = await admin.Post($"{Membres}/{compteId}/mot-de-passe", Moi);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await Corps(res)).GetProperty("motDePasse").GetString()!;
    }

    // ---------- H1 : changement de mot de passe, déconnexion, durée absolue ----------

    [Fact]
    public async Task Changer_son_mot_de_passe_ferme_les_autres_sessions_et_garde_la_courante()
    {
        await using var banc = await BancApi.Demarrer();
        var poste = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var atelier = await banc.Navigateur().Connecter("admin@dupont.fr");
        var vole = poste.Copie();

        var res = await poste.Put("/api/session/mot-de-passe", new { actuel = BancApi.MotDePasse, nouveau = Nouveau });

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        // La session qui a changé le mot de passe reçoit un cookie neuf et reste ouverte.
        Assert.True(await Connecte(poste));
        // Les autres, et l'ancien cookie de ce même poste, tombent.
        Assert.False(await Connecte(atelier));
        Assert.False(await Connecte(vole));
    }

    [Fact]
    public async Task La_deconnexion_revoque_le_cookie_cote_serveur()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var vole = admin.Copie();

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Delete("/api/session")).StatusCode);

        // Le navigateur a effacé son cookie ; une copie gardée ailleurs ne vaut plus rien non plus.
        Assert.False(await Connecte(vole));
        Assert.Equal(HttpStatusCode.Unauthorized, (await vole.Get(Membres)).StatusCode);
        await banc.Navigateur().Connecter("admin@dupont.fr");
    }

    [Fact]
    public async Task Une_session_dure_24_h_au_plus_meme_utilisee_sans_arret()
    {
        var horloge = new HorlogeReglable();
        await using var banc = await BancApi.Demarrer(horloge: horloge);
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");

        // Une requête toutes les 5 h : le glissement de 8 h la prolongerait sans fin.
        for (var i = 0; i < 4; i++)
        {
            horloge.Avancer(TimeSpan.FromHours(5));
            Assert.True(await Connecte(admin), $"à {5 * (i + 1)} h");
        }
        horloge.Avancer(TimeSpan.FromHours(5));

        Assert.False(await Connecte(admin));
    }

    [Fact]
    public void La_duree_absolue_se_compte_depuis_l_ouverture_de_la_session()
    {
        var ouverte = DateTimeOffset.UtcNow;

        Assert.False(ValidationSession.TropAncienne(ouverte.ToUnixTimeMilliseconds().ToString(), ouverte.AddHours(23.9)));
        Assert.True(ValidationSession.TropAncienne(ouverte.ToUnixTimeMilliseconds().ToString(), ouverte.AddHours(24.1)));
        // Cookie d'avant la règle, ou valeur illisible : refusé, une connexion suffit à repartir.
        Assert.True(ValidationSession.TropAncienne(null, ouverte));
        Assert.True(ValidationSession.TropAncienne("pas-une-date", ouverte));
    }

    // ---------- M1 : mot de passe de l'administrateur pour agir sur un compte ----------

    [Fact]
    public async Task Retirer_ou_reinitialiser_exige_le_mot_de_passe_de_l_administrateur()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");

        var sans = await admin.Delete($"{Membres}/{paulId}", new { });
        var faux = await admin.Post($"{Membres}/{paulId}/mot-de-passe", new { motDePasse = "pas-le-bon-mot-de-passe" });

        Assert.Equal(HttpStatusCode.BadRequest, sans.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, faux.StatusCode);
        Assert.Equal("motDePasse", (await Corps(faux)).GetProperty("champs")[0].GetProperty("champ").GetString());
        Assert.NotNull(await banc.Store.CompteAsync("paul@dupont.fr"));
        await banc.Navigateur().Connecter("paul@dupont.fr");
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Delete($"{Membres}/{paulId}", Moi)).StatusCode);
    }

    [Fact]
    public async Task Les_mots_de_passe_d_administrateur_refuses_comptent_comme_des_essais_de_connexion()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");

        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Delete($"{Membres}/{paulId}", new { motDePasse = $"essai-{i}-mauvais" })).StatusCode);
        var bloque = await admin.Delete($"{Membres}/{paulId}", Moi);
        var connexion = await banc.Navigateur().Post("/api/session", new { identifiant = "admin@dupont.fr", motDePasse = BancApi.MotDePasse });

        // Une session volée ne sert pas à deviner le mot de passe : bon mot de passe compris, tout attend.
        Assert.Equal(HttpStatusCode.TooManyRequests, bloque.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, connexion.StatusCode);
        Assert.NotNull(await banc.Store.CompteAsync("paul@dupont.fr"));
    }

    // ---------- M2 : changement forcé après un mot de passe provisoire ----------

    [Fact]
    public async Task Avec_un_mot_de_passe_provisoire_seul_le_changement_est_permis()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");
        var provisoire = await Provisoire(admin, paulId);
        var paul = banc.Navigateur();

        var connexion = await paul.Post("/api/session", new { identifiant = "paul@dupont.fr", motDePasse = provisoire });
        var session = await paul.Json("/api/session");
        var bloque = await paul.Get("/api/organisation");

        Assert.Equal(HttpStatusCode.OK, connexion.StatusCode);
        Assert.True((await Corps(connexion)).GetProperty("utilisateur").GetProperty("doitChanger").GetBoolean());
        Assert.True(session.GetProperty("utilisateur").GetProperty("doitChanger").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, bloque.StatusCode);
        Assert.Equal(Garde.CodeMotDePasseAChanger, (await Corps(bloque)).GetProperty("code").GetString());
        // La santé de l'API reste lisible : le front s'en sert pour savoir qu'un serveur répond.
        Assert.Equal(HttpStatusCode.OK, (await paul.Get("/api/health")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await paul.Put("/api/session/mot-de-passe", new { actuel = provisoire, nouveau = Nouveau })).StatusCode);

        Assert.False((await paul.Json("/api/session")).GetProperty("utilisateur").GetProperty("doitChanger").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await paul.Get("/api/organisation")).StatusCode);
    }

    [Fact]
    public async Task Un_mot_de_passe_provisoire_expire_apres_72_h()
    {
        var horloge = new HorlogeReglable();
        await using var banc = await BancApi.Demarrer(horloge: horloge);
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");
        var provisoire = await Provisoire(admin, paulId);

        horloge.Avancer(TimeSpan.FromHours(73));
        var res = await banc.Navigateur().Post("/api/session", new { identifiant = "paul@dupont.fr", motDePasse = provisoire });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(Garde.CodeProvisoireExpire, (await Corps(res)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Un_provisoire_encore_valable_ouvre_la_session_avant_72_h()
    {
        var horloge = new HorlogeReglable();
        await using var banc = await BancApi.Demarrer(horloge: horloge);
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");
        var provisoire = await Provisoire(admin, paulId);

        horloge.Avancer(TimeSpan.FromHours(71));

        await banc.Navigateur().Connecter("paul@dupont.fr", provisoire);
    }

    // ---------- M3 : cache de la validation ----------

    [Fact]
    public async Task Le_cache_de_validation_garde_10_s_et_s_oublie_sur_demande()
    {
        var horloge = new HorlogeReglable();
        var cache = new CacheSessions(horloge);
        var lectures = 0;
        Task<EtatCompte?> Charger()
        {
            lectures++;
            return Task.FromResult<EtatCompte?>(new EtatCompte("cpt-1", "org-1", "membre", 0, false, null));
        }

        await cache.ObtenirAsync("cpt-1", Charger);
        await cache.ObtenirAsync("cpt-1", Charger);
        Assert.Equal(1, lectures);

        horloge.Avancer(CacheSessions.Duree + TimeSpan.FromMilliseconds(1));
        await cache.ObtenirAsync("cpt-1", Charger);
        Assert.Equal(2, lectures);

        cache.Oublier("cpt-1");
        await cache.ObtenirAsync("cpt-1", Charger);
        Assert.Equal(3, lectures);
    }

    [Fact]
    public async Task Une_lecture_commencee_avant_un_oubli_ne_remet_pas_l_ancien_etat_en_cache()
    {
        var cache = new CacheSessions(new HorlogeReglable());
        var lectures = 0;

        // La lecture lente voit l'état d'avant le retrait ; le retrait oublie le compte pendant qu'elle tourne.
        await cache.ObtenirAsync("cpt-1", () =>
        {
            lectures++;
            cache.Oublier("cpt-1");
            return Task.FromResult<EtatCompte?>(new EtatCompte("cpt-1", "org-1", "membre", 0, false, null));
        });
        await cache.ObtenirAsync("cpt-1", () =>
        {
            lectures++;
            return Task.FromResult<EtatCompte?>(null);
        });

        Assert.Equal(2, lectures);
    }

    // ---------- L3 : coût des empreintes ----------

    [Fact]
    public void Les_nouvelles_empreintes_coutent_210_000_iterations_et_les_anciennes_restent_valables()
    {
        IMotsDePasse mdp = new MotsDePasse();
        var ancienne = new PasswordHasher<object>(Options.Create(new PasswordHasherOptions { IterationCount = 100_000 })).HashPassword(new object(), BancApi.MotDePasse);

        var neuve = mdp.Hacher(BancApi.MotDePasse);
        var octets = Convert.FromBase64String(neuve);
        // Format v3 : 0x01, puis l'algorithme (4 octets), puis le nombre d'itérations (4 octets, gros-boutiste).
        var iterations = (octets[5] << 24) | (octets[6] << 16) | (octets[7] << 8) | octets[8];

        Assert.Equal(MotsDePasse.Iterations, iterations);
        Assert.Equal(210_000, MotsDePasse.Iterations);
        Assert.True(mdp.Verifier(ancienne, BancApi.MotDePasse));
        Assert.False(mdp.Verifier(ancienne, "autre-mot-de-passe"));
    }

    // ---------- L4 : journal des actions sur les comptes ----------

    [Fact]
    public async Task Chaque_action_sur_les_comptes_laisse_une_trace_sans_mot_de_passe()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var autre = await banc.Organisation("Cartonnerie Martin", "admin@martin.fr");
        var paulId = await Creer(admin, "paul@dupont.fr");
        var jeanId = await Creer(admin, "jean@dupont.fr");
        var provisoire = await Provisoire(admin, paulId);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Delete($"{Membres}/{jeanId}", Moi)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Put("/api/session/mot-de-passe", new { actuel = BancApi.MotDePasse, nouveau = Nouveau })).StatusCode);
        var paul = await banc.Navigateur().Connecter("paul@dupont.fr", provisoire);

        var journal = await admin.Json("/api/organisation/journal-comptes");
        var brut = journal.GetRawText();
        var actions = journal.EnumerateArray().Select(e => e.GetProperty("action").GetString()).ToList();

        Assert.Equal(["changement", "retrait", "reinitialisation", "creation", "creation"], actions);
        var retrait = journal.EnumerateArray().Single(e => e.GetProperty("action").GetString() == "retrait");
        Assert.Equal("admin@dupont.fr", retrait.GetProperty("auteur").GetString());
        Assert.Equal("jean@dupont.fr", retrait.GetProperty("cible").GetString());
        Assert.False(string.IsNullOrEmpty(retrait.GetProperty("adresse").GetString()));
        Assert.DoesNotContain(provisoire, brut);
        Assert.DoesNotContain(BancApi.MotDePasse, brut);
        Assert.DoesNotContain(Nouveau, brut);
        // Réservé aux administrateurs de l'organisation : rien d'une autre organisation, rien pour un membre.
        Assert.Equal(0, (await autre.Json("/api/organisation/journal-comptes")).GetArrayLength());
        Assert.Equal(HttpStatusCode.Forbidden, (await paul.Get("/api/organisation/journal-comptes")).StatusCode);
    }
}
