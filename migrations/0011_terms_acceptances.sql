-- Append-only record of each Terms/Privacy acceptance given at login, with the
-- text version it was given against (see functions/_lib/terms.ts). Also
-- created on demand by the login handler, in case this file is never applied.

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  terms_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user ON terms_acceptances(user_id);
