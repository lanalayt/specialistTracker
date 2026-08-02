-- ============================================================
-- Phase 0: RLS Foundation — secure all tables with team membership checks
-- Phase 1: invite_codes table
-- Phase 2: user_settings table
-- Phase 3: session_drafts table
-- Phase 4: Scout data tables
-- Run in the Supabase SQL Editor.
-- ============================================================

-- ── Phase 0A: is_team_member() helper ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_team_member(check_team_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT auth.uid()::text = check_team_id
    OR EXISTS (SELECT 1 FROM public.members WHERE team_id = check_team_id AND id = auth.uid()::text)
$$;

-- ── Phase 0B: Fix RLS on teams ──────────────────────────────────────────────

DROP POLICY IF EXISTS "auth_select" ON teams;
DROP POLICY IF EXISTS "auth_insert" ON teams;
DROP POLICY IF EXISTS "auth_update" ON teams;

CREATE POLICY "members_can_select" ON teams
  FOR SELECT TO authenticated USING (is_team_member(id));
CREATE POLICY "owner_can_insert" ON teams
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = id);
CREATE POLICY "owner_can_update" ON teams
  FOR UPDATE TO authenticated USING (auth.uid()::text = id);

-- ── Fix RLS on sessions ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read sessions" ON sessions;
DROP POLICY IF EXISTS "Authenticated users can insert sessions" ON sessions;
DROP POLICY IF EXISTS "Authenticated users can update sessions" ON sessions;
DROP POLICY IF EXISTS "Authenticated users can delete sessions" ON sessions;
DROP POLICY IF EXISTS "auth_select" ON sessions;
DROP POLICY IF EXISTS "auth_insert" ON sessions;
DROP POLICY IF EXISTS "auth_update" ON sessions;
DROP POLICY IF EXISTS "auth_delete" ON sessions;

CREATE POLICY "team_select" ON sessions
  FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON sessions
  FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON sessions
  FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON sessions
  FOR DELETE TO authenticated USING (is_team_member(team_id));

-- ── Fix RLS on athletes ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read athletes" ON athletes;
DROP POLICY IF EXISTS "Authenticated users can insert athletes" ON athletes;
DROP POLICY IF EXISTS "Authenticated users can update athletes" ON athletes;
DROP POLICY IF EXISTS "Authenticated users can delete athletes" ON athletes;
DROP POLICY IF EXISTS "auth_select" ON athletes;
DROP POLICY IF EXISTS "auth_insert" ON athletes;
DROP POLICY IF EXISTS "auth_update" ON athletes;
DROP POLICY IF EXISTS "auth_delete" ON athletes;

CREATE POLICY "team_select" ON athletes
  FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON athletes
  FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON athletes
  FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON athletes
  FOR DELETE TO authenticated USING (is_team_member(team_id));

-- ── Fix RLS on members ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read members" ON members;
DROP POLICY IF EXISTS "Authenticated users can insert members" ON members;
DROP POLICY IF EXISTS "Authenticated users can update members" ON members;
DROP POLICY IF EXISTS "Authenticated users can delete members" ON members;
DROP POLICY IF EXISTS "auth_select" ON members;
DROP POLICY IF EXISTS "auth_insert" ON members;
DROP POLICY IF EXISTS "auth_update" ON members;
DROP POLICY IF EXISTS "auth_delete" ON members;

-- Members of a team can see each other
CREATE POLICY "team_select" ON members
  FOR SELECT TO authenticated USING (is_team_member(team_id));
-- Self-registration: any authenticated user can insert their own row
CREATE POLICY "self_insert" ON members
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = id);
-- Members can update their own row (last_seen); owner can update any
CREATE POLICY "self_or_owner_update" ON members
  FOR UPDATE TO authenticated USING (
    auth.uid()::text = id OR auth.uid()::text = team_id
  );
-- Only team owner can delete members
CREATE POLICY "owner_delete" ON members
  FOR DELETE TO authenticated USING (auth.uid()::text = team_id);

-- ── Fix RLS on archives ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read archives" ON archives;
DROP POLICY IF EXISTS "Authenticated users can insert archives" ON archives;
DROP POLICY IF EXISTS "Authenticated users can update archives" ON archives;
DROP POLICY IF EXISTS "Authenticated users can delete archives" ON archives;
DROP POLICY IF EXISTS "auth_select" ON archives;
DROP POLICY IF EXISTS "auth_insert" ON archives;
DROP POLICY IF EXISTS "auth_update" ON archives;
DROP POLICY IF EXISTS "auth_delete" ON archives;

CREATE POLICY "team_select" ON archives
  FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON archives
  FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON archives
  FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON archives
  FOR DELETE TO authenticated USING (is_team_member(team_id));

-- ── Fix RLS on team_data (lock down during migration) ───────────────────────

DROP POLICY IF EXISTS "Authenticated users can read team data" ON team_data;
DROP POLICY IF EXISTS "Authenticated users can insert team data" ON team_data;
DROP POLICY IF EXISTS "Authenticated users can update team data" ON team_data;

CREATE POLICY "team_select" ON team_data
  FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON team_data
  FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON team_data
  FOR UPDATE TO authenticated USING (is_team_member(team_id));

-- ── Phase 1: invite_codes table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invite_codes (
  team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  coach_code TEXT NOT NULL,
  athlete_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_coach ON invite_codes(coach_code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_athlete ON invite_codes(athlete_code);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- Only team owner can read/write invite codes
CREATE POLICY "owner_select" ON invite_codes
  FOR SELECT TO authenticated USING (auth.uid()::text = team_id);
CREATE POLICY "owner_insert" ON invite_codes
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = team_id);
CREATE POLICY "owner_update" ON invite_codes
  FOR UPDATE TO authenticated USING (auth.uid()::text = team_id);

-- Migrate existing invite codes from team_data
INSERT INTO invite_codes (team_id, coach_code, athlete_code)
SELECT
  team_id,
  data->>'coachCode',
  data->>'athleteCode'
FROM team_data
WHERE data_key = 'invite_codes'
  AND data->>'coachCode' IS NOT NULL
  AND data->>'athleteCode' IS NOT NULL
ON CONFLICT (team_id) DO NOTHING;

-- ── Phase 2: user_settings table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, sport)
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON user_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON user_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON user_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_delete" ON user_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Migrate existing settings from user_data
INSERT INTO user_settings (user_id, sport, settings, updated_at)
SELECT
  user_id,
  CASE data_key
    WHEN 'settings_fgSettings' THEN 'fg'
    WHEN 'settings_puntSettings' THEN 'punt'
    WHEN 'settings_kickoffSettings' THEN 'kickoff'
    WHEN 'settings_snapSettings' THEN 'snap'
  END,
  data,
  updated_at
FROM user_data
WHERE data_key IN ('settings_fgSettings', 'settings_puntSettings', 'settings_kickoffSettings', 'settings_snapSettings')
ON CONFLICT (user_id, sport) DO NOTHING;

-- ── Phase 3: session_drafts table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_drafts (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  draft_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, draft_key)
);

ALTER TABLE session_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_select" ON session_drafts
  FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON session_drafts
  FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON session_drafts
  FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON session_drafts
  FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Enable realtime for draft sync
ALTER PUBLICATION supabase_realtime ADD TABLE session_drafts;

-- ── Phase 4: Scout data tables ──────────────────────────────────────────────

-- Scout Profiles
CREATE TABLE IF NOT EXISTS scout_profiles (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  profile JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, name)
);

ALTER TABLE scout_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_select" ON scout_profiles FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON scout_profiles FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON scout_profiles FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON scout_profiles FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Migrate scout_profiles from team_data
INSERT INTO scout_profiles (team_id, name, profile)
SELECT
  td.team_id,
  kv.key,
  kv.value
FROM team_data td,
  jsonb_each(td.data) AS kv(key, value)
WHERE td.data_key = 'scout_profiles'
  AND jsonb_typeof(td.data) = 'object'
ON CONFLICT (team_id, name) DO NOTHING;

-- Scout Athletes
CREATE TABLE IF NOT EXISTS scout_athletes (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, sport, name)
);

ALTER TABLE scout_athletes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_select" ON scout_athletes FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON scout_athletes FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON scout_athletes FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON scout_athletes FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Migrate scout_athletes from team_data (per sport)
INSERT INTO scout_athletes (team_id, sport, name, sort_order)
SELECT
  td.team_id,
  REPLACE(td.data_key, 'scout_athletes_', ''),
  elem.value::text,
  elem.ordinality - 1
FROM team_data td,
  jsonb_array_elements_text(td.data) WITH ORDINALITY AS elem(value, ordinality)
WHERE td.data_key LIKE 'scout_athletes_%'
  AND jsonb_typeof(td.data) = 'array'
ON CONFLICT (team_id, sport, name) DO NOTHING;

-- Scout Numbers (jersey numbers)
CREATE TABLE IF NOT EXISTS scout_numbers (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  jersey_number TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, name)
);

ALTER TABLE scout_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_select" ON scout_numbers FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON scout_numbers FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON scout_numbers FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON scout_numbers FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Migrate scout_numbers from team_data
INSERT INTO scout_numbers (team_id, name, jersey_number)
SELECT
  td.team_id,
  kv.key,
  kv.value::text
FROM team_data td,
  jsonb_each_text(td.data) AS kv(key, value)
WHERE td.data_key = 'scout_numbers'
  AND jsonb_typeof(td.data) = 'object'
  AND kv.value != ''
ON CONFLICT (team_id, name) DO NOTHING;

-- Scout Ranking Groups
CREATE TABLE IF NOT EXISTS scout_ranking_groups (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ranking_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, ranking_id)
);

ALTER TABLE scout_ranking_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_select" ON scout_ranking_groups FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON scout_ranking_groups FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON scout_ranking_groups FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON scout_ranking_groups FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Migrate scout_rankings from team_data
INSERT INTO scout_ranking_groups (team_id, ranking_id, name, sort_order)
SELECT
  td.team_id,
  elem->>'id',
  elem->>'name',
  (elem.ordinality - 1)::int
FROM team_data td,
  jsonb_array_elements(td.data) WITH ORDINALITY AS elem(value, ordinality)
WHERE td.data_key = 'scout_rankings_shared'
  AND jsonb_typeof(td.data) = 'array'
ON CONFLICT (team_id, ranking_id) DO NOTHING;

-- Scout Session Rankings
CREATE TABLE IF NOT EXISTS scout_session_rankings (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  lookup_key TEXT NOT NULL,
  ranking_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, lookup_key)
);

ALTER TABLE scout_session_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_select" ON scout_session_rankings FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON scout_session_rankings FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON scout_session_rankings FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON scout_session_rankings FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Migrate scout_session_rankings from team_data
INSERT INTO scout_session_rankings (team_id, lookup_key, ranking_ids)
SELECT
  td.team_id,
  kv.key,
  ARRAY(SELECT jsonb_array_elements_text(kv.value))
FROM team_data td,
  jsonb_each(td.data) AS kv(key, value)
WHERE td.data_key = 'scout_session_rankings'
  AND jsonb_typeof(td.data) = 'object'
  AND jsonb_typeof(kv.value) = 'array'
ON CONFLICT (team_id, lookup_key) DO NOTHING;

-- Assigned Charts
CREATE TABLE IF NOT EXISTS assigned_charts (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  sport TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  due_date TEXT,
  athletes TEXT[] NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  completed_by JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (team_id, id)
);

ALTER TABLE assigned_charts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_select" ON assigned_charts FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON assigned_charts FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON assigned_charts FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON assigned_charts FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Migrate assigned_charts from team_data
INSERT INTO assigned_charts (team_id, id, sport, created_by, created_at, due_date, athletes, config, completed_by)
SELECT
  td.team_id,
  elem->>'id',
  elem->>'sport',
  COALESCE(elem->>'createdBy', ''),
  COALESCE((elem->>'createdAt')::timestamptz, now()),
  elem->>'dueDate',
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(elem->'athletes', '[]'::jsonb))),
  jsonb_build_object(
    'kicks', COALESCE(elem->'kicks', '[]'::jsonb),
    'reps', elem->'reps',
    'puntTypes', elem->'puntTypes',
    'koRows', elem->'koRows'
  ),
  COALESCE(elem->'completedBy', '{}'::jsonb)
FROM team_data td,
  jsonb_array_elements(td.data) AS elem
WHERE td.data_key = 'assigned_charts'
  AND jsonb_typeof(td.data) = 'array'
ON CONFLICT (team_id, id) DO NOTHING;

-- Scout Archives
CREATE TABLE IF NOT EXISTS scout_archives (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  fg JSONB NOT NULL DEFAULT '[]',
  punt JSONB NOT NULL DEFAULT '[]',
  kickoff JSONB NOT NULL DEFAULT '[]',
  snap JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (team_id, id)
);

ALTER TABLE scout_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_select" ON scout_archives FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON scout_archives FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON scout_archives FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON scout_archives FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Migrate scout_archives from team_data
INSERT INTO scout_archives (team_id, id, name, created_at, fg, punt, kickoff, snap)
SELECT
  td.team_id,
  elem->>'id',
  COALESCE(elem->>'name', 'Archive'),
  COALESCE((elem->>'createdAt')::timestamptz, now()),
  COALESCE(elem->'fg', '[]'::jsonb),
  COALESCE(elem->'punt', '[]'::jsonb),
  COALESCE(elem->'kickoff', '[]'::jsonb),
  COALESCE(elem->'snap', '[]'::jsonb)
FROM team_data td,
  jsonb_array_elements(td.data) AS elem
WHERE td.data_key = 'scout_archives'
  AND jsonb_typeof(td.data) = 'array'
ON CONFLICT (team_id, id) DO NOTHING;

-- Custom Themes
CREATE TABLE IF NOT EXISTS custom_themes (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_primary TEXT NOT NULL,
  color_secondary TEXT NOT NULL,
  color_tertiary TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, name)
);

ALTER TABLE custom_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_select" ON custom_themes FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "owner_insert" ON custom_themes FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = team_id);
CREATE POLICY "owner_update" ON custom_themes FOR UPDATE TO authenticated USING (auth.uid()::text = team_id);
CREATE POLICY "owner_delete" ON custom_themes FOR DELETE TO authenticated USING (auth.uid()::text = team_id);

-- Migrate custom_themes from team_data
INSERT INTO custom_themes (team_id, name, color_primary, color_secondary, color_tertiary, sort_order)
SELECT
  td.team_id,
  elem->>'name',
  elem->'colors'->>'primary',
  elem->'colors'->>'secondary',
  elem->'colors'->>'tertiary',
  (elem.ordinality - 1)::int
FROM team_data td,
  jsonb_array_elements(td.data->'themes') WITH ORDINALITY AS elem(value, ordinality)
WHERE td.data_key = 'st_custom_themes'
  AND td.data ? 'themes'
ON CONFLICT (team_id, name) DO NOTHING;
