using System.Text.Json;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using EVAN.Gateway.Publishing;
using EVAN.Gateway.Security;
using EVAN.Gateway.Sources;
using EVAN.Messaging;

namespace EVAN.Gateway;

/// <summary>
/// Passerelle edge : lit chaque machine configurée dans son protocole, publie vers le back,
/// répond aux tests de liaison (vers les seules cibles permises) et filtre les demandes d'écriture.
/// Connexions sortantes uniquement.
/// </summary>
public sealed class GatewayWorker(
    GatewayOptions options,
    MqttConnection mqtt,
    TelemetryPublisher publisher,
    WriteGuard guard,
    GardeTestLiaison cibles,
    MachineSourceFactory sources,
    ILogger<GatewayWorker> log) : BackgroundService
{
    private IMachineSource Source(string protocol) => sources.Create(protocol);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        mqtt.Subscribe(Topics.GatewayCommand(options.SiteId, options.GatewayId, "test"));
        mqtt.Subscribe(Topics.GatewayCommand(options.SiteId, options.GatewayId, "write"));
        mqtt.MessageReceived += (topic, payload) => OnCommandAsync(topic, payload, stoppingToken);
        await mqtt.StartAsync(stoppingToken);

        var presence = Supervision.RunAsync("présence", PresenceAsync, log, stoppingToken);

        log.LogInformation("Passerelle {Gateway} : {Count} machines, écriture {Write}", options.GatewayId, options.Connections.Count, options.AllowWrites ? "AUTORISÉE" : "interdite (lecture seule)");
        var tasks = options.Connections.Select(c => Task.Run(async () =>
        {
            try
            {
                await Source(c.Protocol).RunAsync(c, publisher, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                // Source arrêtée : la machine ne doit pas rester annoncée dans son dernier état.
                publisher.Lost(c.MachineId);
                log.LogError(ex, "Source {Protocol} de {Machine} arrêtée", c.Protocol, c.MachineId);
            }
        }, stoppingToken)).ToList();
        await Task.WhenAll(tasks.Append(presence));
    }

    /// <summary>
    /// Présence : « online » conservé par le broker ; s'il perd la passerelle, il publie le message de dernière volonté.
    /// Republiée toutes les 30 s, et aussitôt après une reconnexion (le statut retenu est alors « offline »).
    /// </summary>
    private async Task PresenceAsync(CancellationToken ct)
    {
        var annonce = DateTimeOffset.MinValue;
        var connecte = false;
        while (!ct.IsCancellationRequested)
        {
            var maintenant = mqtt.IsConnected;
            if (maintenant && (!connecte || DateTimeOffset.UtcNow - annonce >= TimeSpan.FromSeconds(30)))
            {
                var publie = await mqtt.PublishAsync(Topics.GatewayStatus(options.SiteId, options.GatewayId),
                    new GatewayStatus(options.GatewayId, "online", DateTimeOffset.UtcNow, typeof(GatewayWorker).Assembly.GetName().Version?.ToString(), options.Connections.Count),
                    retain: true, ct: ct);
                if (publie) annonce = DateTimeOffset.UtcNow;
                else maintenant = false;
            }
            connecte = maintenant;
            await Task.Delay(TimeSpan.FromSeconds(2), ct).ContinueWith(_ => { });
        }
    }

    /// <summary>
    /// Test de liaison : la garde décide d'abord, la source n'est appelée que pour une cible permise, et joint l'adresse
    /// que la garde a vérifiée. Un refus revient au back comme une étape en échec, sans qu'aucune connexion soit ouverte.
    /// </summary>
    internal static async Task<ConnectionTestReply> TesterAsync(ConnectionTestRequest req, GardeTestLiaison garde, Func<string, IMachineSource> source, CancellationToken ct)
    {
        try
        {
            var decision = await garde.EvaluerAsync(req, ct);
            if (decision.Cible is not { } cible)
                return new ConnectionTestReply { RequestId = req.RequestId, Steps = { new TestStep(decision.Etape, false) } };
            return await source(req.Protocole).TestAsync(req, cible.Adresse, ct);
        }
        catch (Exception ex)
        {
            return new ConnectionTestReply { RequestId = req.RequestId, Steps = { new TestStep(ex.Message, false) } };
        }
    }

    private async Task OnCommandAsync(string topic, ReadOnlyMemory<byte> payload, CancellationToken ct)
    {
        if (topic.EndsWith("/cmd/test") && JsonSerializer.Deserialize<ConnectionTestRequest>(payload.Span, Json.Options) is { } req)
        {
            var reply = await TesterAsync(req, cibles, Source, ct);
            reply.Steps.Insert(0, new TestStep($"Passerelle « {options.GatewayId} » : demande reçue", true));
            await mqtt.PublishAsync(Topics.GatewayReply(options.SiteId, options.GatewayId, req.RequestId), reply, ct: ct);
        }
        else if (topic.EndsWith("/cmd/write") && JsonSerializer.Deserialize<WriteCommand>(payload.Span, Json.Options) is { } cmd)
        {
            var (allowed, reason) = await guard.AuthorizeAsync(cmd, ct);
            var connection = options.Connections.FirstOrDefault(c => c.MachineId == cmd.MachineId);
            string statut = "refusee", detail = reason;
            if (allowed && connection is not null && Source(connection.Protocol) is IWritableSource writable)
            {
                try
                {
                    await writable.WriteAsync(cmd.MachineId, cmd.Address, cmd.Value, ct);
                    (statut, detail) = ("ecrite", "Valeur écrite dans l'automate");
                }
                catch (Exception ex)
                {
                    (statut, detail) = ("echec", ex.Message);
                }
                await guard.AuditResultAsync(cmd, statut, detail, ct);
            }
            else if (allowed)
            {
                detail = "Écriture non prise en charge pour ce protocole";
                await guard.AuditResultAsync(cmd, "refusee", detail, ct);
            }
            await mqtt.PublishAsync(Topics.GatewayReply(options.SiteId, options.GatewayId, cmd.RequestId), new { cmd.RequestId, statut, detail }, ct: ct);
        }
    }
}
