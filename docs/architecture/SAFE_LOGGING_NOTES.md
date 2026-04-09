# Safe logging (audit notes)

This note records a **narrow** pass focused on **obvious raw-content or PII logging** in security- or privacy-sensitive backend areas. It is not a repo-wide logging audit.

## Helper

- `backend/security/safe_logging.py` — metadata-only patterns, allowlisted LLM `trace_context` keys, `exception_summary()` (exception **type** only), and `FORBIDDEN_LOGGING_CONTENT` (what must never appear in logs).

## Audited (this pass)

| Area | Finding |
|------|---------|
| `backend/security/` | No logger calls; policy/redaction modules unchanged. |
| `backend/handlers/` | `process_handler` logged **filenames** (can reveal titles/parties). `sign_flow` logged **signer display name** (PII). |
| `backend/llm_router.py` | Logged full `trace_context` dict at DEBUG; any future misuse could leak arbitrary fields. |
| `backend/agreement_memory/indexer.py` | `log.exception` could attach stack traces and provider error text echoing document or prompt fragments. |
| `backend/document_layout/` | `events.emit_document_layout_event` callers reviewed: current kwargs are counts/ids/hashes/lengths. `llm_assist` logged `str(exc)` on failure. |
| `backend/handlers/verify_handler.py`, `anchor_adapter.py` | No logging calls. |
| `backend/verification/` | No logging calls in this pass. |

## Changes made

1. **`backend/security/safe_logging.py`** (new helper module) — documented forbidden content; allowlisted trace metadata; helpers for structured fields.
2. **`backend/handlers/process_handler.py`** — replace filename logging with `doc_fp` (short SHA-256 prefix of file bytes).
3. **`backend/handlers/sign_flow.py`** — remove signer display name from logs; keep `signer_id` only.
4. **`backend/tests/test_safe_logging.py`** — unit tests for the helper.

## Intentionally not changed (later review)

- **`backend/llm_router.py`** — not changed in this commit.
- **`backend/agreement_memory/indexer.py`** — not changed in this commit.
- **`backend/document_layout/llm_assist.py`** — not changed in this commit.
- **`backend/document_layout/events.py`** — not changed in this commit.
- **`backend/security/__init__.py`** — not changed in this commit.
- **Broad route/service logging** — many routers still use ad hoc `logger.info`/`debug`; a follow-up can adopt `safe_metadata_dict` / `log_metadata` incrementally.
- **`emit_document_layout_event`** — still accepts arbitrary `**fields`; enforcement is by convention + docstring; stricter validation could be added later if needed.
- **Other handlers** (e.g. Telegram or legacy paths outside this audit) — not exhaustively searched.
- **Provider SDK defaults** — OpenAI/client libraries may log at their own levels; operations should confirm vendor log policies separately.

## Adoption guidance

- Prefer **ids, hashes, counts, durations** over any string that originated from a user upload or LLM.
- Use `pick_safe_trace_context` before logging any bag that might grow over time.
- On errors, prefer `exception_summary(exc)` over `%s` / `str(exc)` when the path touches documents or models.
