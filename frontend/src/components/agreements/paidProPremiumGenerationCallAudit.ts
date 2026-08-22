/**
 * Assert at most one premium-full-draft checkout orchestration call unless explicit Retry Pro draft.
 * Network ledger tracks each HTTP premium-full-draft request (including structural retries).
 */

import { paidProPerfTraceEnabled, paidProVerboseDetailLogsEnabled } from "./paidProPerfLogging";

export type PremiumGenerationCallReason =
  | "checkout_completion"
  | "entitled_rewrite"
  | "explicit_retry_pro_draft"
  | "post_generate_tenet_recall"
  | "hydration_snapshot_miss"
  | "unknown";

export type PremiumNetworkCallReason =
  | "checkout_completion"
  | "degraded_structural_retry"
  | "similarity_regeneration"
  | "dev_context_regen"
  | "founder_title_retry"
  | "post_generate_tenet_recall"
  | "explicit_retry_pro_draft"
  | "unknown";

export type PremiumGenerationCallRecord = {
  at: number;
  reason: PremiumGenerationCallReason;
  intakeFingerprint: string;
  agreementGenerationId: string | null;
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

export function armExplicitPremiumGenerationRetry(): void {
  explicitRetryArmed = true;
}

export function clearPremiumGenerationCallAudit(): void {
  records = [];
  networkRecords = [];
  explicitRetryArmed = false;
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
      "post_generate_tenet_recall",
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
 */
function generationIdentityKey(row: {
  agreementGenerationId?: string | null;
  intakeFingerprint?: string | null;
}): string {
  const genId = (row.agreementGenerationId ?? "").trim();
  if (genId) return `gen:${genId}`;
  return `fp:${(row.intakeFingerprint ?? "").trim()}`;
}

export function recordPremiumFullDraftCall(args: {
  reason: PremiumGenerationCallReason;
  intakeFingerprint: string;
  agreementGenerationId?: string | null;
}): { callIndex: number; duplicateBlocked: boolean } {
  const identityKey = generationIdentityKey(args);
  const priorCheckout = records.filter(
    (r) => r.reason === "checkout_completion" && generationIdentityKey(r) === identityKey,
  ).length;
  const isRetry = args.reason === "explicit_retry_pro_draft" || explicitRetryArmed;
  const duplicateBlocked =
    args.reason === "checkout_completion" && priorCheckout >= 1 && !isRetry;

  if (!duplicateBlocked) {
    records.push({
      at: Date.now(),
      reason: args.reason,
      intakeFingerprint: args.intakeFingerprint,
      agreementGenerationId: args.agreementGenerationId ?? null,
    });
    if (args.reason === "explicit_retry_pro_draft") explicitRetryArmed = false;
  }

  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-premium-generation-call]", {
      reason: args.reason,
      callIndex: records.length,
      duplicateBlocked,
      priorCheckout,
      explicitRetryArmed,
    });
  }

  return { callIndex: records.length, duplicateBlocked };
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
