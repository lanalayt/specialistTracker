-- ============================================================================
-- Archive scope: an archive covers practice sessions, game sessions, or both,
-- so practice stats can be rolled over without touching the game log.
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Existing archives were taken before scopes existed and covered everything,
-- so they default to 'all'.
-- ============================================================================

ALTER TABLE archives
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all';

-- Only the three scopes the app writes.
ALTER TABLE archives DROP CONSTRAINT IF EXISTS archives_scope_check;
ALTER TABLE archives
  ADD CONSTRAINT archives_scope_check CHECK (scope IN ('all', 'practice', 'game'));

-- Archives written by a client that stored the scope inside the phase JSON
-- (before this column existed) get it lifted onto the column.
UPDATE archives
SET scope = COALESCE(fg ->> 'scope', punt ->> 'scope', kickoff ->> 'scope')
WHERE scope = 'all'
  AND COALESCE(fg ->> 'scope', punt ->> 'scope', kickoff ->> 'scope') IN ('practice', 'game');

CREATE INDEX IF NOT EXISTS archives_team_scope_idx ON archives (team_id, scope);
