-- ============================================================================
-- Verify supabase-rls-fix.sql was actually applied.
-- Paste this whole file into the Supabase SQL Editor and run.
-- Each query returns a checklist with an ok/MISSING (or count) column.
-- ============================================================================

-- 1. is_team_member() function exists --------------------------------------
SELECT 'is_team_member() function' AS check,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'is_team_member'
       ) THEN 'ok' ELSE 'MISSING' END AS status;

-- 2. All expected tables exist ---------------------------------------------
WITH expected(t) AS (VALUES
  ('invite_codes'),('user_settings'),('session_drafts'),
  ('scout_profiles'),('scout_athletes'),('scout_numbers'),
  ('scout_ranking_groups'),('scout_session_rankings'),
  ('assigned_charts'),('scout_archives'),('custom_themes'))
SELECT e.t AS check,
       CASE WHEN c.relname IS NULL THEN 'MISSING TABLE'
            WHEN c.relrowsecurity THEN 'ok (RLS on)'
            ELSE 'TABLE EXISTS but RLS OFF' END AS status
FROM expected e
LEFT JOIN pg_class c ON c.relname = e.t
     AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
ORDER BY e.t;

-- 3. RLS is enabled on the pre-existing tables too --------------------------
WITH expected(t) AS (VALUES
  ('teams'),('sessions'),('athletes'),('members'),('archives'),('team_data'))
SELECT e.t AS check,
       CASE WHEN c.relrowsecurity THEN 'ok (RLS on)' ELSE 'RLS OFF ⚠️' END AS status
FROM expected e
LEFT JOIN pg_class c ON c.relname = e.t
     AND c.relnamespace = 'public'::regnamespace
ORDER BY e.t;

-- 4. Policy count per table (0 = policies not applied) ----------------------
SELECT tablename AS check, count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('teams','sessions','athletes','members','archives','team_data',
       'invite_codes','user_settings','session_drafts','scout_profiles','scout_athletes',
       'scout_numbers','scout_ranking_groups','scout_session_rankings','assigned_charts',
       'scout_archives','custom_themes')
GROUP BY tablename
ORDER BY tablename;
-- Expect ~3-4 policies on each. Any table missing from this list = no policies.

-- 5. session_drafts added to the realtime publication -----------------------
SELECT 'session_drafts realtime' AS check,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND tablename = 'session_drafts'
       ) THEN 'ok' ELSE 'MISSING' END AS status;

-- 6. Spot-check that is_team_member actually gates a policy ------------------
--    (should show USING clauses referencing is_team_member on sessions)
SELECT tablename AS check, policyname, qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'sessions'
ORDER BY policyname;
