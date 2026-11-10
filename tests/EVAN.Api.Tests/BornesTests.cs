using EVAN.Api.Endpoints;

namespace EVAN.Api.Tests;

/// <summary>Saisies ouvertes sans compte : tailles, types, durée et date bornés avant d'atteindre la mémoire ou la base.</summary>
public class BornesTests
{
    private static readonly DateTimeOffset Maintenant = new(2026, 10, 8, 10, 0, 0, TimeSpan.Zero);

    private static ExploitationEndpoints.SaisieRequest Saisie(string titre = "Remplacement lampe UV", string? compteRendu = null, double duree = 45, long? date = null) =>
        new(null, "m-r04", null, "curative", date ?? Maintenant.AddHours(-2).ToUnixTimeMilliseconds(), duree, titre, compteRendu, "Équipe B", null);

    [Fact]
    public void Un_evenement_valide_passe()
    {
        Assert.Null(Bornes.Evenement(new SiteEndpoints.EventRequest("action", "Écriture autorisée", "m-r01", "Superviseur")));
    }

    [Theory]
    [InlineData("inconnu", "Message")]
    [InlineData("action", "")]
    [InlineData("action", "   ")]
    public void Un_evenement_sans_type_connu_ou_sans_message_est_refuse(string type, string message)
    {
        Assert.NotNull(Bornes.Evenement(new SiteEndpoints.EventRequest(type, message, null, null)));
    }

    [Fact]
    public void Un_message_ou_un_auteur_trop_long_est_refuse()
    {
        Assert.NotNull(Bornes.Evenement(new SiteEndpoints.EventRequest("action", new string('x', Bornes.Message + 1), null, null)));
        Assert.NotNull(Bornes.Evenement(new SiteEndpoints.EventRequest("action", "ok", null, new string('x', Bornes.Auteur + 1))));
    }

    [Fact]
    public void Une_intervention_valide_passe()
    {
        Assert.Null(Bornes.Saisie(Saisie(), Maintenant));
    }

    [Fact]
    public void Un_compte_rendu_ou_un_intitule_trop_long_est_refuse()
    {
        Assert.NotNull(Bornes.Saisie(Saisie(compteRendu: new string('x', Bornes.CompteRendu + 1)), Maintenant));
        Assert.NotNull(Bornes.Saisie(Saisie(titre: new string('x', Bornes.Titre + 1)), Maintenant));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(Bornes.DureeMaxMinutes + 1)]
    [InlineData(double.NaN)]
    public void Une_duree_hors_bornes_est_refusee(double duree)
    {
        Assert.NotNull(Bornes.Saisie(Saisie(duree: duree), Maintenant));
    }

    [Fact]
    public void Une_date_trop_ancienne_ou_future_est_refusee()
    {
        Assert.NotNull(Bornes.Saisie(Saisie(date: Maintenant.AddDays(-401).ToUnixTimeMilliseconds()), Maintenant));
        Assert.NotNull(Bornes.Saisie(Saisie(date: Maintenant.AddDays(2).ToUnixTimeMilliseconds()), Maintenant));
        Assert.NotNull(Bornes.Saisie(Saisie(date: long.MaxValue), Maintenant));
    }
}
