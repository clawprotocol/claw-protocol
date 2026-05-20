import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildPremiumContradictionDocumentNote,
  buildPremiumSituationProfile,
} from "./premiumSituationIntelligence";
import { isWeakStarterPaymentTermsForDisplay } from "./paymentTermsDisplay";
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";
import { draftHasPlaceholderParties } from "./reviewPlaceholderGuard";

export type PremiumDocumentRenderHints = {
  paymentNeedsFinalNumbers: boolean;
  partiesNeedLegalNames: boolean;
  jurisdictionNeedsSelection: boolean;
  /** Situation-aware executive line (shown under document title on Pro paper). */
  executiveFramingLine: string | null;
  /** When intake had contradictory signals — single calm acknowledgment. */
  contradictionDocumentNote: string | null;
};

function isThinCommercialPaymentLine(s: string): boolean {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t || t.length > 220) return false;
  if (t.split(/\s+/).length > 24) return false;
  if (/\binvoic|milestone|retainer|schedule|net\s*\d|late\s+fee|expenses?|tax(es)?|cadence|acceptance\b/i.test(t)) {
    return false;
  }
  return /\$|€|£|\d+\s*%/.test(t);
}

export function computePremiumDocumentRenderHints(
  draft: ParsedDraftShape | null,
  agreementDocumentText: string,
  intakeText?: string | null,
): PremiumDocumentRenderHints {
  const pay = (draft?.payment_terms || "").trim();
  const doc = agreementDocumentText || "";
  const intake = (intakeText || "").trim();
  const paymentNeedsFinalNumbers =
    !pay || isWeakStarterPaymentTermsForDisplay(pay) || isThinCommercialPaymentLine(pay);
  const partiesNeedLegalNames = Boolean(draft && draftHasPlaceholderParties(draft));
  const law = (draft?.jurisdiction || "").trim();
  const jurisdictionNeedsSelection =
    law === PREMIUM_JURISDICTION_PLACEHOLDER.trim() || doc.includes(PREMIUM_JURISDICTION_PLACEHOLDER);

  const profile = intake ? buildPremiumSituationProfile(intake) : null;

  return {
    paymentNeedsFinalNumbers,
    partiesNeedLegalNames,
    jurisdictionNeedsSelection,
    executiveFramingLine: profile?.executiveLine ?? null,
    contradictionDocumentNote: intake ? buildPremiumContradictionDocumentNote(intake) : null,
  };
}
