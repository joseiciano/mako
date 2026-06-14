## AI Code Review

**Decision**: approved_with_comments
**Reason**: Three minor suggestions — a dead-code utility export, a consistency gap in the duplicate-submit guard between AI and P2P branches, and an under-assertive test. No blocking or warning-level issues.

---

### Code Quality
**Status**: issues_found
**Recommendation**: 💬 Optional Nits
**Summary**: Three optional suggestions: one dead-code export, one ref-guard inconsistency between async and sync confirm paths, and one under-assertive test.

**1. `hasFieldErrors` exported but never called in production code** — `schedule-flow.ts:304-306` [SUGGESTION]

The `hasFieldErrors` function is defined, exported, and tested — but only `schedule-flow.test.ts` imports it. No production file (including `schedule-smart.tsx`) calls it. The story explicitly lists it as an exposed helper, but it currently serves no runtime purpose. If it is intended for future use (e.g., to additionally gate the confirm button when field errors exist alongside `isSubmitting`), a brief comment would make that intent clear. Otherwise, consider removing the export until it is actually consumed to keep the public API surface minimal.

**2. P2P confirm path never sets `isDispatchingRef`, making the ref-based duplicate-submit guard effective only for AI-led** — `schedule-smart.tsx:108-131` [SUGGESTION]

The AI-led path sets `isDispatchingRef.current = true` before `createInterview.mutate` and resets it in `onSettled`. The P2P path dispatches `SET_VALIDATION_ERROR` synchronously but never touches `isDispatchingRef`. As a result, the early-return guard at line 76 (`if (isDispatchingRef.current) return`) is a no-op for the P2P branch — double-clicking P2P confirm will re-dispatch the same temporary-unavailable message redundantly. This is harmless today because the P2P path performs no network I/O, but the asymmetry is brittle: if P2P later gains an async mutation call (per Story 5.4), the duplicate-submit prevention will be silently missing there. Either set/reset the ref in the P2P branch for consistency, or add a comment explaining the intentional omission so future readers understand the asymmetry.

**3. Mode-disabled test asserts only the first filtered button** — `schedule-dumb.test.tsx:265-267` [SUGGESTION]

```js
const modeButtons = screen.getAllByRole('button').filter(
  (b) => b.textContent?.includes('AI-Led') || b.textContent?.includes('Peer-to-Peer')
)
expect(modeButtons[0]).toHaveProperty('disabled', true)
```

The test filters for mode buttons but only checks `modeButtons[0]`. If the filter matches two buttons and only the first has `disabled: true`, the test still passes. Asserting `modeButtons.length` equals 2 and then checking both elements (or using `modeButtons.forEach(...)`) would close this gap.

---

### Security
**Status**: lgtm
**Recommendation**: ✅ Approve
**Summary**: No issues found.

---

### Documentation
**Status**: lgtm
**Recommendation**: ✅ Approve
**Summary**: No issues found.

---

*Review generated from diff of `5f1d4e9..HEAD` against `origin/main`.*
*Changed files: 10 | Lines: +652 -300*