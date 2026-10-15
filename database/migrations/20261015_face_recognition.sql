BEGIN;

-- Table face_profiles supportant le personnel (et les utilisateurs)
CREATE TABLE IF NOT EXISTS face_profiles (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    personnel_id bigint REFERENCES personnel(id) ON DELETE CASCADE,
    user_id bigint REFERENCES users(id) ON DELETE CASCADE,
    face_embedding jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'face_profiles' AND column_name = 'personnel_id'
    ) THEN
        ALTER TABLE face_profiles ADD COLUMN personnel_id bigint REFERENCES personnel(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'face_profiles' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE face_profiles ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS face_profiles_personnel_id_unique ON face_profiles (personnel_id) WHERE personnel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS face_profiles_personnel_idx ON face_profiles (personnel_id);

-- Table attendances pour les pointages par reconnaissance faciale
CREATE TABLE IF NOT EXISTS attendances (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    personnel_id bigint REFERENCES personnel(id) ON DELETE CASCADE,
    user_id bigint REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('ARRIVAL', 'DEPARTURE', 'CHECK_IN')),
    timestamp timestamptz NOT NULL DEFAULT now(),
    confidence double precision,
    source text NOT NULL DEFAULT 'FACE_RECOGNITION',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendances_personnel_idx ON attendances (personnel_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS attendances_timestamp_idx ON attendances (timestamp DESC);

COMMIT;
