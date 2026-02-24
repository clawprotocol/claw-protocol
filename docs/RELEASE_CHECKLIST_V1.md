# CLAW v1 Release Checklist

## 1) Confirm scope lock
- Read `CLAW_V1_CANON.md`
- Read `CLAW_V1_TRUST_BOUNDARY.md`
- Read `docs/VERIFY.md`
- Read v1.0.0 Release Notes

## 2) Tag creation (SemVer)
- Ensure working tree is clean
- Create annotated tag: `v1.0.0`

## 3) Build repro kit zip
- Run: `scripts/release/build_release_artifacts.sh`
- Confirm output directory: `dist/claw-v1.0.0/`
- Confirm repro kit zip is present

## 4) Generate checksums
- Confirm `SHA256SUMS.txt` exists in `dist/claw-v1.0.0/`
- Verify it contains all files in that directory

## 5) Verify locally (PASS)
- Unzip the repro kit to a new folder
- Run `python verify.py`
- Expect `PASS`

## 6) Smoke‑check tamper (FAIL)
- Byte‑modify any artifact in the repro kit
- Re‑run `python verify.py`
- Expect `FAIL`

## 7) Run release smoke test (PASS/FAIL tamper)
- Run `bash scripts/release/smoke_release.sh`

## 8) Attach artifacts to release
- Attach the repro kit zip
- Attach `SHA256SUMS.txt`
- Attach CLI artifact only if already built and present
