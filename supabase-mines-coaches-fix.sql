-- ─────────────────────────────────────────────────────────────────────────────
-- Bind yon (yboone, COACH) and preston_kyle (ATHLETE) to "Colorado School of
-- Mines" instead of their legacy solo teams.
--
-- Background: a user's account resolves to the team they JOINED (metadata.teamId)
-- if set, else their own account id. yboone (daf47a48…) and preston (2ef484f3…)
-- each also own a legacy solo team whose id equals their user id, so without an
-- explicit teamId they load that legacy roster instead of Mines.
--
-- Requires the app code change that resolves ALL users to metadata.teamId when
-- present (deployed with this branch). After running this, both users must sign
-- out and back in (or refresh) so the new metadata is read.
-- ─────────────────────────────────────────────────────────────────────────────

-- Constants:
--   team  9187f370-0164-410c-b91b-837083ffcd59  = Colorado School of Mines
--   yon/yboone   daf47a48-d3e6-4baf-982d-550ba22a7df0  (COACH)
--   preston      2ef484f3-1abb-41cc-b3e5-88e3f2bbda2f  (ATHLETE)

-- 1a) yon → Mines COACH (auth metadata).
UPDATE auth.users
SET raw_user_meta_data =
  COALESCE(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('teamId', '9187f370-0164-410c-b91b-837083ffcd59', 'role', 'coach')
WHERE id = 'daf47a48-d3e6-4baf-982d-550ba22a7df0';

-- 1b) preston → Mines ATHLETE (auth metadata).
UPDATE auth.users
SET raw_user_meta_data =
  COALESCE(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('teamId', '9187f370-0164-410c-b91b-837083ffcd59', 'role', 'athlete')
WHERE id = '2ef484f3-1abb-41cc-b3e5-88e3f2bbda2f';

-- 2a) yon's Mines membership = coach / edit.
UPDATE members SET role = 'coach', access = 'edit'
WHERE team_id = '9187f370-0164-410c-b91b-837083ffcd59'
  AND id = 'daf47a48-d3e6-4baf-982d-550ba22a7df0';

-- 2b) preston's Mines membership = athlete / view.
UPDATE members SET role = 'athlete', access = 'view'
WHERE team_id = '9187f370-0164-410c-b91b-837083ffcd59'
  AND id = '2ef484f3-1abb-41cc-b3e5-88e3f2bbda2f';

-- 3) Verify.
SELECT u.id, u.email,
       u.raw_user_meta_data->>'role'   AS meta_role,
       u.raw_user_meta_data->>'teamId' AS meta_team_id,
       m.role AS member_role, m.access AS member_access
FROM auth.users u
LEFT JOIN members m
  ON m.id = u.id::text AND m.team_id = '9187f370-0164-410c-b91b-837083ffcd59'
WHERE u.id IN (
  'daf47a48-d3e6-4baf-982d-550ba22a7df0',
  '2ef484f3-1abb-41cc-b3e5-88e3f2bbda2f'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL: inspect the now-orphaned legacy solo teams before deciding to remove
-- them. Do NOT delete until you've confirmed the data isn't needed.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'athletes' AS kind, team_id, COUNT(*) FROM athletes
WHERE team_id IN ('daf47a48-d3e6-4baf-982d-550ba22a7df0','2ef484f3-1abb-41cc-b3e5-88e3f2bbda2f')
GROUP BY team_id
UNION ALL
SELECT 'sessions', team_id, COUNT(*) FROM sessions
WHERE team_id IN ('daf47a48-d3e6-4baf-982d-550ba22a7df0','2ef484f3-1abb-41cc-b3e5-88e3f2bbda2f')
GROUP BY team_id;
