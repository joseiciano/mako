-- Premium first-to-claim scheduling persistence: interview slots, claim idempotency store, and booking-credit refund audit ledger.

-- ============================================================================
-- 1. premium_interviewer_slots
-- ============================================================================

CREATE TABLE IF NOT EXISTS premium_interviewer_slots (
  id UUID PRIMARY KEY,
  interviewer_id UUID NOT NULL REFERENCES "user"(id),
  interview_type TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE premium_interviewer_slots
  ADD CONSTRAINT premium_interviewer_slots_status_check
  CHECK (status IN ('available', 'claimed', 'cancelled'));

ALTER TABLE premium_interviewer_slots
  ADD CONSTRAINT premium_interviewer_slots_type_check
  CHECK (interview_type IN ('system_design', 'coding', 'behavioral'));

ALTER TABLE premium_interviewer_slots
  ADD CONSTRAINT premium_interviewer_slots_time_window_check
  CHECK (start_time < end_time);

ALTER TABLE premium_interviewer_slots
  ADD CONSTRAINT premium_interviewer_slots_exact_60_minute_check
  CHECK (end_time = start_time + interval '60 minutes');

-- Overlap detection for non-cancelled slots of one interviewer (bounded range scan, not GiST)
CREATE INDEX IF NOT EXISTS idx_premium_interviewer_slots_interviewer_active
  ON premium_interviewer_slots (interviewer_id, start_time, end_time)
  WHERE status <> 'cancelled';

-- Public marketplace listing of available slots ordered by start_time ASC, id ASC
CREATE INDEX IF NOT EXISTS idx_premium_interviewer_slots_available_start
  ON premium_interviewer_slots (status, start_time, id);

-- Owner-list ordering by start_time ASC, id ASC
CREATE INDEX IF NOT EXISTS idx_premium_interviewer_slots_interviewer_start
  ON premium_interviewer_slots (interviewer_id, start_time, id);

-- Owner-list status-aware manage scan
CREATE INDEX IF NOT EXISTS idx_premium_interviewer_slots_interviewer_status_start
  ON premium_interviewer_slots (interviewer_id, status, start_time, id);

-- ============================================================================
-- 2. premium_slot_claims (durable claim-idempotency store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS premium_slot_claims (
  idempotency_key UUID PRIMARY KEY,
  slot_id UUID NOT NULL UNIQUE REFERENCES premium_interviewer_slots(id),
  scheduler_id UUID NOT NULL REFERENCES "user"(id),
  interview_id UUID NOT NULL UNIQUE REFERENCES interviews(id),
  created_at TIMESTAMPTZ NOT NULL
);

-- ============================================================================
-- 3. premium_booking_credit_refunds (internal audit/idempotency ledger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS premium_booking_credit_refunds (
  id UUID PRIMARY KEY,
  interview_id UUID NOT NULL UNIQUE REFERENCES interviews(id),
  scheduler_id UUID NOT NULL REFERENCES "user"(id),
  reason TEXT NOT NULL,
  initiated_by_user_id UUID NOT NULL REFERENCES "user"(id),
  credits_refunded INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE premium_booking_credit_refunds
  ADD CONSTRAINT premium_booking_credit_refunds_reason_check
  CHECK (reason IN ('interviewer_cancelled', 'interviewer_account_deleted'));

ALTER TABLE premium_booking_credit_refunds
  ADD CONSTRAINT premium_booking_credit_refunds_credits_check
  CHECK (credits_refunded = 1);

-- Scheduler refund-history listing
CREATE INDEX IF NOT EXISTS idx_premium_booking_credit_refunds_scheduler
  ON premium_booking_credit_refunds (scheduler_id, created_at);
