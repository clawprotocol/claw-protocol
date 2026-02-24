# CLAW v1 — First Adjudication Flow (Minimal, Deterministic)

## Purpose (Adjudication-First)
This flow produces a minimal, deterministic evidentiary package for adjudication.
It is **NOT** legal advice, **NOT** enforcement, and **NOT** contract signing.

It exists to create verifiable artifacts that can be reviewed by hostile verifiers,
auditors, or adjudicators without trust in CLAW operators.

## Scope
The flow covers:
- A single notice event
- A frozen manifest
- A receipt-like artifact with a commitment to the manifest hash

It does **not** perform anchoring, identity verification, or legal determinations.

## Scripts (Module Paths)
- Generator: `backend.scripts.demo_first_adjudication`
- Verifier: `backend.scripts.verify_first_adjudication`

## Output Directory
Artifacts are written to:
```
artifacts/first_adjudication/
```

## Inputs
The generator and verifier accept deterministic inputs via environment variables:
- `CLAW_OUT_DIR` (default: `artifacts/first_adjudication`)
- `CLAW_TIMELINE_ID`
- `CLAW_TITLE`
- `CLAW_MESSAGE`
- `CLAW_NETWORK`
- `CLAW_ANCHOR_NETWORK`
- `CLAW_EPOCH_ID`
- `CLAW_CREATED_AT`
- `CLAW_EVENT_TIME`
- `CLAW_FROZEN_AT`
- `CLAW_ISSUED_AT`

If unset, the scripts use fixed defaults to remain deterministic.

## Outputs
The generator writes:
- `{timeline_id}.timeline.json`
- `{timeline_id}.receipt.json`
- `esign_attestation.json`
- `personal_liability_attestation.json`
- `agreement_ref.json`
- `pack.json`
- `VERIFY.md`

The verifier writes:
- `VERIFY_RESULT.json`
- `VERIFY.md`

## Deterministic Guarantees
The flow is deterministic with respect to the inputs above:
- Event hash is computed from canonical JSON of the event payload.
- Manifest hash is computed from canonical JSON of:
  ```
  {"event_count": N, "event_hashes": [...]}
  ```
- Receipt commitment equals the manifest hash.

No timestamps are generated internally unless provided by input.

## How to Run (Generator)
```
uv run python -m backend.scripts.demo_first_adjudication
```

## How to Run (Hostile Verifier)
```
uv run python -m backend.scripts.verify_first_adjudication
```

The verifier recomputes event and manifest hashes and checks:
- `receipt.commitment == manifest_sha256`

## One-Command CLI
```
uv run clawctl first-adjudication
```

## Pack Manifest (High Level)
File: `pack.json`
Canonical filename: `pack.json` (required for release export).

Required fields:
- `schema`
- `pack_inputs_hash_sha256`
- `created_at`
- `commitment` (frozen manifest hash)
- `artifacts[]` = `{path, sha256}`
- `utilities` map with keys: `timeline`, `e_sign`, `personal_liability`, `agreements`

## Export (Release Gate Artifact)
```
uv run python -m backend.scripts.export_first_adjudication_pack
```

### Zip Contents
The export zip includes all files in `artifacts/first_adjudication/`, including:
- `VERIFY.md`
- `VERIFY_RESULT.json`
- `{timeline_id}.timeline.json`
- `{timeline_id}.receipt.json`
- `esign_attestation.json`
- `personal_liability_attestation.json`
- `agreement_ref.json`
- `pack.json`

### Zip Filename Rule
```
claw_first_adjudication_pack_<pack_inputs_hash_sha256>.zip
```

## Repro Pack (Repo‑less)
```
uv run python -m backend.scripts.export_first_adjudication_repro
```

This creates:
```
artifacts/first_adjudication/repro/
```

Verify from inside the repro directory (one command, no network):
```
python verify.py
```

Expected output:
```
PASS
pack_inputs_hash_sha256=<hash>
commitment=<hash>
```

This verification is deterministic and does not require the CLAW repo.

## Local Test Command (Sanity Check)
```
uv run pytest -q
```
