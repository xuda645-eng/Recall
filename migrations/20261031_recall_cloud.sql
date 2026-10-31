CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision <= 9007199254740991)
);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  previous_token_hash TEXT,
  previous_token_until INTEGER,
  rotated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS trusted_devices_space ON trusted_devices(space_id);
CREATE INDEX IF NOT EXISTS trusted_devices_previous_token ON trusted_devices(previous_token_hash);

CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  issued_by TEXT NOT NULL REFERENCES trusted_devices(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT
);
CREATE INDEX IF NOT EXISTS pairing_codes_space ON pairing_codes(space_id, expires_at);

CREATE TABLE IF NOT EXISTS pair_rate_limits (
  space_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (space_id, ip_hash)
);

CREATE TABLE IF NOT EXISTS cloud_entities (
  space_id TEXT NOT NULL REFERENCES spaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('deck', 'card', 'reviewLog', 'studySession', 'setting')),
  id TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  PRIMARY KEY (space_id, kind, id)
);
CREATE INDEX IF NOT EXISTS cloud_entities_revision ON cloud_entities(space_id, revision);

CREATE TABLE IF NOT EXISTS mutation_receipts (
  space_id TEXT NOT NULL REFERENCES spaces(id),
  id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
  revision INTEGER NOT NULL CHECK (revision = base_revision + 1),
  device_id TEXT NOT NULL REFERENCES trusted_devices(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, id)
);

CREATE TRIGGER IF NOT EXISTS recall_mutation_revision_guard
BEFORE INSERT ON mutation_receipts
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM trusted_devices
    WHERE id = NEW.device_id AND space_id = NEW.space_id AND revoked_at IS NULL
  ) THEN RAISE(ABORT, 'recall_unauthorized') END;
  UPDATE spaces SET revision = NEW.revision
    WHERE id = NEW.space_id AND revision = NEW.base_revision;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'recall_revision_conflict') END;
END;
