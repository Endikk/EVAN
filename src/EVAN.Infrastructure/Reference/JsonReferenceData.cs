using System.Text.Json;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Sites;

namespace EVAN.Infrastructure.Reference;

/// <summary>Charge les données de référence depuis data/ (copié à la compilation depuis data/ à la racine) ou le dossier EVAN_DATA.</summary>
public static class JsonReferenceData
{
    public static ReferenceData Load(string? directory = null)
    {
        var dir = directory ?? Environment.GetEnvironmentVariable("EVAN_DATA") ?? Path.Combine(AppContext.BaseDirectory, "data");
        T Read<T>(string file) => JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(dir, file)), Json.Options)
                                  ?? throw new InvalidDataException($"{file} illisible");
        return new ReferenceData
        {
            Catalogue = Read<Catalogue>("catalog.json"),
            Kit = Read<Kit>("machines.json"),
            Demo = Read<DemoOrganisation>("demo.json"),
        };
    }
}
