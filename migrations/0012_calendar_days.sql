-- Planning calendar: what the staff expects to do on a given day (training of a
-- given type, a match, or a day off). One row per workspace per day. Purely a
-- plan — imported GPS sessions remain the source of truth for what happened.

CREATE TABLE IF NOT EXISTS calendar_days (
  workspace_id TEXT NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('training', 'match', 'day_off')),
  training_type TEXT,
  opponent_name TEXT,
  match_location TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, date)
);
