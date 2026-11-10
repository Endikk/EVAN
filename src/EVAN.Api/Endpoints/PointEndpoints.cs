using EVAN.Application.Abstractions;

namespace EVAN.Api.Endpoints;

/// <summary>Séries temporelles d'un point de mesure, agrégées par seau (≈ 600 points par courbe par défaut, 2000 au plus).</summary>
internal static class PointEndpoints
{
    /// <summary>Profondeur d'une courbe : la rétention des mesures.</summary>
    internal static readonly TimeSpan Profondeur = TimeSpan.FromDays(400);
    internal const int SeauxMax = 2000;
    private const int SeauxParDefaut = 600;

    internal sealed record Fenetre(DateTimeOffset From, DateTimeOffset To, TimeSpan Bucket);

    /// <summary>
    /// Fenêtre bornée d'une courbe : début ramené à 400 jours au plus, pas assez grand pour 2000 seaux au plus.
    /// Null si la fenêtre demandée est vide ou inversée.
    /// </summary>
    internal static Fenetre? Borner(DateTimeOffset? from, DateTimeOffset? to, int? bucketSeconds, DateTimeOffset now)
    {
        var t1 = to ?? now;
        var t0 = from ?? t1.AddHours(-1);
        if (t0 >= t1) return null;
        if (t0 < now - Profondeur) t0 = now - Profondeur;
        var duree = (t1 - t0).TotalSeconds;
        var demande = Math.Clamp(bucketSeconds ?? (long)(duree / SeauxParDefaut), 1, 86_400);
        var minimum = (long)Math.Ceiling(duree / SeauxMax);
        return new Fenetre(t0, t1, TimeSpan.FromSeconds(Math.Max(demande, minimum)));
    }

    public static RouteGroupBuilder MapPointEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/points/{pointId}/series", async (string pointId, DateTimeOffset? from, DateTimeOffset? to, int? bucketSeconds, IStore store, CancellationToken ct) =>
        {
            if (Borner(from, to, bucketSeconds, DateTimeOffset.UtcNow) is not { } f) return Results.BadRequest(new { erreur = "Fenêtre vide : « from » doit précéder « to »." });
            // Fenêtre entièrement au-delà de la rétention : rien à lire.
            if (f.From >= f.To) return Results.Ok(Array.Empty<SeriesPoint>());
            return Results.Ok(await store.SeriesAsync(pointId, f.From, f.To, f.Bucket, ct));
        }).WithRequestTimeout(EvanApi.TimeoutLecture);
        return api;
    }
}
