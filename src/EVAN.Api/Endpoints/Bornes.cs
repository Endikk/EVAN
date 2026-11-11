namespace EVAN.Api.Endpoints;

/// <summary>
/// Bornes des saisies reçues sans compte (journal, interventions, tests de liaison). Sans elles, une boucle de requêtes
/// remplirait la mémoire et la base, et un texte arbitrairement long partirait tel quel dans le contexte de l'assistant
/// et du MCP, ou vers la passerelle d'une usine.
/// </summary>
internal static class Bornes
{
    public const int Identifiant = 64;
    public const int Auteur = 80;
    public const int Message = 500;
    public const int Titre = 200;
    public const int CompteRendu = 4000;
    /// <summary>Paramètres d'un test de liaison : les protocoles en demandent cinq ou six, rien ne justifie davantage.</summary>
    public const int ParametresMax = 16;
    /// <summary>Valeur d'un paramètre : une adresse OPC UA ou une URL JMF tient largement dedans.</summary>
    public const int Parametre = 512;
    /// <summary>
    /// Protocoles d'EVAN (contrat du front, Protocole). La passerelle réelle teste les quatre premiers et refuse les
    /// autres d'elle-même ; la passerelle de démonstration du simulateur répond pour tous. Le reste n'existe pas.
    /// </summary>
    public static readonly string[] Protocoles = ["opcua", "modbus", "s7", "jmf", "mqtt", "simulateur"];
    /// <summary>Corps de requête maximal, hors assistant et MCP (128 ko, posés par leur garde).</summary>
    public const long CorpsMax = 64 * 1024;
    /// <summary>Durée d'une intervention, en minutes : une semaine au plus.</summary>
    public const double DureeMaxMinutes = 7 * 24 * 60;
    /// <summary>Date d'une intervention : pas plus ancienne que l'historique conservé, pas dans le futur.</summary>
    public static readonly TimeSpan Anciennete = TimeSpan.FromDays(400);
    public static readonly TimeSpan Avance = TimeSpan.FromDays(1);

    /// <summary>Types d'événement du journal (contrat du front, TypeEvenement).</summary>
    public static readonly string[] TypesEvenement = ["etat", "alarme", "action", "connexion", "systeme"];

    public static string? Evenement(SiteEndpoints.EventRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Message) || !TypesEvenement.Contains(req.Type)) return "Type (etat, alarme, action, connexion, systeme) et message requis.";
        return Longueur(req.Message, Message, "Message")
            ?? Longueur(req.MachineId, Identifiant, "Machine")
            ?? Longueur(req.Auteur, Auteur, "Auteur");
    }

    public static string? Saisie(ExploitationEndpoints.SaisieRequest req, DateTimeOffset maintenant)
    {
        if (req.Duree is < 0 or > DureeMaxMinutes || double.IsNaN(req.Duree)) return $"Durée : entre 0 et {DureeMaxMinutes} minutes.";
        var date = DateTimeOffset.FromUnixTimeMilliseconds(Math.Clamp(req.Date, 0, DateTimeOffset.MaxValue.ToUnixTimeMilliseconds()));
        if (date < maintenant - Anciennete || date > maintenant + Avance) return "Date hors de la période conservée.";
        return Longueur(req.Titre, Titre, "Intitulé")
            ?? Longueur(req.CompteRendu, CompteRendu, "Compte rendu")
            ?? Longueur(req.Auteur, Auteur, "Auteur")
            ?? Longueur(req.Id, Identifiant, "Identifiant")
            ?? Longueur(req.MachineId, Identifiant, "Machine")
            ?? Longueur(req.OrganeId, Identifiant, "Organe")
            ?? Longueur(req.TacheId, Identifiant, "Tâche")
            ?? (req.OrganeId is { Length: > 0 } organe && !OrganeDe(organe, req.MachineId) ? "Organe : il n'appartient pas à cette machine." : null);
    }

    /// <summary>Durée d'une intervention planifiée, en minutes : une journée au plus, comme la fenêtre de planification.</summary>
    public const double DureePrevueMaxMinutes = 24 * 60;
    /// <summary>Date d'une intervention planifiée : un peu plus d'un an d'avance au plus, et pas plus ancienne que l'historique.</summary>
    public static readonly TimeSpan AvancePlanification = TimeSpan.FromDays(400);

    /// <summary>
    /// Intervention planifiée. La date peut être passée : « Annuler » remet une intervention planifiée telle qu'elle était,
    /// même si son heure est dépassée. Le point en dérive qui l'a fait planifier est un point de la même machine.
    /// </summary>
    public static string? Prevue(ExploitationEndpoints.PrevueRequest req, DateTimeOffset maintenant)
    {
        if (string.IsNullOrWhiteSpace(req.Titre) || string.IsNullOrWhiteSpace(req.MachineId)) return "Machine et intitulé requis.";
        if (double.IsNaN(req.Duree) || req.Duree is <= 0 or > DureePrevueMaxMinutes) return $"Durée : plus de 0 et {DureePrevueMaxMinutes} minutes au plus.";
        var date = DateTimeOffset.FromUnixTimeMilliseconds(Math.Clamp(req.Date, 0, DateTimeOffset.MaxValue.ToUnixTimeMilliseconds()));
        if (date < maintenant - Anciennete || date > maintenant + AvancePlanification) return "Date hors de la période de planification.";
        return Longueur(req.Titre, Titre, "Intitulé")
            ?? Longueur(req.Auteur, Auteur, "Auteur")
            ?? Longueur(req.Id, Identifiant, "Identifiant")
            ?? Longueur(req.MachineId, Identifiant, "Machine")
            ?? Longueur(req.OrganeId, Identifiant, "Organe")
            ?? Longueur(req.TacheId, Identifiant, "Tâche")
            ?? Longueur(req.PointId, Identifiant, "Point")
            ?? (req.OrganeId is { Length: > 0 } organe && !OrganeDe(organe, req.MachineId) ? "Organe : il n'appartient pas à cette machine." : null)
            ?? (req.PointId is { Length: > 0 } point && !point.StartsWith($"{req.MachineId}.o", StringComparison.Ordinal) ? "Point : il n'appartient pas à cette machine." : null);
    }

    /// <summary>Un organe porte l'identifiant de sa machine : {machineId}.o{numero} (ReferenceData.OrganeId).</summary>
    private static bool OrganeDe(string organeId, string? machineId)
    {
        var prefixe = $"{machineId}.o";
        return !string.IsNullOrEmpty(machineId) && organeId.Length > prefixe.Length
            && organeId.StartsWith(prefixe, StringComparison.Ordinal) && organeId[prefixe.Length..].All(char.IsAsciiDigit);
    }

    /// <summary>
    /// Test de liaison : machine nommée, protocole que la passerelle sait tester, identifiants et paramètres bornés. Ce
    /// qui part vers la passerelle d'une usine reste petit, quel que soit le corps reçu.
    /// </summary>
    public static string? TestLiaison(ConnectionEndpoints.TestRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.MachineId)) return "Machine requise.";
        if (!Protocoles.Contains(req.Protocole)) return $"Protocole : {string.Join(", ", Protocoles)}.";
        if (req.Parametres is { Count: > ParametresMax }) return $"Paramètres : {ParametresMax} au plus.";
        return Longueur(req.MachineId, Identifiant, "Machine")
            ?? Longueur(req.SiteId, Identifiant, "Usine")
            ?? Longueur(req.GatewayId, Identifiant, "Passerelle")
            ?? (req.Parametres ?? []).Select(p => Longueur(p.Key, Identifiant, "Nom de paramètre") ?? Longueur(p.Value, Parametre, $"Paramètre « {p.Key} »"))
                .FirstOrDefault(e => e is not null);
    }

    private static string? Longueur(string? valeur, int max, string champ) =>
        valeur is { Length: var n } && n > max ? $"{champ} : {max} caractères au plus." : null;
}
