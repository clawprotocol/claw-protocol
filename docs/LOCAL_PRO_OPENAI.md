# Local / staging: OpenAI and LawDog Pro full draft

Premium full draft (`POST /api/agreements/premium-full-draft`) calls `call_legal_llm` after a **privilege / protected-mode** airlock. Heuristics treat many normal legal words (e.g. `settlement`, `attorney`, `litigation`) as no-external-AI in production.

For **local**, **dev**, **test**, or **staging** only, set in the repo-root `.env` (loaded by `backend/llm_router.py`):

```bash
CLAW_ENVIRONMENT=local
CLAW_ALLOW_EXTERNAL_AI_LOCAL=1
OPENAI_API_KEY=sk-...
```

- **Production** (`CLAW_ENVIRONMENT=production` or `prod`) never honors `CLAW_ALLOW_EXTERNAL_AI_LOCAL`, even if set.
- The bypass only skips the **block**; **redaction and minimization** still run before the model.
- On startup, the API logs one line under `claw.backend.external_ai` indicating whether the bypass is active.

See also: root `.env.example`.
