-- ============================================================================
-- Phase 1A: scout_presets table (new home for scout chart presets) + migrate
-- the last live blob data off team_data. Non-destructive; run BEFORE deploy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS scout_presets (
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  preset_key TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, preset_key)
);

ALTER TABLE scout_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_select" ON scout_presets;
DROP POLICY IF EXISTS "team_insert" ON scout_presets;
DROP POLICY IF EXISTS "team_update" ON scout_presets;
DROP POLICY IF EXISTS "team_delete" ON scout_presets;
CREATE POLICY "team_select" ON scout_presets FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON scout_presets FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON scout_presets FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON scout_presets FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Migrate existing presets (e.g. scout_fg_preset) from the blob.
-- Guard on teams(id): some blob rows belong to orphaned teams that were never
-- created in the teams table, and both target tables FK to teams(id).
INSERT INTO scout_presets (team_id, preset_key, data)
SELECT td.team_id, td.data_key, td.data
FROM team_data td
WHERE td.data_key LIKE 'scout\_%\_preset' ESCAPE '\'
  AND td.team_id IN (SELECT id FROM teams)
ON CONFLICT (team_id, preset_key) DO NOTHING;

-- Migrate any in-progress session drafts still in the blob into session_drafts
INSERT INTO session_drafts (team_id, draft_key, data, updated_at)
SELECT td.team_id, td.data_key, td.data, COALESCE(td.updated_at, now())
FROM team_data td
WHERE td.data_key LIKE '%\_session\_draft%' ESCAPE '\'
  AND td.team_id IN (SELECT id FROM teams)
ON CONFLICT (team_id, draft_key) DO NOTHING;

-- Verify:
--   SELECT count(*) FROM scout_presets;                    -- expect 3
--   SELECT count(*) FROM session_drafts;                   -- expect the copied drafts
