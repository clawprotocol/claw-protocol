/**
 * Pre–final-review signer capture — logging and copy (agreement-family agnostic).
 */

export const GUIDED_SIGNER_SETUP_HEADLINE = "Add signers before final review";
export const GUIDED_SIGNER_SETUP_SUBCOPY =
  "Add signer or reviewer emails now. LawDog will apply your guided answers in the background, then show the updated agreement for final review.";
export const GUIDED_SIGNER_SETUP_CTA = "Add signer / reviewer details";

export function logSignerSetupActive(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-setup-active]");
}

export function logSignerSetupWriteDeduped(field: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-setup-write-deduped]", { field });
}

export function logSignerSetupComplete(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-setup-complete]");
}

export function logBlockedAutoNavigationWhileSignersEditing(context: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[blocked-auto-navigation-while-signers-editing]", { context });
}

export function logPostApplyQualityWarningNonblocking(reasons: readonly string[]): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[post-apply-quality-warning-nonblocking]", { reasons });
}

export function logGuidedApplyingStuckCleared(payload: { bodyLen: number; phase: string }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-applying-stuck-cleared]", payload);
}
