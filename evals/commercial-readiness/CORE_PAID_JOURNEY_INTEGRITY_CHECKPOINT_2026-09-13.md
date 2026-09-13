# Core Paid Journey integrity checkpoint — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `80ab6871` (`80ab6871c8e34e7cb5fa87a1f3ca1789dffe7533`) — Core Paid Journey acceptance checkpoint  
Nothing was pushed. This is **not** a launch authorization.

The desktop/mobile **workflow** milestone on official `src-9506e8c8b014` still stands and was not rebuilt. This checkpoint closes remaining **document/receipt integrity** gaps on top of that working tree.

Official integrity proof (one unchanged source identity):

`80ab6871c8e34e7cb5fa87a1f3ca1789dffe7533+src-d20519d460a25751c84125625484cdc87ac1732f+run-20260913T131709Z-88408`

Evidence directory (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/80ab6871c8e3-src-d20519d460a2-live-4188-4189-stub-model-run-20260913T131709Z-88408`

## Actual document mismatch

On official workflow evidence `src-9506e8c8b014` (agreement `bb542ed8-3d5f-49d5-b46d-8c058a66e9d2`), raw article fingerprints were:

| Surface | Fingerprint | Notes |
|---|---|---|
| Owner-approved | `2416:4882559a` | Accepted paper |
| Maya signing (existing invite) | `2464:49d68532` | +48 characters |
| Jordan signing (fresh desktop) | `2416:4882559a` | Matched owner |
| Mobile both signers | `2464:…` | Same extra chrome as Maya |

The extra 48 characters were presentation chrome, not a different bargain:

- `Document` label collected inside `recipient-document-shell`
- `Draft Agreement (non-binding template)` prepended by `renderReviewFirstCorpusHtml`

Accepted snapshot corpus length was 2813, digest `7610c92e…`. Signing-lock JSON SHA was a different encoding of the same paper. Those SHA-256 values must not be compared directly.

`sameOperative=false` on that raw compare was **not** a passing integrity result. The repair is a deterministic chrome/signature-metadata strip plus a readable diff. Accepted paper was not rewritten.

On the official integrity run, same-revision compares were:

| Compare | Desktop | Mobile |
|---|---|---|
| Owner vs review recipient (A1) | raw and operative equal | raw and operative equal |
| Owner vs Maya sign (B2) | presentation-only (`2416:4882559a`) | presentation-only (`2416:4882559a`) |
| Owner vs Jordan sign (B2) | raw and operative equal | raw and operative equal |
| Owner vs owner final (B3) | raw and operative equal | raw and operative equal |

Maya’s remaining presentation-only result is chrome/signature metadata on the in-place owner invite. Operative hashes now match, and unresolved operative differences fail A1/B2/B3.

## Snapshot versus signing lock

Lock `content_sha256` covers the JSON signing snapshot. Review-snapshot SHA-256 covers the plain corpus. Direct `lockSha !== snapSha` expire was not restored.

The server lock now copies accepted (or latest pending) snapshot **id, digest, length, and status** at PUT time. Recipient GET renders `review_revision.corpus_plain` from that snapshot. Frontend sign authority fails when the lock carries snapshot binding that disagrees with the rendered body. Matching `locked_version_id` alone is not a bind proof.

Negative cases that must fail:

- lock missing snapshot id/digest
- lock snapshot id mismatch
- lock snapshot digest mismatch
- post-lock corpus change (`twelve months` → `six months`) that keeps names and fee — recipient GET still returns the locked corpus; binding against the new digest fails

Pre-cutover Phase 4B.2 locks without snapshot-binding fields remain open when version and paper still match.

## Final document versus receipt

`/app/agreements/:id/view-signed` is the **completed-document view** (`data-completed-document-view="true"`). Status-pill text is not receipt proof.

Owner signed-view requires lock-bound snapshot id + digest. Missing or mismatched authority shows unavailable/recovery. Draft normalize preserves `accepted_review_snapshot_v1` corpus bytes without placeholder scrub. The owner draft GET uses the same authenticated token refresh as ordinary draft fetch.

B3 verifies the persisted public-verify receipt separately:

- agreement id
- verification hash
- accepted snapshot id + digest
- locked version id
- `fully_executed`
- required participant names
- ≥2 `signature_completed` events with `participant_id`
- refresh recovers the same hash and snapshot

Official B3 (desktop agreement `567201f9-3045-4bd6-98f4-15b31cb0fcc7`): `completedDocument=true receiptBound=true`, receipt hash `df70ed7a…`, snapshot `crs_bf80bced56534bcaad6457d1a5bf875b`, recovered after refresh.

## Gate

Unresolved operative differences block A1/B2. Receipt-binding or completed-document authority failures block B3. Interview, recipient approval/proposal, owner revision, direct signing, and continuity paths were preserved.

## Verification

| Step | Source identity | Outcome |
|---|---|---|
| Focused integrity (desktop proposal + direct sign) | `80ab6871c8e3+src-ca26300cf94a+run-20260913T130307Z-86198` | Playwright 2/2; A3/A4/B1–B3 pass. Not official (incomplete matrix). |
| Official desktop/mobile core gate | `80ab6871c8e3+src-d20519d460a2+run-20260913T131709Z-88408` | 10/10, 28/28 rows, `gate_green=True` |
| Phase 4C.2.3 recipient completion truth | current tree after 4C.2.3-safe lock bind | PASS (pytest 7, contracts 10, Playwright 6/6) |
| Phase 4B.2 recipient signing | current tree after pre-cutover lock exception | PASS (14+2) |
| Handler pytest `direct_signature or lock_binds or owner_and_reviewer or projection or review_track` | current tree | 8 passed |
| Integrity unit/vitest set | current tree | 37 passed |
| `frontend` `tsc -b && vite build` | current tree | PASS |

The 4B.2-preserving lock tweak landed after the focused `src-ca26300cf94a` run. Official `src-d20519d460a2` is the only combined desktop/mobile integrity pass.

Prior official workflow evidence `src-9506e8c8b014` / `run-20260913T040043Z-79629` remains on disk and was not reset.

## Remaining limitations

- Live-model quality is **unproven**. The gate uses the acceptance stub.
- Date wrapping (`date_line_broken` / `October 1,` split from `2026`) remains a separate presentation issue.
- Maya’s existing-invite shell can still include presentation chrome; operative compare must stay the integrity criterion.
- No live email, Stripe, Supabase, or staging claim.
- This is not commercial launch readiness.

## Excluded from this commit

- `evals/commercial-readiness/results/**`
- runtime credentials, access tokens, JWKS, and raw claw-data
