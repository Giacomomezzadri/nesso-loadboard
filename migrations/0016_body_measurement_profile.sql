-- Full ISAK anthropometric profile (girths, breadths, single skinfolds, height,
-- weight, age, equations used) kept as JSON next to a measurement imported from
-- file, so derived values can be recomputed later. NULL for hand-entered rows.
-- Also added on demand by functions/_lib/bodyMeasurements.ts.
ALTER TABLE body_measurements ADD COLUMN data TEXT;
