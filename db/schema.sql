-- Kijo schema (Neon Postgres). Mirrors src/lib/types.ts.
-- Timestamps are epoch milliseconds (BIGINT) to match the shared TS types.
-- Safe to re-run: every statement is idempotent.

CREATE TABLE IF NOT EXISTS nurses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('CNA', 'RN', 'Charge')),
  wing       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'responding'))
);

CREATE TABLE IF NOT EXISTS residents (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  room               TEXT NOT NULL,
  wing               TEXT NOT NULL CHECK (wing IN ('North', 'South', 'Guest')),
  language           TEXT NOT NULL CHECK (language IN ('en', 'fr', 'es')),
  can_speak          BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_nurse_id  TEXT NOT NULL REFERENCES nurses(id),
  age                INTEGER NOT NULL,
  code_status        TEXT NOT NULL CHECK (code_status IN ('Full code', 'DNR')),
  fall_risk          TEXT NOT NULL CHECK (fall_risk IN ('Low', 'Medium', 'High')),
  mobility           TEXT NOT NULL CHECK (mobility IN ('Independent', 'Walker', 'Wheelchair', 'Bed-bound')),
  cognition          TEXT NOT NULL CHECK (cognition IN ('Oriented', 'Mild confusion', 'Dementia')),
  allergies          TEXT[] NOT NULL DEFAULT '{}',
  care_notes         TEXT NOT NULL DEFAULT '',
  emergency_contact  JSONB NOT NULL,
  status             TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'attention', 'emergency')),
  heart_rate         INTEGER NOT NULL,
  last_motion_at     BIGINT NOT NULL,
  motion_state       TEXT CHECK (motion_state IN ('moving', 'still', 'lying')),  -- band motion monitor; NULL = unknown
  is_guest           BOOLEAN NOT NULL DEFAULT FALSE,
  device_id          TEXT,               -- guest flow (/join); server-only
  active             BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = removed from the floor (Charge view); hidden everywhere
  created_at         BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resident_id         TEXT NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('fall', 'voice', 'sos_shake', 'need_pain', 'need_bathroom', 'need_water', 'need_help', 'vitals', 'inactivity', 'up_at_night')),
  priority            SMALLINT NOT NULL CHECK (priority IN (1, 2, 3)),
  summary             TEXT NOT NULL,
  transcript          TEXT,
  heart_rate          INTEGER,
  assigned_nurse_id   TEXT NOT NULL REFERENCES nurses(id),
  escalated_to        TEXT REFERENCES nurses(id),
  assisting_nurse_ids TEXT[] NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at          BIGINT NOT NULL,
  acknowledged_at     BIGINT,
  resolved_at         BIGINT,
  patient_message     TEXT NOT NULL,
  ack_token           TEXT NOT NULL      -- per-alert secret for ntfy "I'm on it"; never sent to clients
);

CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (status);
CREATE INDEX IF NOT EXISTS alerts_resident_created_idx ON alerts (resident_id, created_at DESC);

-- Migration for databases created before motion_state / inactivity / up_at_night (idempotent).
ALTER TABLE residents ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE residents ADD COLUMN IF NOT EXISTS motion_state TEXT CHECK (motion_state IN ('moving', 'still', 'lying'));
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check CHECK (type IN ('fall', 'voice', 'sos_shake', 'need_pain', 'need_bathroom', 'need_water', 'need_help', 'vitals', 'inactivity', 'up_at_night'));
