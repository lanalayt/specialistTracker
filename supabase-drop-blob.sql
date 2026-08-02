-- ============================================================================
-- Phase 1D: DROP the JSON blob tables. IRREVERSIBLE. Run LAST.
--
-- Prerequisites (all must be true):
--   1. supabase-scout-presets.sql has been run (presets + drafts migrated).
--   2. The blob-free code (Phase 1 code changes) is DEPLOYED to production.
--   3. Smoke-tested: scout presets load, invites resolve, drafts recover.
--
-- Until all three hold, do NOT run this — the live app would hit missing tables.
-- ============================================================================

DROP TABLE IF EXISTS team_data;
DROP TABLE IF EXISTS user_data;

-- Verify (both should return NULL):
--   SELECT to_regclass('public.team_data'), to_regclass('public.user_data');
