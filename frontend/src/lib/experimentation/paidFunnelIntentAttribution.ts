/**
 * Monotonic paid-funnel `agreement_intent_id` aligned with `resolveAgreementIntentContract`
 * and premium `PremiumFullDraftContextPayload` (deterministic_id / intent_contract).
 * Read by create-flow `resolvePaidFunnelMetadata` — not product UI.
 */

import type { PremiumFullDraftContextPayload } from "../../components/agreements/premiumFullDraftApi";
import {
  mapDeterministicIntentIdToAgreementIntentId,
  resolveAgreementIntentContract,
  type AgreementIntentId,
} from "../../components/agreements/agreementIntentContract";

type ProCtxHolder = { sessionId: string; ctx: PremiumFullDraftContextPayload } | null;

let lastPremiumProContextBySession: ProCtxHolder = null;

/**
 * Call when building the LawDog Pro full-draft request (same `context` the server uses).
 * Scoped by session so a stale tab does not cross-contaminate.
 */
export function setPaidFunnelLastPremiumProContext(
  sessionId: string,
  context: PremiumFullDraftContextPayload | null,
): void {
  if (!context) {
    lastPremiumProContextBySession = null;
    return;
  }
  lastPremiumProContextBySession = { sessionId, ctx: context };
}

function readProContextForSession(sessionId: string): PremiumFullDraftContextPayload | null {
  if (lastPremiumProContextBySession?.sessionId !== sessionId) return null;
  return lastPremiumProContextBySession.ctx;
}

function idFromProContext(ctx: ProDeterministicOnly): AgreementIntentId | null {
  const fromDet = mapDeterministicIntentIdToAgreementIntentId(ctx.deterministic_intent_id);
  if (fromDet) return fromDet;
  // Do not use `intent_contract` alone: it is derived from the same (possibly long / polluted)
  // raw string as the Pro call and can misroute (e.g. estate false positives) while the visible
  // home-path intake is a different, shorter string. The deterministic `clause_pack` id is the
  // stable product signal from `applyDeterministicIntentToPremiumFullDraftContext`.
  return null;
}

type ProDeterministicOnly = Pick<PremiumFullDraftContextPayload, "deterministic_intent_id">;

/**
 * @param longCorpus - longest user/substance string (see `pickLongestPremiumIntakeCorpus` + checkout resolver).
 * @param parserHint - short free-parse slice (title/purpose) when the full corpus is still empty.
 */
export function resolveBestPaidFunnelIntentId(args: {
  sessionId: string;
  longCorpus: string;
  /** Optional: title + purpose (and similar) for early funnel before long corpus is populated. */
  parserHint: string;
  /** If the API ever returns a premium schema key, pass it here (highest priority). */
  serverPremiumSchemaKey?: string | null;
}): AgreementIntentId {
  const serverId = mapServerPremiumIntentKeyToClient(args.serverPremiumSchemaKey);
  const pro = readProContextForSession(args.sessionId);
  const proId = pro ? idFromProContext(pro) : null;

  const c60 = (args.longCorpus || "").replace(/\r\n/g, "\n").trim();
  const id60 = c60 ? resolveAgreementIntentContract(c60).intent_id : null;

  const h = (args.parserHint || "").replace(/\r\n/g, "\n").trim();
  const id40 = h.length >= 16 ? resolveAgreementIntentContract(h).intent_id : null;

  if (serverId && serverId !== "custom_unknown") return serverId;
  if (proId && proId !== "custom_unknown") return proId;
  if (id60 && id60 !== "custom_unknown") return id60;
  if (id40 && id40 !== "custom_unknown") return id40;
  if (id60) return id60;
  if (id40) return id40;
  if (proId) return proId;
  return "custom_unknown";
}

/** Backend `PremiumIntentKey` (subset) when/if echoed on the client. */
function mapServerPremiumIntentKeyToClient(
  k: string | null | undefined,
): AgreementIntentId | null {
  if (!k) return null;
  const m: Record<string, AgreementIntentId> = {
    logo_design: "design_creative",
    founder_equity: "founder_equity_vesting",
    loan: "loan_repayment",
  };
  if (k === "generic") return null;
  return m[k] ?? null;
}

const MONOTONIC_KEY = "lawdog_paid_funnel_monotonic_intent_v1";

type MonotonicPersisted = { session_id: string; agreement_intent_id: AgreementIntentId };

function readMonotonicPersisted(sessionId: string): AgreementIntentId | null {
  if (typeof window === "undefined" || !sessionId) return null;
  try {
    const r = window.sessionStorage.getItem(MONOTONIC_KEY);
    if (!r) return null;
    const p = JSON.parse(r) as MonotonicPersisted;
    if (p?.session_id !== sessionId) return null;
    return p.agreement_intent_id;
  } catch {
    return null;
  }
}

function writeMonotonicPersisted(sessionId: string, id: AgreementIntentId) {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    const row: MonotonicPersisted = { session_id: sessionId, agreement_intent_id: id };
    window.sessionStorage.setItem(MONOTONIC_KEY, JSON.stringify(row));
  } catch {
    /* private mode, quota */
  }
}

/**
 * Stabilizes per-LawDog-session `agreement_intent_id` across /create → checkout → /create
 * (React remount) and spurious `estate_family_admin` from preview-stitched text. Does not
 * change draft generation — analytics only.
 */
export function finalizePaidFunnelMonotonicIntent(sessionId: string, fresh: AgreementIntentId): AgreementIntentId {
  const prior = readMonotonicPersisted(sessionId);
  let out = fresh;
  if (out === "custom_unknown" && prior) {
    out = prior;
  } else if (out === "estate_family_admin" && prior && prior !== "estate_family_admin" && prior !== "custom_unknown") {
    out = prior;
  }
  if (out !== "custom_unknown") {
    writeMonotonicPersisted(sessionId, out);
  }
  return out;
}

export function __resetPaidFunnelIntentAttributionForTests(): void {
  lastPremiumProContextBySession = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(MONOTONIC_KEY);
    } catch {
      /* ignore */
    }
  }
}
