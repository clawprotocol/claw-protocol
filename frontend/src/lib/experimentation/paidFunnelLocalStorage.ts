/**
 * Browser-local paid conversion funnel (LawDog Pro path). Read by `/app/ops/paid-funnel` operator debug panel.
 * Ring buffer — does not replace server-side telemetry.
 */

export const PAID_FUNNEL_EVENT_STORAGE_KEY = "lawdog_paid_funnel_events_v1";

const MAX_EVENTS = 5000;

export type PaidFunnelEventName =
  | "free_draft_generated"
  | "premium_upsell_seen"
  | "premium_checkout_opened"
  | "premium_checkout_completed"
  | "premium_success_banner_seen"
  | "premium_continue_recipients_clicked"
  | "recipient_setup_opened"
  | "agreement_sent"
  | "send_abandoned_after_payment";

/** Sequential funnel steps (abandon is tracked separately in the operator UI). */
export const PAID_FUNNEL_LINEAR_STEPS: readonly PaidFunnelEventName[] = [
  "free_draft_generated",
  "premium_upsell_seen",
  "premium_checkout_opened",
  "premium_checkout_completed",
  "premium_success_banner_seen",
  "premium_continue_recipients_clicked",
  "recipient_setup_opened",
  "agreement_sent",
] as const;

/** All steps in display order (abandonment after main path). */
export const PAID_FUNNEL_DISPLAY_ORDER: readonly PaidFunnelEventName[] = [
  ...PAID_FUNNEL_LINEAR_STEPS,
  "send_abandoned_after_payment",
] as const;

export type PaidFunnelStoredRow = {
  name: string;
  ts: number;
  session_id: string;
  agreement_intent_id?: string;
  device?: "mobile" | "desktop";
  premium_generation_outcome?: string;
  render_source?: string;
  /** Why a later `premium_checkout_completed` row was written (e.g. client truth-gate). */
  funnel_block_reason?: string;
};

function normalizeRow(x: unknown): PaidFunnelStoredRow | null {
  if (x == null || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.ts !== "number" || typeof o.session_id !== "string") {
    return null;
  }
  const device = o.device === "mobile" || o.device === "desktop" ? o.device : undefined;
  return {
    name: o.name,
    ts: o.ts,
    session_id: o.session_id,
    agreement_intent_id: typeof o.agreement_intent_id === "string" ? o.agreement_intent_id : undefined,
    device,
    premium_generation_outcome: typeof o.premium_generation_outcome === "string" ? o.premium_generation_outcome : undefined,
    render_source: typeof o.render_source === "string" ? o.render_source : undefined,
    funnel_block_reason: typeof o.funnel_block_reason === "string" ? o.funnel_block_reason : undefined,
  };
}

export function loadPaidFunnelEvents(): PaidFunnelStoredRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PAID_FUNNEL_EVENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: PaidFunnelStoredRow[] = [];
    for (const p of parsed) {
      const n = normalizeRow(p);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

export function clearPaidFunnelEvents(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PAID_FUNNEL_EVENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Appends a row (used by create-flow instrumentation). Public for tests.
 */
export function appendPaidFunnelEvent(row: PaidFunnelStoredRow, maxEvents: number = MAX_EVENTS): void {
  if (typeof window === "undefined") return;
  try {
    const prev = loadPaidFunnelEvents();
    const next = [...prev, row].slice(-maxEvents);
    window.localStorage.setItem(PAID_FUNNEL_EVENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * Replaces missing / `custom_unknown` agreement_intent_id for rows in the same LawDog session
 * when a later event resolves to a concrete intent. Preserves all other row fields; ring buffer size is unchanged.
 */
export function backfillPaidFunnelIntentForSession(
  sessionId: string,
  agreement_intent_id: string,
  maxEvents: number = MAX_EVENTS,
): void {
  if (typeof window === "undefined" || !sessionId) return;
  if (!agreement_intent_id || agreement_intent_id === "custom_unknown") return;
  try {
    const prev = loadPaidFunnelEvents();
    let changed = false;
    const next = prev.map((r) => {
      if (r.session_id !== sessionId) return r;
      if (r.agreement_intent_id && r.agreement_intent_id !== "custom_unknown") return r;
      if (r.agreement_intent_id === agreement_intent_id) return r;
      changed = true;
      return { ...r, agreement_intent_id };
    });
    if (changed) {
      window.localStorage.setItem(
        PAID_FUNNEL_EVENT_STORAGE_KEY,
        JSON.stringify(next.slice(-maxEvents)),
      );
    }
  } catch {
    /* ignore */
  }
}

export function buildPaidFunnelRowFromPayload(
  name: PaidFunnelEventName,
  ts: number,
  payload: Record<string, unknown>,
): PaidFunnelStoredRow {
  const session_id = String(payload.session_id ?? "");
  const device = payload.device === "mobile" || payload.device === "desktop" ? payload.device : undefined;
  return {
    name,
    ts,
    session_id,
    agreement_intent_id: typeof payload.agreement_intent_id === "string" ? payload.agreement_intent_id : undefined,
    device,
    premium_generation_outcome: typeof payload.premium_generation_outcome === "string" ? payload.premium_generation_outcome : undefined,
    render_source: typeof payload.render_source === "string" ? payload.render_source : undefined,
    funnel_block_reason: typeof payload.funnel_block_reason === "string" ? payload.funnel_block_reason : undefined,
  };
}
