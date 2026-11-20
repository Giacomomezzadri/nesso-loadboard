-- A player's own training type in a session, when it differs from the session's
-- (e.g. players merged in from another squad's session of the same day). NULL = the session's.
ALTER TABLE segments ADD COLUMN training_type TEXT;
