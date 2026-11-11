using EVAN.Application.Abstractions;
using EVAN.Application.Exploitation;
using EVAN.Application.Live;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Exploitation;
using EVAN.Infrastructure.Reference;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Application.Tests;

/// <summary>
/// Carnet de maintenance tenu à l'écran : correction, suppression et interventions planifiées, rangées par usine.
/// Chaque écriture passe d'abord par la base : refusée, elle ne laisse rien en mémoire ; au démarrage, le carnet est relu.
/// </summary>
public class CarnetTests
{
    private const string Tours = "site-tours";
    private const string Crissey = "site-crissey";
    private const long Maintenant = 1791448200000;
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    /// <summary>Base de test : garde ce qui est écrit, par usine ; peut tomber en panne.</summary>
    private sealed class BaseCarnet : ICarnetStore
    {
        public readonly Dictionary<string, List<Saisie>> Saisies = new();
        public readonly Dictionary<string, List<Prevue>> Prevues = new();
        public bool Panne;

        private static List<T> De<T>(Dictionary<string, List<T>> d, string siteId) => d.TryGetValue(siteId, out var l) ? l : d[siteId] = new List<T>();

        private void Verifier()
        {
            if (Panne) throw new TimeoutException("base injoignable");
        }

        public Task<IReadOnlyList<Saisie>> SaisiesAsync(string siteId, int max, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Saisie>>(De(Saisies, siteId).Take(max).ToList());

        public Task AjouterSaisieAsync(string siteId, Saisie saisie, int garder, CancellationToken ct = default)
        {
            Verifier();
            var l = De(Saisies, siteId);
            l.RemoveAll(x => x.Id == saisie.Id);
            l.Insert(0, saisie);
            return Task.CompletedTask;
        }

        public Task<bool> CorrigerSaisieAsync(string siteId, Saisie saisie, CancellationToken ct = default)
        {
            Verifier();
            var l = De(Saisies, siteId);
            var i = l.FindIndex(x => x.Id == saisie.Id);
            if (i >= 0) l[i] = saisie;
            return Task.FromResult(i >= 0);
        }

        public Task<bool> SupprimerSaisieAsync(string siteId, string id, CancellationToken ct = default)
        {
            Verifier();
            return Task.FromResult(De(Saisies, siteId).RemoveAll(x => x.Id == id) > 0);
        }

        public Task<IReadOnlyList<Prevue>> PrevuesAsync(string siteId, int max, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Prevue>>(De(Prevues, siteId).TakeLast(max).ToList());

        public Task PlanifierAsync(string siteId, Prevue prevue, int garder, CancellationToken ct = default)
        {
            Verifier();
            var l = De(Prevues, siteId);
            l.RemoveAll(x => x.Id == prevue.Id);
            l.Add(prevue);
            return Task.CompletedTask;
        }

        public Task<bool> AnnulerPrevueAsync(string siteId, string id, CancellationToken ct = default)
        {
            Verifier();
            return Task.FromResult(De(Prevues, siteId).RemoveAll(x => x.Id == id) > 0);
        }
    }

    private static (CarnetService Carnet, BaseCarnet Base, LiveService Live) Creer(BaseCarnet? b = null)
    {
        var live = new LiveService(Data, new TestStore(), new TestNotifier(), new TestBus(), NullLogger<LiveService>.Instance);
        b ??= new BaseCarnet();
        return (new CarnetService(live, b), b, live);
    }

    private static Saisie Saisie(string id, string machine = "m-r01", string titre = "Lame changée") =>
        new(id, machine, null, "preventive", Maintenant - 3_600_000, 40, titre, null, "Équipe matin", "outil");

    private static Prevue Prevue(string id, string machine = "m-r04") => new(id, machine, null, "uv", "Remplacer la lampe UV", Maintenant + 86_400_000, 45, null, null);

    [Fact]
    public async Task Une_saisie_corrigee_garde_sa_place_et_part_au_journal()
    {
        var (carnet, b, live) = Creer();
        await carnet.AjouterAsync(Tours, Saisie("sa-1"));
        await carnet.AjouterAsync(Tours, Saisie("sa-2"));

        var corrigee = await carnet.CorrigerAsync(Tours, Saisie("sa-1", titre: "Lame et contre-lame changées"));

        Assert.NotNull(corrigee);
        Assert.Equal(["sa-2", "sa-1"], carnet.Saisies(Tours).Select(s => s.Id));
        Assert.Equal("Lame et contre-lame changées", carnet.Saisies(Tours)[1].Titre);
        Assert.Equal("Lame et contre-lame changées", b.Saisies[Tours].Single(s => s.Id == "sa-1").Titre);
        Assert.Contains(live.Direct(Tours)!.Evenements, e => e.Message.StartsWith("Intervention corrigée", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Une_saisie_d_une_autre_usine_ne_se_corrige_ni_ne_se_supprime()
    {
        var (carnet, _, _) = Creer();
        await carnet.AjouterAsync(Tours, Saisie("sa-1"));

        // Même identifiant, adressé à Crissey : introuvable, et la saisie de Tours ne bouge pas.
        Assert.Null(await carnet.CorrigerAsync(Crissey, Saisie("sa-1", machine: "m-cr-r01", titre: "Intrusion")));
        Assert.False(await carnet.SupprimerAsync(Crissey, "sa-1", "Intrus"));
        // Une correction ne déplace pas une saisie vers une machine d'une autre usine.
        Assert.Null(await carnet.CorrigerAsync(Tours, Saisie("sa-1", machine: "m-cr-r01")));
        Assert.Equal("Lame changée", Assert.Single(carnet.Saisies(Tours)).Titre);
    }

    [Fact]
    public async Task Une_saisie_supprimee_quitte_le_carnet_et_la_base_et_laisse_une_trace_au_journal()
    {
        var (carnet, b, live) = Creer();
        await carnet.AjouterAsync(Tours, Saisie("sa-1"));

        Assert.True(await carnet.SupprimerAsync(Tours, "sa-1", "Chef d'équipe"));

        Assert.Empty(carnet.Saisies(Tours));
        Assert.Empty(b.Saisies[Tours]);
        Assert.Contains(live.Direct(Tours)!.Evenements, e => e.Message.StartsWith("Intervention retirée du carnet", StringComparison.Ordinal) && e.Auteur == "Chef d'équipe");
        Assert.False(await carnet.SupprimerAsync(Tours, "sa-1", "Chef d'équipe"));
    }

    [Fact]
    public async Task Base_injoignable_rien_ne_change_en_memoire()
    {
        var (carnet, b, _) = Creer();
        await carnet.AjouterAsync(Tours, Saisie("sa-1"));
        await carnet.PlanifierAsync(Tours, Prevue("pv-1"));
        b.Panne = true;

        await Assert.ThrowsAsync<TimeoutException>(() => carnet.AjouterAsync(Tours, Saisie("sa-2")));
        await Assert.ThrowsAsync<TimeoutException>(() => carnet.CorrigerAsync(Tours, Saisie("sa-1", titre: "Autre")));
        await Assert.ThrowsAsync<TimeoutException>(() => carnet.SupprimerAsync(Tours, "sa-1", "Test"));
        await Assert.ThrowsAsync<TimeoutException>(() => carnet.AnnulerPrevueAsync(Tours, "pv-1"));

        Assert.Equal("Lame changée", Assert.Single(carnet.Saisies(Tours)).Titre);
        Assert.Single(carnet.Prevues(Tours));
    }

    [Fact]
    public async Task Une_intervention_planifiee_se_deplace_puis_s_annule()
    {
        var (carnet, b, live) = Creer();
        var p1 = await carnet.PlanifierAsync(Tours, Prevue("pv-1"));
        await carnet.PlanifierAsync(Tours, Prevue("pv-2"));

        await carnet.PlanifierAsync(Tours, p1! with { Date = Maintenant + 2 * 86_400_000 });

        Assert.Equal(["pv-2", "pv-1"], carnet.Prevues(Tours).Select(p => p.Id));
        Assert.Equal(Maintenant + 2 * 86_400_000, carnet.Prevues(Tours)[1].Date);
        Assert.True(await carnet.AnnulerPrevueAsync(Tours, "pv-2"));
        Assert.False(await carnet.AnnulerPrevueAsync(Crissey, "pv-1"));
        Assert.Equal(["pv-1"], b.Prevues[Tours].Select(p => p.Id));
        // Une intervention planifiée n'entre pas au journal de l'usine.
        Assert.DoesNotContain(live.Direct(Tours)!.Evenements, e => e.Message.Contains("planifi", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Planifier_sur_une_machine_d_une_autre_usine_est_refuse()
    {
        var (carnet, b, _) = Creer();

        Assert.Null(await carnet.PlanifierAsync(Tours, Prevue("pv-1", machine: "m-cr-r01")));
        Assert.Empty(carnet.Prevues(Tours));
        Assert.False(b.Prevues.ContainsKey(Tours));
    }

    [Fact]
    public async Task Au_demarrage_le_carnet_est_relu_en_base_et_ce_qui_vient_d_etre_ecrit_reste_devant()
    {
        var b = new BaseCarnet();
        b.Saisies[Tours] = [Saisie("sa-ancienne")];
        b.Prevues[Crissey] = [Prevue("pv-ancienne", machine: "m-cr-r01")];
        var (carnet, _, _) = Creer(b);
        await carnet.AjouterAsync(Tours, Saisie("sa-nouvelle"));

        await carnet.RestoreAsync(CancellationToken.None);

        Assert.Equal(["sa-nouvelle", "sa-ancienne"], carnet.Saisies(Tours).Select(s => s.Id));
        Assert.Equal(["pv-ancienne"], carnet.Prevues(Crissey).Select(p => p.Id));
    }
}
