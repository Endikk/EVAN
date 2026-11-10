using Microsoft.Extensions.AI;

namespace EVAN.Application.Assistant;

/// <summary>
/// Jetons consommés par une question, sur tous ses allers-retours avec le modèle : entrée au plein tarif, sortie
/// (réflexion comprise), écriture et lecture du cache de prompt. Le prompt envoyé à chaque aller-retour mesure
/// <see cref="EntreeTotale"/> jetons.
/// </summary>
public sealed record ConsommationAssistant(long Entree, long Sortie, long EcritureCache, long LectureCache, int AllersRetours)
{
    /// <summary>
    /// Compte additionnel des jetons écrits dans le cache. Microsoft.Extensions.AI n'a pas de champ standard pour
    /// l'écriture : l'adaptateur IChatClient du SDK d'Anthropic la range sous ce nom (BetaUsage.CacheCreationInputTokens).
    /// Un fournisseur qui ne la donne pas compte zéro écriture.
    /// </summary>
    public const string CleEcritureCache = "CacheCreationInputTokens";

    public static ConsommationAssistant Aucune { get; } = new(0, 0, 0, 0, 0);

    /// <summary>Taille totale des prompts envoyés : plein tarif, écriture et lecture du cache.</summary>
    public long EntreeTotale => Entree + EcritureCache + LectureCache;

    /// <summary>
    /// Un aller-retour, d'après le décompte du client de modèle. InputTokenCount compte tout le prompt, cache compris ;
    /// CachedInputTokenCount en est la part lue dans le cache.
    /// </summary>
    public static ConsommationAssistant AllerRetour(UsageDetails usage)
    {
        var lecture = usage.CachedInputTokenCount ?? 0;
        var ecriture = usage.AdditionalCounts?.TryGetValue(CleEcritureCache, out var n) == true ? n : 0;
        var entree = Math.Max(0, (usage.InputTokenCount ?? 0) - lecture - ecriture);
        return new ConsommationAssistant(entree, usage.OutputTokenCount ?? 0, ecriture, lecture, 1);
    }

    public ConsommationAssistant Plus(ConsommationAssistant autre) => new(
        Entree + autre.Entree,
        Sortie + autre.Sortie,
        EcritureCache + autre.EcritureCache,
        LectureCache + autre.LectureCache,
        AllersRetours + autre.AllersRetours);
}

/// <summary>Prix d'un modèle, en dollars par million de jetons (configuration Evan:Assistant:Prix).</summary>
public sealed record TarifModele(decimal Entree, decimal Sortie, decimal LectureCache, decimal EcritureCache)
{
    public decimal Cout(ConsommationAssistant c) =>
        (c.Entree * Entree + c.Sortie * Sortie + c.LectureCache * LectureCache + c.EcritureCache * EcritureCache) / 1_000_000m;
}

/// <summary>
/// Bilan d'une question : modèle, effort demandé (null : celui du modèle), jetons consommés et coût estimé en dollars
/// (null quand aucun prix n'est connu pour le modèle : pas de chiffre plutôt qu'un chiffre faux).
/// </summary>
public sealed record BilanQuestion(string? Modele, string? Effort, ConsommationAssistant Consommation, decimal? CoutDollars);
