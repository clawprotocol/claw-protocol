# CLAW v1 Deployment Notes

> **See also:** `docs/DEPLOYMENT.md` (platform guide), `docs/ENVIRONMENT.md` (env reference), `docs/LOCAL_DEV.md` (local setup).

## LawDog frontend — privacy / data-rights inbox (production)

**Required for production LawDog sites:** at **Vite build time**, set **`VITE_LAWDOG_PRIVACY_EMAIL`** to a **real, monitored** address for privacy and data-rights inquiries. The value is baked into static assets (`import.meta.env`); changing it requires a rebuild and redeploy.

If it is missing in a **production** bundle, the Privacy Policy still works but omits a direct `mailto:` for that inbox (fallback channels only), and the SPA logs a **console-only** operator warning at startup — not an end-user banner.

Index: **`docs/architecture/ENV_TOPOLOGY.md`** (table **Frontend (build-time `VITE_*`)**). Example: **`frontend/.env.example`**.

## Purpose
This document lists production‑relevant env vars, file paths, and security notes.

## Runtime Command
```bash
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

## Data Paths
- `CLAW_DATA_DIR`: base directory for local data (default: `/var/lib/claw` if writable, else `~/.claw`)
- `CLAW_TIMELINE_DB_PATH`: overrides timeline sqlite path

## Security Controls
### Rate limiting
- `CLAW_RATE_LIMIT_RPS` (0 disables)
- `CLAW_RATE_LIMIT_BURST` (0 disables)

### Upload / Zip limits
- `CLAW_BUNDLE_MAX_ZIP_BYTES` (default 10MB)
- `CLAW_BUNDLE_MAX_UNZIPPED_BYTES` (default 50MB)
- `CLAW_BUNDLE_MAX_FILES` (default 500)
- `CLAW_MAX_REQUEST_BYTES_VERIFY` (default 10MB)

### CORS
- `CLAW_CORS_ALLOW_ORIGINS` (comma‑separated). If unset, dev allows `*`, prod allows none.

## Demo Run Persistence
`/v1/workflow/demo/run` produces bundle zips in memory; no files are persisted.

## Notes
- No blockchain calls are required for demo or verification.
- Verification is deterministic and file‑based.
