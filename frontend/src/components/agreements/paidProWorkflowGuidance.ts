/**
 * Paid Pro workflow discoverability copy (Test216) — UX guidance only, no corpus/SoT changes.
 */

export const PAID_PRO_WORKFLOW_TOTAL_STEPS = 4;

export const PAID_PRO_REVIEW_STEP_LABEL = "Step 3 of 4";

export const PAID_PRO_REVIEW_STEP_HEADLINE = "Review your agreement";

export const PAID_PRO_REVIEW_STEP_NEXT_PREFIX = "Next:";

export const PAID_PRO_REVIEW_STEP_NEXT_SIGNER_SETUP =
  "Add signer details so LawDog can prepare signature links. You are not signing yet — this step only collects signer information.";

export const PAID_PRO_REVIEW_STEP_NEXT_SIGNATURE_PREP =
  "Continue below to finish signer details or prepare signature links. Signing happens after you confirm and share links.";

export const PAID_PRO_SIGNER_SETUP_ORIENTATION_HEADLINE = "Signer details — not signing yet";

export const PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY =
  "This step prepares signer information. No signatures are collected here. After signer details are added, LawDog will prepare signature links for you to review and share.";

export const PAID_PRO_SIGNER_SETUP_WORKFLOW_TRAIL =
  "Review → Signer details → Signature preparation → Signing";

export const PAID_PRO_STICKY_CTA_DIRECTION_LABEL = "Continue below";

export const PAID_PRO_STICKY_CTA_DIRECTION_SUBLABEL = "Next step";

export const PAID_PRO_STICKY_CTA_DIRECTION_ARIA =
  "Primary action continues in the sticky bar below the agreement";

export function resolvePaidProReviewNextStepCopy(args: { signersReady: boolean }): {
  stepLabel: string;
  headline: string;
  nextLine: string;
} {
  return {
    stepLabel: PAID_PRO_REVIEW_STEP_LABEL,
    headline: PAID_PRO_REVIEW_STEP_HEADLINE,
    nextLine: args.signersReady
      ? PAID_PRO_REVIEW_STEP_NEXT_SIGNATURE_PREP
      : PAID_PRO_REVIEW_STEP_NEXT_SIGNER_SETUP,
  };
}

const PAID_PRO_CTA_CUE_SEEN_KEY = "lawdog.paidPro.ctaDirectionCue.seen.v1";

export function shouldShowPaidProCtaDirectionPulse(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(PAID_PRO_CTA_CUE_SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markPaidProCtaDirectionCueSeen(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PAID_PRO_CTA_CUE_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Test-only */
export function resetPaidProCtaDirectionCueSeenForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PAID_PRO_CTA_CUE_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
