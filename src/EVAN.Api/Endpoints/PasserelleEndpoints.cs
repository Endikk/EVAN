using System.Text.Json;
using System.Text.Json.Serialization;
using EVAN.Api.Securite;
using EVAN.Application.Live;
using EVAN.Application.Usines;

namespace EVAN.Api.Endpoints;

/// <summary>
/// Configuration de la passerelle d'une usine : l'appsettings.json prêt pour EVAN.Gateway, construit depuis l'étape 5.
/// Réservé aux administrateurs de l'organisation : il décrit le réseau de l'usine (adresses des automates).
/// </summary>
internal static class PasserelleEndpoints
{
    /// <summary>
    /// Clés en PascalCase et indentées, comme l'appsettings.json livré avec la passerelle. Une valeur absente (broker
    /// non configuré) est omise : la passerelle garde sa valeur par défaut au lieu d'une chaîne vide.
    /// </summary>
    private static readonly JsonSerializerOptions Fichier = new() { WriteIndented = true, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static RouteGroupBuilder MapPasserelleEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/sites/{siteId}/passerelle/config", (string siteId, LiveService live, IConfiguration config) =>
        {
            // Usine de la démo : sa passerelle est le simulateur, rien à télécharger.
            if (live.Usine(siteId)?.Configuration is not { } usine) return Results.NotFound(new { erreur = "Introuvable." });
            var broker = config["Evan:Passerelles:Broker"];
            var fichier = ConfigurationPasserelle.Construire(usine, string.IsNullOrWhiteSpace(broker) ? null : broker.Trim());
            return Results.Text(JsonSerializer.Serialize(fichier, Fichier), "application/json; charset=utf-8");
        }).RequireAuthorization(Politiques.Admin);
        return api;
    }
}
