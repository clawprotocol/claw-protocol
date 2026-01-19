cat > docs/DEVELOPMENT.md <<'MD'
# CLAW — Development (Local Node)

CLAW is designed so **verification and core operation do not depend on Web2**.
Hosted services (payments, UI hosting, cloud storage) are **optional adapters** only.

## Goals
- Any machine can boot a CLAW node fast.
- Deterministic outputs (hashes/receipts) for auditability.
- Permissionless deployment: anyone can run a node.

## Prereqs
- Python 3.9+ (recommended: 3.9.x to match CI)
- macOS/Linux shell

## 3-command bootstrap (local dev)
From repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt && python -m pip install pytest fastapi uvicorn
