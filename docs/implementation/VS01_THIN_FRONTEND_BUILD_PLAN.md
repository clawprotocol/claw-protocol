# VS01 thin frontend — implementation-ready build plan

**Purpose:** Translate [`VS01_THIN_FRONTEND_PLAN.md`](VS01_THIN_FRONTEND_PLAN.md) into a minimal, professional pilot UI spec: architecture, build order, component contracts, and agent-safe file boundaries. **No backend changes.** **No** OCR, timeline, anchor, auth, draft/LLM UI in this pass.

**API base:** configurable origin + `/v1` (e.g. `VITE_CLAW_API_BASE=http://localhost:8000` → requests to `{base}/v1/documents`, etc.). See [`vs01_documents_api.py`](../../backend/routers/vs01_documents_api.py), [`vs01_sign_api.py`](../../backend/routers/vs01_sign_api.py), [`vs01_receipts_api.py`](../../backend/routers/vs01_receipts_api.py).

---

## 1. Frontend architecture

### Choice: **single-page app with a 3-step wizard (client-only steps)**

- **Single HTML entry** (e.g. Vite + React, or Vue, or plain HTML+JS — team choice) with **one route** `/` for the pilot.
- **Optional** later: `react-router` with `/vs01` only — **not required** for v1 pilot; use **internal step index** `0 | 1 | 2` to avoid router + backend coupling.

**Why not multi-route:** fewer moving parts, no deep-link requirement for internal pilot; refresh loses state unless we add `sessionStorage` (postponed).

### Route structure

| Path | Purpose |
|------|---------|
| `/` (or `/vs01` if you add one route) | Entire wizard |

### Component tree (suggested)

```
App
├── Vs01Layout              # title, disclaimer strip, subtle branding
├── Vs01Wizard              # owns step + global error banner
│   ├── StepFinalize        # step 0
│   ├── StepSign            # step 1
│   └── StepDone            # step 2
├── ErrorBanner / Toast     # maps fetch errors to readable text
└── (optional) DevOnlyApiBaseInput  # pilot: override API base — omit in prod build if undesired
```

### Local state shape (single source of truth)

Hold **one wizard state object** in `Vs01Wizard` (or a small context) — **do not** scatter API results across unrelated stores.

```ts
// Conceptual — not prescriptive file name
type Vs01WizardState = {
  step: 0 | 1 | 2;
  // After finalize
  documentId: string | null;
  contentSha256: string | null;
  contentType: string | null;  // from finalize response
  // After sign session
  sessionId: string | null;
  // After complete
  receiptId: string | null;
  receiptHashSha256: string | null;
  receipt: Record<string, unknown> | null;  // full receipt.v1 from complete response
  // UX
  fileName: string | null;     // display only
  loading: "idle" | "finalize" | "session" | "complete" | "receipt" | "bundle";
  error: string | null;        // user-facing message
};
```

### Persisted vs ephemeral

| Data | Pilot behavior |
|------|------------------|
| **Ephemeral (default)** | All of `Vs01WizardState` — refresh clears flow. Acceptable for first pilot. |
| **Optional persistence** | `sessionStorage` keyed `vs01_wizard_v1` — restore `documentId`, `contentSha256`, `sessionId`, `receiptId` **only** if product wants refresh survival; **never** persist raw file bytes in `localStorage` (size + sensitivity). |
| **Never** | Passwords, API keys, or full document content in localStorage for this pass. |

---

## 2. Implementation order (one Cursor pass per step)

Each step should be shippable and manually testable against a running backend.

| Order | Pass | Deliverable |
|-------|------|-------------|
| **1** | **Scaffold** | Vite (or chosen) app, env-driven `API_BASE`, fetch wrapper with JSON + blob helpers, global CSS (minimal tokens: background, card, primary button, monospace hashes). |
| **2** | **API module** | Thin `vs01Api.ts` (or split by resource) implementing only: `finalizeDocument`, `createSignSession`, `completeSign`, `getReceipt`, `downloadBundle` — **no** UI imports inside. |
| **3** | **Types** | `vs01Types.ts`: request/response interfaces matching backend JSON keys (`document_id`, `content_sha256`, `session_id`, `receipt`, etc.). |
| **4** | **Step 0 — Finalize** | File → base64 → POST `/v1/documents` → advance to step 1 on success; show id + hash snippet. |
| **5** | **Step 1 — Sign** | Form: `signer_ref`, `intent`, one `field_manifest` row (defaults pre-filled). Chain: POST session → POST complete → advance to step 2. |
| **6** | **Step 2 — Done** | Display ids/hashes; buttons: GET receipt (optional), download bundle (`<a download>` or blob save). |
| **7** | **Polish** | Loading disables buttons; map HTTP status to messages (400/404/409); disclaimer text in layout. |
| **8** | **Docs** | `README` in frontend folder: env vars, “VS01 only — not timeline receipts”, link to [`VS01_REVIEW_AND_COMPRESSION.md`](VS01_REVIEW_AND_COMPRESSION.md). |

---

## 3. Component contract

### `Vs01Layout`

| | |
|--|--|
| **Purpose** | Shell: app title, short disclaimer (not legal advice), consistent padding. |
| **Inputs** | `children` |
| **Outputs** | Renders children |
| **Loading/error** | None |
| **API** | None |

### `Vs01Wizard`

| | |
|--|--|
| **Purpose** | Owns `Vs01WizardState`, step navigation (Next only forward; optional “Start over” clearing state). |
| **Inputs** | None (reads `import.meta.env` or `process.env` for API base). |
| **Outputs** | Renders active step component; passes callbacks + state slices. |
| **Loading** | Passes `loading` string to children; blocks double-submit. |
| **Error** | Central `error` string; clear on new action. |
| **API** | Delegates to children or calls `vs01Api` from handlers — **prefer handlers in Wizard** that call `vs01Api` to keep steps dumb. |

### `StepFinalize`

| | |
|--|--|
| **Purpose** | Pick file → finalize document. |
| **Inputs** | `onFinalized(meta)`, `loading`, `error`, `onErrorClear` |
| **Outputs** | Invokes `onFinalized` with `{ documentId, contentSha256, contentType, fileName }` |
| **Loading** | Disable file input + button when `loading === "finalize"` |
| **Error** | Display `error` from parent |
| **API** | **Triggered by parent** on button click: `POST /v1/documents` — *or* step calls a passed `onFinalize(file: File)` from Wizard that runs API. Either pattern OK; **one** place must own the fetch. |

### `StepSign`

| | |
|--|--|
| **Purpose** | Collect signer + intent + one rectangle; run session + complete. |
| **Inputs** | `documentId`, `contentSha256`, `onSigned(result)`, `loading`, `error` |
| **Outputs** | `onSigned({ receiptId, receiptHashSha256, receipt })` |
| **Loading** | `loading` in `session` \| `complete` — show inline spinner on primary button |
| **Error** | 409 `session_not_pending` → message “Session already completed; start over.” |
| **API** | `POST /v1/sign-sessions` then `POST /v1/sign-sessions/{session_id}/complete` — **sequential**, second depends on first. |

### `StepDone`

| | |
|--|--|
| **Purpose** | Show proof outputs; download bundle; optional verify GET. |
| **Inputs** | `receiptId`, `receiptHashSha256`, `receipt`, `loading`, `error` |
| **Outputs** | `onDownloadStart` / `onRefresh` callbacks optional |
| **Loading** | `receipt` refresh: `loading === "receipt"`; bundle: `loading === "bundle"` |
| **Error** | Network failure on bundle — show retry |
| **API** | `GET /v1/receipts/{receipt_id}` (optional), `GET /v1/receipts/{receipt_id}/bundle` (blob) |

### Pure helpers (stateless)

| Helper | Role |
|--------|------|
| `fileToBase64(file)` | Returns standard base64 **without** data-URL prefix (match backend `base64.b64decode`). |
| `buildFieldManifestOneBox(params)` | Returns `[{ field_id, page_index, x, y, w, h }]` with sane defaults. |
| `formatHashSnippet(hex64)` | First/last 8 chars for display. |

---

## 4. Agent-friendly boundaries

| Concern | Owner file(s) | Rule |
|---------|---------------|------|
| **HTTP + paths** | `vs01Api.ts` (or `api/vs01/*.ts`) | Only place that knows `/v1/documents`, `/v1/sign-sessions`, `/v1/receipts`. **No** React components in this file. |
| **View state** | `Vs01Wizard.tsx` + small hooks if needed | Owns step index and wizard state; **no** raw `fetch` here if you already have `vs01Api`. |
| **Presentation** | `Step*.tsx` | Receive props; **no** `fetch`; optional controlled inputs only. |
| **Types** | `vs01Types.ts` | Shared; update when backend JSON changes — single diff point. |
| **Config** | `config.ts` reads `import.meta.env.VITE_CLAW_API_BASE` | One env var; document in README. |

**Safe modification rule for future agents:** change API shapes in **types + vs01Api** first; steps only need prop renames if response contract changes.

---

## 5. Versioning guidance

- **Folder:** e.g. `frontend/src/vs01/` or `frontend/src/features/vs01/` — isolates pilot from any legacy `frontend/` pages.
- **Prefix types** with `Vs01` or namespace `namespace Vs01 { ... }` to avoid clashing with other app types later.
- **API version:** UI assumes **VS01 backend** as implemented (response keys like `ok`, `receipt`, `document`). If backend adds fields, UI should **ignore unknown fields** (forward-compatible).
- **Props:** pass **narrow slices** (`documentId: string`) not whole backend JSON into dumb components — reduces accidental coupling to `receipt` internals on Step 1.
- **Receipt namespace:** show a one-line hint: “VS01 receipt ids typically start with `rcpt_` — do not use timeline receipt endpoints.”

---

## 6. Out of scope (first UI pass)

Do **not** add:

- Authentication, login, sessions, or API keys in the UI
- OCR, ingest, or document intelligence
- Timeline UI, case IDs, or links to `/v1/timeline/receipts/*`
- Anchor status, blockchain, or admin tools
- Draft workspace, LLM chat, agreement templates, `/v1/agreements/*` integration
- Rich PDF canvas / drag-drop signature placement (use numeric fields only)
- `POST /v1/documents/{id}/sign-prep` unless explicitly a second milestone
- Multi-signer workflows, co-sign, or witness
- Internationalization
- E2E test suite in CI (manual QA sufficient for pilot; add Playwright later if needed)

---

## Reference

- Product flow: [`VS01_THIN_FRONTEND_PLAN.md`](VS01_THIN_FRONTEND_PLAN.md)
- Backend scope & risks: [`VS01_REVIEW_AND_COMPRESSION.md`](VS01_REVIEW_AND_COMPRESSION.md)
