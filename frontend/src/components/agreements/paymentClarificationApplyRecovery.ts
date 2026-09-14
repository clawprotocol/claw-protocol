/**
 * Restore Apply prerequisites after a dashboard session reset.
 *
 * Pending payment answers in sessionStorage are not enough. Intake and the
 * structured draft must come from live create state or authorized GET data for
 * the same agreement. Do not invent paper or mark a failed save as applied.
 */

export type PaymentApplyStructuredDraft = {
  title?: string | null;
  purpose?: string | null;
  payment_terms?: string | null;
  agreement_id?: string | null;
  id?: string | null;
};

export type PaymentApplyIntakeSource = "live" | "stored_payment" | "authorized_draft" | "none";
export type PaymentApplyStructuredSource =
  | "live"
  | "premium_snapshot"
  | "authorized_draft"
  | "none";

export function intakeFromAuthorizedDraft(
  draft: PaymentApplyStructuredDraft | null | undefined,
): string {
  if (!draft) return "";
  return (
    [draft.title, draft.purpose, draft.payment_terms].filter(Boolean).join("\n\n").trim() ||
    String(draft.purpose || "").trim()
  );
}

export function authorizedDraftMatchesAgreement(
  draft: PaymentApplyStructuredDraft | null | undefined,
  agreementId: string,
): boolean {
  const expected = String(agreementId || "").trim();
  if (!expected || !draft) return false;
  const actual = String(draft.agreement_id || draft.id || "").trim();
  return !actual || actual === expected;
}

export function resolvePaymentClarificationApplyPrerequisites<T>(args: {
  liveIntake?: string | null;
  storedPaymentIntake?: string | null;
  authorizedDraftIntake?: string | null;
  liveStructuredDraft?: T | null;
  premiumCompletionDraft?: T | null;
  authorizedStructuredDraft?: T | null;
}): {
  intakeText: string;
  structured: T | null;
  intakeSource: PaymentApplyIntakeSource;
  structuredSource: PaymentApplyStructuredSource;
} {
  const liveIntake = String(args.liveIntake || "").trim();
  const storedPaymentIntake = String(args.storedPaymentIntake || "").trim();
  const authorizedDraftIntake = String(args.authorizedDraftIntake || "").trim();
  const intakeText = liveIntake || storedPaymentIntake || authorizedDraftIntake;
  const intakeSource: PaymentApplyIntakeSource = liveIntake
    ? "live"
    : storedPaymentIntake
      ? "stored_payment"
      : authorizedDraftIntake
        ? "authorized_draft"
        : "none";

  const liveStructured = args.liveStructuredDraft ?? null;
  const premiumCompletionDraft = args.premiumCompletionDraft ?? null;
  const authorizedStructuredDraft = args.authorizedStructuredDraft ?? null;
  const structured = liveStructured || premiumCompletionDraft || authorizedStructuredDraft;
  const structuredSource: PaymentApplyStructuredSource = liveStructured
    ? "live"
    : premiumCompletionDraft
      ? "premium_snapshot"
      : authorizedStructuredDraft
        ? "authorized_draft"
        : "none";

  return { intakeText, structured, intakeSource, structuredSource };
}

export function paymentApplyPrerequisitesReady(args: {
  intakeText?: string | null;
  structured?: unknown | null;
}): boolean {
  return Boolean(String(args.intakeText || "").trim() && args.structured);
}

/**
 * After dashboard reset the workspace GET draft is a short structured shell.
 * If authorized intake is materially richer, re-parse that intake instead of
 * treating the shell as a complete Apply draft. Does not invent facts.
 */
export function shouldReparseStructuredDraftFromRecoveredIntake(args: {
  intakeText?: string | null;
  structured?: PaymentApplyStructuredDraft | null;
}): boolean {
  const intake = String(args.intakeText || "").trim();
  if (!intake) return false;
  if (!args.structured) return true;
  const structuredIntake = intakeFromAuthorizedDraft(args.structured);
  return intake.length >= structuredIntake.length + 40;
}
