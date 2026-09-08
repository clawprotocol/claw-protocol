/**
 * Assert at most one premium-full-draft checkout orchestration call unless explicit Retry Pro draft.
 * Network ledger tracks each HTTP premium-full-draft request (including structural retries).
 */

import { readSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { paidProPerfTraceEnabled, paidProVerboseDetailLogsEnabled } from "./paidProPerfLogging";

export type PremiumGenerationCallReason =
  | "checkout_completion"
  | "entitled_rewrite"
  | "explicit_retry_pro_draft"
  | "hydration_snapshot_miss"
  | "unknown";

export type PremiumNetworkCallReason =
  | "checkout_completion"
  | "degraded_structural_retry"
  | "similarity_regeneration"
  | "dev_context_regen"
  | "founder_title_retry"
  | "explicit_retry_pro_draft"
  | "unknown";

export type PremiumGenerationCallRecord = {
  at: number;
  reason: PremiumGenerationCallReason;
  intakeFingerprint: string;
  agreementGenerationId: string | null;
  /** True once fetch() for this orchestration actually started (OPTIONS/POST). */
  httpFired?: boolean;
};

export type PremiumNetworkCallRecord = {
  at: number;
  reason: PremiumNetworkCallReason;
  attempt: number;
  intakeFingerprint: string;
  agreementGenerationId: string | null;
  responseBodyLen?: number;
  documentTextLen?: number;
  serverFullDocumentTextLen?: number;
  generationOutcome?: string;
  failureCode?: string;
};

let records: PremiumGenerationCallRecord[] = [];
let networkRecords: PremiumNetworkCallRecord[] = [];
let explicitRetryArmed = false;
/** Process-global entitled rewrite latch — a remounted instance's useRef is fresh. */
let entitledPremiumRewriteProcessInFlight = false;
let lastEntitledRewriteGenerationId: string | null = null;

export function armExplicitPremiumGenerationRetry(): void {
  explicitRetryArmed = true;
}

export function clearPremiumGenerationCallAudit(): void {
  records = [];
  networkRecords = [];
  explicitRetryArmed = false;
  entitledPremiumRewriteProcessInFlight = false;
  lastEntitledRewriteGenerationId = null;
}

export function isEntitledPremiumRewriteProcessInFlight(): boolean {
  return entitledPremiumRewriteProcessInFlight;
}

/**
 * Latch generate across remounts. False if another instance already started
 * the same generation. A new generation id steals a stuck leftover latch.
 */
export function tryBeginEntitledPremiumRewriteProcessInFlight(opts?: {
  agreementGenerationId?: string | null;
}): boolean {
  const genId = (opts?.agreementGenerationId ?? "").trim();
  if (
    entitledPremiumRewriteProcessInFlight &&
    genId &&
    lastEntitledRewriteGenerationId !== genId
  ) {
    entitledPremiumRewriteProcessInFlight = false;
  }
  if (entitledPremiumRewriteProcessInFlight) return false;
  entitledPremiumRewriteProcessInFlight = true;
  if (genId) lastEntitledRewriteGenerationId = genId;
  return true;
}

export function releaseEntitledPremiumRewriteProcessInFlight(): void {
  entitledPremiumRewriteProcessInFlight = false;
}

export function releaseEntitledPremiumRewriteInFlightLatch(ref: { current: boolean }): void {
  ref.current = false;
  entitledPremiumRewriteProcessInFlight = false;
}

/**
 * After Pro Review settle, drop generate rows that already POSTed so a second
 * homepage dump is not leftover-blocked. Keep in-flight until rewrite `finally`
 * so the auto-rewrite effect cannot re-enter mid-settle.
 */
export function releaseSettledPremiumGenerateInvokes(): void {
  records = records.filter(
    (r) => !(isPremiumGenerateDedupeReason(r.reason) && r.httpFired),
  );
}

/**
 * New generation / Review→Home remount: drop other-gen and fingerprint-only
 * generate leftovers, and release a stuck process-global latch from the prior dump.
 */
export function releasePremiumGenerateInvokeForNewGeneration(
  agreementGenerationId?: string | null,
): void {
  const genId = (agreementGenerationId ?? "").trim();
  if (!genId) return;
  records = records.filter((r) => {
    if (!isPremiumGenerateDedupeReason(r.reason)) return true;
    const rowId = resolveRecordedGenerationId(r);
    if (!rowId) return false;
    return rowId === genId;
  });
  lastEntitledRewriteGenerationId = genId;
}

export function recordPremiumNetworkCall(args: {
  reason: PremiumNetworkCallReason;
  intakeFingerprint: string;
  agreementGenerationId?: string | null;
  responseBodyLen?: number;
  documentTextLen?: number;
  serverFullDocumentTextLen?: number;
  generationOutcome?: string | null;
  failureCode?: string | null;
}): PremiumNetworkCallRecord {
  const row: PremiumNetworkCallRecord = {
    at: Date.now(),
    reason: args.reason,
    attempt: networkRecords.length + 1,
    intakeFingerprint: args.intakeFingerprint,
    agreementGenerationId: args.agreementGenerationId ?? null,
    responseBodyLen: args.responseBodyLen,
    documentTextLen: args.documentTextLen,
    serverFullDocumentTextLen: args.serverFullDocumentTextLen,
    generationOutcome: (args.generationOutcome ?? "").trim() || undefined,
    failureCode: (args.failureCode ?? "").trim() || undefined,
  };
  networkRecords.push(row);
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
    if (paidProPerfTraceEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[premium-network-call]", row);
    } else if (paidProVerboseDetailLogsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[paid-pro-premium-network-call]", row);
    }
  }
  return row;
}

export function readPremiumNetworkCallRecords(): readonly PremiumNetworkCallRecord[] {
  return networkRecords;
}

export function assertTest225PremiumNetworkCallBudget(): void {
  if (networkRecords.length > 2) {
    throw new Error(`test225_too_many_premium_network_calls:${networkRecords.length}`);
  }
  if (networkRecords.length >= 1 && networkRecords[0].reason !== "checkout_completion") {
    throw new Error(`test225_first_call_not_checkout:${networkRecords[0].reason}`);
  }
  if (networkRecords.length === 2) {
    const second = networkRecords[1].reason;
    const allowed: PremiumNetworkCallReason[] = [
      "degraded_structural_retry",
      "similarity_regeneration",
      "dev_context_regen",
      "founder_title_retry",
      "explicit_retry_pro_draft",
    ];
    if (!allowed.includes(second)) {
      throw new Error(`test225_unexpected_second_call:${second}`);
    }
  }
  const checkoutOrchestration = records.filter((r) => r.reason === "checkout_completion");
  if (checkoutOrchestration.length > 1) {
    throw new Error(`test225_duplicate_checkout_orchestration:${checkoutOrchestration.length}`);
  }
}

/**
 * Identity of a single generation attempt. TEST552 — the audit ledger is process-global and is
 * never cleared in production (`clearPremiumGenerationCallAudit` is test-only), so a per-process
 * "at most one checkout" rule mislabelled a genuinely NEW generation (fresh agreement / new
 * generation id) as a duplicate checkout. The pipeline then skipped the network call
 * (`duplicate_checkout_premium_call`) and rendered a thin fallback_preview — the recurring empty
 * Review. Scope duplicate detection to the current generation attempt: a prior checkout only
 * collides when it belongs to the SAME generation id (or the same intake fingerprint when no id is
 * present). Same-generation double-fires (React re-mount / double-invoke) are still blocked; armed
 * explicit retries still bypass.
 *
 * #229 — entitled homepage dump uses `entitled_rewrite`. Treat that as the same generate-invoke
 * family as checkout so a remount double-submit is deduped, but never let a fingerprint-only
 * leftover (no generation id) reject a fresh named-2p create that has a real generation id.
 * A recorded invoke that never started HTTP (OPTIONS-only / aborted) is released so the
 * legitimate first POST can still fire.
 *
 * #230 — after a successful first dump the ledger / process-global in-flight still blocked
 * the second Northline dump in the same tab (OPTIONS-only). Release settled rows and
 * other-generation leftovers on settle, home bump, or a new generation id.
 */
export function isPremiumGenerateDedupeReason(reason: PremiumGenerationCallReason): boolean {
  return reason === "checkout_completion" || reason === "entitled_rewrite";
}

function resolveRecordedGenerationId(row: {
  agreementGenerationId?: string | null;
}): string {
  return (row.agreementGenerationId ?? "").trim();
}

function generationIdentityKey(row: {
  agreementGenerationId?: string | null;
  intakeFingerprint?: string | null;
}): string {
  const genId = resolveRecordedGenerationId(row);
  if (genId) return `gen:${genId}`;
  return `fp:${(row.intakeFingerprint ?? "").trim()}`;
}

function resolveNewCallGenerationId(args: {
  agreementGenerationId?: string | null;
}): string | null {
  const explicit = (args.agreementGenerationId ?? "").trim();
  if (explicit) return explicit;
  return readSessionAgreementGenerationId();
}

export function recordPremiumFullDraftCall(args: {
  reason: PremiumGenerationCallReason;
  intakeFingerprint: string;
  agreementGenerationId?: string | null;
}): { callIndex: number; duplicateBlocked: boolean } {
  const resolvedGenId = resolveNewCallGenerationId(args);
  if (resolvedGenId) {
    releasePremiumGenerateInvokeForNewGeneration(resolvedGenId);
  }
  const identityKey = generationIdentityKey({
    agreementGenerationId: resolvedGenId,
    intakeFingerprint: args.intakeFingerprint,
  });
  const priorGenerate = records.filter(
    (r) => isPremiumGenerateDedupeReason(r.reason) && generationIdentityKey(r) === identityKey,
  );
  const isRetry = args.reason === "explicit_retry_pro_draft" || explicitRetryArmed;
  const duplicateBlocked =
    isPremiumGenerateDedupeReason(args.reason) && priorGenerate.length >= 1 && !isRetry;

  if (!duplicateBlocked) {
    records.push({
      at: Date.now(),
      reason: args.reason,
      intakeFingerprint: args.intakeFingerprint,
      agreementGenerationId: resolvedGenId,
      httpFired: false,
    });
    if (args.reason === "explicit_retry_pro_draft") explicitRetryArmed = false;
  }

  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-premium-generation-call]", {
      reason: args.reason,
      callIndex: records.length,
      duplicateBlocked,
      priorGenerate: priorGenerate.length,
      identityKey,
      explicitRetryArmed,
    });
  }

  return { callIndex: records.length, duplicateBlocked };
}

/** Mark that fetch() actually started for this generation identity. */
export function markPremiumFullDraftHttpFired(args: {
  agreementGenerationId?: string | null;
  intakeFingerprint?: string | null;
}): void {
  const key = generationIdentityKey({
    agreementGenerationId: resolveNewCallGenerationId(args),
    intakeFingerprint: args.intakeFingerprint,
  });
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (generationIdentityKey(records[i]) === key) {
      records[i].httpFired = true;
      return;
    }
  }
}

/**
 * Drop a same-identity generate invoke that never started HTTP so a remount / first
 * Northline dump can POST. True double-submits that already called fetch stay recorded.
 */
export function releasePremiumFullDraftCallIfHttpNeverFired(args: {
  agreementGenerationId?: string | null;
  intakeFingerprint?: string | null;
}): boolean {
  const key = generationIdentityKey({
    agreementGenerationId: resolveNewCallGenerationId(args),
    intakeFingerprint: args.intakeFingerprint,
  });
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const row = records[i];
    if (generationIdentityKey(row) !== key) continue;
    if (row.httpFired) return false;
    records.splice(i, 1);
    return true;
  }
  return false;
}

export function readPremiumGenerationCallRecords(): readonly PremiumGenerationCallRecord[] {
  return records;
}

export function assertAtMostOneCheckoutPremiumGenerationCall(): void {
  // TEST552 — assert at most one checkout orchestration PER generation attempt, not per process.
  // The ledger persists for the tab's lifetime, so a per-process count threw (or masked defects)
  // once a second agreement / generation legitimately ran in the same tab.
  const perGeneration = new Map<string, number>();
  for (const r of records) {
    if (r.reason !== "checkout_completion") continue;
    const key = generationIdentityKey(r);
    perGeneration.set(key, (perGeneration.get(key) ?? 0) + 1);
  }
  for (const [key, count] of perGeneration) {
    if (count > 1) {
      throw new Error(`duplicate_premium_full_draft_checkout:${key}:${count}`);
    }
  }
}
