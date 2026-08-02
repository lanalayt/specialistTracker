// ─── Current team id holder ─────────────────────────────────────────────────
// The team id is resolved once at auth time (coaches: their user id IS the team
// id; athletes: stored in user metadata) and read synchronously across the app.

let _teamId: string | null = null;

export function setTeamId(teamId: string | null) {
  _teamId = teamId;
}

export function getTeamId(): string | null {
  return _teamId;
}
