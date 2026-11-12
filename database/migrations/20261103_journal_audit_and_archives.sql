-- Migration pour journal_audit et archives_rapports
CREATE TABLE IF NOT EXISTS journal_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    acteur_id bigint,
    entite text NOT NULL CHECK (btrim(entite) <> ''),
    entite_id bigint NOT NULL,
    action text NOT NULL CHECK (btrim(action) <> ''),
    motif text,
    avant jsonb,
    apres jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organisation_id, acteur_id) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS audit_entite_idx ON journal_audit (organisation_id, entite, entite_id, created_at DESC);

CREATE TABLE IF NOT EXISTS archives_rapports (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    date_debut date NOT NULL CHECK (isfinite(date_debut)),
    date_fin date NOT NULL CHECK (isfinite(date_fin)),
    type_rapport text NOT NULL CHECK (type_rapport IN ('PRESENCE', 'RETARDS', 'HEURES')),
    donnees jsonb NOT NULL,
    cree_par bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organisation_id, cree_par) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT
);

