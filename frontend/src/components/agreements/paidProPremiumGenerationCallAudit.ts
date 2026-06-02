/**
 * Assert at most one premium-full-draft call per checkout unless explicit user Retry Pro draft.
 */

export type PremiumGenerationCallReason =
  | "checkout_completion"
  | "entitled_rewrite"
  | "explicit_retry_pro_draft"
  | "hydration_snapshot_miss"
  | "unknown";

export type PremiumGenerationCallRecord = {
  at: number;
  reason: PremiumGenerationCallReason;
  intakeFingerprint: string;
  agreementGenerationId: string | null;
};

let records: PremiumGenerationCallRecord[] = [];
let explicitRetryArmed = false;

export function armExplicitPremiumGenerationRetry(): void {
  explicitRetryArmed = true;
}

export function clearPremiumGenerationCallAudit(): void {
  records = [];
  explicitRetryArmed = false;
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
