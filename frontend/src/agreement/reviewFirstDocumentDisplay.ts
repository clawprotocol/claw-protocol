import { buildPremiumAgreementReadonlyHtml } from "../components/agreements/premiumAgreementDocumentHtml";
import {
  corpusHasHydratedSignerExecutionFields,
  detectExecutionHeadingMetadataLeak,
  repairExecutionBlockEntityHeadingLines,
} from "../components/agreements/paidProExecutionBlockEntityHeading";
import { polishProAgreementDisplayLayer } from "../components/agreements/polishProAgreementDisplayLayer";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "../components/agreements/paidProSignerMetadataCommitPolicy";
import { readConsumedPaidProSignerMetadataAuthority } from "../components/agreements/paidProSignerMetadataAuthority";
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
  let corpus = repairDuplicatedEntityPunctuationInDisplay((args.corpusText || "").trim());
  const authorityParties = readConsumedPaidProSignerMetadataAuthority()?.parties;
  if (corpus.length >= 80 && detectExecutionHeadingMetadataLeak(corpus).leak) {
    corpus = repairExecutionBlockEntityHeadingLines(corpus, authorityParties).text;
  }
  const retainExecution =
    isPaidProPostFinalizeHydratedCorpusLocked() || corpusHasHydratedSignerExecutionFields(corpus);
  if (corpus.length >= MIN_CORPUS_FOR_PREMIUM_HTML) {
    const polished = polishProAgreementDisplayLayer(corpus, {
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: retainExecution,
    }).text;
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
