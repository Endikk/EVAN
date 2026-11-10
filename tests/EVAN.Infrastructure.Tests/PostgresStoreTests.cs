using Dapper;
using EVAN.Application.Abstractions;
using EVAN.Application.Comptes;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Sites;
using EVAN.Infrastructure.Persistence;
using Microsoft.Extensions.Logging;
using Npgsql;
using Testcontainers.PostgreSql;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// PostgresStore sur une vraie base TimescaleDB (même image que docker-compose.yml) : schéma rejoué sans dégât, COPY
/// binaire par lots, agrégat continu, alarmes, journal, états machine et classement des échecs. Ignoré sans Docker ;
/// lancement et réglages : docs/ARCHITECTURE.md § 9.
/// </summary>
[Collection(TimescaleCollection.Nom)]
public class PostgresStoreTests(TimescaleFixture fixture)
{
    private const string Tours = "site-tours";
    private const string Crissey = "site-crissey";
    private static readonly TimeSpan AttenteMax = TimeSpan.FromSeconds(30);

    private static async Task<T> Lire<T>(string cs, string sql, object? args = null)
    {
        await using var conn = new NpgsqlConnection(cs);
        return await conn.ExecuteScalarAsync<T>(sql, args) ?? throw new InvalidOperationException($"Aucun résultat : {sql}");
    }

    private static async Task Executer(string cs, string sql)
    {
        await using var conn = new NpgsqlConnection(cs);
        await conn.ExecuteAsync(sql);
    }

    /// <summary>Attend une condition (écriture en tâche de fond), 30 s au plus.</summary>
    private static async Task Attendre(Func<Task<bool>> condition, string quoi)
    {
        var fin = DateTime.UtcNow + AttenteMax;
        while (!await condition())
        {
            if (DateTime.UtcNow > fin) Assert.Fail($"Toujours pas au bout de {AttenteMax.TotalSeconds} s : {quoi}");
            await Task.Delay(100);
        }
    }

    private static Task AttendreMesures(string cs, long nombre) =>
        Attendre(async () => await Lire<long>(cs, "SELECT count(*) FROM mesures") == nombre, $"{nombre} mesures en base");

    /// <summary>Heure pleine, en UTC : les regroupements de time_bucket tombent juste.</summary>
    private static DateTimeOffset HeurePleine(DateTimeOffset t) => new(t.Year, t.Month, t.Day, t.Hour, 0, 0, TimeSpan.Zero);

    private static long Ms(DateTimeOffset t) => t.ToUnixTimeMilliseconds();

    /// <summary>Instant à la milliseconde près, comme les horodatages des alarmes : une borne de période tombe pile dessus.</summary>
    private static DateTimeOffset IlYA(TimeSpan duree) => DateTimeOffset.FromUnixTimeMilliseconds(Ms(DateTimeOffset.UtcNow - duree));

    private static Alarme Casse(string id, long t, string machine = "m-r01") => new()
    {
        Id = id,
        Code = "EM-01",
        Message = "Casse du squelette d’échenillage",
        Gravite = "critique",
        MachineId = machine,
        OrganeId = $"{machine}.o7",
        PointId = $"{machine}.o7.tension_dechet",
        Horodatage = t,
        Valeur = 3.2,
        Unite = "N",
        Seuil = 10,
        Regle = "repetitif",
        Cause = "Casse du squelette d'échenillage.",
        Repetitions = 3,
    };

    private static Task<TimeSpan> CompressionDesMesures(string cs) => Lire<TimeSpan>(cs,
        "SELECT (config->>'compress_after')::interval FROM timescaledb_information.jobs WHERE hypertable_name = 'mesures' AND proc_name = 'policy_compression'");

    [Timescale]
    public async Task Le_schema_rejoue_au_redemarrage_ne_duplique_ni_l_usine_ni_les_politiques()
    {
        var (premier, cs) = await fixture.StockagePretAsync();
        await premier.DisposeAsync();

        // Redémarrage de l'API : un nouveau stockage rejoue le schéma et l'usine d'exemple sur la même base.
        await using var second = new PostgresStore(cs, new Journal<PostgresStore>());
        await second.InitializeAsync(TimescaleFixture.Data, CancellationToken.None);

        var demo = TimescaleFixture.Data.Demo;
        var modeles = demo.Usines.SelectMany(u => u.Machines).Select(TimescaleFixture.Data.Model).ToList();
        Assert.True(second.Healthy);
        Assert.Equal(1, await Lire<long>(cs, "SELECT count(*) FROM organisations"));
        Assert.Equal(demo.Usines.Count, await Lire<long>(cs, "SELECT count(*) FROM sites"));
        Assert.Equal(modeles.Count, await Lire<long>(cs, "SELECT count(*) FROM machines"));
        Assert.Equal(modeles.Sum(m => m.Organes.Count), await Lire<long>(cs, "SELECT count(*) FROM organes"));
        Assert.Equal(modeles.Sum(m => m.Points.Count), await Lire<long>(cs, "SELECT count(*) FROM points_mesure"));
        // Compression et rétention des mesures, rafraîchissement et compression de l'agrégat : une seule fois chacune.
        Assert.Equal(4, await Lire<long>(cs, "SELECT count(*) FROM timescaledb_information.jobs WHERE hypertable_name IN ('mesures', 'mesures_1min')"));
    }

    [Timescale]
    public async Task Une_base_d_une_version_precedente_est_mise_a_niveau_au_redemarrage()
    {
        var (premier, cs) = await fixture.StockagePretAsync();
        await premier.DisposeAsync();
        // Base créée avant le multi-usines et la reprise des alarmes, avec une compression à 7 jours.
        await Executer(cs,
            """
            ALTER TABLE sites DROP COLUMN passerelle;
            ALTER TABLE alarmes DROP COLUMN acquittee_le;
            SELECT alter_job(job_id, config => jsonb_set(config, '{compress_after}', '"7 days"'))
            FROM timescaledb_information.jobs WHERE hypertable_name = 'mesures' AND proc_name = 'policy_compression';
            """);
        Assert.Equal(TimeSpan.FromDays(7), await CompressionDesMesures(cs));

        await using var second = new PostgresStore(cs, new Journal<PostgresStore>());
        await second.InitializeAsync(TimescaleFixture.Data, CancellationToken.None);

        Assert.Equal(TimeSpan.FromDays(1), await CompressionDesMesures(cs));
        Assert.Equal(2, await Lire<long>(cs,
            "SELECT count(*) FROM information_schema.columns WHERE (table_name, column_name) IN (('sites', 'passerelle'), ('alarmes', 'acquittee_le'))"));
    }

    [Timescale]
    public async Task La_compression_la_retention_et_l_agregat_continu_sont_programmes()
    {
        var (store, cs) = await fixture.StockagePretAsync();
        await using var _ = store;
        await using var conn = new NpgsqlConnection(cs);

        var hypertables = (await conn.QueryAsync<(string Nom, TimeSpan Bloc)>(
            "SELECT hypertable_name, time_interval FROM timescaledb_information.dimensions ORDER BY hypertable_name")).ToList();
        var retention = await conn.ExecuteScalarAsync<TimeSpan>(
            "SELECT (config->>'drop_after')::interval FROM timescaledb_information.jobs WHERE hypertable_name = 'mesures' AND proc_name = 'policy_retention'");
        var (debut, fin, periode) = await conn.QuerySingleAsync<(TimeSpan, TimeSpan, TimeSpan)>(
            """
            SELECT (config->>'start_offset')::interval, (config->>'end_offset')::interval, schedule_interval
            FROM timescaledb_information.jobs WHERE hypertable_name = 'mesures_1min' AND proc_name = 'policy_refresh_continuous_aggregate'
            """);
        var compressionAgregat = await conn.ExecuteScalarAsync<TimeSpan>(
            "SELECT (config->>'compress_after')::interval FROM timescaledb_information.jobs WHERE hypertable_name = 'mesures_1min' AND proc_name = 'policy_compression'");
        // Réglages de compression de l'hypertable et de celle qui matérialise l'agrégat, rapportée au nom de la vue.
        var segments = (await conn.QueryAsync<(string Table, string Segment, string? Ordre)>(
            """
            SELECT coalesce(c.view_name, s.hypertable::text), s.segmentby, s.orderby
            FROM timescaledb_information.hypertable_compression_settings s
            LEFT JOIN timescaledb_information.continuous_aggregates c
                ON c.materialization_hypertable_schema || '.' || c.materialization_hypertable_name = s.hypertable::text
            WHERE s.hypertable::text = 'mesures' OR c.view_name = 'mesures_1min'
            ORDER BY 1
            """)).ToList();

        Assert.Equal([("etats_machine", TimeSpan.FromDays(7)), ("mesures", TimeSpan.FromDays(1))],
            hypertables.Where(h => h.Nom is "etats_machine" or "mesures").ToList());
        Assert.Equal(TimeSpan.FromDays(1), await CompressionDesMesures(cs));
        Assert.Equal(TimeSpan.FromDays(400), retention);
        Assert.Equal((TimeSpan.FromDays(1), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1)), (debut, fin, periode));
        Assert.Equal(TimeSpan.FromDays(2), compressionAgregat);
        Assert.Equal([("mesures", "point_id", null), ("mesures_1min", "point_id", "bucket DESC")], segments);
    }

    [Timescale]
    public async Task Les_mesures_ecrites_par_lots_sont_relues_minute_par_minute()
    {
        var (store, cs) = await fixture.StockagePretAsync();
        await using var _ = store;
        // 50 000 lignes : plus de deux lots COPY de 20 000. Le point k vaut k × 1000, plus la seconde dans la minute,
        // plus une demi-unité par minute écoulée.
        const int Points = 5;
        const int Secondes = 10_000;
        var t0 = HeurePleine(DateTimeOffset.UtcNow.AddHours(-4));
        store.Enqueue(Enumerable.Range(0, Secondes).SelectMany(i => Enumerable.Range(0, Points).Select(k =>
            new MeasurementRow(t0.AddSeconds(i), $"p{k}", k * 1000 + i % 60 + i / 60 * 0.5, (short)(i % 2)))));

        await AttendreMesures(cs, Points * Secondes);
        var serie = await store.SeriesAsync("p2", t0, t0.AddSeconds(599), TimeSpan.FromMinutes(1));

        Assert.True(store.Healthy);
        Assert.Equal(Points * Secondes / 2, await Lire<long>(cs, "SELECT count(*) FROM mesures WHERE qualite = 1"));
        Assert.Equal(
            Enumerable.Range(0, 10).Select(m => new SeriesPoint(Ms(t0.AddMinutes(m)), 2000 + m * 0.5 + 29.5, 2000 + m * 0.5, 2000 + m * 0.5 + 59)),
            serie);
    }

    [Timescale]
    public async Task Au_dela_de_6_h_la_courbe_vient_de_l_agregat_pondere_par_minute()
    {
        var (store, cs) = await fixture.StockagePretAsync();
        await using var _ = store;
        // Rafraîchissement à la main seulement : la politique ne matérialise rien pendant le test.
        await Executer(cs, "SELECT alter_job(job_id, scheduled => false) FROM timescaledb_information.jobs WHERE proc_name = 'policy_refresh_continuous_aggregate'");
        // Sept heures, de 1 à 6 échantillons selon la minute : une moyenne de moyennes ne retomberait pas sur la vraie moyenne.
        var t0 = HeurePleine(DateTimeOffset.UtcNow.AddHours(-10));
        var lignes = new List<MeasurementRow>();
        for (var m = 0; m < 7 * 60; m++)
        {
            for (var j = 0; j <= m % 6; j++) lignes.Add(new MeasurementRow(t0.AddMinutes(m).AddSeconds(j * 10), "p-long", m % 6 * 10 + j * 7, 0));
        }
        store.Enqueue(lignes);
        await AttendreMesures(cs, lignes.Count);

        var avantRafraichissement = await store.SeriesAsync("p-long", t0, t0.AddHours(7), TimeSpan.FromHours(1));
        await Executer(cs, "CALL refresh_continuous_aggregate('mesures_1min', NULL, NULL)");
        var serie = await store.SeriesAsync("p-long", t0, t0.AddHours(7), TimeSpan.FromHours(1));

        var heures = lignes.GroupBy(l => (l.Time - t0).Hours).OrderBy(g => g.Key).ToList();
        var moyenneDesMinutes = heures[0].GroupBy(l => l.Time.Minute).Average(g => g.Average(l => l.Value));
        Assert.NotEqual(heures[0].Average(l => l.Value), moyenneDesMinutes, 6);
        // Rien de lu dans les mesures brutes : avant le rafraîchissement, l'agrégat est vide.
        Assert.Empty(avantRafraichissement);
        Assert.Equal(heures.Count, serie.Count);
        for (var h = 0; h < heures.Count; h++)
        {
            Assert.Equal(Ms(t0.AddHours(h)), serie[h].T);
            Assert.Equal(heures[h].Average(l => l.Value), serie[h].Avg, 9);
            Assert.Equal(heures[h].Min(l => l.Value), serie[h].Min);
            Assert.Equal(heures[h].Max(l => l.Value), serie[h].Max);
        }
    }

    [Timescale]
    public async Task Une_alarme_enregistree_est_relue_a_l_identique()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        var t = Ms(DateTimeOffset.UtcNow.AddMinutes(-30));
        var alarme = Casse("al-complete", t) with
        {
            Statut = "resolue", FinLe = t + 540_000, AcquitteePar = "Équipe matin", AcquitteeLe = t + 147_000,
        };

        await store.SaveAlarmAsync(Tours, alarme);
        var relues = await store.AlarmsAsync(Tours, DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow, null);

        Assert.Equal(alarme, Assert.Single(relues));
    }

    [Timescale]
    public async Task La_periode_la_machine_et_l_usine_filtrent_les_alarmes()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        var t = IlYA(TimeSpan.FromMinutes(5));
        await store.SaveAlarmAsync(Tours, Casse("al-3h", Ms(t.AddHours(-3))));
        await store.SaveAlarmAsync(Tours, Casse("al-2h", Ms(t.AddHours(-2)), "m-r02"));
        await store.SaveAlarmAsync(Tours, Casse("al-1h", Ms(t.AddHours(-1))));
        await store.SaveAlarmAsync(Tours, Casse("al-0h", Ms(t)));
        await store.SaveAlarmAsync(Crissey, Casse("al-crissey", Ms(t.AddHours(-1)), "m-cr01"));

        // Bornes comprises, les plus récentes d'abord.
        var periode = await store.AlarmsAsync(Tours, t.AddHours(-2), t.AddHours(-1), null);
        var machine = await store.AlarmsAsync(Tours, t.AddHours(-4), t, "m-r01");
        var crissey = await store.AlarmsAsync(Crissey, t.AddHours(-4), t, null);

        Assert.Equal(["al-1h", "al-2h"], periode.Select(a => a.Id));
        Assert.Equal(["al-0h", "al-1h", "al-3h"], machine.Select(a => a.Id));
        Assert.Equal(["al-crissey"], crissey.Select(a => a.Id));
    }

    [Timescale]
    public async Task Une_alarme_resolue_ne_redevient_jamais_active()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        var t = Ms(DateTimeOffset.UtcNow.AddMinutes(-10));
        var active = Casse("al-ordre", t);
        var prise = active with { Statut = "acquittee", AcquitteePar = "Équipe matin", AcquitteeLe = t + 60_000 };
        var resolue = prise with { Statut = "resolue", FinLe = t + 300_000 };

        await store.SaveAlarmAsync(Tours, active);
        await store.SaveAlarmAsync(Tours, prise);
        var apresPrise = await store.AlarmsAsync(Tours, DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow, null);
        await store.SaveAlarmAsync(Tours, resolue);
        // Écriture en retard de l'état « active » : la garde d'ordre la refuse.
        await store.SaveAlarmAsync(Tours, active);
        var finales = await store.AlarmsAsync(Tours, DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow, null);

        Assert.Equal(prise, Assert.Single(apresPrise));
        Assert.Equal(resolue, Assert.Single(finales));
    }

    [Timescale]
    public async Task Seules_les_alarmes_ouvertes_de_l_usine_sont_reprises_au_redemarrage()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        var t = IlYA(TimeSpan.FromMinutes(5));
        await store.SaveAlarmAsync(Tours, Casse("ancienne", Ms(t.AddDays(-3))));
        await store.SaveAlarmAsync(Tours, Casse("active", Ms(t.AddHours(-2))));
        await store.SaveAlarmAsync(Tours, Casse("prise", Ms(t.AddHours(-1))) with { Statut = "acquittee", AcquitteePar = "Équipe matin" });
        await store.SaveAlarmAsync(Tours, Casse("close", Ms(t)) with { Statut = "resolue", FinLe = Ms(t) + 1000 });
        await store.SaveAlarmAsync(Crissey, Casse("autre-usine", Ms(t), "m-cr01"));

        var ouvertes = await store.UnresolvedAlarmsAsync(Tours, t.AddDays(-1));

        Assert.Equal(["prise", "active"], ouvertes.Select(a => a.Id));
        Assert.Equal(["acquittee", "active"], ouvertes.Select(a => a.Statut));
    }

    [Timescale]
    public async Task Le_journal_est_relu_du_plus_recent_au_plus_ancien_sans_doublon()
    {
        var (store, _) = await fixture.StockagePretAsync();
        await using var s = store;
        var t = Ms(DateTimeOffset.UtcNow.AddMinutes(-20));
        var configuration = new Evenement("ev-1", "action", t, "Configuration enregistrée (14 machines)", Auteur: "Superviseur");
        var panne = new Evenement("ev-2", "alarme", t + 60_000, "Casse d'échenillage sur R01", "m-r01");
        await store.SaveEventAsync(Tours, configuration);
        await store.SaveEventAsync(Tours, panne);
        // Même identifiant écrit deux fois (reprise après coupure) : le premier reste.
        await store.SaveEventAsync(Tours, panne with { Message = "doublon" });
        await store.SaveEventAsync(Tours, new Evenement("ev-vieux", "systeme", t - 7_200_000, "Démarrage"));
        await store.SaveEventAsync(Crissey, new Evenement("ev-crissey", "systeme", t, "Démarrage"));

        var journal = await store.EventsAsync(Tours, DateTimeOffset.UtcNow.AddHours(-1));

        Assert.Equal([panne, configuration], journal);
    }

    [Timescale]
    public async Task Les_etats_machine_sont_ecrits_dans_leur_hypertable()
    {
        var (store, cs) = await fixture.StockagePretAsync();
        await using var s = store;
        var t = IlYA(TimeSpan.FromMinutes(3));
        await store.SaveMachineStateAsync("m-r01", "marche", 142.5, t);
        await store.SaveMachineStateAsync("m-r01", "panne", 0, t.AddSeconds(90));
        await store.SaveMachineStateAsync("m-r02", "calage", 12, t.AddSeconds(30));

        await using var conn = new NpgsqlConnection(cs);
        var etats = (await conn.QueryAsync<(DateTime Temps, string Etat, double Vitesse)>(
            "SELECT temps, etat, vitesse FROM etats_machine WHERE machine_id = 'm-r01' ORDER BY temps")).ToList();

        Assert.Equal([(t.UtcDateTime, "marche", 142.5), (t.AddSeconds(90).UtcDateTime, "panne", 0.0)], etats);
    }

    [Timescale]
    public async Task Une_violation_de_contrainte_n_est_definitive_qu_une_fois_le_schema_cree()
    {
        var (store, cs) = await fixture.StockagePretAsync();
        await using var s = store;
        // Pas encore initialisé (API qui démarre) : tout échec est provisoire, même un refus du serveur.
        await using var auDemarrage = new PostgresStore(cs, new Journal<PostgresStore>());
        var sansCode = Casse("al-sans-code", Ms(DateTimeOffset.UtcNow)) with { Code = null! };

        var refus = await Assert.ThrowsAsync<PostgresException>(() => store.SaveAlarmAsync(Tours, sansCode));
        var refusAuDemarrage = await Assert.ThrowsAsync<PostgresException>(() => auDemarrage.SaveAlarmAsync(Tours, sansCode));

        Assert.Equal(PostgresErrorCodes.NotNullViolation, refus.SqlState);
        Assert.True(store.IsPermanentFailure(refus));
        Assert.False(auDemarrage.IsPermanentFailure(refusAuDemarrage));
    }

    [Timescale]
    public async Task Un_lot_de_mesures_refuse_par_le_serveur_est_ecarte_puis_l_ecriture_reprend()
    {
        var journal = new Journal<PostgresStore>();
        var (store, cs) = await fixture.StockagePretAsync(journal);
        await using var s = store;
        var t = DateTimeOffset.UtcNow.AddMinutes(-1);

        // Un caractère nul n'entre pas dans une colonne texte : refus du serveur, à l'identique à chaque essai.
        store.Enqueue([new MeasurementRow(t, "point\0invalide", 1, 0)]);
        await Attendre(() => Task.FromResult(journal.Lignes.Any(l => l.Niveau == LogLevel.Error && l.Message.Contains("écarté"))), "lot refusé puis écarté");
        store.Enqueue([new MeasurementRow(t.AddSeconds(1), "m-r01.o7.tension_dechet", 26, 0)]);
        await AttendreMesures(cs, 1);

        Assert.True(store.Healthy);
    }

    [Timescale]
    public async Task L_installation_ne_cree_l_organisation_de_l_entreprise_qu_une_fois()
    {
        var (store, _) = await fixture.StockagePretAsync(new Journal<PostgresStore>());
        await using var s = store;
        static (Organisation, Compte) Entreprise(string nom, string identifiant)
        {
            var organisation = new Organisation($"org-{Guid.NewGuid():N}", nom);
            return (organisation, new Compte($"cpt-{Guid.NewGuid():N}", organisation.Id, identifiant, "Admin", Roles.Admin, "empreinte", 0));
        }

        var (premiere, admin) = Entreprise("Imprimerie Dupont", "admin@dupont.fr");
        var (seconde, autre) = Entreprise("Autre", "autre@exemple.fr");
        // Deux installations lancées ensemble : le verrou de transaction n'en laisse passer qu'une.
        var resultats = await Task.WhenAll(store.InstallerAsync(premiere, admin), store.InstallerAsync(seconde, autre));

        Assert.Single(resultats, r => r);
        var (encore, encoreAdmin) = Entreprise("Encore", "encore@exemple.fr");
        Assert.False(await store.InstallerAsync(encore, encoreAdmin));
    }

    [Timescale]
    public async Task Une_mesure_arrivee_pendant_les_refus_n_est_pas_ecartee_avec_le_lot()
    {
        var journal = new Journal<PostgresStore>();
        var (store, cs) = await fixture.StockagePretAsync(journal);
        await using var s = store;
        var t = DateTimeOffset.UtcNow.AddMinutes(-1);

        store.Enqueue([new MeasurementRow(t, "point\0invalide", 1, 0)]);
        await Attendre(() => Task.FromResult(journal.Lignes.Any(l => l.Niveau == LogLevel.Warning && l.Message.Contains("conservées"))), "premier refus");
        // Arrivée entre deux essais du lot refusé : elle attend dans la file et part une fois le lot écarté.
        store.Enqueue([new MeasurementRow(t.AddSeconds(1), "m-r01.o7.tension_dechet", 26, 0)]);
        await Attendre(() => Task.FromResult(journal.Lignes.Any(l => l.Niveau == LogLevel.Error && l.Message.Contains("écarté"))), "lot refusé puis écarté");
        await AttendreMesures(cs, 1);
    }
}

/// <summary>Base qui tombe après le démarrage : conteneur à part, arrêté en cours de test.</summary>
public class PostgresInjoignableTests
{
    [Timescale]
    public async Task Une_base_injoignable_reste_un_echec_provisoire()
    {
        await using var conteneur = new PostgreSqlBuilder(TimescaleFixture.Image).Build();
        await conteneur.StartAsync();
        var cs = new NpgsqlConnectionStringBuilder(conteneur.GetConnectionString()) { Timeout = 3 }.ConnectionString;
        await using var store = new PostgresStore(cs, new Journal<PostgresStore>());
        await store.InitializeAsync(TimescaleFixture.Data, CancellationToken.None);

        await conteneur.StopAsync();
        // D'abord la connexion du pool coupée par l'arrêt du serveur (57P01), puis la connexion refusée.
        var coupures = new List<NpgsqlException>();
        for (var i = 0; i < 3; i++)
            coupures.Add(await Assert.ThrowsAnyAsync<NpgsqlException>(() => store.SaveEventAsync("site-tours", new Evenement($"ev-coupure-{i}", "systeme", 0, "Coupure"))));
        store.Enqueue([new MeasurementRow(DateTimeOffset.UtcNow, "m-r01.o7.tension_dechet", 26, 0)]);
        var fin = DateTime.UtcNow.AddSeconds(30);
        while (store.Healthy && DateTime.UtcNow < fin) await Task.Delay(100);

        Assert.All(coupures, ex => Assert.False(store.IsPermanentFailure(ex), $"{ex.GetType().Name} {(ex as PostgresException)?.SqlState} : {ex.Message}"));
        Assert.IsNotType<PostgresException>(coupures[^1]);
        // L'écriture des mesures échoue : l'état de santé le dit (stockageOk de /api/health).
        Assert.False(store.Healthy);
    }
}
