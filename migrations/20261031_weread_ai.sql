CREATE TABLE IF NOT EXISTS import_request_limits (
  space_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (space_id, bucket, window_start)
);
CREATE TABLE IF NOT EXISTS import_question_cache (
  space_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  value_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, content_hash)
);
