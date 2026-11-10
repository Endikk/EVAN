-- Schéma EVAN : référentiel (organisation → usines → point de mesure), séries temporelles TimescaleDB, alarmes, journal.
-- Idempotent : exécuté par l'API au démarrage.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS organisations (
    id          text PRIMARY KEY,
    nom         text NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
    id              text PRIMARY KEY,
    organisation_id text NOT NULL REFERENCES organisations(id),
    nom             text NOT NULL,
    adresse         text,
    lon             double precision,
    lat             double precision,
    repere          jsonb,
    siret           text,
    passerelle      text                      -- passerelle edge de l'usine (une par site)
);
-- Bases créées avant le multi-usines.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS passerelle text;

CREATE TABLE IF NOT EXISTS batiments (
    id               text PRIMARY KEY,
    site_id          text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    nom              text NOT NULL,
    contour          jsonb NOT NULL,          -- anneau lon/lat WGS84
    sigmas           jsonb,                   -- précision de chaque sommet (m)
    hauteur          double precision,
    niveaux          integer,
    source           text,                    -- bdtopo | osm | manuel
    source_ref       text,                    -- cleabs BD TOPO ou way OSM
    rnb              text,                    -- identifiant du Référentiel national des bâtiments
    usage            text,
    precision_source double precision
);

CREATE TABLE IF NOT EXISTS zones (
    id          text PRIMARY KEY,
    batiment_id text NOT NULL REFERENCES batiments(id) ON DELETE CASCADE,
    nom         text NOT NULL,
    type        text NOT NULL,
    polygone    jsonb NOT NULL               -- repère local du site, en mètres
);

CREATE TABLE IF NOT EXISTS machines (
    id           text PRIMARY KEY,
    batiment_id  text NOT NULL REFERENCES batiments(id) ON DELETE CASCADE,
    zone_id      text REFERENCES zones(id) ON DELETE SET NULL,
    type         text NOT NULL,
    nom          text NOT NULL,
    numero       text NOT NULL,
    x            double precision NOT NULL,
    z            double precision NOT NULL,
    rotation_deg double precision NOT NULL DEFAULT 0,
    modele_url   text
);

CREATE TABLE IF NOT EXISTS organes (
    id         text PRIMARY KEY,
    machine_id text NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    numero     integer NOT NULL,
    nom        text NOT NULL,
    noeud_3d   text,
    position   jsonb
);

CREATE TABLE IF NOT EXISTS points_mesure (
    id         text PRIMARY KEY,
    machine_id text NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    organe_id  text NOT NULL REFERENCES organes(id) ON DELETE CASCADE,
    cle        text NOT NULL,
    libelle    text NOT NULL,
    type       text NOT NULL,
    unite      text,
    nominal    double precision,
    seuils     jsonb,
    protocole  text,
    adresse    text
);

CREATE TABLE IF NOT EXISTS connexions (
    id            text PRIMARY KEY,
    machine_id    text NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    protocole     text NOT NULL,
    parametres    jsonb NOT NULL DEFAULT '{}',
    etat          text NOT NULL DEFAULT 'a_configurer',
    associations  jsonb NOT NULL DEFAULT '{}',
    lecture_seule boolean NOT NULL DEFAULT true,
    maj           timestamptz NOT NULL DEFAULT now()
);

-- Usines enregistrées par les organisations réelles (PUT /api/sites/{id}) : ce que l'assistant du front saisit et que
-- la démo n'avait pas besoin de garder. Bases créées avant les comptes.
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS cree_le timestamptz;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS surface_annoncee double precision;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS configuree boolean NOT NULL DEFAULT false;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS maj timestamptz;
CREATE INDEX IF NOT EXISTS sites_organisation ON sites (organisation_id);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS cree_le bigint;              -- ms epoch, machines placées dans l'assistant
ALTER TABLE organes ADD COLUMN IF NOT EXISTS methode text;
ALTER TABLE organes ADD COLUMN IF NOT EXISTS capteurs jsonb;
ALTER TABLE organes ADD COLUMN IF NOT EXISTS pannes_typiques jsonb;
ALTER TABLE organes ADD COLUMN IF NOT EXISTS alarme_code text;
ALTER TABLE organes ADD COLUMN IF NOT EXISTS alarme_message text;

-- Comptes : un utilisateur appartient à une seule organisation ; l'identifiant (adresse e-mail en minuscules) est unique
-- dans toute l'installation. Seule l'empreinte du mot de passe est gardée (PBKDF2, sel par compte).
CREATE TABLE IF NOT EXISTS comptes (
    id              text PRIMARY KEY,
    organisation_id text NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    identifiant     text NOT NULL UNIQUE,
    nom             text NOT NULL,
    role            text NOT NULL CHECK (role IN ('admin', 'membre')),
    empreinte       text NOT NULL,
    cree_le         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comptes_organisation ON comptes (organisation_id);

-- Séries temporelles : une ligne par échantillon, hypertable partitionnée par jour, compressée après 1 jour.
CREATE TABLE IF NOT EXISTS mesures (
    temps    timestamptz      NOT NULL,
    point_id text             NOT NULL,
    valeur   double precision NOT NULL,
    qualite  smallint         NOT NULL DEFAULT 0
);
SELECT create_hypertable('mesures', 'temps', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS mesures_point_temps ON mesures (point_id, temps DESC);
ALTER TABLE mesures SET (timescaledb.compress, timescaledb.compress_segmentby = 'point_id');
-- Non compressée, une journée à 1 Hz pèse 4,7 Go (index à moitié vides, les points s'entrelacent) et une courbe de 6 h y
-- lit un bloc par échantillon ; compressée, 0,3 Go et cent fois moins de blocs lus. Un jour de délai : l'API accepte un
-- horodatage jusqu'à un jour en retard, il tombe donc toujours dans un bloc pas encore compressé.
SELECT add_compression_policy('mesures', INTERVAL '1 day', if_not_exists => TRUE);
-- Bases créées avec une compression à 7 jours : la politique existante passe à 1 jour.
SELECT alter_job(job_id, config => jsonb_set(config, '{compress_after}', '"1 day"'))
FROM timescaledb_information.jobs
WHERE hypertable_name = 'mesures' AND proc_name = 'policy_compression' AND config->>'compress_after' <> '1 day';
SELECT add_retention_policy('mesures', INTERVAL '400 days', if_not_exists => TRUE);

-- Agrégat continu à la minute pour les courbes longues.
CREATE MATERIALIZED VIEW IF NOT EXISTS mesures_1min
WITH (timescaledb.continuous) AS
SELECT time_bucket(INTERVAL '1 minute', temps) AS bucket, point_id,
       avg(valeur) AS moyenne, min(valeur) AS mini, max(valeur) AS maxi, count(*) AS n
FROM mesures
GROUP BY bucket, point_id
WITH NO DATA;
SELECT add_continuous_aggregate_policy('mesures_1min', start_offset => INTERVAL '1 day', end_offset => INTERVAL '1 minute',
                                       schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);
-- Agrégat compressé par point au-delà de 2 jours, hors de la fenêtre de rafraîchissement : une courbe de 60 jours y lit
-- 1 500 blocs au lieu de 87 000 (une ligne par bloc sinon, les 300 points de chaque minute s'entrelacent).
ALTER MATERIALIZED VIEW mesures_1min SET (timescaledb.compress = true, timescaledb.compress_segmentby = 'point_id',
                                          timescaledb.compress_orderby = 'bucket DESC');
SELECT add_compression_policy('mesures_1min', compress_after => INTERVAL '2 days', if_not_exists => TRUE);

-- États machine (pour la disponibilité et le TRS).
CREATE TABLE IF NOT EXISTS etats_machine (
    temps      timestamptz NOT NULL,
    machine_id text        NOT NULL,
    etat       text        NOT NULL,
    vitesse    double precision
);
SELECT create_hypertable('etats_machine', 'temps', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS etats_machine_temps ON etats_machine (machine_id, temps DESC);

CREATE TABLE IF NOT EXISTS alarmes (
    id            text PRIMARY KEY,
    site_id       text NOT NULL,
    machine_id    text NOT NULL,
    organe_id     text NOT NULL,
    point_id      text,
    code          text NOT NULL,
    message       text NOT NULL,
    gravite       text NOT NULL,
    regle         text NOT NULL,
    statut        text NOT NULL,
    horodatage    timestamptz NOT NULL,
    fin_le        timestamptz,
    valeur        double precision,
    unite         text,
    seuil         double precision,
    cause         text,
    acquittee_par text,
    acquittee_le  timestamptz,
    repetitions   integer
);
-- Bases créées avant la reprise des alarmes au redémarrage (heure d'acquittement conservée).
ALTER TABLE alarmes ADD COLUMN IF NOT EXISTS acquittee_le timestamptz;
CREATE INDEX IF NOT EXISTS alarmes_site_temps ON alarmes (site_id, horodatage DESC);
CREATE INDEX IF NOT EXISTS alarmes_machine_code ON alarmes (machine_id, code, horodatage DESC);

CREATE TABLE IF NOT EXISTS evenements (
    id         text PRIMARY KEY,
    site_id    text NOT NULL,
    machine_id text,
    type       text NOT NULL,
    message    text NOT NULL,
    auteur     text,
    horodatage timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS evenements_site_temps ON evenements (site_id, horodatage DESC);

-- Journal des écritures vers les automates : toute demande, acceptée ou refusée, est tracée.
CREATE TABLE IF NOT EXISTS journal_ecritures (
    id         text PRIMARY KEY,
    machine_id text NOT NULL,
    adresse    text NOT NULL,
    valeur     double precision,
    operateur  text NOT NULL,
    raison     text NOT NULL,
    statut     text NOT NULL,
    horodatage timestamptz NOT NULL DEFAULT now()
);
