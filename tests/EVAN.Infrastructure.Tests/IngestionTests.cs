using EVAN.Infrastructure.Messaging;

namespace EVAN.Infrastructure.Tests;

/// <summary>Ingestion MQTT : un message n'est pris en compte que s'il annonce l'usine et la machine de son sujet.</summary>
public class IngestionTests
{
    [Fact]
    public void Un_message_conforme_a_son_sujet_est_accepte()
    {
        Assert.True(MqttIngestionService.Coherent("site-tours", "m-r01", "site-tours", "m-r01"));
    }

    [Theory]
    [InlineData("site-crissey", "m-r01")]
    [InlineData("site-tours", "m-r02")]
    [InlineData("SITE-TOURS", "m-r01")]
    public void Une_passerelle_ne_peut_pas_ecrire_pour_une_autre_usine_ou_machine(string site, string machine)
    {
        // La passerelle de Tours publie sur son propre sujet un message qui prétend venir d'ailleurs.
        Assert.False(MqttIngestionService.Coherent("site-tours", "m-r01", site, machine));
    }
}
