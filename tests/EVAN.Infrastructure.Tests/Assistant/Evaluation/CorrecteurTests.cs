namespace EVAN.Infrastructure.Tests.Assistant.Evaluation;

/// <summary>Le correcteur de l'évaluation, vérifié sans modèle sur des réponses écrites à la main, bonnes et mauvaises.</summary>
public class CorrecteurTests
{
    private static NombreAttendu N(double valeur, double tolerance = JeuEvaluation.ToleranceParDefaut, string? unite = null) => new("x", valeur, tolerance, unite);

    private static bool Trouve(string texte, NombreAttendu n) => Correcteur.ContientNombre(Correcteur.Nombres(texte), n);

    [Fact]
    public void Les_nombres_s_ecrivent_a_la_francaise_ou_a_l_anglaise()
    {
        var nombres = Correcteur.Nombres("TRS 73,6 % (73.6), 35 840,8 kWh, 15 806 € et 15 806 € par an, 1 000 étiquettes.");
        Assert.Equal([73.6, 73.6, 35840.8, 15806, 15806, 1000], nombres);
    }

    [Fact]
    public void Identifiants_codes_et_cibles_de_liens_ne_sont_pas_des_nombres()
    {
        var texte = "[R01](machine:m-r01) a levé [EM-01](alarme:h-m-r01-1791443880) ; voir aussi TB-101 et m-cr-r01.";
        Assert.Empty(Correcteur.Nombres(texte));
    }

    [Fact]
    public void Une_duree_compte_en_heures_comme_en_minutes()
    {
        // 3,52 h valent 211 min : « 3 h 31 », « 211 min » et « 3,5 h » répondent à 3 % près.
        Assert.True(Trouve("La R07 a cumulé 3 h 31 de panne.", N(3.52, 0.03, "h")));
        Assert.True(Trouve("La R07 a cumulé 211 min de panne.", N(3.52, 0.03, "h")));
        Assert.True(Trouve("Environ 3,5 h de panne.", N(3.52, 0.03, "h")));
        Assert.False(Trouve("Environ 4 h de panne.", N(3.52, 0.03, "h")));
        // Un temps moyen de réparation de 25,4 min, dit en heures.
        Assert.True(Trouve("MTTR : 0,42 h.", N(25.4, 0.03, "min")));
    }

    [Fact]
    public void Une_energie_compte_en_kWh_comme_en_MWh()
    {
        Assert.True(Trouve("35,8 MWh sur la semaine.", N(35840.8, 0.01, "kWh")));
        Assert.True(Trouve("35 841 kWh sur la semaine.", N(35840.8, 0.01, "kWh")));
        Assert.False(Trouve("38 MWh sur la semaine.", N(35840.8, 0.01, "kWh")));
    }

    [Fact]
    public void La_tolerance_est_relative_et_nulle_pour_un_compte()
    {
        Assert.True(Trouve("TRS de 69 %.", N(68.9, 0.01)));
        Assert.False(Trouve("TRS de 72 %.", N(68.9, 0.01)));
        Assert.True(Trouve("5 pannes.", N(5, 0)));
        Assert.False(Trouve("6 pannes.", N(5, 0)));
        // Le signe se perd dans une phrase : « baisse de 1,3 % par jour » répond à une variation de −1,347.
        Assert.True(Trouve("La puissance UV baisse de 1,3 % par jour.", N(-1.347, 0.05)));
        Assert.True(Trouve("Variation : −1,35 %/jour.", N(-1.347, 0.05)));
    }

    [Fact]
    public void Textes_et_machines_se_retrouvent_sans_casse_ni_accents()
    {
        Assert.True(Correcteur.ContientTexte("Casse répétée de l'echenillage.", "Échenillage"));
        Assert.True(Correcteur.ContientTexte("Regardez l’anilox g3.", "Anilox G3"));
        Assert.False(Correcteur.ContientTexte("Regardez le cylindre magnétique.", "Anilox G3"));

        var r07 = new MachineAttendue("x", "m-r07", "R07");
        Assert.True(Correcteur.NommeMachine("C'est la [R07](machine:m-r07).", r07));
        Assert.True(Correcteur.NommeMachine("C'est la R07, puis la R02.", r07));
        Assert.False(Correcteur.NommeMachine("C'est la R070.", r07));
        Assert.False(Correcteur.NommeMachine("C'est la [R02](machine:m-r02).", r07));
    }

    [Fact]
    public void Une_reponse_bonne_a_toutes_ses_verifications_et_une_reponse_fausse_aucune()
    {
        var attendus = new Attendus("q",
            [new NombreAttendu("trsPct", 68.9, 0.01, null), new NombreAttendu("panneH", 3.52, 0.03, "h")],
            [new TexteAttendu("organe", "Dérouleur")],
            [new MachineAttendue("machine", "m-r07", "R07")]);

        var bonne = Correcteur.Noter(attendus, "La [R07](machine:m-r07) : TRS 68,9 %, 3 h 31 de panne, surtout au dérouleur.");
        Assert.True(bonne.Reussie);
        Assert.Equal(1, bonne.Score);

        var fausse = Correcteur.Noter(attendus, "La [R02](machine:m-r02) : TRS 75,4 %, 2 h 43 de panne, surtout au séchage UV.");
        Assert.False(fausse.Reussie);
        Assert.Equal(0, fausse.Score);

        var moitie = Correcteur.Noter(attendus, "La R07 a un TRS de 68,9 %.");
        Assert.Equal(0.5, moitie.Score);
    }
}
