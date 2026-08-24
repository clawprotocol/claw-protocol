/**
 * AgreementBuilderIntake final review visible plain — commercial-locked branch when
 * verified GET is absent (premiumCompletion restore / ask-then-generate).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN } from "./paidProFirstReviewDisplayAuthority";
import { sanitizePaidProReviewPlainForIntakeAuthority } from "./paidProReviewRenderCorpus";
import { repairCheckoutBackRestoreDraftParties } from "./checkoutBackRestore";

export function resolveCommercialLockedSimpleProFinalReviewPlain(args: {
  displayPolishedPaidProPlain: string | null | undefined;
}): string | null {
  const plain = (args.displayPolishedPaidProPlain || "").trim();
  if (plain.length >= PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN) {
    return plain;
  }
  return null;
}

/** Re-apply intake-authority opening/scope seal after display polish mutates the recital. */
export function resealPaidProReviewPlainAfterDisplayPolish(args: {
  polishedPlain: string;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): string {
  const intake = (args.intakeText ?? "").trim();
  const draft =
    args.draft && intake.length >= 20
      ? repairCheckoutBackRestoreDraftParties(args.draft, intake)
      : args.draft ?? null;
  return sanitizePaidProReviewPlainForIntakeAuthority({
    text: args.polishedPlain,
    draft,
    intakeText: intake,
  });
}
