using System.Text.RegularExpressions;
using EVAN.Infrastructure.Persistence;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// Politiques TimescaleDB du schéma embarqué : la compression ne doit jamais rattraper ce qui s'écrit encore (mesures en
/// retard, fenêtre de rafraîchissement de l'agrégat), sinon chaque écriture décompresse un bloc entier.
/// </summary>
public class SchemaTests
{
    /// <summary>Retard d'horodatage accepté par l'API (LiveService.EcartHorlogeMax).</summary>
    private static readonly TimeSpan RetardAccepte = TimeSpan.FromDays(1);

    private static readonly string Sql = LireSchema();

    private static string LireSchema()
    {
        using var stream = typeof(PostgresStore).Assembly.GetManifestResourceStream($"{typeof(PostgresStore).Namespace}.Schema.sql")!;
        return new StreamReader(stream).ReadToEnd();
    }

    private static TimeSpan Intervalle(string motif)
    {
        var m = Regex.Match(Sql, motif);
        Assert.True(m.Success, $"Absent du schéma : {motif}");
        var p = Regex.Match(m.Groups[1].Value, @"^(\d+) (minute|hour|day)s?$");
        Assert.True(p.Success, $"Intervalle non reconnu : {m.Groups[1].Value}");
        var n = int.Parse(p.Groups[1].Value);
        return p.Groups[2].Value switch
        {
            "minute" => TimeSpan.FromMinutes(n),
            "hour" => TimeSpan.FromHours(n),
            _ => TimeSpan.FromDays(n),
        };
    }

    [Fact]
    public void Les_mesures_sont_compressees_apres_le_retard_d_horodatage_accepte()
    {
        var compression = Intervalle(@"add_compression_policy\('mesures', INTERVAL '([^']+)'");

        Assert.True(compression >= RetardAccepte, $"Compression à {compression} : une mesure en retard tomberait dans un bloc compressé");
        Assert.True(compression <= TimeSpan.FromDays(2), $"Compression à {compression} : des jours de mesures restent non compressées");
    }

    [Fact]
    public void Une_base_existante_recoit_le_meme_delai_de_compression_qu_une_base_neuve()
    {
        var neuve = Intervalle(@"add_compression_policy\('mesures', INTERVAL '([^']+)'");
        var existante = Intervalle(@"jsonb_set\(config, '\{compress_after\}', '""([^""]+)""'\)");
        var condition = Intervalle(@"config->>'compress_after' <> '([^']+)'");

        Assert.Equal(neuve, existante);
        Assert.Equal(neuve, condition);
    }

    [Fact]
    public void L_agregat_n_est_compresse_qu_au_dela_de_sa_fenetre_de_rafraichissement()
    {
        var rafraichissement = Intervalle(@"add_continuous_aggregate_policy\('mesures_1min', start_offset => INTERVAL '([^']+)'");
        var compression = Intervalle(@"add_compression_policy\('mesures_1min', compress_after => INTERVAL '([^']+)'");

        Assert.True(compression > rafraichissement, $"Agrégat compressé à {compression}, rafraîchi sur {rafraichissement}");
        Assert.Contains("timescaledb.compress_segmentby = 'point_id'", Sql[Sql.IndexOf("ALTER MATERIALIZED VIEW mesures_1min", StringComparison.Ordinal)..]);
    }
}
