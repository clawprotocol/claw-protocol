# CLAW Agent Playbook

## Prime Directive
Preserve **determinism** and **lifecycle integrity** above all else.

- Do not weaken receipt hashing, timeline replay guarantees, or anchoring invariants.
- Prefer additive harness changes over risky refactors.
- Keep verification local, reproducible, and fail-loud.

## Agent Workflow: Plan -> Execute -> Validate

### 1) Plan
- Define explicit scope and non-goals.
- List files to touch and expected commands.
- Confirm no protocol/schema behavior is changed unintentionally.

### 2) Execute
- Make minimal, localized edits.
- Keep existing file names/paths stable.
- Add markers/docs/config where they improve agent throughput.

### 3) Validate
Run the golden command:
```bash
make validate
```

If a step fails:
- capture exact command + error output,
- patch surgically,
- re-run `make validate`.

## Golden Commands

Primary:
```bash
make validate
```

Fast loops:
```bash
make test-backend
cd frontend && npm run build
```

## Test Index
- Backend tests live in `backend/tests/`.
- Grouped inventory and focused run recipes:
  - `backend/tests/README.md`

## Session Logging
- Record each meaningful harness pass under:
  - `docs/agent_sessions/YYYY-MM-DD.md`
- Include:
  - what changed,
  - commands run,
  - gaps / follow-ups.

## Updating `AGENTS.md` After Failures
When an agent or CI run fails:
1. Record the failing command and exact error.
2. Add the pattern + fix strategy to `AGENTS.md`.
3. Add guardrails (preflight checks, markers, docs, validation steps).
4. Re-run `make validate`.

## No-Slop Review Bar
Before merge, verify:
- Change set is narrow and reversible.
- No hidden changes in receipt/timeline/anchor semantics.
- Docs and commands reflect actual repo behavior.
- Validation output is clear and actionable.

