using EVAN.Core.Domain.Catalog;

namespace EVAN.Api.Endpoints;

internal static class CatalogEndpoints
{
    public static RouteGroupBuilder MapCatalogEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/catalog", (ReferenceData data) => Results.Ok(data.Catalogue));
        return api;
    }
}
