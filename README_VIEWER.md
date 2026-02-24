# CLAW v1 Evidence Viewer (Read‑Only)

## Purpose
This viewer displays CLAW v1 repro kit artifacts as recorded.  
It is informational only and does not perform verification.

**Warning:**  
“CLAW verification is cryptographic and file‑based. This viewer is informational only.”

## What the Viewer Does
- Loads existing CLAW v1 repro kit files
- Displays artifact metadata and contents
- Shows hashes exactly as recorded in `pack.json`
- Renders timeline events as an ordered list

## What the Viewer Does Not Do
- Does not verify integrity
- Does not modify or generate artifacts
- Does not provide legal advice
- Does not enforce outcomes

## Verification is Authoritative
Run local verification with:
```
python verify.py
```
Verification is deterministic, local, and independent of CLAW operators.

## Files to Load
From a repro kit folder:
- `pack.json`
- `sample_timeline.json`
- `sample_receipt.json`
- `esign_attestation.json`
- `personal_liability_attestation.json`
- `agreement_ref.json`

## Viewer Location
Open:
```
viewer/index.html
```
and load the files listed above.
