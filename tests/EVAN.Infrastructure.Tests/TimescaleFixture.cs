using System.Collections.Concurrent;
using DotNet.Testcontainers.Configurations;
using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using Microsoft.Extensions.Logging;
using Npgsql;
using Testcontainers.PostgreSql;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// Test sur une vraie base TimescaleDB, lancée par Testcontainers. Sans Docker joignable, ignoré avec la raison ; en CI
/// (CI=true), jamais ignoré : une CI sans Docker doit échouer, pas passer au vert sans avoir joué ces tests.
/// </summary>
public sealed class TimescaleAttribute : FactAttribute
{
    /// <summary>Pourquoi ces tests ne peuvent pas tourner sur ce poste, ou null si Docker répond.</summary>
    internal static readonly Lazy<string?> Absence = new(ChercherDocker);

    public TimescaleAttribute()
    {
        if (Absence.Value is { } raison) Skip = raison;
    }

    private static string? ChercherDocker()
    {
        if (Environment.GetEnvironmentVariable("CI") == "true") return null;
        const string Aide = "Tests TimescaleDB ignorés : Docker introuvable (DOCKER_HOST, ~/.testcontainers.properties ou socket par défaut). Voir docs/ARCHITECTURE.md § 9.";
        try
        {
            // Testcontainers cherche le démon comme il le fera pour lancer le conteneur : variables, fichier de réglages, sockets connus.
            return TestcontainersSettings.OS.DockerEndpointAuthConfig is null ? Aide : null;
        }
        catch (Exception ex)
        {
            return $"{Aide} ({ex.Message})";
        }
    }
}

/// <summary>
/// Un conteneur TimescaleDB pour toute la collection (même image que docker-compose.yml) ; chaque test prend une base
/// neuve, si bien qu'aucun ne dépend de ce qu'un autre a écrit.
/// </summary>
public sealed class TimescaleFixture : IAsyncLifetime
{
    public const string Image = "timescale/timescaledb:2.30.2-pg17";

    private PostgreSqlContainer? _conteneur;

    public static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    public async Task InitializeAsync()
    {
        // Sans Docker, les tests sont ignorés : pas de conteneur à démarrer.
        if (TimescaleAttribute.Absence.Value is not null) return;
        _conteneur = new PostgreSqlBuilder(Image).Build();
        await _conteneur.StartAsync();
    }

    public async Task DisposeAsync()
    {
        if (_conteneur is not null) await _conteneur.DisposeAsync();
    }

    /// <summary>Crée une base vide dans le conteneur et rend sa chaîne de connexion.</summary>
    public async Task<string> NouvelleBaseAsync()
    {
        var serveur = _conteneur?.GetConnectionString() ?? throw new InvalidOperationException("Conteneur TimescaleDB non démarré.");
        // Nom tiré d'un Guid : sûr dans une instruction DDL, qui n'accepte pas de paramètre.
        var nom = $"evan_{Guid.NewGuid():N}";
        await using (var conn = new NpgsqlConnection(serveur))
        {
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand($"CREATE DATABASE {nom}", conn);
            await cmd.ExecuteNonQueryAsync();
        }
        return new NpgsqlConnectionStringBuilder(serveur) { Database = nom }.ConnectionString;
    }

    /// <summary>Base neuve, schéma et usine d'exemple créés : le stockage tel que l'API le trouve au démarrage.</summary>
    public async Task<(PostgresStore Store, string Base)> StockagePretAsync(Journal<PostgresStore>? journal = null)
    {
        var cs = await NouvelleBaseAsync();
        var store = new PostgresStore(cs, journal ?? new Journal<PostgresStore>());
        using var delai = new CancellationTokenSource(TimeSpan.FromMinutes(1));
        await store.InitializeAsync(Data, delai.Token);
        return (store, cs);
    }
}

[CollectionDefinition(Nom)]
public sealed class TimescaleCollection : ICollectionFixture<TimescaleFixture>
{
    public const string Nom = "TimescaleDB";
}

/// <summary>Journal qui garde ce que le stockage écrit, pour attendre ou vérifier un message précis.</summary>
public sealed class Journal<T> : ILogger<T>
{
    public readonly ConcurrentQueue<(LogLevel Niveau, string Message)> Lignes = new();

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel logLevel) => true;
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
        Lignes.Enqueue((logLevel, formatter(state, exception)));
}
