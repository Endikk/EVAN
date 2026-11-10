namespace EVAN.Application.Validation;

/// <summary>
/// Saisie refusée : le champ en cause, sous la forme qu'écrit le front (« machines[3].nom »), et la raison en clair.
/// Le front s'en sert pour dire à l'utilisateur quoi corriger, et où.
/// </summary>
public sealed record ErreurChamp(string Champ, string Message);
