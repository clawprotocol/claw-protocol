/**
 * Premium checkout modal phase logs — verbose QA only (timeouts stay as console.warn).
 */

import { shouldLogPremiumModalDiagnostic } from "./paidProDiagnosticLogPolicy";

export function logPremiumModalInfo(
  tag:
    | "[premium-modal-enter]"
    | "[premium-modal-stage]"
    | "[premium-modal-exit]"
    | "[premium-modal-timeout-deferred]"
    | "[premium-modal-soft-progress]"
    | "[premium-modal-failopen-suppressed]"
    | "[premium-modal-failopen]"
    | "[premium-modal-inflight-patience-extended]"
    | "[premium-modal-inflight-wait-continued]",
  payload: Record<string, unknown>,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!shouldLogPremiumModalDiagnostic()) return;
  // eslint-disable-next-line no-console
  console.info(tag, payload);
}
