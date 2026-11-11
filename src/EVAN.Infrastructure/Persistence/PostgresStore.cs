using System.Reflection;
using System.Text.Json;
using System.Threading.Channels;
using Dapper;
using EVAN.Application.Abstractions;
using EVAN.Application.Observabilite;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Sites;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace EVAN.Infrastructure.Persistence;

/// <summary>
/// PostgreSQL + TimescaleDB. Les mesures passent par une file bornée et sont écrites par lots en COPY binaire
/// (des dizaines de milliers de lignes par seconde) ; le reste en SQL paramétré. Toute perte de mesure est comptée
/// et journalisée, et la file mesurée (evan.base.file et evan.base.perdues, file « mesures »). Le référentiel des
/// organisations réelles (comptes, usines enregistrées) est dans PostgresStore.Referentiel.cs.
/// </summary>
public sealed partial class PostgresStore : IStore, IComptesStore, IAsyncDisposable
{
    /// <summary>Schema.sql embarqué : le nom de la ressource suit l'espace de noms, qu'on renomme ou non le projet.</summary>
    private static readonly string SchemaResource = $"{typeof(PostgresStore).Namespace}.Schema.sql";

    private const int Capacite = 200_000;
    private const int LotMax = 20_000;
    /// <summary>Lot refusé par le serveur ce nombre de fois de suite : écarté, sinon il bloquerait tous les suivants.</summary>
    private const int RejetsMax = 5;
    /// <summary>Au plus ce nombre de points par courbe, quel que soit le pas demandé (garde-fou, l'API borne déjà le pas).</summary>
    private const int PointsMax = 5000;
    private static readonly TimeSpan AttenteMax = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan BilanPertes = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan VidageMax = TimeSpan.FromSeconds(5);

    private readonly NpgsqlDataSource _db;
    private readonly ILogger<PostgresStore> _log;
    private readonly Channel<MeasurementRow> _queue;
    private readonly CancellationTokenSource _cts = new();
    private Task? _writer;
    private volatile bool _ready;
    private volatile bool _writesOk = true;
    private volatile bool _closing;
    // Pertes de mesures : file pleine (les plus anciennes partent) et lots écartés après refus du serveur.
    private long _dropped;
    private long _discarded;
    private (long Dropped, long Discarded) _reported;
    private DateTime _lastReport = DateTime.UtcNow;

    public PostgresStore(string connectionString, ILogger<PostgresStore> log)
    {
        var builder = new NpgsqlDataSourceBuilder(connectionString);
        // Pas de Kerberos : sans cela Npgsql tente le chiffrement GSS à chaque connexion (erreur au démarrage sans libgssapi, aller-retour inutile).
        builder.ConnectionStringBuilder.GssEncryptionMode = GssEncryptionMode.Disable;
        _db = builder.Build();
        _log = log;
        _queue = Channel.CreateBounded<MeasurementRow>(new BoundedChannelOptions(Capacite)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        }, _ =>
        {
            Interlocked.Increment(ref _dropped);
            Metriques.EnFile(Metriques.FileMesures, -1);
            Metriques.Perdues(Metriques.FileMesures, "file_pleine");
        });
    }

    public string Kind => "timescaledb";
    public bool Healthy => _ready && _writesOk;

    /// <summary>Refus du serveur qui se reproduirait à l'identique ; avant la création du schéma, tout échec est provisoire.</summary>
    public bool IsPermanentFailure(Exception ex) => _ready && ex is PostgresException { IsTransient: false };

    /// <summary>Schéma et usine d'exemple. Réessaie sans limite (attente progressive jusqu'à 30 s) tant que la base ne répond pas.</summary>
    public async Task InitializeAsync(ReferenceData data, CancellationToken ct)
    {
        // L'écrivain démarre tout de suite : il garde les mesures et réessaie tant que la base n'est pas prête.
        _writer ??= Task.Run(() => WriteLoopAsync(_cts.Token), CancellationToken.None);
        var delay = TimeSpan.FromSeconds(1);
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await using var conn = await _db.OpenConnectionAsync(ct);
                await using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(SchemaResource)!;
                var sql = await new StreamReader(stream).ReadToEndAsync(ct);
                await conn.ExecuteAsync(new CommandDefinition(sql, cancellationToken: ct));
                // Migrations additives, chacune dans son fichier (PostgresStore.Carnet.cs) : rejouables, après le schéma.
                await using var carnet = Assembly.GetExecutingAssembly().GetManifestResourceStream(CarnetResource)!;
                await conn.ExecuteAsync(new CommandDefinition(await new StreamReader(carnet).ReadToEndAsync(ct), cancellationToken: ct));
                await SeedAsync(conn, data, ct);
                _organisationDemo = data.Demo.Organisation.Id;
                _ready = true;
                break;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                _log.LogWarning(ex, "Base indisponible (essai {Attempt}), nouvel essai dans {Delay} s", attempt, delay.TotalSeconds);
                await Task.Delay(delay, ct);
                delay = TimeSpan.FromTicks(Math.Min(delay.Ticks * 2, AttenteMax.Ticks));
            }
        }
        _log.LogInformation("TimescaleDB prêt");
    }

    /// <summary>Organisation d'exemple et ses usines, insérées une fois (ON CONFLICT DO NOTHING).</summary>
    private static async Task SeedAsync(NpgsqlConnection conn, ReferenceData data, CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition("INSERT INTO organisations (id, nom) VALUES (@Id, @Nom) ON CONFLICT DO NOTHING", data.Demo.Organisation, tx, cancellationToken: ct));
        foreach (var usine in data.Demo.Usines) await SeedUsineAsync(conn, tx, usine, data, ct);
        await tx.CommitAsync(ct);
    }

    private static async Task SeedUsineAsync(NpgsqlConnection conn, NpgsqlTransaction tx, DemoUsine demo, ReferenceData data, CancellationToken ct)
    {
        string J(object o) => JsonSerializer.Serialize(o, Json.Options);
        Task Run(string sql, object args) => conn.ExecuteAsync(new CommandDefinition(sql, args, tx, cancellationToken: ct));
        var s = demo.Site;
        await Run(
            "INSERT INTO sites (id, organisation_id, nom, adresse, lon, lat, repere, siret, passerelle) VALUES (@Id, @Org, @Nom, @Adresse, @Lon, @Lat, @Repere::jsonb, @Siret, @Passerelle) ON CONFLICT DO NOTHING",
            new { s.Id, Org = s.OrganisationId, s.Nom, s.Adresse, Lon = s.Coordonnees[0], Lat = s.Coordonnees[1], Repere = J(s.Repere), s.Siret, s.Passerelle });
        foreach (var b in demo.Batiments)
        {
            await Run(
                """
                INSERT INTO batiments (id, site_id, nom, contour, sigmas, hauteur, niveaux, source, source_ref, rnb, usage, precision_source)
                VALUES (@Id, @SiteId, @Nom, @Contour::jsonb, @Sigmas::jsonb, @Hauteur, @Niveaux, @Source, @SourceRef, @Rnb, @Usage, @PrecisionSource)
                ON CONFLICT DO NOTHING
                """,
                new { b.Id, b.SiteId, b.Nom, Contour = J(b.Contour), Sigmas = J(b.Sigmas), b.Hauteur, b.Niveaux, b.Source, b.SourceRef, b.Rnb, b.Usage, b.PrecisionSource });
        }
        foreach (var z in demo.Zones)
        {
            await Run("INSERT INTO zones (id, batiment_id, nom, type, polygone) VALUES (@Id, @BatimentId, @Nom, @Type, @Polygone::jsonb) ON CONFLICT DO NOTHING",
                new { z.Id, z.BatimentId, z.Nom, z.Type, Polygone = J(z.Polygone) });
        }
        foreach (var m in demo.Machines)
        {
            await Run(
                "INSERT INTO machines (id, batiment_id, zone_id, type, nom, numero, x, z, rotation_deg, modele_url) VALUES (@Id, @BatimentId, @ZoneId, @Type, @Nom, @Numero, @X, @Z, @RotationDeg, @Url) ON CONFLICT DO NOTHING",
                new { m.Id, m.BatimentId, m.ZoneId, m.Type, m.Nom, m.Numero, X = m.Position[0], Z = m.Position[1], m.RotationDeg, m.Modele.Url });
            var model = data.Model(m);
            foreach (var o in model.Organes)
            {
                await Run("INSERT INTO organes (id, machine_id, numero, nom, noeud_3d, position) VALUES (@Id, @MachineId, @Numero, @Nom, @Noeud3d, @Position::jsonb) ON CONFLICT DO NOTHING",
                    new { o.Id, o.MachineId, o.Numero, o.Nom, o.Noeud3d, Position = o.Position is null ? null : J(o.Position) });
            }
            foreach (var p in model.Points)
            {
                await Run(
                    "INSERT INTO points_mesure (id, machine_id, organe_id, cle, libelle, type, unite, nominal, seuils) VALUES (@Id, @MachineId, @OrganeId, @Cle, @Libelle, @Type, @Unite, @Nominal, @Seuils::jsonb) ON CONFLICT DO NOTHING",
                    new { p.Id, p.MachineId, p.OrganeId, p.Cle, p.Libelle, p.Type, p.Unite, p.Nominal, Seuils = J(p.Seuils) });
            }
        }
    }

    public void Enqueue(IEnumerable<MeasurementRow> rows)
    {
        // Compté une fois par message reçu, pas par ligne. L'écrivain attend 250 ms avant de lire : le compte entre presque
        // toujours avant la sortie, et un écart passager se résorbe dès cet appel terminé.
        var entrees = 0;
        foreach (var r in rows)
        {
            if (_queue.Writer.TryWrite(r)) entrees++;
        }
        Metriques.EnFile(Metriques.FileMesures, entrees);
    }

    private async Task WriteLoopAsync(CancellationToken ct)
    {
        var batch = new List<MeasurementRow>(5000);
        var rejets = 0;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (batch.Count == 0)
                {
                    // File fermée (arrêt) et vide : tout est écrit.
                    if (!await _queue.Reader.WaitToReadAsync(ct)) break;
                    // Petite fenêtre pour regrouper les échantillons d'une même seconde (pas pendant le vidage final).
                    if (!_closing) await Task.Delay(250, ct);
                }
                // Un lot refusé par le serveur est réessayé tel quel : les mesures arrivées entre-temps attendent dans la
                // file au lieu d'être écartées avec lui. Une base injoignable, elle, laisse le lot grossir jusqu'à LotMax.
                if (rejets == 0)
                    while (batch.Count < LotMax && _queue.Reader.TryRead(out var r)) batch.Add(r);
                await CopyAsync(batch, ct);
                Metriques.EnFile(Metriques.FileMesures, -batch.Count);
                batch.Clear();
                rejets = 0;
                _writesOk = true;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _writesOk = false;
                if (IsPermanentFailure(ex) && ++rejets >= RejetsMax)
                {
                    _log.LogError(ex, "Lot de {Count} mesures refusé {Rejets} fois par le serveur : écarté", batch.Count, rejets);
                    Interlocked.Add(ref _discarded, batch.Count);
                    Metriques.EnFile(Metriques.FileMesures, -batch.Count);
                    Metriques.Perdues(Metriques.FileMesures, "refus", batch.Count);
                    batch.Clear();
                    rejets = 0;
                }
                else
                {
                    // Avant la création du schéma, l'échec est attendu : l'initialisation journalise déjà la cause.
                    if (_ready) _log.LogWarning("Écriture des mesures en échec ({Message}), {Count} lignes conservées pour le prochain essai", ex.Message, batch.Count);
                    await Task.Delay(_closing ? 200 : 2000, ct).ContinueWith(_ => { });
                }
            }
            ReportLosses();
        }
        if (batch.Count > 0) _log.LogWarning("Arrêt : lot de {Count} mesures non écrit", batch.Count);
        Metriques.EnFile(Metriques.FileMesures, -batch.Count);
        ReportLosses(force: true);
    }

    private async Task CopyAsync(List<MeasurementRow> batch, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var import = await conn.BeginBinaryImportAsync("COPY mesures (temps, point_id, valeur, qualite) FROM STDIN (FORMAT BINARY)", ct);
        foreach (var r in batch)
        {
            await import.StartRowAsync(ct);
            await import.WriteAsync(r.Time.UtcDateTime, NpgsqlDbType.TimestampTz, ct);
            await import.WriteAsync(r.PointId, NpgsqlDbType.Text, ct);
            await import.WriteAsync(r.Value, NpgsqlDbType.Double, ct);
            await import.WriteAsync(r.Quality, NpgsqlDbType.Smallint, ct);
        }
        await import.CompleteAsync(ct);
    }

    /// <summary>Bilan des mesures perdues depuis le précédent, au plus toutes les 30 s.</summary>
    private void ReportLosses(bool force = false)
    {
        if (!force && DateTime.UtcNow - _lastReport < BilanPertes) return;
        _lastReport = DateTime.UtcNow;
        var current = (Interlocked.Read(ref _dropped), Interlocked.Read(ref _discarded));
        if (current == _reported) return;
        _log.LogWarning("Mesures perdues : {Dropped} (file pleine) et {Discarded} (lots refusés) depuis le dernier bilan ; {TotalDropped} et {TotalDiscarded} depuis le démarrage",
            current.Item1 - _reported.Dropped, current.Item2 - _reported.Discarded, current.Item1, current.Item2);
        _reported = current;
    }

    public async Task SaveAlarmAsync(string siteId, Alarme a, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        // Garde d'ordre : une alarme résolue en base ne repasse jamais « active » ni « acquittée ».
        await conn.ExecuteAsync(new CommandDefinition(
            """
            INSERT INTO alarmes (id, site_id, machine_id, organe_id, point_id, code, message, gravite, regle, statut, horodatage, fin_le, valeur, unite, seuil, cause, acquittee_par, acquittee_le, repetitions)
            VALUES (@Id, @SiteId, @MachineId, @OrganeId, @PointId, @Code, @Message, @Gravite, @Regle, @Statut, @Horodatage, @FinLe, @Valeur, @Unite, @Seuil, @Cause, @AcquitteePar, @AcquitteeLe, @Repetitions)
            ON CONFLICT (id) DO UPDATE SET statut = EXCLUDED.statut, fin_le = EXCLUDED.fin_le, message = EXCLUDED.message,
                valeur = EXCLUDED.valeur, acquittee_par = EXCLUDED.acquittee_par, acquittee_le = EXCLUDED.acquittee_le
            WHERE alarmes.statut <> 'resolue'
            """,
            new
            {
                a.Id, SiteId = siteId, a.MachineId, a.OrganeId, a.PointId, a.Code, a.Message, a.Gravite, a.Regle, a.Statut,
                Horodatage = Utc(a.Horodatage),
                FinLe = a.FinLe is { } f ? Utc(f) : (DateTime?)null,
                a.Valeur, a.Unite, a.Seuil, a.Cause, a.AcquitteePar,
                AcquitteeLe = a.AcquitteeLe is { } q ? Utc(q) : (DateTime?)null,
                a.Repetitions,
            },
            cancellationToken: ct));
    }

    /// <summary>
    /// Clôture annulée : l'alarme reprend son statut d'avant (active ou acquittée), sans fin. Seule écriture qui fasse
    /// repasser une alarme résolue à ouverte ; elle passe par la même file que les autres, donc dans l'ordre.
    /// </summary>
    public async Task ReopenAlarmAsync(string siteId, Alarme a, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            """
            INSERT INTO alarmes (id, site_id, machine_id, organe_id, point_id, code, message, gravite, regle, statut, horodatage, fin_le, valeur, unite, seuil, cause, acquittee_par, acquittee_le, repetitions)
            VALUES (@Id, @SiteId, @MachineId, @OrganeId, @PointId, @Code, @Message, @Gravite, @Regle, @Statut, @Horodatage, NULL, @Valeur, @Unite, @Seuil, @Cause, @AcquitteePar, @AcquitteeLe, @Repetitions)
            ON CONFLICT (id) DO UPDATE SET statut = EXCLUDED.statut, fin_le = NULL, acquittee_par = EXCLUDED.acquittee_par, acquittee_le = EXCLUDED.acquittee_le
            WHERE alarmes.site_id = EXCLUDED.site_id
            """,
            new
            {
                a.Id, SiteId = siteId, a.MachineId, a.OrganeId, a.PointId, a.Code, a.Message, a.Gravite, a.Regle, a.Statut,
                Horodatage = Utc(a.Horodatage),
                a.Valeur, a.Unite, a.Seuil, a.Cause, a.AcquitteePar,
                AcquitteeLe = a.AcquitteeLe is { } q ? Utc(q) : (DateTime?)null,
                a.Repetitions,
            },
            cancellationToken: ct));
    }

    private static DateTime Utc(long ms) => DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime;

    private static long Ms(DateTime t) => new DateTimeOffset(t, TimeSpan.Zero).ToUnixTimeMilliseconds();

    public async Task SaveEventAsync(string siteId, Evenement e, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO evenements (id, site_id, machine_id, type, message, auteur, horodatage) VALUES (@Id, @SiteId, @MachineId, @Type, @Message, @Auteur, @T) ON CONFLICT DO NOTHING",
            new { e.Id, SiteId = siteId, e.MachineId, e.Type, e.Message, e.Auteur, T = Utc(e.Horodatage) },
            cancellationToken: ct));
    }

    public async Task SaveMachineStateAsync(string machineId, string etat, double vitesse, DateTimeOffset t, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO etats_machine (temps, machine_id, etat, vitesse) VALUES (@T, @MachineId, @Etat, @Vitesse)",
            new { T = t.UtcDateTime, MachineId = machineId, Etat = etat, Vitesse = vitesse },
            cancellationToken: ct));
    }

    private sealed record AlarmRow(string Id, string MachineId, string OrganeId, string? PointId, string Code, string Message, string Gravite, string Regle, string Statut,
        DateTime Horodatage, DateTime? FinLe, double? Valeur, string? Unite, double? Seuil, string? Cause, string? AcquitteePar, DateTime? AcquitteeLe, int? Repetitions);

    private const string AlarmColumns =
        """
        SELECT id, machine_id AS MachineId, organe_id AS OrganeId, point_id AS PointId, code, message, gravite, regle, statut, horodatage, fin_le AS FinLe,
               valeur, unite, seuil, cause, acquittee_par AS AcquitteePar, acquittee_le AS AcquitteeLe, repetitions
        FROM alarmes
        """;

    private static Alarme ToAlarme(AlarmRow r) => new()
    {
        Id = r.Id, MachineId = r.MachineId, OrganeId = r.OrganeId, PointId = r.PointId, Code = r.Code, Message = r.Message, Gravite = r.Gravite, Regle = r.Regle,
        Statut = r.Statut, Horodatage = Ms(r.Horodatage), FinLe = r.FinLe is { } f ? Ms(f) : null,
        Valeur = r.Valeur, Unite = r.Unite, Seuil = r.Seuil, Cause = r.Cause, AcquitteePar = r.AcquitteePar,
        AcquitteeLe = r.AcquitteeLe is { } q ? Ms(q) : null, Repetitions = r.Repetitions,
    };

    public async Task<IReadOnlyList<Alarme>> AlarmsAsync(string siteId, DateTimeOffset from, DateTimeOffset to, string? machineId, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<AlarmRow>(new CommandDefinition(
            $"""
            {AlarmColumns}
            WHERE site_id = @siteId AND horodatage BETWEEN @from AND @to AND (@machineId::text IS NULL OR machine_id = @machineId)
            ORDER BY horodatage DESC
            LIMIT 2000
            """,
            new { siteId, from = from.UtcDateTime, to = to.UtcDateTime, machineId },
            cancellationToken: ct));
        return rows.Select(ToAlarme).ToList();
    }

    public async Task<IReadOnlyList<Alarme>> UnresolvedAlarmsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<AlarmRow>(new CommandDefinition(
            $"""
            {AlarmColumns}
            WHERE site_id = @siteId AND statut <> 'resolue' AND horodatage >= @from
            ORDER BY horodatage DESC
            LIMIT 2000
            """,
            new { siteId, from = from.UtcDateTime },
            cancellationToken: ct));
        return rows.Select(ToAlarme).ToList();
    }

    public async Task<IReadOnlyList<SeriesPoint>> SeriesAsync(string pointId, DateTimeOffset from, DateTimeOffset to, TimeSpan bucket, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        // Au-delà de 6 h, l'agrégat continu à la minute suffit et coûte bien moins cher. Sa moyenne est pondérée par le
        // nombre d'échantillons de chaque minute : une moyenne de moyennes fausserait les minutes incomplètes.
        var useAggregate = to - from > TimeSpan.FromHours(6) && bucket >= TimeSpan.FromMinutes(1);
        var sql = useAggregate
            ? "SELECT time_bucket(@bucket, bucket) AS t, sum(moyenne * n) / nullif(sum(n), 0)::double precision AS avg, min(mini) AS min, max(maxi) AS max FROM mesures_1min WHERE point_id = @pointId AND bucket BETWEEN @from AND @to GROUP BY 1 ORDER BY 1 LIMIT @limit"
            : "SELECT time_bucket(@bucket, temps) AS t, avg(valeur) AS avg, min(valeur) AS min, max(valeur) AS max FROM mesures WHERE point_id = @pointId AND temps BETWEEN @from AND @to GROUP BY 1 ORDER BY 1 LIMIT @limit";
        var rows = await conn.QueryAsync<(DateTime T, double Avg, double Min, double Max)>(new CommandDefinition(
            sql, new { bucket, pointId, from = from.UtcDateTime, to = to.UtcDateTime, limit = PointsMax }, cancellationToken: ct));
        return rows.Select(r => new SeriesPoint(Ms(r.T), r.Avg, r.Min, r.Max)).ToList();
    }

    public async Task<IReadOnlyList<Evenement>> EventsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<(string Id, string Type, DateTime T, string Message, string? MachineId, string? Auteur)>(new CommandDefinition(
            "SELECT id, type, horodatage, message, machine_id, auteur FROM evenements WHERE site_id = @siteId AND horodatage >= @from ORDER BY horodatage DESC LIMIT 1000",
            new { siteId, from = from.UtcDateTime },
            cancellationToken: ct));
        return rows.Select(r => new Evenement(r.Id, r.Type, Ms(r.T), r.Message, r.MachineId, r.Auteur)).ToList();
    }

    /// <summary>Arrêt : la file est fermée puis vidée en base (5 s au plus), ensuite seulement l'écriture est annulée.</summary>
    public async ValueTask DisposeAsync()
    {
        _closing = true;
        _queue.Writer.TryComplete();
        if (_writer is not null && await Task.WhenAny(_writer, Task.Delay(VidageMax)) != _writer)
            _log.LogWarning("Arrêt : mesures encore en file après {Delay} s, abandonnées", VidageMax.TotalSeconds);
        else if (_writer is null && _queue.Reader.Count > 0)
            _log.LogWarning("Arrêt : {Count} mesures jamais écrites (base jamais prête)", _queue.Reader.Count);
        await _cts.CancelAsync();
        if (_writer is not null) await _writer.ContinueWith(_ => { });
        // Mesures restées en file : jamais écrites, elles sortent du compte.
        Metriques.EnFile(Metriques.FileMesures, -_queue.Reader.Count);
        await _db.DisposeAsync();
        _cts.Dispose();
    }
}
