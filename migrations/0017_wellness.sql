-- Morning wellness questionnaire (Hooper-style), filled in by the athletes themselves
-- from a public team link. One answer per player per day: re-submitting the same day
-- overwrites. Each item is 1–5 where 5 is always the GOOD end (slept well, relaxed,
-- fresh, no soreness, good mood), so the total (5–25) reads "higher = better".
-- sleep_hours (0–16, half hours) is kept apart from the score.

CREATE TABLE IF NOT EXISTS wellness_entries (
  workspace_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  date TEXT NOT NULL,
  sleep INTEGER NOT NULL,
  stress INTEGER NOT NULL,
  fatigue INTEGER NOT NULL,
  soreness INTEGER NOT NULL,
  mood INTEGER NOT NULL,
  sleep_hours REAL,
  note TEXT,
  submitted_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, player_id, date)
);
CREATE INDEX IF NOT EXISTS idx_wellness_entries_date ON wellness_entries(workspace_id, date);

-- The team link (/q/<token>): one per workspace. Regenerating replaces the token, so the
-- old link stops working at once.
CREATE TABLE IF NOT EXISTS wellness_links (
  workspace_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
