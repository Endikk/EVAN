using EVAN.Gateway.Sources;
using Opc.Ua;

namespace EVAN.Gateway.Tests;

/// <summary>Valeurs OPC UA : horodatage de repli (jamais l'an 1) et conversion protégée (tableaux, textes, structures).</summary>
public class OpcUaValeursTests
{
    private static readonly DateTimeOffset Maintenant = new(2026, 10, 8, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void L_horodatage_prend_la_source_puis_le_serveur_puis_la_passerelle()
    {
        var source = new DateTime(2026, 10, 8, 7, 59, 59, DateTimeKind.Utc);
        var serveur = new DateTime(2026, 10, 8, 7, 59, 58, DateTimeKind.Utc);

        Assert.Equal(source, OpcUaSource.Horodatage(new DataValue(new Variant(1.0), StatusCodes.Good, source, serveur), Maintenant).UtcDateTime);
        Assert.Equal(serveur, OpcUaSource.Horodatage(new DataValue(new Variant(1.0), StatusCodes.Good, DateTime.MinValue, serveur), Maintenant).UtcDateTime);
        Assert.Equal(Maintenant, OpcUaSource.Horodatage(new DataValue(new Variant(1.0)), Maintenant));
    }

    [Theory]
    [InlineData(12.5, true, 12.5)]
    [InlineData(7, true, 7.0)]
    [InlineData(true, true, 1.0)]
    [InlineData("3.25", true, 3.25)]
    [InlineData("marche", false, 0.0)]
    [InlineData(double.NaN, false, 0.0)]
    public void Conversion_des_valeurs_scalaires(object brute, bool attendu, double valeur)
    {
        Assert.Equal(attendu, OpcUaSource.TryToDouble(brute, out var v));
        if (attendu) Assert.Equal(valeur, v);
    }

    [Fact]
    public void Un_tableau_ou_une_valeur_nulle_est_ignore()
    {
        Assert.False(OpcUaSource.TryToDouble(new[] { 1.0, 2.0 }, out _));
        Assert.False(OpcUaSource.TryToDouble(null, out _));
        Assert.False(OpcUaSource.TryToDouble(DateTime.UtcNow, out _));
    }
}
