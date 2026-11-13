CREATE TABLE recall_personal_libraries (
  owner_id varchar(64) NOT NULL,
  library_key varchar(96) NOT NULL DEFAULT 'personal',
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state_json text NOT NULL DEFAULT '{"entities":[],"receipts":[]}'
    CHECK (jsonb_typeof(state_json::jsonb) = 'object' AND octet_length(state_json) <= 16777216),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  ),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  ),
  PRIMARY KEY (owner_id, library_key)
);
ALTER TABLE recall_personal_libraries ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON recall_personal_libraries TO service_role USING (true);
CREATE POLICY recall_personal_authenticated ON recall_personal_libraries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY recall_personal_select ON recall_personal_libraries
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY recall_personal_created_by ON recall_personal_libraries
  FOR ALL TO authenticated USING ((current_setting('app.user_id', true)) = ((_created_by).user_id)::text);
CREATE POLICY recall_personal_owner_guard ON recall_personal_libraries
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (owner_id = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK (owner_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY recall_personal_no_anon ON recall_personal_libraries
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
COMMENT ON TABLE recall_personal_libraries IS 'Single-user Recall aggregate; revision, entities and replay receipts commit in one conditional write. No image bytes or device secrets.';
