using EVAN.Core.Domain.Machines;
using EVAN.Core.Domain.Sites;

namespace EVAN.Application.Usines;

// Configuration d'une usine telle que l'assistant du front la construit (étapes 1 à 5), formes JSON de
// src/EVAN.Front/src/domain/types.ts : le front envoie ses objets tels quels et relit les mêmes.

/// <summary>Alarme de l'automate rattachée à un organe (code et message du constructeur).</summary>
public sealed record AlarmeOrgane(string Code, string Message);

/// <summary>Organe d'une machine, forme du front (capteurs et pannes typiques compris, alarme imbriquée).</summary>
public sealed record OrganeConfig(
    string Id,
    string MachineId,
    int Numero,
    string Nom,
    string? Noeud3d = null,
    double[]? Position = null,
    List<string>? Capteurs = null,
    List<string>? PannesTypiques = null,
    string? Methode = null,
    AlarmeOrgane? Alarme = null)
{
    public Organe VersDomaine() => new(Id, MachineId, Numero, Nom, Noeud3d, Position, Methode, Alarme?.Code, Alarme?.Message);
}

/// <summary>
/// Configuration complète d'une usine : site, bâtiments, zones, machines, organes et points de chaque machine (ceux que
/// le front affiche, catalogue et saisies confondus), connexions de l'étape 5. Configure : l'usine s'ouvre sur la
/// supervision. Les listes arrivent du client : elles peuvent manquer, la validation le dit.
/// </summary>
public sealed record ConfigurationUsine(
    Site Site,
    List<Batiment> Batiments,
    List<Zone> Zones,
    List<Machine> Machines,
    List<OrganeConfig> Organes,
    List<PointDeMesure> Points,
    List<Connexion> Connexions,
    bool Configure = false);

/// <summary>Usine enregistrée par une organisation réelle (jamais celle de la démo).</summary>
public sealed record UsineEnregistree(string OrganisationId, ConfigurationUsine Configuration)
{
    public string SiteId => Configuration.Site.Id;
}

/// <summary>
/// Un identifiant de la configuration appartient déjà à une autre usine : la base garde des identifiants uniques dans
/// toute l'installation (sujets MQTT, séries, alarmes). Champ : où il se trouve dans la configuration.
/// </summary>
public sealed class IdentifiantPrisException(string champ, string message) : Exception(message)
{
    public string Champ { get; } = champ;
}
