# RUNNING A CLAW NODE

CLAW is designed to be bootable on any machine with a deterministic dependency lock.
Web2 services are optional hooks; verification works offline.

## Prereqs
- Install uv: https://astral.sh/uv
- Repo cloned locally

## Full node (2 commands)
From repo root:

1) Install dependencies deterministically:
```bash
uv sync --frozen
