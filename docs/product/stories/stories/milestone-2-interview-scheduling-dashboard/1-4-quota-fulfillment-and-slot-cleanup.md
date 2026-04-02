# Story 1.4: Quota Fulfillment and Slot Cleanup

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Enforce per-request match quotas and clean up remaining availability atomically when a request is fulfilled.
**Status**: Todo

## What Needs to Be Done

### 1. Fulfillment state transition
- [ ] If `current_matches` reaches `max_matches` for a request, mark request `status = 'fulfilled'`.

### 2. Remaining slot cleanup
- [ ] When a request is fulfilled, set all its remaining `available` slots to `status = 'cancelled'` in the same transaction.

### 3. Match-prevention guarantees
- [ ] Ensure no additional matches can be produced from fulfilled/cancelled requests in the same cron run.
- [ ] Ensure no additional matches can be produced from fulfilled/cancelled requests in later cron runs.

## End Goal
Quota exhaustion is enforced strictly and atomically, and fulfilled requests can no longer produce redundant or duplicate future matches.
