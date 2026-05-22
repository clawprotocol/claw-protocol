/**
 * Pre–final-review signer capture — logging and copy (agreement-family agnostic).
 */

export {
  GUIDED_SIGNER_SETUP_HEADLINE,
  GUIDED_SIGNER_SETUP_BACKGROUND_SUBCOPY,
  GUIDED_SIGNER_SETUP_APPLY_COMPLETE_SUBCOPY,
  GUIDED_SIGNER_SETUP_BACKGROUND_SUBCOPY as GUIDED_SIGNER_SETUP_SUBCOPY,
} from "./guidedAnswerApplyOrchestration";
export const GUIDED_SIGNER_SETUP_CTA = "Add signer / reviewer details";
export const GUIDED_SIGNER_SETUP_APPLY_CTA = "Apply answers and prepare review";
export const GUIDED_APPLYING_HEADLINE = "Updating your Pro agreement…";

export function formatGuidedApplyingSubcopy(_answerCount?: number): string {
  return "Applying your answers to the Pro agreement…";
}

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

export function logSignerSetupIncomplete(payload: {
  filledCount: number;
  requiredCount: number;
  incompleteIndices: readonly number[];
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-setup-incomplete]", payload);
}

export function logSignerSetupFieldPersisted(field: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-setup-field-persisted]", { field });
}

export function logGuidedApplyExplicitlyStarted(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-apply-explicitly-started]");
}

export function logGuidedApplyDeduped(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-apply-deduped]");
}

export function logBlockedAutoNavigationWhileSignersEditing(context: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[blocked-auto-navigation-while-signers-editing]", { context });
}

export function logGuidedFinalReviewBlockedSignersIncomplete(payload: {
  filledCount: number;
  requiredCount: number;
  incompleteIndices: readonly number[];
  applyStatus: string;
  isEditing: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-blocked-signers-incomplete]", payload);
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
