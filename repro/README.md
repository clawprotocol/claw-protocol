# CLAW v1.x — Verification Reproduction Pack

This directory contains a complete, minimal, frozen example for independently
verifying a CLAW v1.x receipt.

No trust in CLAW, its authors, or its infrastructure is required.

Citation-ready summary: see docs/CITATION_SNIPPET_v1.x.md

---

## What This Proves

Using only:
- the files in this directory, and
- public blockchain data,

any third party can independently verify that:

- specific digital content existed no later than a known time,
- the content has not been altered since,
- the verification process is deterministic and reproducible.

---

## Files

- `sample_timeline.json` — frozen timeline input
- `sample_receipt.json` — CLAW receipt referencing the timeline
- `sample_anchor.json` — public anchor reference
- `verify.sh` — one-command verifier

---

## How To Verify

From this directory:

```bash
./verify.sh
