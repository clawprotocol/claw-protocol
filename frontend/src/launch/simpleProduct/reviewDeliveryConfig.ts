export type ReviewDeliveryMode = "manual" | "email" | "manual_and_email";

const VALID: ReadonlySet<string> = new Set(["manual", "email", "manual_and_email"]);

/**
 * How review links are delivered to counterparties.
 * Production default remains ``manual`` until an email service is configured.
 *
 * Railway frontend: set ``VITE_REVIEW_DELIVERY_MODE=manual_and_email`` (or ``email``)
 * so owners route to ``/app`` after review-first send instead of ``/app/done/{id}``.
 * Backend must set ``CLAW_REVIEW_DELIVERY_MODE`` to the same mode family.
 */
export function readReviewDeliveryMode(): ReviewDeliveryMode {
  const raw =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: { VITE_REVIEW_DELIVERY_MODE?: string } }).env?.VITE_REVIEW_DELIVERY_MODE) ||
    "";
  const m = String(raw || "manual")
    .trim()
    .toLowerCase();
  if (VALID.has(m)) return m as ReviewDeliveryMode;
  return "manual";
}

export function reviewDeliveryModeAllowsEmailSend(mode: ReviewDeliveryMode): boolean {
  return mode === "email" || mode === "manual_and_email";
}
