import { buildPremiumAgreementReadonlyHtml } from "../components/agreements/premiumAgreementDocumentHtml";
import { polishProAgreementDisplayLayer } from "../components/agreements/polishProAgreementDisplayLayer";
import { repairDuplicatedEntityPunctuationInDisplay } from "./partyPlaceholderDisplay";

const MIN_CORPUS_FOR_PREMIUM_HTML = 500;

/**
 * Display-only HTML for review surfaces — does not mutate authoritative corpus.
 */
export function buildReviewFirstDocumentDisplayHtml(args: {
  serverHtml: string;
  corpusText?: string | null;
  partyNames?: readonly (string | null | undefined)[] | null;
}): string {
  const corpus = repairDuplicatedEntityPunctuationInDisplay((args.corpusText || "").trim());
  if (corpus.length >= MIN_CORPUS_FOR_PREMIUM_HTML) {
    const polished = polishProAgreementDisplayLayer(corpus).text;
    const names = (args.partyNames || [])
      .map((n) => repairDuplicatedEntityPunctuationInDisplay(String(n ?? "").trim()))
      .filter(Boolean);
    return buildPremiumAgreementReadonlyHtml(polished, {
      signatureSectionMode: "collaboration",
      partyNames: names.length ? names : ["Party A", "Party B"],
      suppressCorpusEmbeddedSignatureForDisplay: false,
      suppressDocumentIntelligenceCallouts: true,
    });
  }
  const inner = repairDuplicatedEntityPunctuationInDisplay(args.serverHtml || "<p>No preview yet.</p>");
  return `<div class="premium-readonly-doc" data-paid-pro-review-paper="true"><div class="premium-doc-body">${inner}</div></div>`;
}
