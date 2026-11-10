using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using EVAN.Gateway.Publishing;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Gateway.Tests;

/// <summary>Les mesures sont statiques : ces tests tournent seuls, aucun autre test ne compte en même temps qu'eux.</summary>
[CollectionDefinition(nameof(MesuresSeules), DisableParallelization = true)]
public sealed class MesuresSeules;

/// <summary>La file d'envoi mesurée revient à zéro quand le broker accuse, et chaque message perdu est compté avec son motif.</summary>
[Collection(nameof(MesuresSeules))]
public sealed class MesuresEnvoiTests : IDisposable
{
    private readonly MeterListener _ecoute = new();
    private readonly ConcurrentDictionary<string, long> _sommes = new();

    public MesuresEnvoiTests()
    {
        _ecoute.InstrumentPublished = (instrument, ecoute) =>
        {
            if (instrument.Meter.Name == MesuresEnvoi.Nom) ecoute.EnableMeasurementEvents(instrument);
        };
        _ecoute.SetMeasurementEventCallback<long>((instrument, valeur, etiquettes, _) =>
        {
            var cle = instrument.Name + string.Concat(etiquettes.ToArray().Select(e => $"|{e.Key}={e.Value}"));
            _sommes.AddOrUpdate(cle, valeur, (_, somme) => somme + valeur);
        });
        _ecoute.Start();
    }

    public void Dispose() => _ecoute.Dispose();

    private long Somme(string cle) => _sommes.GetValueOrDefault(cle);

    private static TelemetryPublisher Publisher(int capacite = 100) =>
        new(new GatewayOptions { SiteId = "site-tours", GatewayId = "tours-01", BufferCapacity = capacite }, NullLogger<TelemetryPublisher>.Instance,
            (_, _, _) => Task.FromResult(true), () => true);

    private static PlcAlarmMessage Alarme(string code) => new() { SiteId = "site-tours", MachineId = "m-pv01", Ts = DateTimeOffset.UtcNow, Code = code, Active = true };

    [Fact]
    public async Task La_file_revient_a_zero_quand_le_broker_accuse()
    {
        var p = Publisher();
        p.State("m-pv01", "marche");
        p.Alarm(Alarme("AU-1"));
        p.Tick(DateTimeOffset.UtcNow);
        Assert.Equal(2, Somme("evan.passerelle.file"));

        var envoi = new OutboxSender(p.Outbox, (_, _, _) => Task.FromResult(true), () => true, NullLogger.Instance);
        await envoi.SendOnceAsync(CancellationToken.None);

        Assert.Equal(0, Somme("evan.passerelle.file"));
        Assert.Equal(0, Somme("evan.passerelle.perdus|motif=file_pleine"));
    }

    [Fact]
    public void File_pleine_le_plus_ancien_part_et_il_est_compte()
    {
        var p = Publisher(capacite: 1);
        p.Alarm(Alarme("AU-1"));
        p.Alarm(Alarme("AU-2"));

        Assert.Equal(1, Somme("evan.passerelle.file"));
        Assert.Equal(1, Somme("evan.passerelle.perdus|motif=file_pleine"));
    }

    [Fact]
    public async Task Un_message_refuse_par_le_broker_joignable_finit_abandonne_et_compte()
    {
        var p = Publisher();
        p.Alarm(Alarme("AU-1"));
        var envoi = new OutboxSender(p.Outbox, (_, _, _) => Task.FromResult(false), () => true, NullLogger.Instance);

        for (var i = 0; i < OutboxSender.RefusMax; i++) await envoi.SendOnceAsync(CancellationToken.None);

        Assert.Equal(0, envoi.EnAttente);
        Assert.Equal(0, Somme("evan.passerelle.file"));
        Assert.Equal(1, Somme("evan.passerelle.perdus|motif=refus"));
    }
}
