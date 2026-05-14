# Athlete Mode Plan

## Rename
- "Coach Mode" → "Team Mode" everywhere (toggle, sidebar, labels)
- Three modes: Team | Scout | Athlete

## Athlete Mode Overview
- Separate data from Team Mode (completely isolated, like Scout Mode)
- Athletes from Team Mode roster transfer over (shared athlete list)
- Statistics and history do NOT transfer — starts fresh
- Same inputs as Team Mode (FG, Punt, Kickoff, Snap)
- Charting games included (Line Golf, Punt Battle, 30 Point, Balls & Strikes)
- All athletes can see all data/stats for everyone on the team

## Access
- Athletes log in → land on Team Mode by default
- Coach has full access to Athlete Mode
- Athletes can see all sessions and all athletes' data
- Toggle: Team | Scout | Athlete in header (Scout still coach-only)

## Features needed
- Same sport pages as Team Mode (FG, Punt, Kickoff, Snap)
- Same session flow (practice/game)
- Same statistics pages
- Same history pages with athlete filter toggle
- Same charting games
- Own archives (separate from Team and Scout)
- Data stored with ATHLETE_* sport keys (like SCOUT_* pattern)

## Data Storage
- Sessions: sport = "ATHLETE_KICKING", "ATHLETE_PUNTING", "ATHLETE_KICKOFF", "ATHLETE_LONGSNAP"
- Athletes: shared with Team Mode (same athletes table)
- Archives: separate (athlete_archives in team_data)
