using Dapper;
using EVAN.Application.Abstractions;
using EVAN.Application.Comptes;
using EVAN.Core.Domain.Sites;
using EVAN.Infrastructure.Persistence;
using Npgsql;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// Retrait d'un compte et mot de passe provisoire, dans les deux stockages : l'organisation de l'auteur seulement,
/// l'auteur doit en être un administrateur, le dernier administrateur reste, et la réinitialisation change la
/// génération des sessions. Mémoire toujours ; PostgreSQL avec Docker (ignoré sinon).
/// </summary>
[Collection(TimescaleCollection.Nom)]
public class ComptesStoreTests(TimescaleFixture fixture)
{
    private sealed record Entreprise(Organisation Organisation, Compte Admin, Compte Membre);

    private static Compte Compte(string organisationId, string identifiant, string role) =>
        new($"cpt-{Guid.NewGuid():N}", organisationId, identifiant, identifiant.Split('@')[0], role, "empreinte", 0);

    private static async Task<Entreprise> Creer(IComptesStore store, string nom, string domaine)
    {
        var organisation = new Organisation($"org-{Guid.NewGuid():N}", nom);
        var admin = Compte(organisation.Id, $"admin@{domaine}", Roles.Admin);
        var membre = Compte(organisation.Id, $"membre@{domaine}", Roles.Membre);
        Assert.True(await store.CreerOrganisationAsync(organisation, admin));
        Assert.True(await store.AjouterCompteAsync(membre));
        return new Entreprise(organisation, admin, membre);
    }

    private static async Task Retrait(IComptesStore store)
    {
        var dupont = await Creer(store, "Imprimerie Dupont", "dupont.fr");
        var martin = await Creer(store, "Cartonnerie Martin", "martin.fr");

        // Une autre organisation : rien ne bouge, même réponse qu'un compte inconnu.
        Assert.Equal(IssueMembre.Introuvable, await store.RetirerCompteAsync(dupont.Organisation.Id, dupont.Admin.Id, martin.Membre.Id));
        Assert.Equal(IssueMembre.Introuvable, await store.RetirerCompteAsync(dupont.Organisation.Id, dupont.Admin.Id, "cpt-inconnu"));
        // Un membre n'est pas administrateur : refusé, même s'il vise un compte de son organisation.
        Assert.Equal(IssueMembre.Refuse, await store.RetirerCompteAsync(dupont.Organisation.Id, dupont.Membre.Id, dupont.Admin.Id));
        // Le seul administrateur ne part pas, même demandé par lui-même.
        Assert.Equal(IssueMembre.DernierAdministrateur, await store.RetirerCompteAsync(dupont.Organisation.Id, dupont.Admin.Id, dupont.Admin.Id));
        Assert.Equal(IssueMembre.Fait, await store.RetirerCompteAsync(dupont.Organisation.Id, dupont.Admin.Id, dupont.Membre.Id));

        Assert.Null(await store.CompteAsync(dupont.Membre.Identifiant));
        Assert.NotNull(await store.CompteAsync(dupont.Admin.Identifiant));
        Assert.NotNull(await store.CompteAsync(martin.Membre.Identifiant));
        Assert.Single(await store.ComptesAsync(dupont.Organisation.Id));
    }

    private static readonly DateTimeOffset Reinitialise = new(2026, 11, 11, 8, 0, 0, TimeSpan.Zero);

    private static async Task Reinitialisation(IComptesStore store)
    {
        var dupont = await Creer(store, "Imprimerie Dupont", "dupont.fr");
        var martin = await Creer(store, "Cartonnerie Martin", "martin.fr");

        Assert.Equal(IssueMembre.Introuvable, await store.ReinitialiserEmpreinteAsync(dupont.Organisation.Id, dupont.Admin.Id, martin.Membre.Id, "volee", Reinitialise));
        Assert.Equal(IssueMembre.Refuse, await store.ReinitialiserEmpreinteAsync(dupont.Organisation.Id, dupont.Membre.Id, dupont.Admin.Id, "volee", Reinitialise));
        Assert.Equal(IssueMembre.Fait, await store.ReinitialiserEmpreinteAsync(dupont.Organisation.Id, dupont.Admin.Id, dupont.Membre.Id, "provisoire-1", Reinitialise));
        Assert.Equal(IssueMembre.Fait, await store.ReinitialiserEmpreinteAsync(dupont.Organisation.Id, dupont.Admin.Id, dupont.Membre.Id, "provisoire-2", Reinitialise));

        var membre = await store.CompteAsync(dupont.Membre.Identifiant);
        Assert.Equal("provisoire-2", membre!.Empreinte);
        // Chaque réinitialisation ferme les sessions ouvertes avant elle, et exige un changement à la connexion.
        Assert.Equal(2, membre.Generation);
        Assert.True(membre.DoitChanger);
        Assert.Equal(Reinitialise.ToUnixTimeMilliseconds(), membre.ProvisoireLe);
        Assert.Equal("empreinte", (await store.CompteAsync(martin.Membre.Identifiant))!.Empreinte);
        Assert.Equal("empreinte", (await store.CompteAsync(dupont.Admin.Identifiant))!.Empreinte);
        // Le changement par le titulaire ferme aussi les autres sessions (il rend la nouvelle génération) et lève l'obligation.
        Assert.Equal(3, await store.ChangerEmpreinteAsync(dupont.Membre.Id, "choisi-par-lui"));
        var change = (await store.CompteAsync(dupont.Membre.Identifiant))!;
        Assert.Equal(3, change.Generation);
        Assert.False(change.DoitChanger);
        Assert.Null(change.ProvisoireLe);
        Assert.Null(await store.ChangerEmpreinteAsync("cpt-inconnu", "x"));
        // La déconnexion avance la génération sans toucher au mot de passe.
        Assert.Equal(4, await store.NouvelleGenerationAsync(dupont.Membre.Id));
        Assert.Equal("choisi-par-lui", (await store.CompteAsync(dupont.Membre.Identifiant))!.Empreinte);
        Assert.Null(await store.NouvelleGenerationAsync("cpt-inconnu"));
        // Un compte se lit par son identifiant technique, dans son organisation seulement.
        Assert.Equal(dupont.Membre.Identifiant, (await store.CompteDeAsync(dupont.Organisation.Id, dupont.Membre.Id))?.Identifiant);
        Assert.Null(await store.CompteDeAsync(martin.Organisation.Id, dupont.Membre.Id));
    }

    private static async Task JournalDesComptes(IComptesStore store)
    {
        var dupont = await Creer(store, "Imprimerie Dupont", "dupont.fr");
        var martin = await Creer(store, "Cartonnerie Martin", "martin.fr");
        var t = Reinitialise;
        await store.JournaliserAsync(new EvenementCompte(dupont.Organisation.Id, dupont.Admin.Id, dupont.Admin.Identifiant, dupont.Membre.Id, dupont.Membre.Identifiant, ActionCompte.Creation, "10.0.0.1", t.ToUnixTimeMilliseconds()));
        await store.JournaliserAsync(new EvenementCompte(dupont.Organisation.Id, dupont.Admin.Id, dupont.Admin.Identifiant, dupont.Membre.Id, dupont.Membre.Identifiant, ActionCompte.Retrait, "10.0.0.1", t.AddMinutes(1).ToUnixTimeMilliseconds()));
        await store.JournaliserAsync(new EvenementCompte(martin.Organisation.Id, martin.Admin.Id, martin.Admin.Identifiant, martin.Admin.Id, martin.Admin.Identifiant, ActionCompte.Changement, "10.0.0.2", t.ToUnixTimeMilliseconds()));

        var journal = await store.JournalComptesAsync(dupont.Organisation.Id, 50);

        Assert.Equal([ActionCompte.Retrait, ActionCompte.Creation], journal.Select(e => e.Action));
        Assert.All(journal, e => Assert.Equal(dupont.Organisation.Id, e.OrganisationId));
        Assert.Equal("10.0.0.1", journal[0].Adresse);
        Assert.Equal(dupont.Membre.Identifiant, journal[0].CibleIdentifiant);
        Assert.Single(await store.JournalComptesAsync(dupont.Organisation.Id, 1));
    }

    [Fact]
    public Task Memoire_retire_dans_l_organisation_de_l_auteur_seulement() => Retrait(new MemoryStore());

    [Fact]
    public Task Memoire_reinitialise_et_change_la_generation() => Reinitialisation(new MemoryStore());

    [Fact]
    public Task Memoire_journal_des_comptes_par_organisation() => JournalDesComptes(new MemoryStore());

    [Timescale]
    public async Task Postgres_journal_des_comptes_par_organisation()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        await JournalDesComptes(store);
    }

    [Timescale]
    public async Task Postgres_retire_dans_l_organisation_de_l_auteur_seulement()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        await Retrait(store);
    }

    [Timescale]
    public async Task Postgres_reinitialise_et_change_la_generation()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        await Reinitialisation(store);
    }

    [Timescale]
    public async Task Deux_administrateurs_qui_se_retirent_en_meme_temps_en_laissent_un()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        var dupont = await Creer(store, "Imprimerie Dupont", "dupont.fr");
        var second = Compte(dupont.Organisation.Id, "second@dupont.fr", Roles.Admin);
        Assert.True(await store.AjouterCompteAsync(second));

        // Le verrou de l'organisation les fait passer l'un après l'autre : le second auteur n'existe plus.
        var issues = await Task.WhenAll(
            store.RetirerCompteAsync(dupont.Organisation.Id, dupont.Admin.Id, second.Id),
            store.RetirerCompteAsync(dupont.Organisation.Id, second.Id, dupont.Admin.Id));

        Assert.Single(issues, i => i == IssueMembre.Fait);
        Assert.Single(issues, i => i == IssueMembre.Refuse);
        Assert.Single(await store.ComptesAsync(dupont.Organisation.Id), c => c.Role == Roles.Admin);
    }

    [Timescale]
    public async Task Une_base_d_avant_la_generation_la_recoit_a_zero_sans_perdre_ses_comptes()
    {
        var (store, cs) = await fixture.StockagePretAsync();
        await using (store)
        {
            await Creer(store, "Imprimerie Dupont", "dupont.fr");
        }
        await using (var conn = new NpgsqlConnection(cs))
            await conn.ExecuteAsync("ALTER TABLE comptes DROP COLUMN generation, DROP COLUMN doit_changer, DROP COLUMN provisoire_le; DROP TABLE journal_comptes");

        // Redémarrage : le schéma rejoué ajoute colonnes et journal, les comptes existants partent de zéro.
        await using var relance = new PostgresStore(cs, new Journal<PostgresStore>());
        await relance.InitializeAsync(TimescaleFixture.Data, CancellationToken.None);

        var admin = await relance.CompteAsync("admin@dupont.fr");
        Assert.NotNull(admin);
        Assert.Equal(0, admin.Generation);
        Assert.False(admin.DoitChanger);
        Assert.Null(admin.ProvisoireLe);
        Assert.Empty(await relance.JournalComptesAsync(admin.OrganisationId, 10));
    }
}
