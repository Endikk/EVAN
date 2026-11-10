using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http.Features;

namespace EVAN.Api.Securite;

/// <summary>
/// Réglages de l'accès à l'assistant et au serveur MCP (section Evan:Assistant). Les valeurs par défaut conviennent
/// à une usine : quelques personnes qui posent des questions, pas un robot qui vide la clé.
/// </summary>
public sealed class AccesIaOptions
{
    /// <summary>
    /// Code d'accès des clients réseau, présenté en <c>Authorization: Bearer &lt;code&gt;</c>. Vide : l'assistant et le
    /// serveur MCP ne servent que le poste du serveur (le navigateur derrière le proxy de Vite, Claude Code en local).
    /// </summary>
    public string? CodeAcces { get; set; }

    /// <summary>Questions par minute et par client (seau à jetons : une rafale de cette taille, puis une toutes les 60/n s).</summary>
    public int QuestionsParMinute { get; set; } = 6;

    /// <summary>Réponses en cours en même temps, tous clients confondus (chacune tient un appel au modèle).</summary>
    public int QuestionsSimultanees { get; set; } = 4;

    /// <summary>Plafond de questions par période de 24 h, tous clients confondus : la borne de coût, quoi qu'il arrive.</summary>
    public int QuestionsParJour { get; set; } = 300;

    /// <summary>Requêtes MCP par minute et par client (les outils ne coûtent pas d'appel au modèle).</summary>
    public int RequetesMcpParMinute { get; set; } = 120;

    /// <summary>Durée maximale d'une réponse de l'assistant, en secondes.</summary>
    public int SecondesMax { get; set; } = 180;
}

/// <summary>Ce qu'une route protégée consomme : une question à l'assistant (appel payant au modèle) ou une requête MCP.</summary>
public enum UsageIa { Assistant, Mcp }

/// <summary>Métadonnée de route : la route est servie par <see cref="GardeIa"/>, avec une taille de requête bornée.</summary>
public sealed record ProtectionIa(UsageIa Usage, long OctetsMax);

/// <summary>Résultat du contrôle d'accès, pour le front (GET /api/assistant) : poste local, code demandé, ou fermé au réseau.</summary>
public enum AccesIa { Local, Code, Ferme }

/// <summary>
/// Garde de l'assistant et du serveur MCP, appliquée par un middleware aux routes marquées <see cref="ProtectionIa"/>.
/// Dans l'ordre : taille de la requête, origine (contre le rebond DNS vers le poste local), code d'accès des clients
/// réseau (comparaison à temps constant, tentatives limitées), puis limites de débit et de coût. Les limites vivent
/// en mémoire : un redémarrage les remet à zéro, d'où le plafond de dépense à poser aussi côté console Anthropic.
/// </summary>
public sealed class GardeIa : IDisposable
{
    private const string ClientLocal = "local";
    private const int EchecsMax = 10;
    private const int ReponsesParClient = 2;

    private readonly AccesIaOptions _options;
    private readonly byte[]? _empreinteCode;
    private readonly HashSet<string> _origines;
    private readonly ILogger<GardeIa> _log;

    private readonly PartitionedRateLimiter<string> _questions;
    private readonly PartitionedRateLimiter<string> _reponsesParClient;
    private readonly ConcurrencyLimiter _reponses;
    private readonly FixedWindowRateLimiter _quotaJour;
    private readonly PartitionedRateLimiter<string> _mcp;
    private readonly PartitionedRateLimiter<string> _echecs;

    public GardeIa(AccesIaOptions options, IConfiguration config, ILogger<GardeIa> log)
    {
        _options = options;
        _log = log;
        var code = options.CodeAcces?.Trim();
        if (!string.IsNullOrEmpty(code))
        {
            _empreinteCode = Empreinte(code);
            if (code.Length < 16) log.LogWarning("Code d'accès de l'assistant court ({Longueur} caractères) : 16 au moins conseillés.", code.Length);
        }
        _origines = new HashSet<string>(config.GetSection("Evan:CorsOrigins").Get<string[]>() ?? ["http://localhost:5173"], StringComparer.OrdinalIgnoreCase);

        var parMinute = Math.Max(1, options.QuestionsParMinute);
        _questions = PartitionedRateLimiter.Create<string, string>(client => RateLimitPartition.GetTokenBucketLimiter(client, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = parMinute,
            TokensPerPeriod = 1,
            ReplenishmentPeriod = TimeSpan.FromSeconds(60.0 / parMinute),
            QueueLimit = 0,
        }));
        _reponsesParClient = PartitionedRateLimiter.Create<string, string>(client => RateLimitPartition.GetConcurrencyLimiter(client, _ => new ConcurrencyLimiterOptions
        {
            PermitLimit = ReponsesParClient,
            QueueLimit = 0,
        }));
        _reponses = new ConcurrencyLimiter(new ConcurrencyLimiterOptions { PermitLimit = Math.Max(1, options.QuestionsSimultanees), QueueLimit = 0 });
        _quotaJour = new FixedWindowRateLimiter(new FixedWindowRateLimiterOptions
        {
            PermitLimit = Math.Max(1, options.QuestionsParJour),
            Window = TimeSpan.FromDays(1),
            QueueLimit = 0,
        });
        var mcpParMinute = Math.Max(1, options.RequetesMcpParMinute);
        _mcp = PartitionedRateLimiter.Create<string, string>(client => RateLimitPartition.GetTokenBucketLimiter(client, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = mcpParMinute,
            TokensPerPeriod = 1,
            ReplenishmentPeriod = TimeSpan.FromSeconds(60.0 / mcpParMinute),
            QueueLimit = 0,
        }));
        // Dix codes faux, puis un essai toutes les 90 s : deviner un code de 16 caractères devient hors de portée.
        _echecs = PartitionedRateLimiter.Create<string, string>(client => RateLimitPartition.GetTokenBucketLimiter(client, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = EchecsMax,
            TokensPerPeriod = 1,
            ReplenishmentPeriod = TimeSpan.FromSeconds(90),
            QueueLimit = 0,
        }));
    }

    public TimeSpan DureeMax => TimeSpan.FromSeconds(Math.Max(10, _options.SecondesMax));

    /// <summary>Accès de ce client : le poste local passe, un client réseau doit présenter le code, et sans code configuré il est refusé.</summary>
    public AccesIa Acces(HttpContext ctx) => EstLocal(ctx) ? AccesIa.Local : _empreinteCode is null ? AccesIa.Ferme : AccesIa.Code;

    /// <summary>
    /// Requête venue du poste du serveur. L'adresse de la connexion doit être locale ; derrière un relais local (proxy
    /// de Vite), chaque adresse de X-Forwarded-For aussi. Un en-tête forgé ne peut que retirer l'accès local, jamais
    /// le donner. Rien n'est lu derrière nginx (Docker) : la connexion vient du conteneur du proxy, donc du réseau.
    /// </summary>
    public static bool EstLocal(HttpContext ctx)
    {
        if (!Locale(ctx.Connection.RemoteIpAddress)) return false;
        foreach (var valeur in ctx.Request.Headers["X-Forwarded-For"])
            foreach (var adresse in (valeur ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
                if (!IPAddress.TryParse(adresse, out var ip) || !Locale(ip)) return false;
        return true;
    }

    private static bool Locale(IPAddress? ip) =>
        ip is not null && IPAddress.IsLoopback(ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip);

    /// <summary>
    /// Origine admise pour le poste local : aucune (curl, client MCP), une origine du front (Evan:CorsOrigins) ou une
    /// origine locale. Une page tierce qui fait pointer son nom vers 127.0.0.1 (rebond DNS) garde son origine : refusée.
    /// </summary>
    private bool OrigineLocaleAdmise(HttpContext ctx)
    {
        var origine = ctx.Request.Headers.Origin.ToString();
        if (origine.Length == 0) return true;
        if (_origines.Contains(origine)) return true;
        return Uri.TryCreate(origine, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && uri.IsLoopback;
    }

    private bool CodeValide(HttpContext ctx)
    {
        if (_empreinteCode is null) return false;
        var entete = ctx.Request.Headers.Authorization.ToString();
        const string schema = "Bearer ";
        if (!entete.StartsWith(schema, StringComparison.OrdinalIgnoreCase)) return false;
        return CryptographicOperations.FixedTimeEquals(Empreinte(entete[schema.Length..].Trim()), _empreinteCode);
    }

    private static byte[] Empreinte(string code) => SHA256.HashData(Encoding.UTF8.GetBytes(code));

    /// <summary>
    /// Clé de partition des limites par client : « local » pour le poste du serveur ; sinon l'adresse de la connexion,
    /// et derrière nginx la dernière adresse de X-Forwarded-For (celle que nginx a ajoutée). Un client qui forgerait
    /// cet en-tête ne gagnerait que des limites par client neuves : le code d'accès, la concurrence globale et le
    /// quota du jour restent communs.
    /// </summary>
    private static string Client(HttpContext ctx)
    {
        if (EstLocal(ctx)) return ClientLocal;
        var connexion = ctx.Connection.RemoteIpAddress?.ToString() ?? "inconnu";
        var relais = ctx.Request.Headers["X-Forwarded-For"].ToString().Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return relais.Length > 0 ? $"{connexion}|{relais[^1]}" : connexion;
    }

    /// <summary>Applique la garde à une route protégée, puis la sert en tenant ses jetons jusqu'à la fin de la réponse.</summary>
    public async Task ServirAsync(HttpContext ctx, ProtectionIa protection, RequestDelegate suite)
    {
        // 1. Taille : une question tient en quelques kilo-octets.
        if (ctx.Request.ContentLength > protection.OctetsMax)
        {
            await Refuser(ctx, StatusCodes.Status413PayloadTooLarge, "Requête trop volumineuse.");
            return;
        }
        if (ctx.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } taille) taille.MaxRequestBodySize = protection.OctetsMax;

        // 2. Accès.
        var client = Client(ctx);
        switch (Acces(ctx))
        {
            case AccesIa.Local when !OrigineLocaleAdmise(ctx):
                _log.LogWarning("Assistant/MCP : origine refusée {Origine}", ctx.Request.Headers.Origin.ToString());
                await Refuser(ctx, StatusCodes.Status403Forbidden, "Origine non autorisée.");
                return;
            case AccesIa.Ferme:
                await Refuser(ctx, StatusCodes.Status403Forbidden,
                    "Assistant et serveur MCP réservés au poste du serveur : définir un code d'accès (Evan:Assistant:CodeAcces) pour les ouvrir au réseau.");
                return;
            // Client bloqué après trop de codes faux : refusé avant toute comparaison, bon code compris (sinon un
            // essai réussi se distinguerait encore des autres et le blocage ne freinerait pas la recherche du code).
            case AccesIa.Code when _echecs.GetStatistics(client)?.CurrentAvailablePermits == 0:
                await Refuser(ctx, StatusCodes.Status429TooManyRequests, "Trop de codes refusés : réessayez dans quelques minutes.", TimeSpan.FromSeconds(90));
                return;
            case AccesIa.Code when !CodeValide(ctx):
                if (ctx.Request.Headers.Authorization.Count > 0)
                {
                    using var _ = _echecs.AttemptAcquire(client);
                    _log.LogWarning("Assistant/MCP : code d'accès refusé pour {Client}", client);
                }
                ctx.Response.Headers.WWWAuthenticate = "Bearer realm=\"EVAN\"";
                await Refuser(ctx, StatusCodes.Status401Unauthorized,
                    ctx.Request.Headers.Authorization.Count > 0 ? "Code d'accès refusé." : "Code d'accès requis.");
                return;
        }

        // 3. Débit et coût. Les jetons de concurrence sont tenus pendant toute la réponse (flux SSE compris).
        var jetons = new List<RateLimitLease>();
        try
        {
            if (protection.Usage == UsageIa.Mcp)
            {
                if (!Prendre(jetons, _mcp.AttemptAcquire(client)))
                {
                    await Refuser(ctx, StatusCodes.Status429TooManyRequests, "Trop de requêtes MCP : réessayez dans un instant.", jetons[^1]);
                    return;
                }
            }
            else
            {
                string? refus =
                    !Prendre(jetons, _reponsesParClient.AttemptAcquire(client)) ? "Une réponse est déjà en cours : attendez-la avant de poser une autre question."
                    : !Prendre(jetons, _questions.AttemptAcquire(client)) ? "Trop de questions en une minute : réessayez dans un instant."
                    : !Prendre(jetons, _reponses.AttemptAcquire()) ? "L'assistant répond déjà à plusieurs personnes : réessayez dans un instant."
                    : !Prendre(jetons, _quotaJour.AttemptAcquire()) ? "Quota de questions du jour atteint pour cette installation."
                    : null;
                if (refus is not null)
                {
                    _log.LogInformation("Assistant : question refusée pour {Client} ({Motif})", client, refus);
                    await Refuser(ctx, StatusCodes.Status429TooManyRequests, refus, jetons[^1]);
                    return;
                }
            }
            await suite(ctx);
        }
        finally
        {
            foreach (var jeton in jetons) jeton.Dispose();
        }
    }

    private static bool Prendre(List<RateLimitLease> jetons, RateLimitLease jeton)
    {
        jetons.Add(jeton);
        return jeton.IsAcquired;
    }

    private static Task Refuser(HttpContext ctx, int statut, string message, RateLimitLease jeton) =>
        Refuser(ctx, statut, message, jeton.TryGetMetadata(MetadataName.RetryAfter, out var attente) ? attente : null);

    private static async Task Refuser(HttpContext ctx, int statut, string message, TimeSpan? attente = null)
    {
        ctx.Response.StatusCode = statut;
        if (attente is { } a) ctx.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling(a.TotalSeconds)).ToString();
        await ctx.Response.WriteAsJsonAsync(new { erreur = message });
    }

    public void Dispose()
    {
        _questions.Dispose();
        _reponsesParClient.Dispose();
        _reponses.Dispose();
        _quotaJour.Dispose();
        _mcp.Dispose();
        _echecs.Dispose();
    }
}

public static class GardeIaExtensions
{
    /// <summary>Taille maximale d'une requête à l'assistant ou au serveur MCP.</summary>
    public const long OctetsMax = 128 * 1024;

    public static IServiceCollection AddGardeIa(this IServiceCollection services, IConfiguration config)
    {
        var options = new AccesIaOptions();
        config.GetSection("Evan:Assistant").Bind(options);
        services.AddSingleton(options);
        services.AddSingleton<GardeIa>();
        return services;
    }

    /// <summary>Marque une route comme protégée par la garde (accès, débit, coût).</summary>
    public static TBuilder ProtegerIa<TBuilder>(this TBuilder builder, UsageIa usage) where TBuilder : IEndpointConventionBuilder =>
        builder.WithMetadata(new ProtectionIa(usage, OctetsMax));

    /// <summary>Middleware : les routes marquées <see cref="ProtectionIa"/> passent par la garde, les autres sont servies telles quelles.</summary>
    public static IApplicationBuilder UseGardeIa(this IApplicationBuilder app)
    {
        var garde = app.ApplicationServices.GetRequiredService<GardeIa>();
        return app.Use(async (ctx, suite) =>
        {
            if (ctx.GetEndpoint()?.Metadata.GetMetadata<ProtectionIa>() is { } protection)
                await garde.ServirAsync(ctx, protection, suite);
            else
                await suite(ctx);
        });
    }
}
