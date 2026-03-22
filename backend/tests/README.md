# Backend Test Harness Index

## Overview
`backend/tests/` is the CLAW backend harness for lifecycle integrity, deterministic verification, and API behavior.
Grouping below is based on filename and quick content skim so agents can choose focused runs fast.

## Test Categories

### Invariants (hashing, determinism, protocol safety)
- `test_canon_json.py` - canonical JSON behavior.
- `test_receipt.py` - receipt hashing and integrity.
- `test_sign_packet.py` - signing packet invariants.
- `test_epoch_merkle.py` - merkle construction invariants.
- `test_opreturn_payload.py` - anchoring payload shape/invariants.
- `test_timeline_hashing.py` - timeline hash determinism.
- `test_esign_determinism.py` - e-sign deterministic output checks.
- `test_anchor_adapter.py` - anchoring adapter correctness.

### Unit / API behavior
- `test_api_happy_path.py`
- `test_request_id.py`
- `test_version_headers.py`
- `test_metrics_lite.py`
- `test_timeline_store.py`
- `test_timeline_fork_api.py`
- `test_liability_assessment.py`
- `test_liability_latest.py`
- `test_legal_analyst.py`
- `test_cli_verify.py`

### Agreements
- `test_agreement_v1.py`
- `test_agreement_packet_v1.py`
- `test_agreement_versioning.py`
- `test_bundle_contains_agreement_versions.py`
- `test_agreements_api_v2.py`

### E-sign
- `test_esign_flow.py`
- `test_esign_determinism.py`

### Workflow / Timeline capture
- `test_workflow_state.py`
- `test_workflow_v1_e2e.py`
- `test_timeline_capture_e2e.py`

### Bundles / Verification / Repro kits
- `test_bundle_v0_e2e.py`
- `test_verify_bundle.py`
- `test_zip_validation.py`
- `test_evidence_envelope_e2e.py`
- `test_repro_pack_repo_less.py`
- `test_demo_run_e2e.py`

### First adjudication launch gate
- `test_first_adjudication_verify.py`
- `test_first_adjudication_export.py`
- `test_first_adjudication_repro.py`
- `test_v1_launch_gate.py`

### Liability attestations
- `test_liability_attestation_v1.py`

### Attestation flow
- `test_attestation_e2e.py`

## How To Run

### Run all backend tests
```bash
python3 -m pytest -q backend/tests
```

Repo convention:
```bash
make test-backend
```

### Run only invariants
Marker-first (preferred once tests are fully marked):
```bash
python3 -m pytest -q -m invariant backend/tests
```

Filename/content fallback:
```bash
python3 -m pytest -q -k "determinism or hash or merkle or canon or receipt or invariant" backend/tests
```

### Run only e2e
Marker-first (preferred once tests are fully marked):
```bash
python3 -m pytest -q -m e2e backend/tests
```

Filename fallback:
```bash
python3 -m pytest -q -k "e2e or demo_run or repro_pack or launch_gate or first_adjudication" backend/tests
```

## How to Add a New Test
1. Create `backend/tests/test_<feature>.py`.
2. Use explicit names: `test_<behavior>_<expected_result>()`.
3. Add marker(s) where applicable:
   - `@pytest.mark.unit`
   - `@pytest.mark.invariant`
   - `@pytest.mark.e2e`
   - `@pytest.mark.slow`
4. Keep fixtures deterministic (timestamps, hashes, seeded randomness).
5. For lifecycle paths, assert replayability and hash continuity explicitly.
