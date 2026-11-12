-- Migration: Table de jonction pour les responsables de division / niveau
CREATE TABLE IF NOT EXISTS division_responsables (
    division_id bigint NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (division_id, user_id)
);

CREATE INDEX IF NOT EXISTS div_resp_user_idx ON division_responsables (user_id);
CREATE INDEX IF NOT EXISTS div_resp_div_idx ON division_responsables (division_id);
