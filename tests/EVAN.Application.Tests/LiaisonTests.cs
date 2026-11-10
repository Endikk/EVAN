using System.Text.Json;
using System.Text.Json.Serialization;
using EVAN.Application.Live;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Reference;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Application.Tests;

/// <summary>
/// Liaison perdue : une machine sans nouvelles depuis plus de 5 s, jamais vue, ou dont la passerelle s'est annoncée
/// hors ligne, est diffusée avec « horsLigne » (facteur 0, dernier état gardé). Horloge injectée.
/// </summary>
public class LiaisonTests
{
    private const string Site = "site-tours";
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    private sealed class Horloge(DateTimeOffset depart) : TimeProvider
    {
        public DateTimeOffset Maintenant { get; set; } = depart;
        public override DateTimeOffset GetUtcNow() => Maintenant;
    }

    private static (LiveService Live, Horloge Horloge) Banc(double? seuilSecondes = null)
    {
        var horloge = new Horloge(new DateTimeOffset(2026, 10, 8, 8, 0, 0, TimeSpan.Zero));
        var options = new LiveOptions();
        if (seuilSecondes is { } s) options.LiaisonPerdueSecondes = s;
        return (new LiveService(Data, new TestStore(), new TestNotifier(), new TestBus(), NullLogger<LiveService>.Instance, options, horloge), horloge);
    }

    private static TelemetryMessage Mesure(string machine, DateTimeOffset ts, string? passerelle = "tours-01") => new()
    {
        SiteId = Site, MachineId = machine, GatewayId = passerelle, Ts = ts, Metrics = [new Metric($"{machine}.o1.tension", 180)],
    };

    [Fact]
    public void Jamais_vue_puis_en_ligne_puis_hors_ligne_apres_5_s_chaque_bascule_part_seule()
    {
        var (live, h) = Banc();

        var initial = live.TakeTelemetry(Site);
        Assert.NotNull(initial);
        Assert.True(initial.Value.Machines["m-r01"].HorsLigne);
        Assert.Equal(0, initial.Value.Machines["m-r01"].Facteur);
        Assert.Null(live.TakeTelemetry(Site));

        live.HandleTelemetry(Mesure("m-r01", h.Maintenant), h.Maintenant);
        var enLigne = live.TakeTelemetry(Site);
        Assert.NotEqual(true, enLigne!.Value.Machines["m-r01"].HorsLigne);
        Assert.True(enLigne.Value.Machines["m-r02"].HorsLigne);

        h.Maintenant += TimeSpan.FromSeconds(4);
        Assert.Null(live.TakeTelemetry(Site));

        // Plus de 5 s sans nouvelles : le delta part alors qu'aucune autre valeur n'a changé.
        h.Maintenant += TimeSpan.FromSeconds(2);
        var perdue = live.TakeTelemetry(Site);
        Assert.NotNull(perdue);
        Assert.Empty(perdue.Value.Values);
        Assert.True(perdue.Value.Machines["m-r01"].HorsLigne);
        Assert.Null(live.TakeTelemetry(Site));

        live.HandleTelemetry(Mesure("m-r01", h.Maintenant), h.Maintenant);
        Assert.NotEqual(true, live.TakeTelemetry(Site)!.Value.Machines["m-r01"].HorsLigne);
    }

    [Fact]
    public void Hors_ligne_garde_le_dernier_etat_et_coupe_le_facteur()
    {
        var (live, h) = Banc();
        live.HandleState(new StateMessage { SiteId = Site, MachineId = "m-r01", Ts = h.Maintenant, Etat = "marche", Vitesse = 140, Facteur = 0.93 }, h.Maintenant);

        var enLigne = live.Direct(Site)!.Machines["m-r01"];
        Assert.Null(enLigne.HorsLigne);
        Assert.Equal(0.93, enLigne.Facteur);

        h.Maintenant += TimeSpan.FromSeconds(6);
        var perdue = live.Direct(Site)!.Machines["m-r01"];
        Assert.True(perdue.HorsLigne);
        Assert.Equal("marche", perdue.Etat);
        Assert.Equal(0, perdue.Facteur);
    }

    [Fact]
    public void Le_statut_offline_de_la_passerelle_coupe_aussitot_ses_seules_machines()
    {
        var (live, h) = Banc();
        live.HandleTelemetry(Mesure("m-r01", h.Maintenant), h.Maintenant);
        live.HandleTelemetry(Mesure("m-r02", h.Maintenant, "simulateur"), h.Maintenant);
        live.TakeTelemetry(Site);

        h.Maintenant += TimeSpan.FromSeconds(1);
        live.HandleGatewayStatus(Site, "tours-01", "offline", h.Maintenant);
        var coupe = live.TakeTelemetry(Site)!.Value.Machines;
        Assert.True(coupe["m-r01"].HorsLigne);
        Assert.NotEqual(true, coupe["m-r02"].HorsLigne);

        // Des données reçues après le statut offline prouvent que la passerelle est revenue.
        h.Maintenant += TimeSpan.FromSeconds(1);
        live.HandleTelemetry(Mesure("m-r01", h.Maintenant), h.Maintenant);
        Assert.NotEqual(true, live.TakeTelemetry(Site)!.Value.Machines["m-r01"].HorsLigne);

        live.HandleGatewayStatus(Site, "tours-01", "offline", h.Maintenant.AddMilliseconds(1));
        h.Maintenant += TimeSpan.FromSeconds(1);
        live.HandleGatewayStatus(Site, "tours-01", "online", h.Maintenant);
        live.HandleTelemetry(Mesure("m-r01", h.Maintenant), h.Maintenant);
        Assert.NotEqual(true, live.TakeTelemetry(Site)!.Value.Machines["m-r01"].HorsLigne);
    }

    [Fact]
    public void Le_delai_de_liaison_perdue_se_regle()
    {
        var (live, h) = Banc(seuilSecondes: 30);
        live.HandleTelemetry(Mesure("m-r01", h.Maintenant), h.Maintenant);

        h.Maintenant += TimeSpan.FromSeconds(20);
        Assert.Null(live.Direct(Site)!.Machines["m-r01"].HorsLigne);
        h.Maintenant += TimeSpan.FromSeconds(11);
        Assert.True(live.Direct(Site)!.Machines["m-r01"].HorsLigne);
    }

    [Fact]
    public void Le_champ_horsLigne_est_serialise_en_camelCase_et_absent_en_ligne()
    {
        var (live, h) = Banc();
        live.HandleTelemetry(Mesure("m-r01", h.Maintenant), h.Maintenant);
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

        var machines = JsonSerializer.SerializeToElement(live.Snapshot(Site), options).GetProperty("machines");

        Assert.False(machines.GetProperty("m-r01").TryGetProperty("horsLigne", out _));
        Assert.True(machines.GetProperty("m-r02").GetProperty("horsLigne").GetBoolean());
        Assert.Equal(0, machines.GetProperty("m-r02").GetProperty("facteur").GetDouble());
    }

    [Fact]
    public void Un_lot_non_envoye_repart_au_suivant()
    {
        var (live, h) = Banc();
        live.TakeTelemetry(Site);
        live.HandleTelemetry(Mesure("m-r01", h.Maintenant), h.Maintenant);
        var perdu = live.TakeTelemetry(Site)!.Value;
        Assert.Contains("m-r01.o1.tension", perdu.Values.Keys);

        live.RequeueTelemetry(Site, perdu.Values.Keys);

        var renvoye = live.TakeTelemetry(Site);
        Assert.NotNull(renvoye);
        Assert.Contains("m-r01.o1.tension", renvoye.Value.Values.Keys);
    }
}
