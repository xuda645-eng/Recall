BEGIN;

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision <= 9007199254740991)
);

CREATE TABLE trusted_devices (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  previous_token_hash TEXT,
  previous_token_until BIGINT,
  rotated_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  revoked_at BIGINT
);
CREATE INDEX trusted_devices_space ON trusted_devices(space_id);
CREATE INDEX trusted_devices_previous_token ON trusted_devices(previous_token_hash);

CREATE TABLE pairing_codes (
  code_hash TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  issued_by TEXT NOT NULL REFERENCES trusted_devices(id),
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  used_by TEXT
);
CREATE INDEX pairing_codes_space ON pairing_codes(space_id, expires_at);

CREATE TABLE pair_rate_limits (
  space_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (space_id, ip_hash)
);

CREATE TABLE cloud_entities (
  space_id TEXT NOT NULL REFERENCES spaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('deck', 'card', 'reviewLog', 'studySession', 'setting')),
  id TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (value_json::jsonb IS NOT NULL),
  revision BIGINT NOT NULL CHECK (revision > 0 AND revision <= 9007199254740991),
  PRIMARY KEY (space_id, kind, id)
);
CREATE INDEX cloud_entities_revision ON cloud_entities(space_id, revision);

CREATE TABLE mutation_receipts (
  space_id TEXT NOT NULL REFERENCES spaces(id),
  id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  base_revision BIGINT NOT NULL CHECK (base_revision >= 0),
  revision BIGINT NOT NULL CHECK (revision = base_revision + 1),
  device_id TEXT NOT NULL REFERENCES trusted_devices(id),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (space_id, id)
);

CREATE FUNCTION recall_mutation_revision_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM trusted_devices WHERE id = NEW.device_id AND space_id = NEW.space_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recall_unauthorized';
  END IF;
  UPDATE spaces SET revision = NEW.revision WHERE id = NEW.space_id AND revision = NEW.base_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recall_revision_conflict';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recall_mutation_revision_guard BEFORE INSERT ON mutation_receipts
  FOR EACH ROW EXECUTE FUNCTION recall_mutation_revision_guard();

CREATE TABLE import_request_limits (
  space_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (space_id, bucket, window_start)
);

CREATE TABLE import_question_cache (
  space_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  value_json TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (space_id, content_hash)
);

CREATE TABLE media_usage (
  space_id TEXT PRIMARY KEY REFERENCES spaces(id),
  used_bytes BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT media_usage_quota CHECK (used_bytes >= 0 AND used_bytes <= 67108864)
);

CREATE TABLE media_assets (
  space_id TEXT NOT NULL REFERENCES spaces(id),
  id TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 524288),
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (space_id, id)
);

CREATE FUNCTION recall_media_usage() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO media_usage (space_id, used_bytes) VALUES (NEW.space_id, NEW.size)
      ON CONFLICT (space_id) DO UPDATE SET used_bytes = media_usage.used_bytes + NEW.size;
    RETURN NEW;
  END IF;
  UPDATE media_usage SET used_bytes = used_bytes - OLD.size WHERE space_id = OLD.space_id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER media_count_insert AFTER INSERT ON media_assets FOR EACH ROW EXECUTE FUNCTION recall_media_usage();
CREATE TRIGGER media_count_delete AFTER DELETE ON media_assets FOR EACH ROW EXECUTE FUNCTION recall_media_usage();

CREATE FUNCTION recall_audit_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW._updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['spaces', 'trusted_devices', 'pairing_codes', 'pair_rate_limits',
    'cloud_entities', 'mutation_receipts', 'import_request_limits', 'import_question_cache', 'media_usage', 'media_assets']
  LOOP
    EXECUTE format('ALTER TABLE %I
      ADD COLUMN _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN _created_by user_profile,
      ADD COLUMN _updated_by user_profile', table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE TRIGGER recall_audit_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION recall_audit_update()', table_name);
    EXECUTE format('CREATE POLICY recall_backend ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name);
    EXECUTE format('CREATE POLICY recall_no_anon ON %I FOR ALL TO anon USING (false) WITH CHECK (false)', table_name);
    EXECUTE format('CREATE POLICY recall_no_authenticated_read ON %I FOR SELECT TO authenticated USING (false)', table_name);
    EXECUTE format('CREATE POLICY recall_no_authenticated_write ON %I FOR ALL TO authenticated USING (false) WITH CHECK (false)', table_name);
  END LOOP;
END;
$$;

COMMIT;
