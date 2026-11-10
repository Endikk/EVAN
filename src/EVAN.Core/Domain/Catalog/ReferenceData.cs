using EVAN.Core.Domain.Machines;
using EVAN.Core.Domain.Sites;

namespace EVAN.Core.Domain.Catalog;

/// <summary>
/// Données de référence : catalogue EVAN, kit machines fourni et organisation d'exemple (une ou plusieurs usines).
/// Le domaine ne sait pas d'où elles viennent (fichiers JSON aujourd'hui, base demain).
/// </summary>
public sealed class ReferenceData
{
    public required Catalogue Catalogue { get; init; }
    public required Kit Kit { get; init; }
    public required DemoOrganisation Demo { get; init; }

    public static string OrganeId(string machineId, int numero) => $"{machineId}.o{numero}";

    public static string PointId(string machineId, int numero, string cle) => $"{OrganeId(machineId, numero)}.{cle}";

    public MachineModel Model(Machine machine)
    {
        Catalogue.Types.TryGetValue(machine.Type, out var type);
        var model = new MachineModel { Machine = machine, Type = type };
        var kit = Kit.Machines.FirstOrDefault(k => k.Id == machine.Type);
        if (type is null || kit is null) return model;
        foreach (var p in kit.Points)
        {
            var oid = OrganeId(machine.Id, p.Numero);
            model.Organes.Add(new Organe(oid, machine.Id, p.Numero, p.Nom, null, p.Position, p.Cause, p.Alarme?.Code, p.Alarme?.Message));
            if (!type.Organes.TryGetValue(p.Numero.ToString(), out var oc)) continue;
            foreach (var m in oc.Mesures)
            {
                var pid = PointId(machine.Id, p.Numero, m.Cle);
                model.Points.Add(new PointDeMesure(pid, machine.Id, oid, m.Cle, m.Libelle, m.Type, m.Unite, m.Nominal, m.Seuils));
                model.Defs[pid] = (m, oc);
            }
        }
        return model;
    }

    /// <summary>
    /// Modèle d'une machine enregistrée : ses organes et points saisis remplacent ceux du catalogue, comme dans le front
    /// (machineModel) ; une liste vide garde ceux du catalogue. Un point garde la définition du catalogue (dynamique,
    /// forme de panne) quand son organe et sa clé y figurent.
    /// </summary>
    public MachineModel Model(Machine machine, IReadOnlyList<Organe> organes, IReadOnlyList<PointDeMesure> points)
    {
        var catalogue = Model(machine);
        if (organes.Count == 0 && points.Count == 0) return catalogue;
        var model = new MachineModel { Machine = machine, Type = catalogue.Type };
        model.Organes.AddRange(organes.Count > 0 ? organes : catalogue.Organes);
        model.Points.AddRange(points.Count > 0 ? points : catalogue.Points);
        var numeros = model.Organes.ToDictionary(o => o.Id, o => o.Numero);
        foreach (var p in model.Points)
        {
            if (catalogue.Type is null || !numeros.TryGetValue(p.OrganeId, out var numero)) continue;
            if (!catalogue.Type.Organes.TryGetValue(numero.ToString(), out var oc)) continue;
            if (oc.Mesures.FirstOrDefault(m => m.Cle == p.Cle) is { } def) model.Defs[p.Id] = (def, oc);
        }
        return model;
    }
}
