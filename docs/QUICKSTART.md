# CLAW v1 Quickstart

## What CLAW is
CLAW is an evidence-first workflow for creating, freezing, exporting, and
verifying records. It does not give legal advice, enforce outcomes, or claim
jurisdiction.

## The 4 utilities
- **Evidence Timeline:** capture events, freeze a manifest hash, export a repro kit.
- **E-Sign / Attestation:** record statements with timestamps and signatures.
- **Liability Attestation:** document roles, capacity, and control windows.
- **Agreement:** draft and redline document text for evidence use.

## One-click demo
1) Start backend + frontend (`make dev`).
2) In the UI, click **Run Demo**.
3) Download `bundle.zip`.
4) Run verifier or use the Verifier tab.
5) Review `BUNDLE_CONTENTS.md` inside the bundle for a human-readable summary.

## Hostile Verifier CLI (offline)
You can verify a bundle without the web app:
```bash
clawctl verify bundle.zip --pretty
```
Exit code is `0` for PASS and `1` for FAIL (offline, no network).

## Evidence-only warning
Verification only confirms integrity and linkage of files. It does not confirm
truthfulness, intent, or legal enforceability.

## App state export/import (convenience)
CLAW can export/import a small “app state” JSON for your local records list.
This is for convenience only and is not a proof artifact.
It does not affect verification and is not part of bundle.zip.
Use app state to move draft records between machines.

## Agreement versioning + redlines
Use “Save Version” to create immutable snapshots (v1, v2, v3).
Select two versions and “Generate Redline” for a deterministic diff.
You can optionally include version files and redlines in bundle export.
This does not change verification semantics.
