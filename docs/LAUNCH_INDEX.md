# CLAW v1 Launch Index

This index lists the authoritative documents for the CLAW v1 production release.

## Required Reading
- Canon: `CLAW_V1_CANON.md`
- Trust boundary: `CLAW_V1_TRUST_BOUNDARY.md`
- Freeze and distribution: `docs/CLAW_V1_FREEZE_AND_DISTRIBUTION.md`
- Verification guide: `docs/VERIFY.md`
- Repro kit guide: `repro/README.md`
- Release notes: v1.0.0 Release Notes (GitHub Release)

## Operations & hosting
- **Launch week (chronological playbook):** `docs/ops/LAUNCH_OPERATOR_PLAYBOOK.md`
- **Postgres launch posture (single DSN default):** `docs/ops/LAUNCH_DATABASE_PROFILE.md`
- Operator runbook (processes, startup order, anchoring, recovery): `docs/ops/OPERATOR_RUNBOOK.md`
- Anchoring launch (Bitcoin-first, mandatory Doge mirror, weekly cadence): `docs/ops/ANCHORING_LAUNCH_RUNBOOK.md`
- Lean AWS anchoring (pruned nodes, EventBridge worker): `docs/ops/ANCHORING_AWS_LAUNCH.md`
- Deploy smoke test (post-ship checks): `docs/ops/DEPLOY_SMOKE_TEST.md`
- Environment topology / env vars by role: `docs/architecture/ENV_TOPOLOGY.md`
- Legacy deployment notes: `docs/DEPLOY.md`

## Workflow API + CLI Commands
- Workflow API: `/v1/workflow/*` (create, freeze, export)
- CLI: `clawctl timeline|attest|agreement|dispute`
