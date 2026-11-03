-- Jump tests (ForceDecks CMJ / DJ exports, and any future test type). One row per
-- player per test (player + test type + date + time), so re-importing the same
-- export overwrites instead of duplicating. Every numeric column of the export is
-- kept in `data` (JSON: metrics + parsed asymmetries), so a metric not shown today
-- can be surfaced later without re-importing.

CREATE TABLE IF NOT EXISTS jump_tests (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  test_type TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  body_weight_kg REAL,
  reps INTEGER,
  source_name TEXT NOT NULL,
  data TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS idx_jump_tests_player ON jump_tests(workspace_id, player_id);

-- How a name spelled by another system (e.g. "AZZALI LEONARDO" in ForceDecks) maps
-- to a roster player, once someone has paired it by hand. Keyed by the normalized
-- name (see nameKey in src/lib/csv/matchPlayerNames.ts).
CREATE TABLE IF NOT EXISTS player_aliases (
  workspace_id TEXT NOT NULL,
  alias_key TEXT NOT NULL,
  player_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, alias_key)
);
