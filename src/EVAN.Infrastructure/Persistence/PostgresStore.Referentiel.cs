using System.Text.Json;
using Dapper;
using EVAN.Application.Comptes;
using EVAN.Application.Usines;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Machines;
using EVAN.Core.Domain.Sites;
using Npgsql;

namespace EVAN.Infrastructure.Persistence;

/// <summary>
/// Référentiel des organisations réelles : comptes, et usines enregistrées depuis l'assistant du front. Une usine
/// s'écrit d'un seul bloc (transaction) : son site, puis tout ce qui en dépend, effacé et réécrit. Chaque table est
/// remplie en une requête (unnest de tableaux), quel que soit le nombre de points de mesure.
/// </summary>
public sealed partial class PostgresStore
{
    /// <summary>Violation d'unicité (PostgreSQL 23505) : un identifiant appartient déjà à une autre usine.</summary>
    private const string Unicite = "23505";

    /// <summary>Organisation de la démo, posée à l'initialisation : ses usines viennent de data/demo.json, pas d'ici.</summary>
    private volatile string? _organisationDemo;

    private static string J(object o) => JsonSerializer.Serialize(o, Json.Options);

    private static T? Lire<T>(string? json) => json is null ? default : JsonSerializer.Deserialize<T>(json, Json.Options);

    // ---------- Usines ----------

    public async Task EnregistrerUsineAsync(UsineEnregistree usine, CancellationToken ct = default)
    {
        var c = usine.Configuration;
        var s = c.Site;
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        Task<int> Run(string sql, object args) => conn.ExecuteAsync(new CommandDefinition(sql, args, tx, cancellationToken: ct));

        // Le site d'une autre organisation n'est jamais réécrit (verrou de la ligne jusqu'à la fin de la transaction).
        var proprietaire = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
            "SELECT organisation_id FROM sites WHERE id = @Id FOR UPDATE", new { s.Id }, tx, cancellationToken: ct));
        if (proprietaire is not null && proprietaire != usine.OrganisationId) throw new IdentifiantPrisException("site.id", "Usine inconnue.");
        try
        {
            // Deux organisations qui créeraient la même usine au même instant : la seconde ne met à jour aucune ligne.
            var site = await Run(
                """
                INSERT INTO sites (id, organisation_id, nom, adresse, lon, lat, repere, siret, passerelle, surface_annoncee, configuree, maj)
                VALUES (@Id, @Org, @Nom, @Adresse, @Lon, @Lat, @Repere::jsonb, @Siret, @Passerelle, @Surface, @Configuree, now())
                ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom, adresse = EXCLUDED.adresse, lon = EXCLUDED.lon, lat = EXCLUDED.lat,
                    repere = EXCLUDED.repere, siret = EXCLUDED.siret, passerelle = EXCLUDED.passerelle,
                    surface_annoncee = EXCLUDED.surface_annoncee, configuree = EXCLUDED.configuree, maj = now()
                WHERE sites.organisation_id = EXCLUDED.organisation_id
                """,
                new
                {
                    s.Id, Org = usine.OrganisationId, s.Nom, s.Adresse, Lon = s.Coordonnees[0], Lat = s.Coordonnees[1], Repere = J(s.Repere),
                    s.Siret, s.Passerelle, Surface = s.SurfaceAnnoncee, Configuree = c.Configure,
                });
            if (site != 1) throw new IdentifiantPrisException("site.id", "Usine inconnue.");
            // Zones, machines, organes, points et connexions suivent leurs bâtiments (ON DELETE CASCADE).
            await Run("DELETE FROM batiments WHERE site_id = @Id", new { s.Id });
            await Run(
                """
                INSERT INTO batiments (id, site_id, nom, contour, sigmas, hauteur, niveaux, source, source_ref, rnb, usage, precision_source)
                SELECT t.id, @Site, t.nom, t.contour::jsonb, t.sigmas::jsonb, t.hauteur, t.niveaux, t.source, t.source_ref, t.rnb, t.usage, t.precision_source
                FROM unnest(@Ids::text[], @Noms::text[], @Contours::text[], @Sigmas::text[], @Hauteurs::float8[], @Niveaux::int[], @Sources::text[],
                            @Refs::text[], @Rnbs::text[], @Usages::text[], @Precisions::float8[])
                     AS t(id, nom, contour, sigmas, hauteur, niveaux, source, source_ref, rnb, usage, precision_source)
                """,
                new
                {
                    Site = s.Id,
                    Ids = c.Batiments.Select(b => b.Id).ToArray(),
                    Noms = c.Batiments.Select(b => b.Nom).ToArray(),
                    Contours = c.Batiments.Select(b => J(b.Contour)).ToArray(),
                    Sigmas = c.Batiments.Select(b => J(b.Sigmas)).ToArray(),
                    Hauteurs = c.Batiments.Select(b => b.Hauteur).ToArray(),
                    Niveaux = c.Batiments.Select(b => b.Niveaux).ToArray(),
                    Sources = c.Batiments.Select(b => b.Source).ToArray(),
                    Refs = c.Batiments.Select(b => b.SourceRef).ToArray(),
                    Rnbs = c.Batiments.Select(b => b.Rnb).ToArray(),
                    Usages = c.Batiments.Select(b => b.Usage).ToArray(),
                    Precisions = c.Batiments.Select(b => b.PrecisionSource).ToArray(),
                });
            await Run(
                """
                INSERT INTO zones (id, batiment_id, nom, type, polygone, niveau)
                SELECT t.id, t.batiment_id, t.nom, t.type, t.polygone::jsonb, t.niveau
                FROM unnest(@Ids::text[], @Batiments::text[], @Noms::text[], @Types::text[], @Polygones::text[], @Niveaux::int4[])
                     AS t(id, batiment_id, nom, type, polygone, niveau)
                """,
                new
                {
                    Ids = c.Zones.Select(z => z.Id).ToArray(),
                    Batiments = c.Zones.Select(z => z.BatimentId).ToArray(),
                    Noms = c.Zones.Select(z => z.Nom).ToArray(),
                    Types = c.Zones.Select(z => z.Type).ToArray(),
                    Polygones = c.Zones.Select(z => J(z.Polygone)).ToArray(),
                    Niveaux = c.Zones.Select(z => z.Niveau).ToArray(),
                });
            await Run(
                """
                INSERT INTO machines (id, batiment_id, zone_id, type, nom, numero, x, z, rotation_deg, modele_url, cree_le, niveau)
                SELECT t.id, t.batiment_id, t.zone_id, t.type, t.nom, t.numero, t.x, t.z, t.rotation_deg, t.modele_url, t.cree_le, t.niveau
                FROM unnest(@Ids::text[], @Batiments::text[], @Zones::text[], @Types::text[], @Noms::text[], @Numeros::text[], @Xs::float8[], @Zs::float8[],
                            @Rotations::float8[], @Modeles::text[], @CreeLe::int8[], @Niveaux::int4[])
                     AS t(id, batiment_id, zone_id, type, nom, numero, x, z, rotation_deg, modele_url, cree_le, niveau)
                """,
                new
                {
                    Ids = c.Machines.Select(m => m.Id).ToArray(),
                    Batiments = c.Machines.Select(m => m.BatimentId).ToArray(),
                    Zones = c.Machines.Select(m => m.ZoneId).ToArray(),
                    Types = c.Machines.Select(m => m.Type).ToArray(),
                    Noms = c.Machines.Select(m => m.Nom).ToArray(),
                    Numeros = c.Machines.Select(m => m.Numero).ToArray(),
                    Xs = c.Machines.Select(m => m.Position[0]).ToArray(),
                    Zs = c.Machines.Select(m => m.Position[1]).ToArray(),
                    Rotations = c.Machines.Select(m => m.RotationDeg).ToArray(),
                    Modeles = c.Machines.Select(m => m.Modele.Url).ToArray(),
                    CreeLe = c.Machines.Select(m => m.CreeLe).ToArray(),
                    Niveaux = c.Machines.Select(m => m.Niveau).ToArray(),
                });
            await Run(
                """
                INSERT INTO organes (id, machine_id, numero, nom, noeud_3d, position, methode, capteurs, pannes_typiques, alarme_code, alarme_message)
                SELECT t.id, t.machine_id, t.numero, t.nom, t.noeud_3d, t.position::jsonb, t.methode, t.capteurs::jsonb, t.pannes::jsonb, t.code, t.message
                FROM unnest(@Ids::text[], @Machines::text[], @Numeros::int[], @Noms::text[], @Noeuds::text[], @Positions::text[], @Methodes::text[],
                            @Capteurs::text[], @Pannes::text[], @Codes::text[], @Messages::text[])
                     AS t(id, machine_id, numero, nom, noeud_3d, position, methode, capteurs, pannes, code, message)
                """,
                new
                {
                    Ids = c.Organes.Select(o => o.Id).ToArray(),
                    Machines = c.Organes.Select(o => o.MachineId).ToArray(),
                    Numeros = c.Organes.Select(o => o.Numero).ToArray(),
                    Noms = c.Organes.Select(o => o.Nom).ToArray(),
                    Noeuds = c.Organes.Select(o => o.Noeud3d).ToArray(),
                    Positions = c.Organes.Select(o => o.Position is null ? null : J(o.Position)).ToArray(),
                    Methodes = c.Organes.Select(o => o.Methode).ToArray(),
                    Capteurs = c.Organes.Select(o => o.Capteurs is null ? null : J(o.Capteurs)).ToArray(),
                    Pannes = c.Organes.Select(o => o.PannesTypiques is null ? null : J(o.PannesTypiques)).ToArray(),
                    Codes = c.Organes.Select(o => o.Alarme?.Code).ToArray(),
                    Messages = c.Organes.Select(o => o.Alarme?.Message).ToArray(),
                });
            await Run(
                """
                INSERT INTO points_mesure (id, machine_id, organe_id, cle, libelle, type, unite, nominal, seuils, protocole, adresse)
                SELECT t.id, t.machine_id, t.organe_id, t.cle, t.libelle, t.type, t.unite, t.nominal, t.seuils::jsonb, t.protocole, t.adresse
                FROM unnest(@Ids::text[], @Machines::text[], @Organes::text[], @Cles::text[], @Libelles::text[], @Types::text[], @Unites::text[],
                            @Nominaux::float8[], @Seuils::text[], @Protocoles::text[], @Adresses::text[])
                     AS t(id, machine_id, organe_id, cle, libelle, type, unite, nominal, seuils, protocole, adresse)
                """,
                new
                {
                    Ids = c.Points.Select(p => p.Id).ToArray(),
                    Machines = c.Points.Select(p => p.MachineId).ToArray(),
                    Organes = c.Points.Select(p => p.OrganeId).ToArray(),
                    Cles = c.Points.Select(p => p.Cle).ToArray(),
                    Libelles = c.Points.Select(p => p.Libelle).ToArray(),
                    Types = c.Points.Select(p => p.Type).ToArray(),
                    Unites = c.Points.Select(p => p.Unite).ToArray(),
                    Nominaux = c.Points.Select(p => p.Nominal).ToArray(),
                    Seuils = c.Points.Select(p => J(p.Seuils)).ToArray(),
                    Protocoles = c.Points.Select(p => p.Protocole).ToArray(),
                    Adresses = c.Points.Select(p => p.Adresse).ToArray(),
                });
            await Run(
                """
                INSERT INTO connexions (id, machine_id, protocole, parametres, etat, associations, lecture_seule, maj)
                SELECT t.id, t.machine_id, t.protocole, t.parametres::jsonb, t.etat, t.associations::jsonb, t.lecture_seule, now()
                FROM unnest(@Ids::text[], @Machines::text[], @Protocoles::text[], @Parametres::text[], @Etats::text[], @Associations::text[], @LectureSeule::bool[])
                     AS t(id, machine_id, protocole, parametres, etat, associations, lecture_seule)
                """,
                new
                {
                    Ids = c.Connexions.Select(x => x.Id).ToArray(),
                    Machines = c.Connexions.Select(x => x.MachineId).ToArray(),
                    Protocoles = c.Connexions.Select(x => x.Protocole).ToArray(),
                    Parametres = c.Connexions.Select(x => J(x.Parametres)).ToArray(),
                    Etats = c.Connexions.Select(x => x.Etat).ToArray(),
                    Associations = c.Connexions.Select(x => J(x.Associations)).ToArray(),
                    LectureSeule = c.Connexions.Select(x => x.LectureSeule).ToArray(),
                });
        }
        catch (PostgresException ex) when (ex.SqlState == Unicite)
        {
            await tx.RollbackAsync(CancellationToken.None);
            throw new IdentifiantPrisException(Champ(ex.TableName), "Identifiant déjà utilisé par une autre usine : régénérez l'élément (supprimer puis recréer).");
        }
        await tx.CommitAsync(ct);
    }

    /// <summary>Liste de la configuration où se trouve l'identifiant refusé, d'après la table de la contrainte.</summary>
    private static string Champ(string? table) => table switch
    {
        "batiments" => "batiments",
        "zones" => "zones",
        "machines" => "machines",
        "organes" => "organes",
        "points_mesure" => "points",
        "connexions" => "connexions",
        _ => "site",
    };

    private sealed record SiteRow(string Id, string OrganisationId, string Nom, string? Adresse, double? Lon, double? Lat, string? Repere, string? Siret, string? Passerelle,
        double? SurfaceAnnoncee, bool Configuree);

    private sealed record BatimentRow(string Id, string SiteId, string Nom, string Contour, string? Sigmas, double? Hauteur, int? Niveaux, string? Source, string? SourceRef,
        string? Rnb, string? Usage, double? PrecisionSource);

    private sealed record ZoneRow(string Id, string BatimentId, string Nom, string Type, string Polygone, int Niveau);

    private sealed record MachineRow(string Id, string BatimentId, string? ZoneId, string Type, string Nom, string Numero, double X, double Z, double RotationDeg,
        string? ModeleUrl, long? CreeLe, int Niveau);

    private sealed record OrganeRow(string Id, string MachineId, int Numero, string Nom, string? Noeud3d, string? Position, string? Methode, string? Capteurs,
        string? PannesTypiques, string? AlarmeCode, string? AlarmeMessage);

    private sealed record PointRow(string Id, string MachineId, string OrganeId, string Cle, string Libelle, string Type, string? Unite, double? Nominal, string? Seuils,
        string? Protocole, string? Adresse);

    private sealed record ConnexionRow(string Id, string MachineId, string Protocole, string Parametres, string Etat, string Associations, bool LectureSeule);

    public async Task<IReadOnlyList<UsineEnregistree>> UsinesAsync(CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var args = new { demo = _organisationDemo ?? "" };
        async Task<List<T>> Q<T>(string sql) => (await conn.QueryAsync<T>(new CommandDefinition(sql, args, cancellationToken: ct))).ToList();
        // Dépendances des seules usines réelles : jointure jusqu'au site, organisation de la démo exclue.
        const string Reelles = "JOIN sites s ON s.id = b.site_id AND s.organisation_id <> @demo";
        var sites = await Q<SiteRow>(
            """
            SELECT id, organisation_id AS OrganisationId, nom, adresse, lon, lat, repere::text AS repere, siret, passerelle, surface_annoncee AS SurfaceAnnoncee, configuree
            FROM sites WHERE organisation_id <> @demo ORDER BY id
            """);
        if (sites.Count == 0) return [];
        var batiments = await Q<BatimentRow>(
            $"""
            SELECT b.id, b.site_id AS SiteId, b.nom, b.contour::text AS contour, b.sigmas::text AS sigmas, b.hauteur, b.niveaux, b.source, b.source_ref AS SourceRef, b.rnb, b.usage,
                   b.precision_source AS PrecisionSource
            FROM batiments b {Reelles} ORDER BY b.id
            """);
        var zones = await Q<ZoneRow>($"SELECT z.id, z.batiment_id AS BatimentId, z.nom, z.type, z.polygone::text AS polygone, z.niveau FROM zones z JOIN batiments b ON b.id = z.batiment_id {Reelles} ORDER BY z.id");
        var machines = await Q<MachineRow>(
            $"""
            SELECT m.id, m.batiment_id AS BatimentId, m.zone_id AS ZoneId, m.type, m.nom, m.numero, m.x, m.z, m.rotation_deg AS RotationDeg, m.modele_url AS ModeleUrl,
                   m.cree_le AS CreeLe, m.niveau
            FROM machines m JOIN batiments b ON b.id = m.batiment_id {Reelles} ORDER BY m.id
            """);
        var organes = await Q<OrganeRow>(
            $"""
            SELECT o.id, o.machine_id AS MachineId, o.numero, o.nom, o.noeud_3d AS Noeud3d, o.position::text AS position, o.methode, o.capteurs::text AS capteurs,
                   o.pannes_typiques::text AS PannesTypiques, o.alarme_code AS AlarmeCode, o.alarme_message AS AlarmeMessage
            FROM organes o JOIN machines m ON m.id = o.machine_id JOIN batiments b ON b.id = m.batiment_id {Reelles} ORDER BY o.machine_id, o.numero
            """);
        var points = await Q<PointRow>(
            $"""
            SELECT p.id, p.machine_id AS MachineId, p.organe_id AS OrganeId, p.cle, p.libelle, p.type, p.unite, p.nominal, p.seuils::text AS seuils, p.protocole, p.adresse
            FROM points_mesure p JOIN machines m ON m.id = p.machine_id JOIN batiments b ON b.id = m.batiment_id {Reelles} ORDER BY p.id
            """);
        var connexions = await Q<ConnexionRow>(
            $"""
            SELECT x.id, x.machine_id AS MachineId, x.protocole, x.parametres::text AS parametres, x.etat, x.associations::text AS associations, x.lecture_seule AS LectureSeule
            FROM connexions x JOIN machines m ON m.id = x.machine_id JOIN batiments b ON b.id = m.batiment_id {Reelles} ORDER BY x.id
            """);

        var siteDeBatiment = batiments.ToDictionary(b => b.Id, b => b.SiteId);
        var siteDeMachine = machines.ToDictionary(m => m.Id, m => siteDeBatiment[m.BatimentId]);
        return sites.Select(s =>
        {
            var site = new Site(s.Id, s.OrganisationId, s.Nom, s.Adresse ?? "", [s.Lon ?? 0, s.Lat ?? 0], Lire<Repere>(s.Repere) ?? new Repere([s.Lon ?? 0, s.Lat ?? 0], 0),
                s.Siret, s.Passerelle, s.SurfaceAnnoncee);
            var config = new ConfigurationUsine(
                site,
                batiments.Where(b => b.SiteId == s.Id).Select(b => new Batiment(b.Id, b.SiteId, b.Nom, Lire<double[][]>(b.Contour) ?? [], Lire<double[]>(b.Sigmas) ?? [],
                    b.Hauteur ?? 0, b.Niveaux ?? 0, b.Source ?? "manuel", b.SourceRef, b.Rnb, b.Usage, b.PrecisionSource)).ToList(),
                zones.Where(z => siteDeBatiment[z.BatimentId] == s.Id).Select(z => new Zone(z.Id, z.BatimentId, z.Nom, z.Type, Lire<double[][]>(z.Polygone) ?? [], z.Niveau)).ToList(),
                machines.Where(m => siteDeMachine[m.Id] == s.Id).Select(m => new Machine(m.Id, m.BatimentId, m.ZoneId, m.Type, m.Nom, m.Numero, [m.X, m.Z], m.RotationDeg,
                    new ModeleRef(m.ModeleUrl ?? ""), m.CreeLe, m.Niveau)).ToList(),
                organes.Where(o => siteDeMachine[o.MachineId] == s.Id).Select(o => new OrganeConfig(o.Id, o.MachineId, o.Numero, o.Nom, o.Noeud3d, Lire<double[]>(o.Position),
                    Lire<List<string>>(o.Capteurs), Lire<List<string>>(o.PannesTypiques), o.Methode,
                    o.AlarmeCode is { } code ? new AlarmeOrgane(code, o.AlarmeMessage ?? "") : null)).ToList(),
                points.Where(p => siteDeMachine[p.MachineId] == s.Id).Select(p => new PointDeMesure(p.Id, p.MachineId, p.OrganeId, p.Cle, p.Libelle, p.Type, p.Unite ?? "",
                    p.Nominal ?? 0, Lire<Seuils>(p.Seuils) ?? new Seuils(), p.Protocole, p.Adresse)).ToList(),
                connexions.Where(x => siteDeMachine[x.MachineId] == s.Id).Select(x => new Connexion(x.Id, x.MachineId, x.Protocole,
                    Lire<Dictionary<string, string>>(x.Parametres) ?? [], x.Etat, Lire<Dictionary<string, string>>(x.Associations) ?? [], x.LectureSeule)).ToList(),
                s.Configuree);
            return new UsineEnregistree(s.OrganisationId, config);
        }).ToList();
    }

    // ---------- Comptes et organisations ----------

    private sealed record CompteRow(string Id, string OrganisationId, string Identifiant, string Nom, string Role, string Empreinte, DateTime CreeLe)
    {
        public Compte VersCompte() => new(Id, OrganisationId, Identifiant, Nom, Role, Empreinte, Ms(CreeLe));
    }

    private const string CompteColonnes = "SELECT id, organisation_id AS OrganisationId, identifiant, nom, role, empreinte, cree_le AS CreeLe FROM comptes";

    public async Task<Compte?> CompteAsync(string identifiant, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var row = await conn.QuerySingleOrDefaultAsync<CompteRow>(new CommandDefinition($"{CompteColonnes} WHERE identifiant = @identifiant", new { identifiant }, cancellationToken: ct));
        return row?.VersCompte();
    }

    public async Task<IReadOnlyList<Compte>> ComptesAsync(string organisationId, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<CompteRow>(new CommandDefinition(
            $"{CompteColonnes} WHERE organisation_id = @organisationId ORDER BY cree_le LIMIT 1000", new { organisationId }, cancellationToken: ct));
        return rows.Select(r => r.VersCompte()).ToList();
    }

    public async Task<Organisation?> OrganisationAsync(string id, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<Organisation>(new CommandDefinition("SELECT id, nom FROM organisations WHERE id = @id", new { id }, cancellationToken: ct));
    }

    private const string InsererCompte =
        """
        INSERT INTO comptes (id, organisation_id, identifiant, nom, role, empreinte, cree_le)
        VALUES (@Id, @OrganisationId, @Identifiant, @Nom, @Role, @Empreinte, @Cree)
        ON CONFLICT (identifiant) DO NOTHING
        """;

    private static object Args(Compte c) => new { c.Id, c.OrganisationId, c.Identifiant, c.Nom, c.Role, c.Empreinte, Cree = Utc(c.CreeLe) };

    public async Task<bool> CreerOrganisationAsync(Organisation organisation, Compte admin, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition("INSERT INTO organisations (id, nom, cree_le) VALUES (@Id, @Nom, now())", organisation, tx, cancellationToken: ct));
        if (await conn.ExecuteAsync(new CommandDefinition(InsererCompte, Args(admin), tx, cancellationToken: ct)) == 0)
        {
            await tx.RollbackAsync(ct);
            return false;
        }
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task<bool> InstallerAsync(Organisation organisation, Compte admin, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        // Verrou de transaction : une seconde installation simultanée attend la première, puis voit son compte.
        await conn.ExecuteAsync(new CommandDefinition("SELECT pg_advisory_xact_lock(hashtext('evan.installation'))", transaction: tx, cancellationToken: ct));
        if (await conn.ExecuteScalarAsync<bool>(new CommandDefinition("SELECT EXISTS (SELECT 1 FROM comptes)", transaction: tx, cancellationToken: ct)))
        {
            await tx.RollbackAsync(ct);
            return false;
        }
        await conn.ExecuteAsync(new CommandDefinition("INSERT INTO organisations (id, nom, cree_le) VALUES (@Id, @Nom, now())", organisation, tx, cancellationToken: ct));
        if (await conn.ExecuteAsync(new CommandDefinition(InsererCompte, Args(admin), tx, cancellationToken: ct)) == 0)
        {
            await tx.RollbackAsync(ct);
            return false;
        }
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task<bool> AjouterCompteAsync(Compte compte, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition(InsererCompte, Args(compte), cancellationToken: ct)) == 1;
    }

    public async Task<bool> ChangerEmpreinteAsync(string compteId, string empreinte, CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition("UPDATE comptes SET empreinte = @empreinte WHERE id = @compteId", new { compteId, empreinte }, cancellationToken: ct)) == 1;
    }
}
