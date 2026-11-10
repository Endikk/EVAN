using System.Text.RegularExpressions;
using EVAN.Application.Validation;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;
using EVAN.Core.Domain.Sites;

namespace EVAN.Application.Usines;

/// <summary>
/// Validation stricte d'une configuration d'usine, avant toute écriture : tailles, nombre d'éléments, bornes
/// numériques, valeurs connues, renvois entre éléments et identifiants uniques. Chaque refus nomme son champ
/// (« machines[3].nom ») et le dit en clair, avec la machine ou le bâtiment concerné.
/// Les identifiants d'usine et de machine entrent dans les sujets MQTT (evan/v1/{usine}/{machine}/…) : ni point, ni
/// barre, ni joker. Ceux des organes et des points suivent la convention partagée avec le front ({machine}.o{n}.{clé}).
/// </summary>
public static partial class ValidationUsine
{
    public const int BatimentsMax = 20;
    public const int ZonesMax = 200;
    public const int MachinesMax = 300;
    public const int OrganesParMachine = 60;
    public const int PointsParMachine = 200;
    public const int OrganesMax = 5000;
    public const int PointsMax = 10_000;
    public const int SommetsContour = 2000;
    public const int SommetsZone = 200;
    public const int ParametresMax = 30;
    public const int AssociationsMax = 500;
    public const int Texte = 120;
    public const int Adresse = 300;
    public const int TexteLong = 2000;
    public const int ElementsListe = 30;
    /// <summary>Distance au repère du site (m) : bien au-delà du plus grand site industriel.</summary>
    public const double PositionMax = 5000;
    public const double ValeurMax = 1e9;
    /// <summary>Au-delà, la liste des refus ne dit plus rien de plus utile : on s'arrête.</summary>
    public const int ErreursMax = 50;

    public static readonly string[] SourcesEmprise = ["bdtopo", "osm", "manuel", "demo"];
    public static readonly string[] TypesZone = ["atelier", "stock", "expedition", "prepresse", "faconnage", "bureaux"];
    public static readonly string[] TypesMesure =
        ["tension", "temperature", "vitesse", "pression", "alarme", "ph", "conductivite", "viscosite", "puissance", "reperage", "comptage", "taux", "diametre", "couple", "densite", "longueur", "usure"];
    public static readonly string[] Protocoles = ["opcua", "modbus", "s7", "jmf", "mqtt", "simulateur"];
    public static readonly string[] EtatsConnexion = ["a_configurer", "test", "connectee", "erreur"];

    /// <summary>Identifiant d'usine, de machine ou de passerelle : un segment de sujet MQTT.</summary>
    [GeneratedRegex(@"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")]
    public static partial Regex SegmentMqtt();

    /// <summary>Identifiant de bâtiment, de zone ou de connexion.</summary>
    [GeneratedRegex(@"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$")]
    private static partial Regex Identifiant();

    /// <summary>Suffixe d'un point après son organe : la clé du catalogue ou un identifiant saisi (p-…).</summary>
    [GeneratedRegex(@"^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex SuffixePoint();

    [GeneratedRegex(@"^[A-Za-z0-9_]{1,60}$")]
    private static partial Regex Cle();

    [GeneratedRegex(@"^[A-Za-z][A-Za-z0-9_]{0,39}$")]
    private static partial Regex CleParametre();

    /// <summary>Modèle 3D du kit, servi par le front. Un modèle importé (adresse blob:) reste dans le navigateur.</summary>
    [GeneratedRegex(@"^/kit/modeles/[A-Za-z0-9_-]{1,64}\.glb$")]
    private static partial Regex ModeleKit();

    [GeneratedRegex(@"^\d{14}$")]
    private static partial Regex Siret();

    /// <summary>Champs refusés de la configuration ; vide si elle est recevable.</summary>
    public static IReadOnlyList<ErreurChamp> Verifier(string siteId, ConfigurationUsine? c, Catalogue catalogue)
    {
        var v = new Verificateur();
        if (c is null)
        {
            v.Ajouter("", "Configuration absente.");
            return v.Erreurs;
        }
        Site(v, siteId, c.Site);
        if (!v.Liste("batiments", c.Batiments, BatimentsMax, "bâtiments") | !v.Liste("zones", c.Zones, ZonesMax, "zones")
            | !v.Liste("machines", c.Machines, MachinesMax, "machines") | !v.Liste("organes", c.Organes, OrganesMax, "organes")
            | !v.Liste("points", c.Points, PointsMax, "points de mesure") | !v.Liste("connexions", c.Connexions, MachinesMax, "connexions"))
            return v.Erreurs;

        var batiments = Batiments(v, siteId, c.Batiments);
        var zones = Zones(v, c.Zones, batiments);
        var machines = Machines(v, c.Machines, batiments, zones, catalogue);
        var organes = Organes(v, c.Organes, machines);
        var points = Points(v, c.Points, machines, organes);
        Connexions(v, c.Connexions, machines, points);
        if (c.Batiments.Count == 0) v.Ajouter("batiments", "Au moins un bâtiment relevé est nécessaire (étape 1).");
        return v.Erreurs;
    }

    private static void Site(Verificateur v, string siteId, Site? s)
    {
        if (s is null)
        {
            v.Ajouter("site", "Adresse de l'usine requise (étape 1).");
            return;
        }
        if (s.Id != siteId) v.Ajouter("site.id", "L'identifiant de l'usine ne correspond pas à l'adresse de la requête.");
        if (!SegmentMqtt().IsMatch(siteId)) v.Ajouter("site.id", "Identifiant d'usine invalide : lettres, chiffres, - et _, 64 caractères au plus.");
        v.Texte("site.nom", "Nom de l'usine", s.Nom, Texte, requis: true);
        v.Texte("site.adresse", "Adresse", s.Adresse, Adresse);
        v.LonLat("site.coordonnees", "Coordonnées de l'usine", s.Coordonnees);
        if (s.Repere is null) v.Ajouter("site.repere", "Repère du site requis.");
        else
        {
            v.LonLat("site.repere.origin", "Origine du repère", s.Repere.Origin);
            v.Nombre("site.repere.angleDeg", "Angle du repère", s.Repere.AngleDeg, -360, 360);
        }
        if (s.Siret is { } siret && !Siret().IsMatch(siret)) v.Ajouter("site.siret", "SIRET : 14 chiffres.");
        if (s.Passerelle is { } gw && !SegmentMqtt().IsMatch(gw)) v.Ajouter("site.passerelle", "Passerelle : lettres, chiffres, - et _, 64 caractères au plus.");
        if (s.SurfaceAnnoncee is { } surface) v.Nombre("site.surfaceAnnoncee", "Surface annoncée", surface, 0, 10_000_000);
    }

    private static HashSet<string> Batiments(Verificateur v, string siteId, List<Batiment> liste)
    {
        var ids = new HashSet<string>();
        for (var i = 0; i < liste.Count; i++)
        {
            var b = liste[i];
            var champ = $"batiments[{i}]";
            if (b is null) { v.Ajouter(champ, $"Bâtiment {i + 1} vide."); continue; }
            var nom = $"Bâtiment « {Court(b.Nom) ?? (i + 1).ToString()} »";
            v.Id($"{champ}.id", nom, b.Id, Identifiant(), ids);
            if (b.SiteId != siteId) v.Ajouter($"{champ}.siteId", $"{nom} : rattaché à une autre usine.");
            v.Texte($"{champ}.nom", $"{nom} : nom", b.Nom, Texte, requis: true);
            if (b.Contour is not { Length: >= 3 }) v.Ajouter($"{champ}.contour", $"{nom} : contour de 3 sommets au moins.");
            else if (b.Contour.Length > SommetsContour) v.Ajouter($"{champ}.contour", $"{nom} : {SommetsContour} sommets au plus.");
            else for (var j = 0; j < b.Contour.Length && v.Ouvert; j++) v.LonLat($"{champ}.contour[{j}]", $"{nom} : sommet {j + 1}", b.Contour[j]);
            if (b.Sigmas is null || b.Contour is not null && b.Sigmas.Length != b.Contour.Length) v.Ajouter($"{champ}.sigmas", $"{nom} : une précision par sommet.");
            else if (b.Sigmas.Any(x => !double.IsFinite(x) || x < 0 || x > 1000)) v.Ajouter($"{champ}.sigmas", $"{nom} : précision des sommets entre 0 et 1000 m.");
            v.Nombre($"{champ}.hauteur", $"{nom} : hauteur", b.Hauteur, 0, 500);
            if (b.Niveaux is < 0 or > 200) v.Ajouter($"{champ}.niveaux", $"{nom} : niveaux entre 0 et 200.");
            if (!SourcesEmprise.Contains(b.Source)) v.Ajouter($"{champ}.source", $"{nom} : source inconnue ({string.Join(", ", SourcesEmprise)}).");
            v.Texte($"{champ}.sourceRef", $"{nom} : référence de la source", b.SourceRef, 100);
            v.Texte($"{champ}.rnb", $"{nom} : identifiant RNB", b.Rnb, 32);
            v.Texte($"{champ}.usage", $"{nom} : usage", b.Usage, Texte);
            if (b.PrecisionSource is { } p) v.Nombre($"{champ}.precisionSource", $"{nom} : précision de la source", p, 0, 1000);
        }
        return ids;
    }

    private static HashSet<string> Zones(Verificateur v, List<Zone> liste, HashSet<string> batiments)
    {
        var ids = new HashSet<string>();
        for (var i = 0; i < liste.Count; i++)
        {
            var z = liste[i];
            var champ = $"zones[{i}]";
            if (z is null) { v.Ajouter(champ, $"Zone {i + 1} vide."); continue; }
            var nom = $"Zone « {Court(z.Nom) ?? (i + 1).ToString()} »";
            v.Id($"{champ}.id", nom, z.Id, Identifiant(), ids);
            if (!batiments.Contains(z.BatimentId ?? "")) v.Ajouter($"{champ}.batimentId", $"{nom} : bâtiment inconnu.");
            v.Texte($"{champ}.nom", $"{nom} : nom", z.Nom, Texte, requis: true);
            if (!TypesZone.Contains(z.Type)) v.Ajouter($"{champ}.type", $"{nom} : type inconnu ({string.Join(", ", TypesZone)}).");
            if (z.Polygone is not { Length: >= 3 }) v.Ajouter($"{champ}.polygone", $"{nom} : 3 sommets au moins.");
            else if (z.Polygone.Length > SommetsZone) v.Ajouter($"{champ}.polygone", $"{nom} : {SommetsZone} sommets au plus.");
            else if (z.Polygone.Any(p => !v.Plan(p))) v.Ajouter($"{champ}.polygone", $"{nom} : sommets à moins de {PositionMax} m du repère du site.");
        }
        return ids;
    }

    private static Dictionary<string, Machine> Machines(Verificateur v, List<Machine> liste, HashSet<string> batiments, HashSet<string> zones, Catalogue catalogue)
    {
        var ids = new HashSet<string>();
        var machines = new Dictionary<string, Machine>();
        for (var i = 0; i < liste.Count; i++)
        {
            var m = liste[i];
            var champ = $"machines[{i}]";
            if (m is null) { v.Ajouter(champ, $"Machine {i + 1} vide."); continue; }
            var nom = $"Machine {Court(m.Numero) ?? (i + 1).ToString()}";
            if (v.Id($"{champ}.id", nom, m.Id, SegmentMqtt(), ids))
            {
                if (m.Id is "gateway" or "sim") v.Ajouter($"{champ}.id", $"{nom} : identifiant réservé.");
                machines[m.Id] = m;
            }
            if (!batiments.Contains(m.BatimentId ?? "")) v.Ajouter($"{champ}.batimentId", $"{nom} : placée hors des bâtiments relevés.");
            if (m.ZoneId is { } zone && !zones.Contains(zone)) v.Ajouter($"{champ}.zoneId", $"{nom} : zone inconnue.");
            if (m.Type != "custom" && !catalogue.Types.ContainsKey(m.Type ?? "")) v.Ajouter($"{champ}.type", $"{nom} : type de machine inconnu du catalogue.");
            v.Texte($"{champ}.nom", $"{nom} : nom", m.Nom, Texte, requis: true);
            v.Texte($"{champ}.numero", $"{nom} : numéro", m.Numero, 20, requis: true);
            if (m.Position is not { Length: 2 } || !v.Plan(m.Position)) v.Ajouter($"{champ}.position", $"{nom} : position à moins de {PositionMax} m du repère du site.");
            v.Nombre($"{champ}.rotationDeg", $"{nom} : rotation", m.RotationDeg, -3600, 3600);
            if (m.Modele?.Url is not { } url || !ModeleKit().IsMatch(url))
                v.Ajouter($"{champ}.modele.url", $"{nom} : modèle 3D hors du kit. Un modèle importé reste dans ce navigateur : remplacez-le par un modèle du kit pour l'enregistrer.");
            if (m.CreeLe is < 0) v.Ajouter($"{champ}.creeLe", $"{nom} : date d'ajout invalide.");
        }
        return machines;
    }

    private static Dictionary<string, OrganeConfig> Organes(Verificateur v, List<OrganeConfig> liste, Dictionary<string, Machine> machines)
    {
        var ids = new HashSet<string>();
        var organes = new Dictionary<string, OrganeConfig>();
        var parMachine = new Dictionary<string, int>();
        for (var i = 0; i < liste.Count; i++)
        {
            var o = liste[i];
            var champ = $"organes[{i}]";
            if (o is null) { v.Ajouter(champ, $"Organe {i + 1} vide."); continue; }
            var machine = o.MachineId is not null ? machines.GetValueOrDefault(o.MachineId) : null;
            var nom = $"Organe {o.Numero}{(machine is null ? "" : $" de {Court(machine.Numero)}")}";
            if (machine is null) { v.Ajouter($"{champ}.machineId", $"{nom} : machine inconnue."); continue; }
            if (o.Numero is < 0 or > 999) v.Ajouter($"{champ}.numero", $"{nom} : numéro entre 0 et 999.");
            if (o.Id != ReferenceData.OrganeId(machine.Id, o.Numero)) v.Ajouter($"{champ}.id", $"{nom} : identifiant attendu {ReferenceData.OrganeId(machine.Id, o.Numero)}.");
            else if (!ids.Add(o.Id)) v.Ajouter($"{champ}.id", $"{nom} : en double.");
            else organes[o.Id] = o;
            if ((parMachine[machine.Id] = parMachine.GetValueOrDefault(machine.Id) + 1) == OrganesParMachine + 1)
                v.Ajouter("organes", $"Machine {Court(machine.Numero)} : {OrganesParMachine} organes au plus.");
            v.Texte($"{champ}.nom", $"{nom} : nom", o.Nom, Texte, requis: true);
            v.Texte($"{champ}.noeud3d", $"{nom} : nœud 3D", o.Noeud3d, Texte);
            if (o.Position is { } p && (p.Length != 3 || p.Any(x => !double.IsFinite(x) || Math.Abs(x) > 1000))) v.Ajouter($"{champ}.position", $"{nom} : position 3D invalide.");
            v.Liste($"{champ}.capteurs", $"{nom} : capteurs", o.Capteurs);
            v.Liste($"{champ}.pannesTypiques", $"{nom} : pannes typiques", o.PannesTypiques);
            v.Texte($"{champ}.methode", $"{nom} : méthode de diagnostic", o.Methode, TexteLong);
            if (o.Alarme is { } a)
            {
                v.Texte($"{champ}.alarme.code", $"{nom} : code d'alarme", a.Code, 32, requis: true);
                v.Texte($"{champ}.alarme.message", $"{nom} : message d'alarme", a.Message, Adresse);
            }
        }
        return organes;
    }

    private static Dictionary<string, PointDeMesure> Points(Verificateur v, List<PointDeMesure> liste, Dictionary<string, Machine> machines, Dictionary<string, OrganeConfig> organes)
    {
        var points = new Dictionary<string, PointDeMesure>();
        var parMachine = new Dictionary<string, int>();
        for (var i = 0; i < liste.Count; i++)
        {
            var p = liste[i];
            var champ = $"points[{i}]";
            if (p is null) { v.Ajouter(champ, $"Point de mesure {i + 1} vide."); continue; }
            var machine = p.MachineId is not null ? machines.GetValueOrDefault(p.MachineId) : null;
            var nom = $"Mesure « {Court(p.Libelle) ?? p.Cle} »{(machine is null ? "" : $" de {Court(machine.Numero)}")}";
            if (machine is null) { v.Ajouter($"{champ}.machineId", $"{nom} : machine inconnue."); continue; }
            if (p.OrganeId is null || !organes.TryGetValue(p.OrganeId, out var organe) || organe.MachineId != machine.Id)
                v.Ajouter($"{champ}.organeId", $"{nom} : organe inconnu sur cette machine.");
            else if (p.Id is null || !p.Id.StartsWith(organe.Id + ".", StringComparison.Ordinal) || !SuffixePoint().IsMatch(p.Id[(organe.Id.Length + 1)..]))
                v.Ajouter($"{champ}.id", $"{nom} : identifiant attendu de la forme {organe.Id}.<clé>.");
            else if (!points.TryAdd(p.Id, p)) v.Ajouter($"{champ}.id", $"{nom} : en double.");
            if ((parMachine[machine.Id] = parMachine.GetValueOrDefault(machine.Id) + 1) == PointsParMachine + 1)
                v.Ajouter("points", $"Machine {Court(machine.Numero)} : {PointsParMachine} points de mesure au plus.");
            if (p.Cle is null || !Cle().IsMatch(p.Cle)) v.Ajouter($"{champ}.cle", $"{nom} : clé de 60 lettres, chiffres ou _ au plus.");
            v.Texte($"{champ}.libelle", $"{nom} : libellé", p.Libelle, Texte, requis: true);
            if (!TypesMesure.Contains(p.Type)) v.Ajouter($"{champ}.type", $"{nom} : type de mesure inconnu.");
            v.Texte($"{champ}.unite", $"{nom} : unité", p.Unite, 20);
            v.Nombre($"{champ}.nominal", $"{nom} : valeur nominale", p.Nominal, -ValeurMax, ValeurMax);
            if (p.Seuils is null) v.Ajouter($"{champ}.seuils", $"{nom} : seuils requis (vides si aucun).");
            else
            {
                foreach (var (cle, valeur) in new[] { ("alarmeBas", p.Seuils.AlarmeBas), ("attentionBas", p.Seuils.AttentionBas), ("attentionHaut", p.Seuils.AttentionHaut), ("alarmeHaut", p.Seuils.AlarmeHaut) })
                    if (valeur is { } x) v.Nombre($"{champ}.seuils.{cle}", $"{nom} : seuil", x, -ValeurMax, ValeurMax);
            }
            if (p.Protocole is { } proto && !Protocoles.Contains(proto)) v.Ajouter($"{champ}.protocole", $"{nom} : protocole inconnu.");
            v.Texte($"{champ}.adresse", $"{nom} : adresse de la variable", p.Adresse, 200);
        }
        return points;
    }

    private static void Connexions(Verificateur v, List<Connexion> liste, Dictionary<string, Machine> machines, Dictionary<string, PointDeMesure> points)
    {
        var ids = new HashSet<string>();
        var connectees = new HashSet<string>();
        for (var i = 0; i < liste.Count; i++)
        {
            var c = liste[i];
            var champ = $"connexions[{i}]";
            if (c is null) { v.Ajouter(champ, $"Connexion {i + 1} vide."); continue; }
            var machine = c.MachineId is not null ? machines.GetValueOrDefault(c.MachineId) : null;
            var nom = $"Connexion de {(machine is null ? "?" : Court(machine.Numero))}";
            v.Id($"{champ}.id", nom, c.Id, Identifiant(), ids);
            if (machine is null) { v.Ajouter($"{champ}.machineId", $"{nom} : machine inconnue."); continue; }
            if (!connectees.Add(machine.Id)) v.Ajouter($"{champ}.machineId", $"{nom} : une seule connexion par machine.");
            if (!Protocoles.Contains(c.Protocole)) v.Ajouter($"{champ}.protocole", $"{nom} : protocole inconnu ({string.Join(", ", Protocoles)}).");
            if (!EtatsConnexion.Contains(c.Etat)) v.Ajouter($"{champ}.etat", $"{nom} : état inconnu.");
            if (c.Parametres is null) v.Ajouter($"{champ}.parametres", $"{nom} : paramètres requis (vides si aucun).");
            else if (c.Parametres.Count > ParametresMax) v.Ajouter($"{champ}.parametres", $"{nom} : {ParametresMax} paramètres au plus.");
            else
            {
                foreach (var (k, val) in c.Parametres)
                {
                    if (!CleParametre().IsMatch(k)) v.Ajouter($"{champ}.parametres", $"{nom} : nom de paramètre invalide.");
                    else if (k.Contains("passe", StringComparison.OrdinalIgnoreCase) || k.Contains("password", StringComparison.OrdinalIgnoreCase) || k.Contains("secret", StringComparison.OrdinalIgnoreCase))
                        v.Ajouter($"{champ}.parametres.{k}", $"{nom} : le mot de passe de l'automate se règle sur la passerelle elle-même, jamais dans EVAN.");
                    else v.Texte($"{champ}.parametres.{k}", $"{nom} : paramètre {k}", val, 500);
                }
            }
            if (c.Associations is null) v.Ajouter($"{champ}.associations", $"{nom} : associations requises (vides si aucune).");
            else if (c.Associations.Count > AssociationsMax) v.Ajouter($"{champ}.associations", $"{nom} : {AssociationsMax} variables associées au plus.");
            else
            {
                foreach (var (variable, pointId) in c.Associations)
                {
                    if (string.IsNullOrWhiteSpace(variable) || variable.Length > 200 || variable.Any(char.IsControl))
                        v.Ajouter($"{champ}.associations", $"{nom} : adresse de variable invalide (200 caractères au plus).");
                    else if (!points.TryGetValue(pointId ?? "", out var p) || p.MachineId != machine.Id)
                        v.Ajouter($"{champ}.associations", $"{nom} : la variable {Court(variable)} vise un point inconnu sur cette machine.");
                }
            }
        }
    }

    private static string? Court(string? s) => s is null ? null : s.Length > 40 ? s[..40] + "…" : s;

    /// <summary>Collecte des refus, bornée à <see cref="ErreursMax"/>.</summary>
    private sealed class Verificateur
    {
        public readonly List<ErreurChamp> Erreurs = new();
        public bool Ouvert => Erreurs.Count < ErreursMax;

        public void Ajouter(string champ, string message)
        {
            if (Ouvert) Erreurs.Add(new ErreurChamp(champ, message));
        }

        public bool Liste<T>(string champ, List<T>? liste, int max, string libelle)
        {
            if (liste is null) Ajouter(champ, $"Liste des {libelle} absente (vide si aucun).");
            else if (liste.Count > max) Ajouter(champ, $"{max} {libelle} au plus.");
            else return true;
            return false;
        }

        public bool Id(string champ, string nom, string? id, Regex motif, HashSet<string> vus)
        {
            if (id is null || !motif.IsMatch(id)) Ajouter(champ, $"{nom} : identifiant invalide (lettres, chiffres, - et _).");
            else if (!vus.Add(id)) Ajouter(champ, $"{nom} : identifiant en double.");
            else return true;
            return false;
        }

        public void Texte(string champ, string nom, string? valeur, int max, bool requis = false)
        {
            if (string.IsNullOrWhiteSpace(valeur))
            {
                if (requis) Ajouter(champ, $"{nom} requis.");
            }
            else if (valeur.Length > max) Ajouter(champ, $"{nom} : {max} caractères au plus.");
            else if (valeur.Any(char.IsControl)) Ajouter(champ, $"{nom} : caractères de contrôle refusés.");
        }

        public void Liste(string champ, string nom, List<string>? liste)
        {
            if (liste is null) return;
            if (liste.Count > ElementsListe) Ajouter(champ, $"{nom} : {ElementsListe} au plus.");
            else if (liste.Any(x => x is null || x.Length > Adresse || x.Any(char.IsControl))) Ajouter(champ, $"{nom} : {Adresse} caractères au plus chacun.");
        }

        public void Nombre(string champ, string nom, double valeur, double min, double max)
        {
            if (!double.IsFinite(valeur) || valeur < min || valeur > max) Ajouter(champ, $"{nom} : entre {min:0.##} et {max:0.##}.");
        }

        public void LonLat(string champ, string nom, double[]? p)
        {
            if (p is not { Length: 2 } || !double.IsFinite(p[0]) || !double.IsFinite(p[1]) || Math.Abs(p[0]) > 180 || Math.Abs(p[1]) > 90)
                Ajouter(champ, $"{nom} : [longitude, latitude] en degrés attendus.");
        }

        public bool Plan(double[]? p) => p is { Length: 2 } && p.All(x => double.IsFinite(x) && Math.Abs(x) <= PositionMax);
    }
}
