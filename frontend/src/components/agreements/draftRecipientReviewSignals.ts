import type { AgreementDraft } from "../../agreement/agreementTypes";

/** True when a recipient (or participant) approval event exists on the draft audit log. */
export function draftAuditHasRecipientRecordedApproval(draft: unknown): boolean {
  const log = (draft as { audit_log?: AgreementDraft["audit_log"] | null } | null | undefined)?.audit_log;
  if (!Array.isArray(log) || log.length === 0) return false;
  return log.some((e) => {
    const t = String(e?.event_type || "").trim();
    return t === "recipient_approved" || t === "participant_approved";
  });
}

/** When true, do not persist paid-pro edit-return snapshot on “Back to draft” (server draft is source of truth). */
export function shouldWritePaidProEditReturnHandoffAfterReview(
  draft: AgreementDraft | null | undefined,
  hasRecoverableBody: boolean,
): boolean {
  if (!draft || !hasRecoverableBody) return false;
  return !draftAuditHasRecipientRecordedApproval(draft);
}

/** Dev / QA: `localStorage.lawdogOwnerReviewReturnDiag = "1"` */
export function logOwnerReviewReturnState(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogOwnerReviewReturnDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[owner-review-return-state]", payload);
}

/** Dev / QA: `localStorage.lawdogOwnerReviewLinkStatusDiag = "1"` (also honors `lawdogOwnerReviewReturnDiag`). */
export function logOwnerReviewLinkStatus(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogOwnerReviewLinkStatusDiag") === "1" ||
    window.localStorage?.getItem("lawdogOwnerReviewReturnDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[owner-review-link-status]", payload);
}

/** Dev / QA: same flags as {@link logOwnerReviewLinkStatus} + `lawdogOwnerFinalizeRouteDiag`. */
export function logOwnerFinalizeRouteDecision(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogOwnerFinalizeRouteDiag") === "1" ||
    window.localStorage?.getItem("lawdogOwnerReviewLinkStatusDiag") === "1" ||
    window.localStorage?.getItem("lawdogOwnerReviewReturnDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[owner-finalize-route-decision]", payload);
}
