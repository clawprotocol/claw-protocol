import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolvePremiumCheckoutIntakeCorpus } from "./premiumCheckoutIntakeCorpus";

/**
 * Best-effort deal intake for Pro upgrade / premium completion.
 * Uses session original, checkout-back snapshot, resume fields, and live buffers — not starter preview text.
 */
export function buildUpgradeSourceTextForPremium(args: {
  intakeCombined: string;
  structuredDraft: ParsedDraftShape | null;
  agreementDocumentText: string;
  finalTranscript?: string;
}): string {
  const resolved = resolvePremiumCheckoutIntakeCorpus({
    structuredDraft: args.structuredDraft,
    intakeCombined: args.intakeCombined,
    agreementDocumentText: args.agreementDocumentText,
    finalTranscript: args.finalTranscript,
    minLen: 12,
    allowDocumentFallback: false,
  });
  if (resolved.corpus.length >= 12) return resolved.corpus;
  const doc = args.agreementDocumentText.trim();
  if (doc.length >= 200) return doc;
  return resolved.corpus.trim();
}
