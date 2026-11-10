using EVAN.Application.Abstractions;
using EVAN.Application.Validation;
using EVAN.Core.Domain.Sites;

namespace EVAN.Application.Comptes;

/// <summary>Issue d'une création : le compte créé (et son organisation), ou ce qui l'empêche. Conflit : adresse déjà prise.</summary>
public sealed record ResultatCompte(Compte? Compte, Organisation? Organisation, IReadOnlyList<ErreurChamp> Erreurs, bool Conflit = false)
{
    public bool Reussi => Compte is not null;

    internal static ResultatCompte Refus(params ErreurChamp[] erreurs) => new(null, null, erreurs);

    internal static readonly ResultatCompte AdressePrise = new(null, null, [new ErreurChamp("identifiant", "Cette adresse e-mail a déjà un compte.")], Conflit: true);

    internal static readonly ResultatCompte DejaInstalle = new(null, null, [new ErreurChamp("installation", "EVAN est déjà installé : un administrateur crée les comptes depuis la page Compte.")], Conflit: true);
}

/// <summary>
/// Comptes de l'entreprise. Pas d'inscription publique : l'installation, possible une seule fois, crée l'organisation et
/// son premier administrateur, qui crée ensuite les membres. Le mot de passe n'est gardé que sous forme d'empreinte.
/// </summary>
public sealed class ComptesService(IComptesStore comptes, IMotsDePasse motsDePasse, TimeProvider time)
{
    public const int MotDePasseMin = 12;
    /// <summary>Au-delà, le calcul de l'empreinte devient un moyen de faire travailler le serveur pour rien.</summary>
    public const int MotDePasseMax = 256;
    public const int IdentifiantMax = 254;
    public const int NomMax = 80;
    public const int OrganisationMax = 120;

    /// <summary>
    /// Empreinte d'un mot de passe que personne ne connaît : un identifiant inconnu coûte le même calcul qu'un compte
    /// existant, la durée de la réponse ne dit pas si le compte existe.
    /// </summary>
    private readonly Lazy<string> _leurre = new(() => motsDePasse.Hacher(Guid.NewGuid().ToString("N")));

    /// <summary>Identifiant tel qu'il est gardé et comparé : sans espaces autour, en minuscules.</summary>
    public static string Normaliser(string? identifiant) => (identifiant ?? "").Trim().ToLowerInvariant();

    /// <summary>Champs refusés d'un nouveau compte (vide si tout est recevable).</summary>
    public static IReadOnlyList<ErreurChamp> Verifier(NouveauCompte saisie)
    {
        var erreurs = new List<ErreurChamp>();
        var identifiant = Normaliser(saisie.Identifiant);
        if (identifiant.Length == 0) erreurs.Add(new("identifiant", "Adresse e-mail requise."));
        else if (identifiant.Length > IdentifiantMax) erreurs.Add(new("identifiant", $"Adresse e-mail : {IdentifiantMax} caractères au plus."));
        else if (!EstAdresse(identifiant)) erreurs.Add(new("identifiant", "Adresse e-mail invalide (de la forme nom@domaine)."));

        var nom = saisie.Nom?.Trim() ?? "";
        if (nom.Length == 0) erreurs.Add(new("nom", "Nom requis : il signe les acquittements et les interventions."));
        else if (nom.Length > NomMax) erreurs.Add(new("nom", $"Nom : {NomMax} caractères au plus."));
        else if (nom.Any(char.IsControl)) erreurs.Add(new("nom", "Nom : caractères de contrôle refusés."));

        var mdp = saisie.MotDePasse ?? "";
        if (mdp.Length < MotDePasseMin) erreurs.Add(new("motDePasse", $"Mot de passe : {MotDePasseMin} caractères au moins."));
        else if (mdp.Length > MotDePasseMax) erreurs.Add(new("motDePasse", $"Mot de passe : {MotDePasseMax} caractères au plus."));
        else if (string.Equals(mdp.Trim(), identifiant, StringComparison.OrdinalIgnoreCase)) erreurs.Add(new("motDePasse", "Le mot de passe ne peut pas être l'adresse e-mail."));

        if (saisie.Role is not null && !Roles.Connu(saisie.Role)) erreurs.Add(new("role", "Rôle : admin ou membre."));
        return erreurs;
    }

    /// <summary>Forme minimale d'une adresse : une partie locale, une arobase, un domaine avec un point, sans espace.</summary>
    private static bool EstAdresse(string s)
    {
        var at = s.IndexOf('@');
        return at > 0 && at == s.LastIndexOf('@') && s.IndexOf('.', at) > at + 1 && !s.EndsWith('.') && !s.Any(c => char.IsWhiteSpace(c) || char.IsControl(c));
    }

    /// <summary>
    /// Compte qui correspond à ces identifiants, ou null. Un identifiant inconnu et un mauvais mot de passe coûtent le
    /// même calcul et donnent la même réponse.
    /// </summary>
    public async Task<Compte?> AuthentifierAsync(string? identifiant, string? motDePasse, CancellationToken ct = default)
    {
        var id = Normaliser(identifiant);
        var mdp = motDePasse ?? "";
        var compte = id.Length is > 0 and <= IdentifiantMax && mdp.Length <= MotDePasseMax ? await comptes.CompteAsync(id, ct) : null;
        var valide = motsDePasse.Verifier(compte?.Empreinte ?? _leurre.Value, mdp.Length <= MotDePasseMax ? mdp : "");
        return compte is not null && valide ? compte : null;
    }

    /// <summary>Installation, une seule fois : l'organisation de l'entreprise et son premier administrateur.</summary>
    public async Task<ResultatCompte> InstallerAsync(string? nomOrganisation, NouveauCompte admin, CancellationToken ct = default)
    {
        var erreurs = Verifier(admin with { Role = Roles.Admin }).ToList();
        var nom = nomOrganisation?.Trim() ?? "";
        if (nom.Length == 0) erreurs.Insert(0, new("organisation", "Nom de l'organisation requis."));
        else if (nom.Length > OrganisationMax) erreurs.Insert(0, new("organisation", $"Nom de l'organisation : {OrganisationMax} caractères au plus."));
        if (erreurs.Count > 0) return ResultatCompte.Refus([.. erreurs]);

        var organisation = new Organisation($"org-{Guid.NewGuid():N}", nom);
        var compte = Nouveau(organisation.Id, admin, Roles.Admin);
        // EVAN sert une seule entreprise : l'installation ne crée son organisation qu'une fois, au premier lancement.
        return await comptes.InstallerAsync(organisation, compte, ct)
            ? new ResultatCompte(compte, organisation, [])
            : ResultatCompte.DejaInstalle;
    }

    /// <summary>Un administrateur ajoute un compte à son organisation (membre par défaut).</summary>
    public async Task<ResultatCompte> CreerCompteAsync(string organisationId, NouveauCompte saisie, CancellationToken ct = default)
    {
        var erreurs = Verifier(saisie);
        if (erreurs.Count > 0) return ResultatCompte.Refus([.. erreurs]);
        var compte = Nouveau(organisationId, saisie, saisie.Role ?? Roles.Membre);
        return await comptes.AjouterCompteAsync(compte, ct)
            ? new ResultatCompte(compte, null, [])
            : ResultatCompte.AdressePrise;
    }

    private Compte Nouveau(string organisationId, NouveauCompte saisie, string role) => new(
        $"cpt-{Guid.NewGuid():N}",
        organisationId,
        Normaliser(saisie.Identifiant),
        saisie.Nom!.Trim(),
        role,
        motsDePasse.Hacher(saisie.MotDePasse!),
        time.GetUtcNow().ToUnixTimeMilliseconds());

    /// <summary>
    /// Le titulaire change son mot de passe : l'actuel est exigé (une session laissée ouverte ne suffit pas), le
    /// nouveau suit les mêmes règles qu'à la création. Erreurs sur « actuel » ou « nouveau ».
    /// </summary>
    public async Task<IReadOnlyList<ErreurChamp>> ChangerMotDePasseAsync(string identifiant, string? actuel, string? nouveau, CancellationToken ct = default)
    {
        if (await AuthentifierAsync(identifiant, actuel, ct) is not { } compte) return [new ErreurChamp("actuel", "Mot de passe actuel incorrect.")];
        var erreurs = Verifier(new NouveauCompte(compte.Identifiant, compte.Nom, nouveau))
            .Where(e => e.Champ == "motDePasse")
            .Select(e => e with { Champ = "nouveau" })
            .ToList();
        if (erreurs.Count == 0 && nouveau == actuel) erreurs.Add(new ErreurChamp("nouveau", "Le nouveau mot de passe doit différer de l'actuel."));
        if (erreurs.Count > 0) return erreurs;
        return await comptes.ChangerEmpreinteAsync(compte.Id, motsDePasse.Hacher(nouveau!), ct) ? [] : [new ErreurChamp("actuel", "Compte introuvable.")];
    }

    public Task<IReadOnlyList<Compte>> ComptesAsync(string organisationId, CancellationToken ct = default) => comptes.ComptesAsync(organisationId, ct);

    public Task<Organisation?> OrganisationAsync(string organisationId, CancellationToken ct = default) => comptes.OrganisationAsync(organisationId, ct);
}
