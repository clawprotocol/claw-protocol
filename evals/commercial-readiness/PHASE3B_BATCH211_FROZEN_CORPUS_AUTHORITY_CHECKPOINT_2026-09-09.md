# Phase 3B Batch 2.1.1 checkpoint — agreement/org-bound frozen corpus authority

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `aaf4dc57` (`record phase 3B batch 2.1 frozen-corpus signer-metadata checkpoint`)  
Nothing was pushed.

This replaces the unscoped frozen-legal singleton. It is **not** a launch authorization.

## Authority

Frozen legal bytes are keyed by `agreementId` + `organizationId` + hash.

- Session cache is not a grant. Reload/reopen reads server-authoritative state only after agreement, organization, and hash match.
- Browser `localStorage` / `sessionStorage` cannot restore a corpus.
- `local-org` and `session-handoff` stay session-only so TEST505 can still bind without a workspace id. They cannot restore from server.
- Logout (`clearLawdogUserSessionState`) clears session and client-held server records.
- Organization switch inactivates the session cache. Reopening the same authorized agreement restores from server for that org.

Missing agreement, organization, or hash, or any mismatch, fails closed (`null` / `{ ok: false }`). Agreement B finalize never receives Agreement A’s body.

## Proof

`paidProBatch211FrozenCorpusAuthority.behavior.test.ts` — **4/4**

- A’s corpus is not returned while finalizing B
- Logout and org-switch inactivate the prior corpus
- Reload of the same authorized agreement restores the exact body and hash from server authority
- Missing or mismatched authority fails closed

## Preserved

- TEST505 — **6/6**
- TEST366 — **3/3**
- Alex notice/execution hydration still passes. The pre-existing opening-repair failure at `e72f1707` is unchanged.

## Verification

- Phase 1: **96/96**
- Phase 2 paid-journey: **64 files, 376 passed**, zero failures
- Production build: `frontend` `tsc -b && vite build` succeeded
- Full suite: not rerun. Official baseline remains **9,458 / 9,240 / 218**

Added to the Phase 2 gate: `paidProBatch211FrozenCorpusAuthority.behavior.test.ts`.

## Remaining

- Alex opening-title repair, notice `If to … Attn:` rebuild, and TEST497 review-vs-frozen remain pre-existing
- No launch-readiness claim
