using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.Metadata;

namespace EVAN.Api.Endpoints;

/// <summary>Taille de corps propre à une route, au-delà de la limite commune (<see cref="Bornes.CorpsMax"/>, 64 ko).</summary>
public sealed record TailleCorps(long Octets) : IRequestSizeLimitMetadata
{
    public long? MaxRequestBodySize => Octets;
}

public static class TailleCorpsExtensions
{
    /// <summary>
    /// Après le routage : une route qui déclare sa taille de corps (<see cref="IRequestSizeLimitMetadata"/>) la reçoit
    /// avant toute lecture du corps. Les autres gardent la limite de Kestrel.
    /// </summary>
    public static IApplicationBuilder UseTailleCorps(this IApplicationBuilder app) => app.Use((ctx, suite) =>
    {
        if (ctx.GetEndpoint()?.Metadata.GetMetadata<IRequestSizeLimitMetadata>() is { MaxRequestBodySize: { } max }
            && ctx.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } taille)
            taille.MaxRequestBodySize = max;
        return suite(ctx);
    });
}
