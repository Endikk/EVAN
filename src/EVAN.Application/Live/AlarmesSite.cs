using System.Collections;
using EVAN.Application.Observabilite;
using EVAN.Core.Domain.Alarms;

namespace EVAN.Application.Live;

/// <summary>
/// Alarmes d'un site, les plus récentes d'abord (2000 au plus, closes comprises). Toute modification passe par cette
/// liste, qui en garde la trace : l'état d'alarme d'une machine, lu à chaque message reçu, n'est recalculé qu'après un
/// changement au lieu de parcourir toute la liste à chaque fois. Le compte des alarmes ouvertes (evan.alarmes.ouvertes)
/// suit chaque modification au même endroit.
/// </summary>
internal sealed class AlarmesSite : IReadOnlyList<Alarme>
{
    private readonly List<Alarme> _liste = new();
    /// <summary>Incrémentée à chaque modification de la liste : un état calculé avant est périmé.</summary>
    private int _version;
    private readonly Dictionary<string, (int Version, string? Etat)> _etats = new();

    public int Count => _liste.Count;

    public Alarme this[int index]
    {
        get => _liste[index];
        set
        {
            Metriques.AlarmeRemplacee(_liste[index], value);
            _liste[index] = value;
            _version++;
        }
    }

    public void Insert(int index, Alarme alarme)
    {
        _liste.Insert(index, alarme);
        Metriques.AlarmeRemplacee(null, alarme);
        _version++;
    }

    public void RemoveAt(int index)
    {
        Metriques.AlarmeRemplacee(_liste[index], null);
        _liste.RemoveAt(index);
        _version++;
    }

    public void Clear()
    {
        foreach (var a in _liste) Metriques.AlarmeRemplacee(a, null);
        _liste.Clear();
        _version++;
    }

    public int FindIndex(Predicate<Alarme> match) => _liste.FindIndex(match);

    public int FindLastIndex(Predicate<Alarme> match) => _liste.FindLastIndex(match);

    /// <summary>Copie (instantané, lecture hors verrou).</summary>
    public List<Alarme> ToList() => new(_liste);

    /// <summary>
    /// État imposé par les alarmes ouvertes d'une machine : « panne » (une critique), « attention », ou null (aucune).
    /// Le résultat est gardé jusqu'à la prochaine modification de la liste.
    /// </summary>
    public string? Etat(string machineId)
    {
        if (_etats.TryGetValue(machineId, out var connu) && connu.Version == _version) return connu.Etat;
        string? etat = null;
        foreach (var a in _liste)
        {
            if (a.MachineId != machineId || a.Statut == "resolue") continue;
            if (a.Gravite == "critique")
            {
                etat = "panne";
                break;
            }
            if (a.Gravite == "attention") etat = "attention";
        }
        _etats[machineId] = (_version, etat);
        return etat;
    }

    public List<Alarme>.Enumerator GetEnumerator() => _liste.GetEnumerator();

    IEnumerator<Alarme> IEnumerable<Alarme>.GetEnumerator() => _liste.GetEnumerator();

    IEnumerator IEnumerable.GetEnumerator() => _liste.GetEnumerator();
}
