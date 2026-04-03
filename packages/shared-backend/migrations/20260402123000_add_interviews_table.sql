-- Add interview persistence required for matcher-created and route-created sessions.

CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY,
  scheduler_id UUID NOT NULL REFERENCES users(id),
  scheduler_alias TEXT NOT NULL,
  interviewer_id UUID REFERENCES users(id),
  interviewer_alias TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN ('system_design', 'coding', 'behavioral')
  ),
  mode TEXT NOT NULL CHECK (
    mode IN ('peer_to_peer', 'ai_led')
  ),
  tier TEXT NOT NULL CHECK (
    tier IN ('standard', 'premium')
  ),
  status TEXT NOT NULL CHECK (
    status IN ('scheduled', 'ongoing', 'completed', 'cancelled')
  ),
  scheduled_at TIMESTAMPTZ NOT NULL,
  realtime_session_id TEXT,
  excalidraw_room_id TEXT,
  excalidraw_key TEXT,
  recording_url TEXT,
  screenshot_urls JSONB,
  feedback JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
