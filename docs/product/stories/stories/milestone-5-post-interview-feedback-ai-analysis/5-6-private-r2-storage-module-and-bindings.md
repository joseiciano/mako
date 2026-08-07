# Story 5.6: Private R2 Storage Module and Bindings

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Add reusable private R2 storage behavior and wire recording/screenshot buckets to the Workers that own artifact and feedback processing.
**Status**: Todo
**Prerequisites**:
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-4-feedback-and-artifact-schema-migration.md`

## What Needs to Be Done

### 1. Add an interview asset storage module
- [ ] Create focused modules under `packages/shared-backend/src/interview-assets/` for deterministic key construction and R2 object operations, exported through `packages/shared-backend/src/index.ts`.
- [ ] Generate server-owned keys beneath `interviews/{interview_id}/recording/` and `interviews/{interview_id}/screenshots/` using application-generated UUIDs.
- [ ] Store validated content type, interview ID, artifact kind, and capture timestamp as object metadata without user PII.
- [ ] Expose dependency-injected storage ports so services can be tested without real R2 bindings.

### 2. Apply artifact validation and privacy safeguards
- [ ] Allow only the documented recording output types and PNG screenshots; reject content-type mismatches and oversized screenshot bodies before persistence.
- [ ] Define bounded screenshot count and per-object size limits in server configuration.
- [ ] Prevent callers from supplying raw object keys, bucket names, or public destination URLs.
- [ ] Treat missing objects and metadata mismatches as explicit domain errors rather than silent empty results.

### 3. Wire R2 bindings in all environments
- [ ] Add `RECORDINGS_BUCKET` and `SCREENSHOTS_BUCKET` to `apps/backend-rest/wrangler.jsonc`, `apps/notification-orchestrator/wrangler.jsonc`, and their Worker binding types.
- [ ] Reconcile local/development binding names with the existing Terraform bindings in `infrastructure/main.tf`. Note: the notification-orchestrator Terraform resource currently has `ignore_changes` on bindings; Story 5.10 narrows this behavior so Terraform-managed production binding updates take effect. Add the R2 bindings to the Terraform config here, but coordinate with 5.10's `ignore_changes` narrowing for production deployment.
- [ ] Regenerate or update Cloudflare Worker environment types after Wrangler changes.
- [ ] Keep both buckets private and document that public development URLs must remain disabled.
- [ ] Add mandatory 30-day lifecycle rules for both raw-artifact buckets in Terraform as a privacy backstop, with production deployment/readiness tests.

### 4. Add storage tests
- [ ] Add unit tests for deterministic prefixes, generated filenames, metadata, allowlisted content types, size/count limits, and caller-supplied key rejection.
- [ ] Add Worker integration tests using local R2 bindings for put/head/get/delete and missing-object behavior.
- [ ] Verify logs never include raw object bodies, transcript text, signed URLs, or user identifiers embedded in keys.

## Implementation Notes
- Terraform already provisions separate recording and screenshot buckets; this story wires application access and lifecycle policy rather than creating duplicate buckets.
- Use streams for recording reads/writes so a 60-minute recording is not buffered fully in Worker memory.

## End Goal
Backend and workflow code can read and write private interview artifacts through one validated, testable module with consistent bindings and no public bucket exposure.
