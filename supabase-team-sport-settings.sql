-- ─────────────────────────────────────────────────────────────────────────────
-- Per-TEAM sport charting settings.
--
-- FG/punt/kickoff/snap config (types, categories, direction scoring, make/miss
-- modes, score options, op-time, holder toggle) and the strike-zone calibrations
-- are the TEAM's charting setup, not an individual's. Move them from per-user
-- (user_settings) to a per-team table so a coach's setup applies to every athlete
-- on the team, and only coaches can change it.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Coach check (mirrors is_team_member): team owner, or a members row marked
--    coach/admin. Used for write policies.
CREATE OR REPLACE FUNCTION public.is_team_coach(check_team_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT auth.uid()::text = check_team_id
    OR EXISTS (
      SELECT 1 FROM public.members
      WHERE team_id = check_team_id
        AND id = auth.uid()::text
        AND role IN ('coach', 'admin')
    )
$$;

-- 2) Table.
CREATE TABLE IF NOT EXISTS public.team_sport_settings (
  team_id    TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  sport      TEXT NOT NULL,   -- fg | punt | kickoff | snap | punt_strike_zone | holder_strike_zone
  settings   JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, sport)
);

ALTER TABLE public.team_sport_settings ENABLE ROW LEVEL SECURITY;

-- 3) RLS: everyone on the team can READ; only coaches can WRITE.
DROP POLICY IF EXISTS "team_read"   ON public.team_sport_settings;
DROP POLICY IF EXISTS "coach_insert" ON public.team_sport_settings;
DROP POLICY IF EXISTS "coach_update" ON public.team_sport_settings;
DROP POLICY IF EXISTS "coach_delete" ON public.team_sport_settings;

CREATE POLICY "team_read" ON public.team_sport_settings
  FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "coach_insert" ON public.team_sport_settings
  FOR INSERT TO authenticated WITH CHECK (is_team_coach(team_id));
CREATE POLICY "coach_update" ON public.team_sport_settings
  FOR UPDATE TO authenticated USING (is_team_coach(team_id)) WITH CHECK (is_team_coach(team_id));
CREATE POLICY "coach_delete" ON public.team_sport_settings
  FOR DELETE TO authenticated USING (is_team_coach(team_id));

-- 4) Realtime (so a coach's change pushes to athletes' open sessions).
--    Idempotent so the whole script can be re-run safely.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'team_sport_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_sport_settings;
  END IF;
END $$;

-- 5) Migrate: seed each team from the team OWNER's existing per-user rows.
--    (A team's owner is the user whose id == team id.)
INSERT INTO public.team_sport_settings (team_id, sport, settings, updated_at)
SELECT us.user_id::text, us.sport, us.settings, COALESCE(us.updated_at, now())
FROM public.user_settings us
JOIN public.teams t ON t.id = us.user_id::text
WHERE us.sport IN ('fg','punt','kickoff','snap','punt_strike_zone','holder_strike_zone')
ON CONFLICT (team_id, sport) DO NOTHING;

-- NOTE: for a team whose active coach is NOT the account that owns the team
-- (e.g. a co-coach), the owner's row may be empty/default. Those coaches just
-- open the settings page once and re-save; it writes to team_sport_settings.

-- 6) (Optional, AFTER verifying the app reads the team table) clean up the old
--    per-user copies so they can't drift. Leave commented until confirmed.
-- DELETE FROM public.user_settings
-- WHERE sport IN ('fg','punt','kickoff','snap','punt_strike_zone','holder_strike_zone');
