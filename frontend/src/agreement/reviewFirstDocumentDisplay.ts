import type { AgreementDraft } from "./agreementTypes";
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
import { formatAgreementPlainTextForEditing } from "./formatAgreementPlainTextForEditing";
import {
  analyzeReviewerVisibleClauseParity,
  corpusFingerprintShort,
  countMainSectionHeadings,
  extractVisiblePlainFromReviewHtml,
} from "./reviewFirstDocumentDisplayParity";
import {
  analyzeSection9StageContent,
  fingerprintStageText,
  logTest323LiveSection9Trace,
} from "./reviewFirstDocumentDisplaySection9Trace";
import {
  applyReviewReadyMetadataBackfill,
  corpusHasFullyHydratedExecutionBlock,
  isReviewTrackHydrationSurface,
  logTest323ReviewerVisibleClauseParity,
  reviewTrackExecutionMetadataComplete,
  type ReviewReadyHydratedDisplayCorpusSurface,
} from "../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";

const MIN_CORPUS_FOR_PREMIUM_HTML = 500;

/**
 * Display-only HTML for review surfaces — does not mutate authoritative corpus.
 */
export function buildReviewFirstDocumentDisplayHtml(args: {
  serverHtml: string;
  corpusText?: string | null;
  partyNames?: readonly (string | null | undefined)[] | null;
  draft?: AgreementDraft | null;
  surface?: ReviewReadyHydratedDisplayCorpusSurface;
  selectedCorpusSource?: string;
  agreementId?: string | null;
}): string {
  const surface = args.surface ?? "reviewer";
  let corpus = repairDuplicatedEntityPunctuationInDisplay((args.corpusText || "").trim());
  if (
    corpus.length >= 80 &&
    args.draft &&
    isReviewTrackHydrationSurface(surface)
  ) {
    corpus = applyReviewReadyMetadataBackfill(corpus, args.draft, {
      surface,
      selectedSource: args.selectedCorpusSource ?? "review_first_document_display",
    });
  }

  const authorityParties = readConsumedPaidProSignerMetadataAuthority()?.parties;
  if (corpus.length >= 80 && detectExecutionHeadingMetadataLeak(corpus).leak) {
    corpus = repairExecutionBlockEntityHeadingLines(corpus, authorityParties).text;
  }

  const retainExecution =
    isPaidProPostFinalizeHydratedCorpusLocked() ||
    reviewTrackExecutionMetadataComplete(corpus) ||
    corpusHasFullyHydratedExecutionBlock(corpus) ||
    corpusHasHydratedSignerExecutionFields(corpus);

  if (corpus.length >= MIN_CORPUS_FOR_PREMIUM_HTML) {
    const authoritativeCorpus = (args.corpusText || "").trim();
    const corpusBeforePolish = corpus;
    const clauseCountBeforePolish = countMainSectionHeadings(corpusBeforePolish);
    const reviewTrack = isReviewTrackHydrationSurface(surface);

    if (reviewTrack) {
      logTest323LiveSection9Trace({
        stage: "authoritative_corpus",
        agreementId: args.agreementId ?? null,
        surface,
        source: args.selectedCorpusSource ?? "review_first_document_display_input",
        corpusHash: fingerprintStageText(authoritativeCorpus),
        hasSection9Heading: analyzeSection9StageContent(authoritativeCorpus).hasSection9Heading,
        hasSection9Body: analyzeSection9StageContent(authoritativeCorpus).hasSection9Body,
        hasSection10Heading: analyzeSection9StageContent(authoritativeCorpus).hasSection10Heading,
        section9Index: analyzeSection9StageContent(authoritativeCorpus).section9Index,
        section10Index: analyzeSection9StageContent(authoritativeCorpus).section10Index,
        section9To10Preview: analyzeSection9StageContent(authoritativeCorpus).section9To10Preview,
      });
      const finalStage = analyzeSection9StageContent(corpusBeforePolish);
      logTest323LiveSection9Trace({
        stage: "final_display_corpus",
        agreementId: args.agreementId ?? null,
        surface,
        source: args.selectedCorpusSource ?? "review_first_document_display",
        corpusHash: fingerprintStageText(corpusBeforePolish),
        ...finalStage,
      });
    }

    const polished = polishProAgreementDisplayLayer(corpusBeforePolish, {
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: retainExecution,
    }).text;

    if (reviewTrack) {
      logTest323LiveSection9Trace({
        stage: "polished_corpus",
        agreementId: args.agreementId ?? null,
        surface,
        source: "polishProAgreementDisplayLayer",
        corpusHash: fingerprintStageText(polished),
        ...analyzeSection9StageContent(polished),
      });
    }

    // Review track: render the same backfilled corpus as copy/export. Display polish can drop
    // integration clauses (§9 miscellaneous) that mention "between the parties".
    const displayCorpus = reviewTrack ? corpusBeforePolish : polished;

    const names = (args.partyNames || [])
      .map((n) => repairDuplicatedEntityPunctuationInDisplay(String(n ?? "").trim()))
      .filter(Boolean);
    const html = buildPremiumAgreementReadonlyHtml(displayCorpus, {
      signatureSectionMode: "collaboration",
      partyNames: names.length ? names : ["Party A", "Party B"],
      suppressCorpusEmbeddedSignatureForDisplay: false,
      suppressDocumentIntelligenceCallouts: true,
      surface: "review_first_document_display_html",
    });

    if (reviewTrack) {
      const htmlStage = analyzeSection9StageContent(extractVisiblePlainFromReviewHtml(html));
      logTest323LiveSection9Trace({
        stage: "reviewer_html",
        agreementId: args.agreementId ?? null,
        surface,
        source: "buildPremiumAgreementReadonlyHtml",
        htmlHash: fingerprintStageText(html),
        ...htmlStage,
      });
      const copyExportPlain = formatAgreementPlainTextForEditing(corpusBeforePolish);
      const parity = analyzeReviewerVisibleClauseParity({
        corpusPlain: corpusBeforePolish,
        copyExportPlain,
        visibleHtml: html,
        clauseCountBeforePolish,
        clauseCountAfterPolish: countMainSectionHeadings(displayCorpus),
      });
      logTest323ReviewerVisibleClauseParity({
        agreementId: args.agreementId ?? null,
        surface,
        selectedCorpusSource: args.selectedCorpusSource ?? "review_first_document_display",
        selectedCorpusHash: corpusFingerprintShort(corpusBeforePolish),
        visibleTextHash: corpusFingerprintShort(extractVisiblePlainFromReviewHtml(html)),
        copyExportHash: corpusFingerprintShort(copyExportPlain),
        hasSection9HeadingInCorpus: parity.hasSection9HeadingInCorpus,
        hasSection9BodyInCorpus: parity.hasSection9BodyInCorpus,
        hasSection9HeadingInVisibleHtml: parity.hasSection9HeadingInVisibleHtml,
        hasSection9BodyInVisibleHtml: parity.hasSection9BodyInVisibleHtml,
        hasSection9HeadingInCopyExport: parity.hasSection9HeadingInCopyExport,
        hasSection9BodyInCopyExport: parity.hasSection9BodyInCopyExport,
        clauseCountBeforePolish: parity.clauseCountBeforePolish,
        clauseCountAfterPolish: parity.clauseCountAfterPolish,
        droppedHeadingNumbers: parity.droppedHeadingNumbers,
      });
    }
    return html;
  }
  const inner = repairDuplicatedEntityPunctuationInDisplay(args.serverHtml || "<p>No preview yet.</p>");
  return `<div class="premium-readonly-doc" data-paid-pro-review-paper="true"><div class="premium-doc-body">${inner}</div></div>`;
}
