-- ============================================================================
-- Stopwatch: persist stopwatch runs (total time + splits) per team.
-- Run in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stopwatch_runs (
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  user_id    UUID,
  label      TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ,
  total_ms   BIGINT NOT NULL DEFAULT 0,
  -- [{ n, splitMs, lapMs }] — one entry per lap press, in press order.
  laps       JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, id)
);

ALTER TABLE stopwatch_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_select" ON stopwatch_runs;
DROP POLICY IF EXISTS "team_insert" ON stopwatch_runs;
DROP POLICY IF EXISTS "team_update" ON stopwatch_runs;
DROP POLICY IF EXISTS "team_delete" ON stopwatch_runs;
CREATE POLICY "team_select" ON stopwatch_runs FOR SELECT TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_insert" ON stopwatch_runs FOR INSERT TO authenticated WITH CHECK (is_team_member(team_id));
CREATE POLICY "team_update" ON stopwatch_runs FOR UPDATE TO authenticated USING (is_team_member(team_id));
CREATE POLICY "team_delete" ON stopwatch_runs FOR DELETE TO authenticated USING (is_team_member(team_id));

-- Recent-runs list is ordered by start time within a team.
CREATE INDEX IF NOT EXISTS idx_stopwatch_runs_recent ON stopwatch_runs(team_id, started_at DESC);

-- Verify:
--   SELECT team_id, id, total_ms, jsonb_array_length(laps) AS laps FROM stopwatch_runs ORDER BY started_at DESC LIMIT 10;
