-- A player's situation in a session when the GPS export has no data for them
-- (absent, gym, national team, not called, …). Present/Rehab are derived from the GPS rows.
CREATE TABLE IF NOT EXISTS player_statuses (
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, session_id, player_id)
);
