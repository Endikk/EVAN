-- Carnet de maintenance tenu à l'écran (migration additive, rejouée à chaque démarrage après Schema.sql) :
-- interventions consignées et interventions planifiées, rangées par usine. La clé (site_id, id) cloisonne : un
-- identifiant venu du navigateur ne peut viser que l'usine de l'adresse de la requête.

CREATE TABLE IF NOT EXISTS carnet_saisies (
    site_id        text             NOT NULL,
    id             text             NOT NULL,
    machine_id     text             NOT NULL,
    organe_id      text,
    type           text             NOT NULL,
    debut          timestamptz      NOT NULL,
    duree_min      double precision NOT NULL,
    titre          text             NOT NULL,
    compte_rendu   text,
    auteur         text             NOT NULL,
    tache_id       text,
    -- Ordre d'enregistrement : le carnet garde les plus récentes, comme la mémoire du service.
    enregistree_le timestamptz      NOT NULL DEFAULT now(),
    PRIMARY KEY (site_id, id)
);
CREATE INDEX IF NOT EXISTS carnet_saisies_ordre ON carnet_saisies (site_id, enregistree_le DESC);

CREATE TABLE IF NOT EXISTS carnet_prevues (
    site_id        text             NOT NULL,
    id             text             NOT NULL,
    machine_id     text             NOT NULL,
    organe_id      text,
    tache_id       text,
    titre          text             NOT NULL,
    debut          timestamptz      NOT NULL,
    duree_min      double precision NOT NULL,
    auteur         text,
    point_id       text,
    enregistree_le timestamptz      NOT NULL DEFAULT now(),
    PRIMARY KEY (site_id, id)
);
CREATE INDEX IF NOT EXISTS carnet_prevues_ordre ON carnet_prevues (site_id, enregistree_le);
