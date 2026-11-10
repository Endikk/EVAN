using EVAN.Application.Live;
using EVAN.Core.Domain.Alarms;

namespace EVAN.Application.Tests;

/// <summary>
/// Liste des alarmes d'un site : l'état d'alarme d'une machine, gardé entre deux modifications, doit toujours valoir
/// celui qu'on obtiendrait en parcourant toute la liste.
/// </summary>
public class AlarmesSiteTests
{
    private static int _n;

    private static Alarme A(string machine, string gravite, string statut = "active") => new()
    {
        Id = $"al-{Interlocked.Increment(ref _n)}",
        Code = "TB-101",
        Message = "test",
        Gravite = gravite,
        MachineId = machine,
        OrganeId = $"{machine}.o1",
        Statut = statut,
    };

    /// <summary>Calcul de référence : parcours complet, comme avant le cache.</summary>
    private static string? Reference(IEnumerable<Alarme> alarmes, string machine)
    {
        var ouvertes = alarmes.Where(a => a.MachineId == machine && a.Statut != "resolue").ToList();
        return ouvertes.Any(a => a.Gravite == "critique") ? "panne" : ouvertes.Any(a => a.Gravite == "attention") ? "attention" : null;
    }

    [Fact]
    public void Etat_d_une_machine_selon_ses_alarmes_ouvertes()
    {
        var liste = new AlarmesSite();
        Assert.Null(liste.Etat("m-r01"));

        liste.Insert(0, A("m-r01", "attention"));
        liste.Insert(0, A("m-r02", "critique"));
        Assert.Equal("attention", liste.Etat("m-r01"));
        Assert.Equal("panne", liste.Etat("m-r02"));

        liste.Insert(0, A("m-r01", "critique", "acquittee"));
        Assert.Equal("panne", liste.Etat("m-r01"));

        liste[0] = liste[0] with { Statut = "resolue" };
        Assert.Equal("attention", liste.Etat("m-r01"));

        liste.RemoveAt(liste.FindIndex(a => a.MachineId == "m-r01" && a.Statut == "active"));
        Assert.Null(liste.Etat("m-r01"));
        Assert.Equal("panne", liste.Etat("m-r02"));

        liste.Clear();
        Assert.Null(liste.Etat("m-r02"));
    }

    [Fact]
    public void Une_alarme_info_ne_change_pas_l_etat()
    {
        var liste = new AlarmesSite();
        liste.Insert(0, A("m-r01", "info"));
        Assert.Null(liste.Etat("m-r01"));
    }

    [Fact]
    public void Etat_garde_toujours_egal_au_parcours_complet()
    {
        // Suite pseudo-aléatoire reproductible de levées, acquittements, clôtures, évictions et remises à zéro.
        var rnd = new Random(1234);
        var liste = new AlarmesSite();
        string[] machines = ["m-r01", "m-r02", "m-r03"];
        string[] gravites = ["info", "attention", "critique"];
        string[] statuts = ["active", "acquittee", "resolue"];
        for (var i = 0; i < 5000; i++)
        {
            switch (rnd.Next(10))
            {
                case < 4:
                    liste.Insert(rnd.Next(liste.Count + 1), A(machines[rnd.Next(3)], gravites[rnd.Next(3)], statuts[rnd.Next(3)]));
                    break;
                case < 7 when liste.Count > 0:
                    var j = rnd.Next(liste.Count);
                    liste[j] = liste[j] with { Statut = statuts[rnd.Next(3)] };
                    break;
                case < 9 when liste.Count > 0:
                    liste.RemoveAt(rnd.Next(liste.Count));
                    break;
                case 9 when rnd.Next(50) == 0:
                    liste.Clear();
                    break;
            }
            // Lectures répétées entre deux modifications : la valeur gardée doit rester juste.
            foreach (var m in machines)
            {
                Assert.Equal(Reference(liste, m), liste.Etat(m));
                Assert.Equal(Reference(liste, m), liste.Etat(m));
            }
        }
    }
}
