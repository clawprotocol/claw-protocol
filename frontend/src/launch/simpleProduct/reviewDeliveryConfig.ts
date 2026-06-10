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
  const m = String(readReviewDeliveryModeEnvRaw() || "manual")
    .trim()
    .toLowerCase();
  if (VALID.has(m)) return m as ReviewDeliveryMode;
  return "manual";
}

export function reviewDeliveryModeAllowsEmailSend(mode: ReviewDeliveryMode): boolean {
  return mode === "email" || mode === "manual_and_email";
}

/** Raw ``VITE_REVIEW_DELIVERY_MODE`` before defaulting (empty when unset at build time). */
export function readReviewDeliveryModeEnvRaw(): string {
  const fromImportMeta = String(
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: { VITE_REVIEW_DELIVERY_MODE?: string } }).env?.VITE_REVIEW_DELIVERY_MODE) ||
      "",
  ).trim();
  if (fromImportMeta) return fromImportMeta;
  if (typeof process !== "undefined") {
    return String(process.env.VITE_REVIEW_DELIVERY_MODE ?? "").trim();
  }
  return "";
}

/** True only when the build explicitly sets manual (not when the env var is omitted). */
export function isReviewDeliveryModeExplicitlyManual(): boolean {
  return readReviewDeliveryModeEnvRaw().toLowerCase() === "manual";
}
