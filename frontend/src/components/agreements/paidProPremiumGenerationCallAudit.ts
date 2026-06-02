/**
 * Assert at most one premium-full-draft checkout orchestration call unless explicit Retry Pro draft.
 * Network ledger tracks each HTTP premium-full-draft request (including structural retries).
 */

import { paidProVerboseDetailLogsEnabled } from "./paidProPerfLogging";

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
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test" && paidProVerboseDetailLogsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-premium-network-call]", row);
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

export function recordPremiumFullDraftCall(args: {
  reason: PremiumGenerationCallReason;
  intakeFingerprint: string;
  agreementGenerationId?: string | null;
}): { callIndex: number; duplicateBlocked: boolean } {
  const priorCheckout = records.filter((r) => r.reason === "checkout_completion").length;
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
  const checkoutCalls = records.filter((r) => r.reason === "checkout_completion");
  if (checkoutCalls.length > 1) {
    throw new Error(
      `duplicate_premium_full_draft_checkout:${checkoutCalls.length}`,
    );
  }
}
