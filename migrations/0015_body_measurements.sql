-- Body composition measurements entered by hand: one row per player per measurement date.
CREATE TABLE IF NOT EXISTS body_measurements (
  workspace_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  date TEXT NOT NULL,
  fat_mass_pct REAL,
  skinfold_mm REAL,
  muscle_mass_kg REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, player_id, date)
);
