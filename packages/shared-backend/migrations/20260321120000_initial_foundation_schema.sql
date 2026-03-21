-- Initial foundation schema for authentication and availability matching.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  free_standard_interviews INTEGER NOT NULL DEFAULT 1 CHECK (free_standard_interviews >= 0),
  free_ai_interviews INTEGER NOT NULL DEFAULT 1 CHECK (free_ai_interviews >= 0),
  companies BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_companies (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL CHECK (company = lower(company)),
  joined TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS availability_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_matches INTEGER NOT NULL CHECK (max_matches > 0),
  current_matches INTEGER NOT NULL DEFAULT 0 CHECK (current_matches >= 0),
  interview_type TEXT NOT NULL CHECK (
    interview_type IN ('system_design', 'coding', 'behavioral')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'fulfilled', 'cancelled')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES availability_requests(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (
    status IN ('available', 'matched', 'cancelled')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT availability_slots_time_window_check CHECK (start_time < end_time),
  CONSTRAINT availability_slots_unique_window UNIQUE (request_id, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_user_companies_user_id
  ON user_companies (user_id);

CREATE INDEX IF NOT EXISTS idx_availability_requests_user_id_status
  ON availability_requests (user_id, status);

CREATE INDEX IF NOT EXISTS idx_availability_slots_request_id_status
  ON availability_slots (request_id, status);
