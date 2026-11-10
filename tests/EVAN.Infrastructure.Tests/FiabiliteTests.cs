using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;

namespace EVAN.Infrastructure.Tests;

/// <summary>Adaptateurs sous charge : historique simulé calculé une fois malgré les requêtes concurrentes, stockage mémoire borné.</summary>
public class FiabiliteTests
{
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    [Fact]
    public async Task L_historique_d_une_heure_est_calcule_une_seule_fois_pour_des_lectures_concurrentes()
    {
        var reader = new SimulatedHistoryReader(Data);
        var machines = Data.Demo.Usine("site-tours")!.Machines;
        const long maintenant = 1791448200000;

        var lectures = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() => reader.Lire(machines, maintenant))));

        Assert.All(lectures, h => Assert.Same(lectures[0], h));
    }

    [Fact]
    public async Task Le_stockage_memoire_borne_ses_alarmes_en_gardant_les_ouvertes()
    {
        var store = new MemoryStore();
        var t0 = DateTimeOffset.UtcNow.AddHours(-1).ToUnixTimeMilliseconds();
        await store.SaveAlarmAsync("site-tours", Alarme("ouverte", t0, "active"));
        for (var i = 0; i < 20_000; i++) await store.SaveAlarmAsync("site-tours", Alarme($"al-{i}", t0 + i, "resolue"));

        var toutes = await store.AlarmsAsync("site-tours", DateTimeOffset.UnixEpoch, DateTimeOffset.UtcNow, null);

        Assert.True(toutes.Count <= 10_000, $"{toutes.Count} alarmes gardées en mémoire");
        Assert.Contains(toutes, a => a.Id == "ouverte");
    }

    private static Alarme Alarme(string id, long t, string statut) => new()
    {
        Id = id,
        Code = "TB-101",
        Message = "Tension",
        Gravite = "critique",
        MachineId = "m-r01",
        OrganeId = "m-r01.o1",
        Horodatage = t,
        Statut = statut,
    };
}
