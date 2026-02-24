## Agreement Builder v2 Endpoints (single-intake flow)

Quick curl checks for new deterministic agreement routes while legacy endpoints remain intact:

```bash
# 1) Parse single intake into structured fields
curl -s -X POST "http://127.0.0.1:8000/api/agreements/parse" \
  -H "Content-Type: application/json" \
  -d '{"intake_text":"Consulting agreement between Acme Inc and John Smith in Texas, $400 per week, due March 15, 2026."}'

# 2) Create canonical draft
curl -s -X POST "http://127.0.0.1:8000/api/agreements/draft" \
  -H "Content-Type: application/json" \
  -d '{"title":"Consulting Agreement","jurisdiction":"Texas","parties":[{"name":"Acme Inc","role":"Client"},{"name":"John Smith","role":"Consultant"}],"purpose":"Consulting services","payment_terms":"$400 per week","duration":"until March 15, 2026","due_date":"March 15, 2026","effective_date":null}'

# 3) Update only one field (no full re-gen)
curl -s -X POST "http://127.0.0.1:8000/api/agreements/<id>/update-field" \
  -H "Content-Type: application/json" \
  -d '{"field":"due_date","value":"March 20, 2026"}'

# 4) Render clean user-facing HTML (no template metadata leakage)
curl -s -X POST "http://127.0.0.1:8000/api/agreements/<id>/render"
```
# Developer Guide

## Quick links
- `docs/QUICKSTART.md`
- `docs/PRODUCT_BOUNDARY.md`

## Bootstrap
```bash
make bootstrap
```

## Run Tests
```bash
make test
```

## Run Backend Tests Only
```bash
make test-backend
```

## Troubleshooting
### uv panic on macOS (Apple Silicon)
If `uv run pytest -q` fails with a panic like `Attempted to create a NULL object`, use the fallback runner:
```bash
python3 -m pytest -q
```
or
```bash
make test
```
which will fall back automatically.

### uv pip / missing pip
If a uv-managed environment lacks `pip`, use:
```bash
uv pip install -e ".[dev]"
```

### Missing python-multipart
If tests fail with:
`Form data requires "python-multipart" to be installed`,
re-run bootstrap to install updated dependencies:
```bash
make bootstrap
```

### Run a single test file
```bash
python3 -m pytest -q backend/tests/test_bundle_v0_e2e.py
```

## Notes
- Tests run offline (no Bitcoin or external network calls).
- Verification is deterministic and file-based.

## Updating golden fixtures (intentional)
Golden bundle fixtures are strict by default and will fail on drift.
To regenerate intentionally:
```bash
CLAW_UPDATE_FIXTURES=1 python3 -m pytest -q backend/tests/test_bundle_v0_e2e.py
```
This prints a warning and rewrites the fixture files.

## Smoke demo
```bash
curl -s -X POST "http://127.0.0.1:8000/v1/workflow/demo/run?format=zip" -H "content-type: application/json" -d '{"created_at":"2026-01-01T00:00:00Z","anchor_network":"bitcoin-testnet","epoch_id":"epoch-demo-fixed","timeline_id":"tl_demo_fixed"}' -o bundle.zip
curl -s -X POST "http://127.0.0.1:8000/v1/workflow/bundle/verify" -F "bundle_zip=@bundle.zip"
```

## Backend/Frontend Dev
### Start backend (auto port fallback)
```bash
bash scripts/dev_backend.sh
```

If port 8000 is in use, it will use 8001. To auto-kill only a uvicorn
`backend.main:app` process:
```bash
AUTO_KILL=1 bash scripts/dev_backend.sh
```

### Start frontend (set API base if backend on 8001)
```bash
cd frontend
VITE_API_BASE="http://127.0.0.1:8001" npm run dev
```

### Run backend + frontend together
```bash
make dev
```

### API base URL in frontend
Set `VITE_API_BASE` to point at the backend. The UI shows the current value.

### Find/kill uvicorn manually
```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
kill <PID>
```
