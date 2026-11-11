using System.ComponentModel;
using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using EVAN.Application.Exploitation;
using EVAN.Core.Contracts;
using Microsoft.Extensions.AI;

namespace EVAN.Application.Assistant;

/// <summary>Marque une méthode de <see cref="EvanTools"/> comme outil, sous son nom d'outil (snake_case).</summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class OutilEvanAttribute(string nom, string titre) : Attribute
{
    public string Nom { get; } = nom;
    /// <summary>Titre lisible, affiché par les clients MCP et l'application.</summary>
    public string Titre { get; } = titre;
}

/// <summary>
/// Outils d'EVAN, définis une seule fois : l'assistant intégré (« Demander à EVAN ») les donne à Claude, le serveur MCP
/// (EVAN.Mcp) les expose à tout client MCP (Claude Desktop, Claude Code, une application Laravel…). Tous en lecture
/// seule : ils lisent l'historique, le carnet et ses interventions planifiées, l'énergie et l'état en direct, ils ne
/// pilotent aucune machine et ne planifient rien.
/// </summary>
public sealed class EvanTools(ExploitationService exploitation)
{
    /// <summary>
    /// Méthodes marquées <see cref="OutilEvanAttribute"/>, dans l'ordre de déclaration. GetMethods ne garantit aucun
    /// ordre : on trie sur le jeton de métadonnées, qui suit la déclaration. Les outils ouvrent le prompt envoyé au
    /// modèle : un ordre qui changerait d'un démarrage à l'autre invaliderait tout le cache de prompt.
    /// </summary>
    public static IReadOnlyList<(MethodInfo Methode, OutilEvanAttribute Outil)> Methodes { get; } = typeof(EvanTools)
        .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
        .OrderBy(m => m.MetadataToken)
        .Select(m => (m, m.GetCustomAttribute<OutilEvanAttribute>()))
        .Where(x => x.Item2 is not null)
        .Select(x => (x.m, x.Item2!))
        .ToList();

    /// <summary>
    /// Sérialisation des réponses d'outils : celle du contrat (camelCase, nuls omis), accents laissés tels quels pour que
    /// le modèle lise du français et non des séquences é.
    /// </summary>
    public static readonly JsonSerializerOptions JsonOutils = new(Json.Options)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        // Résolveur explicite : le serveur MCP fige ces options, ce qui exige un résolveur de types déclaré.
        TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
    };

    /// <summary>Les outils sous forme de fonctions pour un <see cref="IChatClient"/>.</summary>
    public IReadOnlyList<AIFunction> Fonctions() =>
        Methodes.Select(x => AIFunctionFactory.Create(x.Methode, this, new AIFunctionFactoryOptions { Name = x.Outil.Nom, SerializerOptions = JsonOutils })).ToList();

    [OutilEvan("organisation", "Usines de l'organisation")]
    [Description("Liste les usines de l'organisation : adresse, nombre de machines, état en direct (en production, en panne, alarmes actives) et indicateurs des 7 derniers jours (TRS, arrêts sur panne, alarmes critiques, énergie, maintenance en retard). Point de départ pour situer une question.")]
    public object Organisation() => exploitation.Organisation();

    [OutilEvan("machines", "Machines et organes")]
    [Description("Machines d'une usine : identifiant, numéro (R01…), nom, type, zone, organes et leurs points de mesure (clé, unité, valeur nominale, seuils).")]
    public object Machines([Description("Usine : identifiant (site-tours), nom ou ville ; par défaut la première usine.")] string? usine = null) =>
        exploitation.Machines(usine);

    [OutilEvan("etat_usine", "État en direct")]
    [Description("État en direct d'une usine : chaque machine (marche, calage, panne, arrêt, depuis combien de temps, vitesse), alarmes actives et mesures hors de leur plage.")]
    public object EtatUsine([Description("Usine : identifiant, nom ou ville.")] string? usine = null) => exploitation.EtatUsine(usine);

    [OutilEvan("alarmes", "Journal des alarmes")]
    [Description("Alarmes des dernières heures (historique et direct), de la plus récente à la plus ancienne : code, machine, organe, heure, durée d'arrêt, temps d'acquittement, cause probable, intervention type, règle (seuil, dérive, répétitif, automate). Chaque alarme a un identifiant pour l'outil chronologie_panne.")]
    public object Alarmes(
        [Description("Usine : identifiant, nom ou ville.")] string? usine = null,
        [Description("Machine : identifiant, numéro (R01) ou nom (Gallus) ; toutes les machines si absent.")] string? machine = null,
        [Description("Fenêtre en heures, de 1 à 168 (7 jours).")] double heures = 24,
        [Description("Code d'alarme à filtrer (ex. EM-01).")] string? code = null) =>
        exploitation.Alarmes(usine, machine, heures, code);

    [OutilEvan("arrets", "Arrêts et TRS")]
    [Description("Arrêts et performance sur la période : TRS, disponibilité, heures de panne et de calage par machine et par organe, codes d'alarme les plus fréquents et les plus longs, temps moyen de réparation.")]
    public object Arrets(
        [Description("Usine : identifiant, nom ou ville.")] string? usine = null,
        [Description("Période en jours, de 1 à 7.")] double jours = 7,
        [Description("Machine : identifiant, numéro ou nom ; toutes si absent.")] string? machine = null) =>
        exploitation.Arrets(usine, jours, machine);

    [OutilEvan("chronologie_panne", "Chronologie d'une panne")]
    [Description("Chronologie d'une panne passée, étape par étape : début de la dérive de la mesure, seuil d'attention, alarme et arrêt, acquittement, fin d'intervention, redémarrage, retour en production, avec les valeurs et les seuils.")]
    public object ChronologiePanne([Description("Identifiant de l'alarme renvoyé par l'outil alarmes (ex. h-m-r01-1791443880).")] string alarme) =>
        exploitation.ChronologiePanne(alarme);

    [OutilEvan("carnet_maintenance", "Carnet de maintenance")]
    [Description("Carnet de maintenance : indicateurs sur 7 jours (MTBF, MTTR, temps d'acquittement, part du préventif), tâches du plan à planifier ou en retard (systématiques et conditionnelles, avec l'intervention planifiée qui s'en charge), interventions planifiées de la plus proche à la plus lointaine (date, jour relatif, machine, organe, tâche du plan rattachée, statut : prevue ; en_retard quand sa tâche a déjà dépassé sa limite ; a_consigner quand son jour est passé sans qu'elle soit consignée), dérives détectées avec la date probable du franchissement de seuil (maintenance prévisionnelle), dernières interventions et leur compte rendu. Pour « qu'est-ce qui est prévu cette semaine » ou « quand est prévu le changement de lampe UV de R04 ».")]
    public object CarnetMaintenance(
        [Description("Usine : identifiant, nom ou ville.")] string? usine = null,
        [Description("Machine : identifiant, numéro ou nom ; toute l'usine si absent.")] string? machine = null) =>
        exploitation.CarnetMaintenance(usine, machine);

    [OutilEvan("energie", "Énergie et CO₂")]
    [Description("Énergie et CO₂ sur la période : kWh par état (production, calage, veille, panne), par machine, intensité en kWh pour 1 000 étiquettes imprimées, pic de la courbe de charge, émissions, coût et gisements d'économie chiffrés à l'année.")]
    public object Energie(
        [Description("Usine : identifiant, nom ou ville.")] string? usine = null,
        [Description("Période en jours, de 1 à 7.")] double jours = 7,
        [Description("Machine : identifiant, numéro ou nom ; toute l'usine si absent.")] string? machine = null) =>
        exploitation.EnergieUsine(usine, jours, machine);

    [OutilEvan("diagnostic_defaut_repetitif", "Défaut répétitif")]
    [Description("Un défaut revient au même pas sur la bande imprimée : trouve la pièce tournante (cylindre, rouleau, anilox) dont le développement correspond à l'écart mesuré entre deux défauts. Classe les candidats par vraisemblance.")]
    public object DiagnosticDefautRepetitif(
        [Description("Machine : identifiant, numéro ou nom.")] string machine,
        [Description("Écart mesuré entre deux défauts identiques, en millimètres (pas d'étiquette × nombre d'étiquettes si on compte en étiquettes).")] double pasMm,
        [Description("Usine : identifiant, nom ou ville.")] string? usine = null,
        [Description("Aspect du défaut s'il est connu : impression, decoupe, marque ou dorure.")] string? nature = null) =>
        exploitation.DiagnosticDefautRepetitif(machine, pasMm, usine, nature);

    [OutilEvan("mesure", "Courbe d'une mesure")]
    [Description("Courbe d'une mesure d'une machine sur la période (minimum, moyenne et maximum par tranche), ses seuils et sa valeur en direct.")]
    public object Mesure(
        [Description("Machine : identifiant, numéro ou nom.")] string machine,
        [Description("Mesure : clé (tension, puissance_uv…) ou morceau de son libellé.")] string point,
        [Description("Usine : identifiant, nom ou ville.")] string? usine = null,
        [Description("Fenêtre en heures, de 1 à 168.")] double heures = 24) =>
        exploitation.Mesure(machine, point, usine, heures);
}
