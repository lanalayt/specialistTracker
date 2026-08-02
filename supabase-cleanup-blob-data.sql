-- ============================================================================
-- Phase 7: Clean up redundant legacy blob rows  (REVIEW BEFORE RUNNING)
-- ----------------------------------------------------------------------------
-- Run ONLY AFTER:
--   1. supabase-rls-fix.sql          (creates tables + migrates most keys)
--   2. supabase-backfill-blob-data.sql (recovers trapped sessions/athletes)
--   3. You have confirmed in the live app that recovered history shows up.
--
-- Every key deleted here has a verified home in a dedicated table (or is a
-- stale/redundant duplicate that a newer table row already supersedes).
--
-- ⚠️ DELIBERATELY PRESERVED (do NOT add these to the delete lists):
--   • scout_fg_preset            -> scoutStore still reads/writes presets here.
--   • *_session_draft, *_session_draft_practice, *_session_draft_game,
--     ko_session_draft_*, longsnap_manual_draft_*
--                                -> draftStore.loadDraft() still falls back to
--                                   team_data for these, and they hold in-progress
--                                   chart work. Leave them.
--   • user_data.settings_strikeZoneBounds*  -> per-user prefs; verify unused
--                                              before ever deleting (kept here).
--
-- Recommended: run each DELETE inside a transaction and eyeball the row count.
--   BEGIN;  <delete>  -- check "DELETE N"
--   COMMIT; (or ROLLBACK;)
-- ============================================================================

-- ── 7A: team_data — keys fully migrated to dedicated tables or backfilled ────
DELETE FROM team_data
WHERE data_key IN (
  -- core session/athlete state -> sessions + athletes (Phase 6 backfill)
  'fg_data', 'punt_data', 'kickoff_data', 'longsnap_data',
  -- migrated by supabase-rls-fix.sql
  'invite_codes',
  'scout_profiles',
  'scout_numbers',
  'scout_rankings_shared',
  'scout_session_rankings',
  'assigned_charts',
  'scout_archives',
  'st_custom_themes',
  -- redundant: the teams/members rows are already populated and newer
  'theme_colors',
  'settings_team',
  'team_logo',
  'team_members',
  -- empty / superseded per-sport legacy variants
  'scout_rankings_fg', 'scout_rankings_kickoff', 'scout_rankings_punt', 'scout_rankings_snap',
  'scout_numbers_fg', 'scout_numbers_kickoff', 'scout_numbers_punt', 'scout_numbers_snap',
  -- expired trash (7-day window long past)
  'deleted_sessions'
)
-- scout_athletes_<sport> handled separately (LIKE pattern), see below
;

-- per-sport scout athlete lists -> scout_athletes table
DELETE FROM team_data WHERE data_key LIKE 'scout_athletes_%';

-- ── 7B: user_data — legacy per-user rows superseded by team/user tables ──────
DELETE FROM user_data
WHERE data_key IN (
  -- settings -> user_settings
  'settings_fgSettings', 'settings_puntSettings',
  'settings_kickoffSettings', 'settings_snapSettings',
  -- legacy pre-team per-user copies -> now team-scoped in sessions/athletes
  'fg_data', 'kickoff_data', 'punt_data',
  -- legacy per-user team/theme settings -> teams + custom_themes tables
  'settings_st_team_v1', 'team_data', 'settings_st_custom_themes'
);

-- ============================================================================
-- After cleanup, what SHOULD remain in the blobs (expected survivors):
--   team_data:  scout_fg_preset, *_session_draft*  (intentional)
--   user_data:  *_session_draft, settings_strikeZoneBounds*  (review later)
-- Verify with:
--   SELECT data_key, count(*) FROM team_data GROUP BY 1 ORDER BY 1;
--   SELECT data_key, count(*) FROM user_data GROUP BY 1 ORDER BY 1;
-- ============================================================================
