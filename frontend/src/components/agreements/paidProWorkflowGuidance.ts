/**
 * Paid Pro workflow discoverability copy (Test216) — UX guidance only, no corpus/SoT changes.
 */

export const PAID_PRO_WORKFLOW_TOTAL_STEPS = 4;

export const PAID_PRO_REVIEW_STEP_LABEL = "Step 3 of 4";

export const PAID_PRO_REVIEW_STEP_HEADLINE = "Signer details next";

export const PAID_PRO_REVIEW_STEP_NEXT_PREFIX = "Next:";

export const PAID_PRO_REVIEW_STEP_NEXT_SIGNER_SETUP =
  "Add signer details to create signature links. No one signs on this step.";

export const PAID_PRO_REVIEW_STEP_NEXT_SIGNATURE_PREP =
  "Prepare signature links when you are ready. Signing happens only after you share a link.";

export const PAID_PRO_SIGNER_SETUP_ORIENTATION_HEADLINE = "Add signer details";

export const PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY =
  "Enter who will sign for each party. No one signs here — LawDog creates signature links only after you confirm.";

export const PAID_PRO_SIGNER_SETUP_WORKFLOW_TRAIL =
  "Review → Signer details → Signature links → Signing";

export const PAID_PRO_STICKY_CTA_DIRECTION_LABEL = "Continue below";

export const PAID_PRO_STICKY_CTA_DIRECTION_SUBLABEL = "Next step";

export const PAID_PRO_STICKY_CTA_DIRECTION_ARIA =
  "Primary action continues in the sticky bar below the agreement";

export function resolvePaidProReviewNextStepCopy(args: {
  signersReady: boolean;
  /** Compact paid review shell — skip redundant step callout. */
  compactShell?: boolean;
}): {
  stepLabel: string;
  headline: string;
  nextLine: string;
  showCallout: boolean;
} {
  if (args.compactShell) {
    return {
      stepLabel: "",
      headline: "",
      nextLine: "",
      showCallout: false,
    };
  }
  return {
    stepLabel: PAID_PRO_REVIEW_STEP_LABEL,
    headline: PAID_PRO_REVIEW_STEP_HEADLINE,
    nextLine: args.signersReady
      ? PAID_PRO_REVIEW_STEP_NEXT_SIGNATURE_PREP
      : PAID_PRO_REVIEW_STEP_NEXT_SIGNER_SETUP,
    showCallout: true,
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
