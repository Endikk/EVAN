namespace EVAN.Core.Domain.Machines;

/// <summary>Connexion d'une machine à la passerelle. Lecture seule par défaut.</summary>
public sealed record Connexion(string Id, string MachineId, string Protocole, Dictionary<string, string> Parametres, string Etat, Dictionary<string, string> Associations, bool LectureSeule = true);
