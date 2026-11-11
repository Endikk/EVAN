using Dapper;
using EVAN.Application.Abstractions;
using EVAN.Core.Domain.Exploitation;

namespace EVAN.Infrastructure.Persistence;

/// <summary>
/// Carnet de maintenance en base (tables de Carnet.sql) : interventions consignées et planifiées, par usine. Toutes les
/// requêtes sont paramétrées et portent le site : une ligne d'une autre usine n'est jamais lue, corrigée ni supprimée.
/// </summary>
public sealed partial class PostgresStore : ICarnetStore
{
    /// <summary>Carnet.sql embarqué, joué après Schema.sql : migration additive, sans toucher aux tables existantes.</summary>
    private static readonly string CarnetResource = $"{typeof(PostgresStore).Namespace}.Carnet.sql";

    private sealed record SaisieRow(string Id, string MachineId, string? OrganeId, string Type, DateTime Debut, double Duree, string Titre, string? CompteRendu,
        string Auteur, string? TacheId);

    private sealed record PrevueRow(string Id, string MachineId, string? OrganeId, string? TacheId, string Titre, DateTime Debut, double Duree, string? Auteur,
        string? PointId);

    private static object ArgsSaisie(string siteId, Saisie s) => new
    {
        SiteId = siteId, s.Id, s.MachineId, s.OrganeId, s.Type, Debut = Utc(s.Date), s.Duree, s.Titre, s.CompteRendu, s.Auteur, s.TacheId,
    };

    public async Task<IReadOnlyList<Saisie>> SaisiesAsync(string siteId, int max, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<SaisieRow>(new CommandDefinition(
            """
            SELECT id, machine_id AS MachineId, organe_id AS OrganeId, type, debut, duree_min AS Duree, titre, compte_rendu AS CompteRendu, auteur, tache_id AS TacheId
            FROM carnet_saisies WHERE site_id = @siteId ORDER BY enregistree_le DESC LIMIT @max
            """,
            new { siteId, max }, cancellationToken: ct));
        return rows.Select(r => new Saisie(r.Id, r.MachineId, r.OrganeId, r.Type, Ms(r.Debut), r.Duree, r.Titre, r.CompteRendu, r.Auteur, r.TacheId)).ToList();
    }

    public async Task AjouterSaisieAsync(string siteId, Saisie saisie, int garder, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            """
            INSERT INTO carnet_saisies (site_id, id, machine_id, organe_id, type, debut, duree_min, titre, compte_rendu, auteur, tache_id, enregistree_le)
            VALUES (@SiteId, @Id, @MachineId, @OrganeId, @Type, @Debut, @Duree, @Titre, @CompteRendu, @Auteur, @TacheId, clock_timestamp())
            ON CONFLICT (site_id, id) DO UPDATE SET machine_id = EXCLUDED.machine_id, organe_id = EXCLUDED.organe_id, type = EXCLUDED.type,
                debut = EXCLUDED.debut, duree_min = EXCLUDED.duree_min, titre = EXCLUDED.titre, compte_rendu = EXCLUDED.compte_rendu,
                auteur = EXCLUDED.auteur, tache_id = EXCLUDED.tache_id, enregistree_le = EXCLUDED.enregistree_le
            """,
            ArgsSaisie(siteId, saisie), tx, cancellationToken: ct));
        // Saisie ouverte sans compte sur la démo : la table ne grossit pas au-delà de ce que le service garde.
        await conn.ExecuteAsync(new CommandDefinition(
            """
            DELETE FROM carnet_saisies WHERE site_id = @siteId AND id NOT IN
                (SELECT id FROM carnet_saisies WHERE site_id = @siteId ORDER BY enregistree_le DESC LIMIT @garder)
            """,
            new { siteId, garder }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
    }

    public async Task<bool> CorrigerSaisieAsync(string siteId, Saisie saisie, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var n = await conn.ExecuteAsync(new CommandDefinition(
            """
            UPDATE carnet_saisies SET machine_id = @MachineId, organe_id = @OrganeId, type = @Type, debut = @Debut, duree_min = @Duree, titre = @Titre,
                compte_rendu = @CompteRendu, auteur = @Auteur, tache_id = @TacheId
            WHERE site_id = @SiteId AND id = @Id
            """,
            ArgsSaisie(siteId, saisie), cancellationToken: ct));
        return n > 0;
    }

    public async Task<bool> SupprimerSaisieAsync(string siteId, string id, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var n = await conn.ExecuteAsync(new CommandDefinition("DELETE FROM carnet_saisies WHERE site_id = @siteId AND id = @id", new { siteId, id }, cancellationToken: ct));
        return n > 0;
    }

    public async Task<IReadOnlyList<Prevue>> PrevuesAsync(string siteId, int max, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        // Les plus récentes d'abord pour la limite, puis remises dans l'ordre de planification.
        var rows = await conn.QueryAsync<PrevueRow>(new CommandDefinition(
            """
            SELECT id, machine_id AS MachineId, organe_id AS OrganeId, tache_id AS TacheId, titre, debut, duree_min AS Duree, auteur, point_id AS PointId
            FROM (SELECT * FROM carnet_prevues WHERE site_id = @siteId ORDER BY enregistree_le DESC LIMIT @max) dernieres
            ORDER BY enregistree_le
            """,
            new { siteId, max }, cancellationToken: ct));
        return rows.Select(r => new Prevue(r.Id, r.MachineId, r.OrganeId, r.TacheId, r.Titre, Ms(r.Debut), r.Duree, r.Auteur, r.PointId)).ToList();
    }

    public async Task PlanifierAsync(string siteId, Prevue prevue, int garder, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            """
            INSERT INTO carnet_prevues (site_id, id, machine_id, organe_id, tache_id, titre, debut, duree_min, auteur, point_id, enregistree_le)
            VALUES (@SiteId, @Id, @MachineId, @OrganeId, @TacheId, @Titre, @Debut, @Duree, @Auteur, @PointId, clock_timestamp())
            ON CONFLICT (site_id, id) DO UPDATE SET machine_id = EXCLUDED.machine_id, organe_id = EXCLUDED.organe_id, tache_id = EXCLUDED.tache_id,
                titre = EXCLUDED.titre, debut = EXCLUDED.debut, duree_min = EXCLUDED.duree_min, auteur = EXCLUDED.auteur, point_id = EXCLUDED.point_id,
                enregistree_le = EXCLUDED.enregistree_le
            """,
            new
            {
                SiteId = siteId, prevue.Id, prevue.MachineId, prevue.OrganeId, prevue.TacheId, prevue.Titre, Debut = Utc(prevue.Date), prevue.Duree,
                prevue.Auteur, prevue.PointId,
            },
            tx, cancellationToken: ct));
        await conn.ExecuteAsync(new CommandDefinition(
            """
            DELETE FROM carnet_prevues WHERE site_id = @siteId AND id NOT IN
                (SELECT id FROM carnet_prevues WHERE site_id = @siteId ORDER BY enregistree_le DESC LIMIT @garder)
            """,
            new { siteId, garder }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
    }

    public async Task<bool> AnnulerPrevueAsync(string siteId, string id, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var n = await conn.ExecuteAsync(new CommandDefinition("DELETE FROM carnet_prevues WHERE site_id = @siteId AND id = @id", new { siteId, id }, cancellationToken: ct));
        return n > 0;
    }
}
