-- ============================================================================
-- Phase 6: Backfill core session + athlete data from legacy *_data blobs
-- ----------------------------------------------------------------------------
-- Context: the original blob→table migration ran CLIENT-SIDE and only fired
-- when a team's `sessions` table was still EMPTY. Once any row existed it
-- bailed out, leaving the rest of the blob's `history[]` orphaned. That
-- client migration has since been removed, so this SQL recovers the trapped
-- data directly.
--
-- Scope (verified against production 2026-08-02):
--   team_data.fg_data      -> sessions (KICKING) + athletes (KICKING)
--   team_data.punt_data    -> sessions (PUNTING) + athletes (PUNTING)
--   team_data.kickoff_data -> sessions (KICKOFF) + athletes (KICKOFF)
--   team_data.longsnap_data-> sessions (LONGSNAP)+ athletes (LONGSNAP)  [none present today]
--
-- Safe to re-run: every insert is guarded by NOT EXISTS, so existing rows are
-- never touched or duplicated. It only ADDS sessions/athletes that are missing.
--
-- Run in the Supabase SQL Editor.
-- ============================================================================

-- ── 6A: Sessions from each blob's history[] ─────────────────────────────────
-- history[] entries carry: id, date, label, sport, teamId, entries[]
-- (weather/mode/opponent/gameTime are usually absent -> sensible defaults).

INSERT INTO sessions (id, team_id, sport, label, date, weather, mode, opponent, game_time, entries, updated_at)
SELECT
  elem->>'id',
  td.team_id,
  m.sport,
  COALESCE(elem->>'label', ''),
  COALESCE((elem->>'date')::timestamptz, now()),
  elem->>'weather',
  COALESCE(elem->>'mode', 'practice'),
  elem->>'opponent',
  COALESCE(elem->>'gameTime', elem->>'game_time'),
  COALESCE(elem->'entries', '[]'::jsonb),
  now()
FROM team_data td
JOIN (VALUES
  ('fg_data',       'KICKING'),
  ('punt_data',     'PUNTING'),
  ('kickoff_data',  'KICKOFF'),
  ('longsnap_data', 'LONGSNAP')
) AS m(data_key, sport) ON td.data_key = m.data_key
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(td.data->'history', '[]'::jsonb)) AS elem
WHERE jsonb_typeof(td.data->'history') = 'array'
  AND COALESCE(elem->>'id', '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.team_id = td.team_id
      AND s.id = elem->>'id'
  );

-- ── 6B: Athletes from each blob's athletes[] (string array of names) ─────────

INSERT INTO athletes (id, team_id, sport, name)
SELECT
  gen_random_uuid()::text,
  td.team_id,
  m.sport,
  trim(name_elem)
FROM team_data td
JOIN (VALUES
  ('fg_data',       'KICKING'),
  ('punt_data',     'PUNTING'),
  ('kickoff_data',  'KICKOFF'),
  ('longsnap_data', 'LONGSNAP')
) AS m(data_key, sport) ON td.data_key = m.data_key
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(td.data->'athletes', '[]'::jsonb)) AS name_elem
WHERE jsonb_typeof(td.data->'athletes') = 'array'
  AND trim(name_elem) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM athletes a
    WHERE a.team_id = td.team_id
      AND a.sport   = m.sport
      AND a.name    = trim(name_elem)
  );

-- ============================================================================
-- Verification — run these SELECTs after the inserts.
-- Expected against 2026-08-02 snapshot: +35 sessions, +8 athletes.
-- ============================================================================

-- How many sessions now exist per team/sport that came from a blad blob:
--   SELECT team_id, sport, count(*) FROM sessions
--   WHERE deleted_at IS NULL GROUP BY 1,2 ORDER BY 1,2;

-- Confirm nothing is still trapped (should return 0 rows):
--   SELECT td.team_id, td.data_key,
--          jsonb_array_length(td.data->'history') AS blob_sessions,
--          count(s.id) FILTER (WHERE s.id IS NOT NULL) AS in_table
--   FROM team_data td
--   JOIN (VALUES ('fg_data','KICKING'),('punt_data','PUNTING'),
--                ('kickoff_data','KICKOFF'),('longsnap_data','LONGSNAP'))
--        AS m(data_key,sport) ON td.data_key = m.data_key
--   CROSS JOIN LATERAL jsonb_array_elements(td.data->'history') AS elem
--   LEFT JOIN sessions s ON s.team_id = td.team_id AND s.id = elem->>'id'
--   GROUP BY 1,2, td.data
--   HAVING count(s.id) FILTER (WHERE s.id IS NOT NULL) < jsonb_array_length(td.data->'history');
