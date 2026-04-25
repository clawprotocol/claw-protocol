# Product events ingestion (stub plan)

**Status:** Not implemented server-side. Frontend can optionally POST when `VITE_CLAW_FEATURE_PRODUCT_EVENTS_INGEST=1` (see `productEventsIngestStub.ts`).

## Purpose

Persist first-party product analytics from the SPA into operator-owned storage for funnels, experiments, and revenue joins — without treating the browser as the system of record.

## Endpoint (future)

- **Method / path:** `POST /api/product-events`
- **Auth:** Session cookie or bearer token aligned with existing org/workspace auth (TBD).
- **Body:** JSON matching `AnalyticsProductEventPayload` in `frontend/src/lib/experimentation/analyticsProductEvent.ts`.

### Request body fields

| Field | Type | Notes |
|--------|------|--------|
| `event_name` | string | e.g. `paywall_shown`, `checkout_completed` |
| `session_id` | string | LawDog session id when present |
| `anonymous_user_id` | string \| null | Optional stable anon key from auth stub |
| `event_ts_ms` | number | Client event time (ms); server may record `received_at` separately |
| `surface` | string \| null | e.g. `post_generation_send`, `billing_page` |
| `experiment` | string \| null | e.g. `send_conversion_paywall` |
| `variant` | string \| null | e.g. `control`, `v1` |
| `agreement_type` | string \| null | When applicable |
| `step_number` | number \| null | Funnel steps |
| `revenue_usd` | number \| null | Attributed list price / unlock amount when known |
| `metadata` | object | Remaining envelope (flow, step, agreementId, …) — **no** agreement body text |

### Response (suggested)

- `202 Accepted` with `{ "ok": true, "id": "<uuid>" }` for async ingest, or `204` for fire-and-forget.

### Idempotency (suggested)

- Client may send `(session_id, event_name, event_ts_ms, dedupe_key)`; server stores dedupe_key optional — **TBD**.

### Privacy

- Same rules as `docs/ops/LAWDOG_ANALYTICS_RUNBOOK.md`: no clause text, no memory queries, no signer PII in `metadata`.

## Backend implementation sketch (Python)

1. Router `POST /product-events` under internal or public API with rate limit.
2. Validate JSON against a Pydantic model mirroring `AnalyticsProductEventPayload`.
3. Append-only table: `product_events(id, received_at, payload_jsonb)` or normalized columns for hot queries.
4. Async worker optional for warehouse export.

## Rollout

1. Ship DB migration + stub handler returning `501` during development.
2. Enable `VITE_CLAW_FEATURE_PRODUCT_EVENTS_INGEST=1` in staging; verify non-blocking failures in browser.
3. Turn on server route; monitor 4xx/5xx and payload size.

## Relation to `/app/ops/growth`

The operator growth dashboard continues to read **browser-local** `localStorage` (`claw_growth_events_v1`). Server ingest is additive for cross-device and production-wide reporting.
