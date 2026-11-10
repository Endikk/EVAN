using System.Reflection;

namespace EVAN.Architecture.Tests;

/// <summary>
/// Règles de dépendance, vérifiées sur les assemblages compilés : une référence interdite ajoutée par mégarde
/// casse le build de test au lieu d'éroder l'architecture en silence.
/// </summary>
public class DependencyRulesTests
{
    /// <summary>Projets EVAN dont chaque projet a le droit de se servir (Core ← Application ← Infrastructure ← Api ; Mcp, présentation, ne voit que l'application).</summary>
    public static TheoryData<string, string[]> Autorisations => new()
    {
        { "EVAN.Core", [] },
        { "EVAN.Application", ["EVAN.Core"] },
        { "EVAN.Messaging", ["EVAN.Core"] },
        { "EVAN.Infrastructure", ["EVAN.Core", "EVAN.Application", "EVAN.Messaging"] },
        { "EVAN.Mcp", ["EVAN.Core", "EVAN.Application"] },
        { "EVAN.Api", ["EVAN.Core", "EVAN.Application", "EVAN.Infrastructure", "EVAN.Mcp"] },
        { "EVAN.Simulator", ["EVAN.Core", "EVAN.Infrastructure", "EVAN.Messaging"] },
        { "EVAN.Gateway", ["EVAN.Core", "EVAN.Messaging"] },
    };

    private static IEnumerable<AssemblyName> References(string assembly) => Assembly.Load(assembly).GetReferencedAssemblies();

    /// <summary>Fermeture transitive des références, en suivant les seuls projets EVAN.</summary>
    private static HashSet<string> Closure(string assembly)
    {
        var seen = new HashSet<string>();
        var todo = new Stack<string>([assembly]);
        while (todo.TryPop(out var current))
        {
            foreach (var name in References(current).Select(r => r.Name!))
            {
                if (seen.Add(name) && name.StartsWith("EVAN.", StringComparison.Ordinal)) todo.Push(name);
            }
        }
        return seen;
    }

    [Theory]
    [MemberData(nameof(Autorisations))]
    public void Chaque_projet_ne_depend_que_des_couches_autorisees(string assembly, string[] autorises)
    {
        var interdits = References(assembly)
            .Select(r => r.Name!)
            .Where(n => n.StartsWith("EVAN.", StringComparison.Ordinal) && !autorises.Contains(n))
            .ToList();
        Assert.True(interdits.Count == 0, $"{assembly} dépend de {string.Join(", ", interdits)}");
    }

    [Fact]
    public void Le_domaine_n_utilise_que_la_bibliotheque_standard()
    {
        var externes = References("EVAN.Core")
            .Select(r => r.Name!)
            .Where(n => !n.StartsWith("System", StringComparison.Ordinal) && n is not ("netstandard" or "mscorlib"))
            .ToList();
        Assert.True(externes.Count == 0, $"EVAN.Core dépend de {string.Join(", ", externes)}");
    }

    [Fact]
    public void Le_serveur_MCP_ne_touche_ni_la_base_ni_le_broker_ni_le_fournisseur_du_modele()
    {
        // Les outils passent par les cas d'usage : le serveur MCP ne voit ni TimescaleDB, ni MQTT, ni le SDK d'Anthropic.
        var embarques = Closure("EVAN.Mcp");
        foreach (var interdit in new[] { "EVAN.Infrastructure", "EVAN.Messaging", "Npgsql", "MQTTnet", "Anthropic" })
            Assert.DoesNotContain(interdit, embarques);
    }

    [Fact]
    public void Les_cas_d_usage_ignorent_le_fournisseur_du_modele()
    {
        // L'assistant ne connaît que l'abstraction IChatClient : changer de modèle ou de fournisseur se fait dans l'infrastructure.
        var embarques = Closure("EVAN.Application");
        foreach (var interdit in new[] { "Anthropic", "Microsoft.Extensions.AI" })
            Assert.DoesNotContain(interdit, embarques);
    }

    [Fact]
    public void Le_domaine_et_les_cas_d_usage_mesurent_sans_OpenTelemetry()
    {
        // Mesures métier par System.Diagnostics.Metrics (bibliothèque standard) ; OpenTelemetry reste dans l'API et la passerelle.
        foreach (var couche in new[] { "EVAN.Core", "EVAN.Application" })
            Assert.DoesNotContain(Closure(couche), n => n.StartsWith("OpenTelemetry", StringComparison.Ordinal));
    }

    [Fact]
    public void La_passerelle_edge_n_embarque_ni_base_ni_cas_d_usage()
    {
        var embarques = Closure("EVAN.Gateway");
        foreach (var interdit in new[] { "EVAN.Application", "EVAN.Infrastructure", "Npgsql", "Dapper", "Microsoft.AspNetCore.SignalR.Core" })
            Assert.DoesNotContain(interdit, embarques);
    }
}
