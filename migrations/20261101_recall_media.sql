CREATE TABLE IF NOT EXISTS media_usage (
  space_id TEXT PRIMARY KEY REFERENCES spaces(id),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0 AND used_bytes <= 67108864)
);
CREATE TABLE IF NOT EXISTS media_assets (
  space_id TEXT NOT NULL REFERENCES spaces(id),
  id TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  data BLOB NOT NULL CHECK (length(data) > 0 AND length(data) <= 524288),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, id)
);
CREATE TRIGGER IF NOT EXISTS media_count_insert AFTER INSERT ON media_assets
BEGIN
  INSERT INTO media_usage (space_id, used_bytes) VALUES (NEW.space_id, length(NEW.data))
  ON CONFLICT (space_id) DO UPDATE SET used_bytes = used_bytes + length(NEW.data);
END;
CREATE TRIGGER IF NOT EXISTS media_count_delete AFTER DELETE ON media_assets
BEGIN
  UPDATE media_usage SET used_bytes = used_bytes - length(OLD.data) WHERE space_id = OLD.space_id;
END;
