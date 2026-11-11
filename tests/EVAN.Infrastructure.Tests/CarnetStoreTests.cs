using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Exploitation;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// Carnet de maintenance en base (Carnet.sql) et réouverture d'une alarme, sur une vraie base TimescaleDB : chaque
/// ligne reste dans son usine, l'ordre d'enregistrement est gardé, la table ne grossit pas au-delà de la borne. Ignoré
/// sans Docker, comme les autres tests de la collection.
/// </summary>
[Collection(TimescaleCollection.Nom)]
public class CarnetStoreTests(TimescaleFixture fixture)
{
    private const string Tours = "site-tours";
    private const string Crissey = "site-crissey";
    private static readonly long Maintenant = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private static Saisie Saisie(string id, string titre = "Lame changée") =>
        new(id, "m-r01", "m-r01.o6", "preventive", Maintenant - 3_600_000, 40, titre, "Compte rendu", "Équipe matin", "outil");

    private static Prevue Prevue(string id, long date) => new(id, "m-r04", "m-r04.o5", "uv", "Remplacer la lampe UV", date, 45, "Équipe matin", "m-r04.o5.puissance_uv");

    [Timescale]
    public async Task Une_saisie_s_ajoute_se_corrige_et_se_supprime_dans_son_usine_seulement()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        await store.AjouterSaisieAsync(Tours, Saisie("sa-1"), 500);
        await store.AjouterSaisieAsync(Tours, Saisie("sa-2"), 500);

        // Une autre usine ne corrige ni ne supprime une saisie de Tours, même en connaissant son identifiant.
        Assert.False(await store.CorrigerSaisieAsync(Crissey, Saisie("sa-1", "Intrusion")));
        Assert.False(await store.SupprimerSaisieAsync(Crissey, "sa-1"));
        Assert.True(await store.CorrigerSaisieAsync(Tours, Saisie("sa-1", "Lame et contre-lame changées")));
        Assert.True(await store.SupprimerSaisieAsync(Tours, "sa-2"));

        var relues = await store.SaisiesAsync(Tours, 500);
        Assert.Equal(Saisie("sa-1", "Lame et contre-lame changées"), Assert.Single(relues));
        Assert.Empty(await store.SaisiesAsync(Crissey, 500));
    }

    [Timescale]
    public async Task Les_saisies_sont_relues_de_la_derniere_a_la_premiere_et_bornees()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        for (var i = 1; i <= 4; i++) await store.AjouterSaisieAsync(Tours, Saisie($"sa-{i}"), 3);
        // Remise (« Annuler » d'une suppression) : la saisie repasse en tête.
        await store.AjouterSaisieAsync(Tours, Saisie("sa-3"), 3);

        Assert.Equal(["sa-3", "sa-4", "sa-2"], (await store.SaisiesAsync(Tours, 500)).Select(x => x.Id));
    }

    [Timescale]
    public async Task Une_intervention_planifiee_se_deplace_et_s_annule_dans_son_usine_seulement()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        var demain = Maintenant + 86_400_000;
        await store.PlanifierAsync(Tours, Prevue("pv-1", demain), 200);
        await store.PlanifierAsync(Tours, Prevue("pv-2", demain), 200);
        // Déplacée : nouvelle date, et elle passe en fin de liste, comme dans le navigateur.
        await store.PlanifierAsync(Tours, Prevue("pv-1", demain + 7_200_000), 200);

        Assert.False(await store.AnnulerPrevueAsync(Crissey, "pv-2"));
        var relues = await store.PrevuesAsync(Tours, 200);
        Assert.Equal(["pv-2", "pv-1"], relues.Select(p => p.Id));
        Assert.Equal(Prevue("pv-1", demain + 7_200_000), relues[1]);

        Assert.True(await store.AnnulerPrevueAsync(Tours, "pv-2"));
        Assert.Equal(["pv-1"], (await store.PrevuesAsync(Tours, 200)).Select(p => p.Id));
    }

    [Timescale]
    public async Task Le_schema_du_carnet_se_rejoue_au_redemarrage_sans_rien_perdre()
    {
        var (store, cs) = await fixture.StockagePretAsync();
        await using (store) await store.AjouterSaisieAsync(Tours, Saisie("sa-1"), 500);

        await using var relance = new Persistence.PostgresStore(cs, new Journal<Persistence.PostgresStore>());
        using var delai = new CancellationTokenSource(TimeSpan.FromMinutes(1));
        await relance.InitializeAsync(TimescaleFixture.Data, delai.Token);

        Assert.Equal(["sa-1"], (await relance.SaisiesAsync(Tours, 500)).Select(x => x.Id));
    }

    [Timescale]
    public async Task Une_cloture_annulee_rouvre_l_alarme_en_base()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        var t = Maintenant - 600_000;
        var prise = new Alarme
        {
            Id = "al-rouverte", Code = "TB-101", Message = "Tension hors tolérance", Gravite = "critique", MachineId = "m-r01", OrganeId = "m-r01.o1",
            PointId = "m-r01.o1.tension", Horodatage = t, Statut = "acquittee", AcquitteePar = "Équipe matin", AcquitteeLe = t + 60_000,
        };
        await store.SaveAlarmAsync(Tours, prise);
        await store.SaveAlarmAsync(Tours, prise with { Statut = "resolue", FinLe = t + 300_000 });

        // Une autre usine ne rouvre pas l'alarme de Tours.
        await store.ReopenAlarmAsync(Crissey, prise);
        Assert.Empty(await store.UnresolvedAlarmsAsync(Tours, DateTimeOffset.UtcNow.AddHours(-1)));

        await store.ReopenAlarmAsync(Tours, prise);
        Assert.Equal(prise, Assert.Single(await store.UnresolvedAlarmsAsync(Tours, DateTimeOffset.UtcNow.AddHours(-1))));
        // Close de nouveau : la garde d'ordre laisse passer, l'alarme rouverte n'étant plus résolue en base.
        await store.SaveAlarmAsync(Tours, prise with { Statut = "resolue", FinLe = t + 500_000 });
        Assert.Empty(await store.UnresolvedAlarmsAsync(Tours, DateTimeOffset.UtcNow.AddHours(-1)));
    }
}
