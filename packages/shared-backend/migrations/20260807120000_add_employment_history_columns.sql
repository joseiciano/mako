-- Add role and ended_at columns to user_companies for canonical employment history.
-- role: nullable for legacy rows, required for new canonical creates
-- ended_at: nullable employment end; null means current role

ALTER TABLE user_companies
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

ALTER TABLE user_companies
  ADD CONSTRAINT user_companies_role_check CHECK (role IS NULL OR btrim(role) <> '');

ALTER TABLE user_companies
  ADD CONSTRAINT user_companies_ended_at_check
    CHECK (ended_at IS NULL OR (ended_at AT TIME ZONE 'UTC')::date >= (joined AT TIME ZONE 'UTC')::date);
