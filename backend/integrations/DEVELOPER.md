# CLAW integrations — developer reference

Stable schemas and versioning for outbound webhooks, document layout outputs, and inbound integration aliases.

## Webhook payload (`claw.integration.webhook/v1`)

Each delivery is a POST with `Content-Type: application/json; charset=utf-8` and a JSON body (UTF-8, sorted keys in CLAW’s canonical representation).

| Field | Type | Description |
|--------|------|-------------|
| `event_id` | string | Unique id for this delivery instance (e.g. `evt_…`). |
| `event_type` | string | Dotted lowercase name (see event catalog below). |
| `occurred_at` | string | ISO 8601 UTC timestamp. |
| `org_id` | string | Workspace org id (matches `X-Claw-Org-Id` for that tenant). |
| `object_type` | string | Domain noun (e.g. `agreement`, `document_layout_analysis`, `workspace`). |
| `object_id` | string | Primary id for the object (agreement id, analysis id, etc.). |
| `summary` | object | Small, structured context — **no full agreement body or PII by default**. |
| `version` | string | Schema id, currently `claw.integration.webhook/v1`. |

### HTTP headers (verification)

| Header | Description |
|--------|-------------|
| `X-Claw-Webhook-Id` | Same as `event_id`. |
| `X-Claw-Webhook-Timestamp` | Unix seconds as string (signing input). |
| `X-Claw-Webhook-Signature` | `v1=<hex>` HMAC-SHA256 over `timestamp + "." + body_bytes` using the endpoint’s signing secret. |
| `X-Claw-Webhook-Event-Type` | Same as `event_type`. |
| `X-Claw-Webhook-Schema` | Same as body `version` (`claw.integration.webhook/v1`). |

Verify using the **raw request body bytes** (before JSON re-serialization).

**Canonical signing input:** `timestamp` (ASCII string from `X-Claw-Webhook-Timestamp`) as UTF-8 bytes, then `.`, then the **raw POST body bytes** (no JSON re-serialization): `ts.encode() + b"." + body`. HMAC-SHA256 with the endpoint secret; hex digest; header `X-Claw-Webhook-Signature` value `v1=<hex>` (see `sign_webhook_body`).

Libraries: `verify_webhook_signature` checks crypto only; `verify_webhook_signature_fresh` also enforces timestamp skew (default ±300 seconds vs receipt time) to limit replay. Tune `max_age_seconds` for slow consumers.

**Secrets:** Returned once at registration (and on rotate). Stored server-side in org webhook state. Rotating **invalidates the previous secret immediately**.

### `object_type` vocabulary (stable)

| `object_type` | Typical `object_id` | Notes |
|---------------|---------------------|--------|
| `agreement` | Agreement / draft UUID | Lifecycle, memory indexed per agreement |
| `document_layout_analysis` | `analysis_id` | Layout + field review |
| `subscription` | Subscription row id | Billing |
| `workspace` | Org id (`X-Claw-Org-Id`) | `paywall.triggered` — tenant-scoped gate; check `summary.agreement_id` when present |

### Event catalog (initial)

- `agreement.created` — draft created (including forked drafts).
- `agreement.updated` — owner field patch via workspace API (`update-field`).
- `agreement.sent` — `review_sent_at` set (`review-sent`).
- `agreement.signed` — all required signers completed (`signing-ceremony/complete`, fully executed).
- `agreement.completed` — same execution milestone; use for “workflow done” automations (duplicated fire with `agreement.signed` is intentional for clearer subscriptions).
- `agreement.expired` — free-plan draft TTL hit (`assert_free_incomplete_draft_not_expired`).
- `agreement.memory.indexed` — Agreement Memory index row written (per agreement).
- `document.analysis.completed` — layout pipeline finished (`/v1/document-layout/analyze`).
- `field.review.completed` — review manifest saved (`PUT .../review-manifest`).
- `paywall.triggered` — usage economics blocked an action; `object_type` is **`workspace`**, `object_id` is **org id** (see table above).
- `subscription.upgraded` — new subscription row created from payment sync (initial purchase).

### Example payloads

**Agreement sent**

```json
{
  "event_id": "evt_abc123",
  "event_type": "agreement.sent",
  "occurred_at": "2026-04-01T12:00:00Z",
  "org_id": "org_01example",
  "object_type": "agreement",
  "object_id": "a1b2c3d4-....",
  "summary": { "review_sent_at": "2026-04-01T12:00:00Z" },
  "version": "claw.integration.webhook/v1"
}
```

**Agreement signed / completed** (`agreement.signed` and `agreement.completed` fire in the same request when fully executed; summaries differ slightly)

```json
{
  "event_type": "agreement.signed",
  "object_type": "agreement",
  "object_id": "a1b2c3d4-....",
  "summary": {
    "locked_version_id": "v_...",
    "agreement_version_hash_prefix": "deadbeef0123456789abcdef"
  },
  "version": "claw.integration.webhook/v1"
}
```

**Document analysis completed**

```json
{
  "event_type": "document.analysis.completed",
  "object_type": "document_layout_analysis",
  "object_id": "layout_abcd1234ef56",
  "summary": {
    "page_count": 3,
    "candidate_total": 12,
    "document_id_ref": "doc_uuid_optional"
  },
  "version": "claw.integration.webhook/v1"
}
```

**Field review completed**

```json
{
  "event_type": "field.review.completed",
  "object_type": "document_layout_analysis",
  "object_id": "layout_abcd1234ef56",
  "summary": { "action_count": 4, "review_state": "manifest_saved" },
  "version": "claw.integration.webhook/v1"
}
```

### Delivery log (org API)

`GET /v1/orgs/{org_id}/integrations/webhooks/deliveries` returns recent attempts with:

| Field | Description |
|--------|-------------|
| `delivery_id` | Stable id for this attempt row |
| `status` | `pending` (in flight), `success`, `failed` |
| `attempts` / `retry_count` | Server-side tries in the last run (1–3 with backoff) |
| `http_status` / `response_code` | Last HTTP status from the endpoint, if any |
| `last_error` / `error_summary` | Short failure reason (e.g. `http_502`, timeout snippet) |
| `last_attempt_at` | ISO 8601 UTC of last try in that run |
| `created_at` / `completed_at` | When the row was opened / finalized |
| `event_type`, `object_type`, `object_id` | Copy of the dispatched event routing |

Admin **Retry** re-posts using the same `event_type`, `object_type`, `object_id`, and stored `summary` when available (summary includes `admin_delivery_replay` flags). Legacy rows without a stored summary use a minimal replay payload.

### Retries

Failed deliveries are retried **within the same delivery** up to three times with backoff (0s, 1s, 4s). Each attempt updates `attempts`, `last_attempt_at`, and `http_status` / `last_error`. Admin replay from the UI creates a **new** delivery row.

---

## Document layout analysis (`claw.document_layout.v1`)

Produced by `run_layout_analysis` / `GET /v1/document-layout/analysis/{analysis_id}` (enriched for API). Important top-level fields:

- `analysis_id`, `document_id_ref`, `content_sha256_analyzed`, `page_count`
- `pages` — spatial text/layout slices for review UIs.
- `field_candidates` — detected boxes with `candidate_id`, `field_type_guess`, `confidence`, `bbox_normalized`, etc.
- `likely_signable_regions` — subset for e-sign–style placement.
- `downstream_field_manifest` — after enrichment / review: manifest for integration consumers (see `enrich_analysis_for_api`).

`summary` in webhooks for `document.analysis.completed` includes counts and optional `document_id_ref`, not full candidate arrays.

---

## Field review manifest

`PUT /v1/document-layout/analysis/{analysis_id}/review-manifest` accepts `{ "actions": [ ... ] }` (confirm, correct, reject, add_manual, etc.). On success, `field.review.completed` fires with `action_count` and stable `analysis_id` as `object_id`.

---

## Agreement lifecycle (machine-readable)

- **Status label** for integrations: `GET /v1/integration/agreements/{agreement_id}/status` returns `schema: claw.integration.agreement_status/v1` with `status`, `review_sent_at`, and economics overlay — same ownership rules as core APIs.

---

## Inbound integration aliases (`/v1/integration`)

All require the same auth model as core routes: **`X-Claw-Org-Id`** plus existing ownership checks where applicable.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/integration/agreements/draft` | Create agreement draft (wraps agreements API). |
| POST | `/v1/integration/documents/analyze` | Run document layout analysis (requires org header). |
| POST | `/v1/integration/layout/{analysis_id}/localize` | Natural-language field localization query. |
| GET | `/v1/integration/layout/{analysis_id}/fields` | Review-ready field map. |
| POST | `/v1/integration/agreements/{agreement_id}/send` | Trigger review-sent workflow. |
| GET | `/v1/integration/agreements/{agreement_id}/status` | Agreement status summary. |
| POST | `/v1/integration/memory/search` | Agreement Memory search (tier gated). |

Org admin webhook configuration:

- `GET/POST /v1/orgs/{org_id}/integrations/webhooks`
- `PATCH/DELETE /v1/orgs/{org_id}/integrations/webhooks/{hook_id}`
- `POST .../rotate-secret`, `GET .../webhooks/deliveries`, `POST .../deliveries/{delivery_id}/retry`

Path `org_id` **must** match `X-Claw-Org-Id`.

---

## Versioning policy

- Webhook **`version`** field bumps when payload shape changes (e.g. to `claw.integration.webhook/v2`).
- New optional `summary` keys are backward compatible; removing or renaming fields requires a new `version`.
- Integration response schemas include a `schema` string where applicable (e.g. agreement status).

---

## Audit events (server logs)

Structured logs include: `webhook_registered`, `webhook_delivery_succeeded`, `webhook_delivery_failed`, `webhook_secret_rotated`, `integration_settings_opened`.
