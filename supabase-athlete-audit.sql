-- ─────────────────────────────────────────────────────────────────────────────
-- Athlete data audit + cleanup
--
-- Symptoms addressed:
--   • Deleting an athlete doesn't stick (it reappears on reload).
--   • Athletes show up in accounts that don't own them (cross-account leakage).
--
-- Run the SELECTs first (read-only) to see what's wrong, THEN run the targeted
-- DELETEs. Every destructive statement is at the bottom and commented out —
-- uncomment only after reviewing the diagnostics.
--
-- Context: the app scopes athletes by `team_id`; a coach's team_id IS their
-- auth user id. RLS (is_team_member(team_id)) lets a user read/delete only rows
-- for teams they own or are a `members` row of. Rows with a null/empty/invalid
-- team_id are therefore un-deletable from the app (RLS blocks them) — they must
-- be cleaned up here.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Orphaned athletes: null / empty team_id, or a team_id with no matching team.
--    These are the rows that can be seen (via legacy paths) but never deleted.
SELECT a.id, a.team_id, a.sport, a.name, a.created_at,
       CASE
         WHEN a.team_id IS NULL OR a.team_id = '' THEN 'null/empty team_id'
         WHEN t.id IS NULL THEN 'team_id has no matching team'
       END AS problem
FROM athletes a
LEFT JOIN teams t ON t.id = a.team_id
WHERE a.team_id IS NULL OR a.team_id = '' OR t.id IS NULL
ORDER BY a.team_id NULLS FIRST, a.sport, a.name;

-- 2) Duplicate athletes within a team+sport (same name repeated). Deleting one
--    id leaves the other, so the name "comes back".
SELECT team_id, sport, name, COUNT(*) AS copies, ARRAY_AGG(id) AS ids
FROM athletes
GROUP BY team_id, sport, name
HAVING COUNT(*) > 1
ORDER BY copies DESC;

-- 3) Athlete counts per team + sport — eyeball for teams with unexpected rosters.
SELECT team_id, sport, COUNT(*) AS athletes
FROM athletes
GROUP BY team_id, sport
ORDER BY team_id, sport;

-- 4) Cross-membership: users who are `members` of a team they do NOT own
--    (id <> team_id). Legitimate for athletes/co-coaches who joined via invite,
--    but this is where "I can see another account's athletes" comes from — check
--    for anyone who shouldn't be on that team.
SELECT m.team_id, m.id AS member_user_id, m.email, m.role, m.access,
       t.name AS team_name
FROM members m
LEFT JOIN teams t ON t.id = m.team_id
WHERE m.id <> m.team_id
ORDER BY m.team_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP (review the SELECTs above first, then uncomment what applies)
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a) Delete orphaned athletes (null/empty team_id, or team_id with no team).
-- DELETE FROM athletes a
-- USING (SELECT a2.id FROM athletes a2
--        LEFT JOIN teams t ON t.id = a2.team_id
--        WHERE a2.team_id IS NULL OR a2.team_id = '' OR t.id IS NULL) orphan
-- WHERE a.id = orphan.id;

-- 5b) De-duplicate: keep the earliest row per (team_id, sport, name), delete the rest.
-- DELETE FROM athletes a
-- USING (
--   SELECT id FROM (
--     SELECT id, ROW_NUMBER() OVER (
--       PARTITION BY team_id, sport, name ORDER BY created_at ASC, id ASC
--     ) AS rn
--     FROM athletes
--   ) ranked WHERE rn > 1
-- ) dup
-- WHERE a.id = dup.id;

-- 5c) Remove a wrongful membership (fill in the values from query 4):
-- DELETE FROM members WHERE team_id = '<TEAM_ID>' AND id = '<MEMBER_USER_ID>';
