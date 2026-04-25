# Database portability (`backend/db`)

- **Anchoring:** `open_anchoring_store_connection()`, Postgres migrations under `backend/anchoring/migrations/postgres/`.
- **Other stores:** still SQLite-first; port by adding a sibling `migrations/postgres/` and a small connection wrapper like `anchoring_sql.py`.

See `docs/architecture/POSTGRES_DAY_ONE.md`.
