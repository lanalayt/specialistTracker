-- ============================================================
-- Create `teams` table — replaces settings_team, theme_colors,
-- and team_logo blobs from team_data.
-- Run this once in the Supabase SQL editor.
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,  -- same as coach's auth UID (= current team_id)
  name TEXT NOT NULL DEFAULT 'My Team',
  school TEXT NOT NULL DEFAULT 'My School',
  dash_title TEXT NOT NULL DEFAULT 'Special Teams Dashboard',
  color_primary TEXT NOT NULL DEFAULT '#00d4a0',
  color_secondary TEXT NOT NULL DEFAULT '#0a0f14',
  color_tertiary TEXT NOT NULL DEFAULT '#1f2f42',
  logo TEXT,  -- base64 data URL, NULL = no logo (default)
  enabled_sports JSONB NOT NULL DEFAULT '["KICKING","PUNTING","KICKOFF","LONGSNAP"]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON teams FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON teams FOR UPDATE TO authenticated USING (true);

-- 3. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE teams;

-- 4. Migrate existing blob data into the new table
INSERT INTO teams (id, name, school, dash_title,
                   color_primary, color_secondary, color_tertiary,
                   logo, enabled_sports)
SELECT
  td_settings.team_id,
  COALESCE(td_settings.data->>'name', td_settings.data->>'school', 'My Team'),
  COALESCE(td_settings.data->>'school', 'My School'),
  COALESCE(td_settings.data->>'dashTitle', 'Special Teams Dashboard'),
  COALESCE(td_colors.data->>'primary', '#00d4a0'),
  COALESCE(td_colors.data->>'secondary', '#0a0f14'),
  COALESCE(td_colors.data->>'tertiary', '#1f2f42'),
  NULLIF(td_logo.data->>'logo', ''),
  COALESCE(td_settings.data->'config'->'enabledSports', '["KICKING","PUNTING","KICKOFF","LONGSNAP"]'::jsonb)
FROM team_data td_settings
LEFT JOIN team_data td_colors
  ON td_colors.team_id = td_settings.team_id AND td_colors.data_key = 'theme_colors'
LEFT JOIN team_data td_logo
  ON td_logo.team_id = td_settings.team_id AND td_logo.data_key = 'team_logo'
WHERE td_settings.data_key = 'settings_team'
ON CONFLICT (id) DO NOTHING;
