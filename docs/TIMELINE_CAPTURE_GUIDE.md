# CLAW v1 Timeline Capture Guide

## Purpose
This guide provides neutral, court‑safe steps to capture a timeline, freeze it, export a repro kit, and verify integrity. It does not provide legal advice or enforcement.

## Trust Boundary
- Viewer/UI is informational only.
- Verification is cryptographic and file‑based.
- `verify.py` is authoritative.

## Capture Steps
1) **Create a timeline** using deterministic inputs (IDs, timestamps, title).  
2) **Append events** with notice content and optional references.  
3) **Freeze** the timeline to seal the manifest hash.  
4) **Export** a repo‑less repro kit that includes `pack.json`, `sample_timeline.json`, `sample_receipt.json`, `verify.py`, and `VERIFY.md`.

## Verification Steps
1) Open a terminal in the repro kit folder.  
2) Run:
```bash
python verify.py
```
3) Expect `PASS`.

## Tamper Check
1) Modify one byte of any artifact file.  
2) Re‑run `python verify.py`.  
3) Expect `FAIL`.

## Notes
- Verification is deterministic and local.  
- Any mismatch in hashes or manifests must fail verification.  
- Artifacts are evidence records only; they do not imply enforceability.
