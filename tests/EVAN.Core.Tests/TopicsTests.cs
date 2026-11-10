using EVAN.Core.Contracts;

namespace EVAN.Core.Tests;

public class TopicsTests
{
    [Fact]
    public void Le_statut_de_passerelle_a_six_niveaux_et_se_lit_a_part()
    {
        var topic = Topics.GatewayStatus("site-tours", "tours-01");

        Assert.False(Topics.TryParse(topic, out _, out _, out _));
        Assert.True(Topics.TryParseGatewayStatus(topic, out var site, out var passerelle));
        Assert.Equal(("site-tours", "tours-01"), (site, passerelle));
        Assert.False(Topics.TryParseGatewayStatus(Topics.GatewayReply("site-tours", "tours-01", "r1"), out _, out _));
        Assert.False(Topics.TryParseGatewayStatus(Topics.Telemetry("site-tours", "m-r01"), out _, out _));
        Assert.Equal("evan/v1/+/gateway/+/status", Topics.GatewayStatusFilter);
    }
}
