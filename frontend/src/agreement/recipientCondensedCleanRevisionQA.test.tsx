/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { buildCondensedTopicReviewCards, buildCondensedTopicReviewCardsPdfHtml } from "./recipientCondensedTopicReviewModel";
import { buildNotRestatedOriginalSectionsAppendixHtml } from "./recipientCondensedDraftSemanticMap";
import { buildHumanReviewStructuredForPdf } from "./recipientHumanReviewSummaryModel";
import { RecipientFocusedWordingDialog } from "./RecipientFocusedWordingDialog";
import { RecipientCondensedRevisionSurface } from "./RecipientCondensedRevisionSurface";
import { detectRecipientReviewPresentationMode } from "./recipientReviewPresentationMode";
import { buildRecipientRedlinePdfHtml } from "./recipientPreviewPdfHtml";
import {
  RECIPIENT_EXPORT_PDF_ADVANCED_MARKUP_APPENDIX_HEADING,
  RECIPIENT_EXPORT_PDF_CLEAN_PROPOSED_HEADING,
  RECIPIENT_EXPORT_PDF_KEY_CHANGED_WORDING_HEADING,
} from "./portableReviewCopy";
import type { RecipientCompareConfidence } from "./recipientCompareConfidence";
import type { RecipientRedlineStickyNavRow } from "./recipientBusinessReviewCardsModel";
import { createRef } from "react";

function consultingAgreementLongFixture(): string {
  let t =
    "MASTER CONSULTING AGREEMENT\n\nThis Agreement is entered into between Client and Vendor for professional services.\n\n";
  for (let major = 1; major <= 6; major++) {
    for (let minor = 1; minor <= 5; minor++) {
      t += `${major}.${minor} Clause ${major}.${minor}. Fees, milestones, acceptance criteria, confidentiality, and liability caps are described in detail for operational clarity. Subprocessors and change control apply as written. Payment timing and invoicing procedures follow standard procurement rules.\n\n`;
    }
  }
  t += "12. General provisions. Entire agreement, assignment, and governing law.\n\n13. Signatures.\n";
  return t;
}

function sarahCollinsCondensedRevisedFixture(): string {
  return [
    "1.0 Summary",
    "This revised draft reflects proposed operational clarifications requested during legal review.",
    "",
    "2.0 Payment",
    "Invoices are due Net 30 from invoice date. Vendor may pause work for nonpayment after written notice.",
    "",
    "3.0 Scope",
    "Developer will deliver the website and analytics milestones described in Exhibit A.",
    "",
    "4.0 Acceptance",
    "Client will complete UAT sign-off within ten business days of a stable staging release.",
    "",
    "5.0 Ownership",
    "Client owns custom deliverables; Vendor retains tools and pre-existing IP.",
    "",
    "6.0 Third-party services",
    "Material subprocessors require at least ten business days prior written notice.",
    "",
    "7.0 Timeline",
    "Schedule slippage tied to third-party dependencies does not excuse payment obligations once milestones are accepted.",
  ].join("\n");
}

const condensedConfidence: RecipientCompareConfidence = {
  level: "medium",
  headline: "Compare confidence: Medium",
  body: "Take a moment to spot-check material sections.",
  reasonCodes: [],
  gentleContextLines: [],
};

const compareChips = [
  "Payment timing",
  "Scope boundaries",
  "IP ownership",
  "Third party risk",
  "Acceptance testing",
  "Timeline protections",
];

afterEach(() => {
  cleanup();
});

describe("condensed clean-revision QA (Sarah Collins archetype)", () => {
  it("detects condensed_clean_revision for long original vs condensed revised with summary meta", () => {
    const currentPlain = consultingAgreementLongFixture();
    const proposedPlain = sarahCollinsCondensedRevisedFixture();
    expect(currentPlain.length / proposedPlain.length).toBeGreaterThanOrEqual(2.5);
    expect(
      detectRecipientReviewPresentationMode({
        currentPlain,
        proposedPlain,
        narrowRecipientTargetedRedline: false,
      }),
    ).toBe("condensed_clean_revision");
  });

  it("builds topic cards covering payment, scope, ownership, third-party, acceptance, and timeline", () => {
    const currentPlain = consultingAgreementLongFixture();
    const proposedPlain = sarahCollinsCondensedRevisedFixture();
    const vm = buildLegalRedlineDocumentViewModel(currentPlain, proposedPlain);
    const cards = buildCondensedTopicReviewCards(vm, currentPlain, compareChips);
    const ids = cards.map((c) => c.semanticId);
    expect(ids).toContain("payment_terms");
    expect(ids).toContain("scope");
    expect(ids).toContain("ownership");
    expect(ids).toContain("third_party");
    expect(ids).toContain("acceptance");
    expect(ids).toContain("timeline_protections");
  });

  it("defaults condensed surface to clean proposed tab and hides advanced redline scrollport", () => {
    const currentPlain = consultingAgreementLongFixture();
    const proposedPlain = sarahCollinsCondensedRevisedFixture();
    const vm = buildLegalRedlineDocumentViewModel(currentPlain, proposedPlain);
    const cards = buildCondensedTopicReviewCards(vm, currentPlain, compareChips);
    const ref = createRef<HTMLDivElement>();
    const sticky: readonly RecipientRedlineStickyNavRow[] = [];
    render(
      <RecipientCondensedRevisionSurface
        ref={ref}
        proposedPlainClean={proposedPlain}
        topicCards={cards}
        notRestatedLabels={["Representations / warranties", "Termination"]}
        legalVm={vm}
        onlyChangedRedlineSections={true}
        onOnlyChangedChange={() => {}}
        recipientNarrowIntentAnchors={false}
        narrowRedlineHighlightAnchor={null}
        semanticPresentation={null}
        highlightedSemanticAnchor={null}
        stickyNavRows={sticky}
        onStickySelect={() => {}}
        onDenseExactWording={() => {}}
        selectedTab="clean"
        onTabChange={() => {}}
      />,
    );
    expect(screen.getByTestId("recipient-condensed-tab-clean").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByTestId("recipient-suggested-changes-document")).toBeNull();
    expect(screen.getByTestId("recipient-condensed-panel-clean")).toBeTruthy();
  });

  it("compare fallback dialog structures prior/revised and offers show-full for long revised text", () => {
    const longRevised = `${"Revised paragraph. ".repeat(120)}Final token.`;
    render(
      <RecipientFocusedWordingDialog
        open
        variant="compare_fallback"
        sectionTitle="Payment"
        sectionSubline="Section 3 — Fees"
        businessNote="Cash timing affects delivery risk."
        oldText="Due on receipt."
        newText={longRevised}
        onClose={() => {}}
        onOpenFullRedline={() => {}}
      />,
    );
    expect(screen.getByTestId("recipient-focused-wording-show-full-revised")).toBeTruthy();
    expect(screen.getByText("Prior wording")).toBeTruthy();
    expect(screen.getByText("Revised wording")).toBeTruthy();
  });

  it("exports condensed PDF with clean proposed before key topics before collapsed advanced appendix", () => {
    const currentPlain = consultingAgreementLongFixture();
    const proposedPlain = sarahCollinsCondensedRevisedFixture();
    const vm = buildLegalRedlineDocumentViewModel(currentPlain, proposedPlain);
    const cards = buildCondensedTopicReviewCards(vm, currentPlain, compareChips);
    const structured = buildHumanReviewStructuredForPdf({
      reviewerHeadlineName: "Sarah Collins",
      chips: compareChips,
      changedBlockCount: vm.stats.changedBlockCount,
      instructionPlain: "Please review condensed draft.",
      changedFieldKeys: ["revision_text"],
      confidence: condensedConfidence,
      headlinePlainOverride: "Sarah Collins proposed a clean revised draft with 6 key revision areas.",
    });
    const html = buildRecipientRedlinePdfHtml(
      vm,
      {
        agreementId: "ag_test",
        agreementTitle: "Consulting",
        reviewerDisplayName: "Sarah Collins",
        reviewerEmail: null,
        generatedAt: new Date(2026, 4, 8),
      },
      {
        structuredHumanReview: structured,
        condensedCleanRevisionPdf: {
          cleanProposedPlain: proposedPlain,
          topicSectionHtml: buildCondensedTopicReviewCardsPdfHtml(cards),
          notRestatedAppendixHtml: buildNotRestatedOriginalSectionsAppendixHtml([
            "Representations / warranties",
            "Termination",
          ]),
        },
      },
    );
    const cleanIdx = html.indexOf(RECIPIENT_EXPORT_PDF_CLEAN_PROPOSED_HEADING);
    const keyIdx = html.indexOf(RECIPIENT_EXPORT_PDF_KEY_CHANGED_WORDING_HEADING);
    const advIdx = html.indexOf(RECIPIENT_EXPORT_PDF_ADVANCED_MARKUP_APPENDIX_HEADING);
    expect(cleanIdx).toBeGreaterThan(0);
    expect(keyIdx).toBeGreaterThan(cleanIdx);
    expect(advIdx).toBeGreaterThan(keyIdx);
    expect(html).toMatch(/<details[^>]*>/i);
    expect(html).toContain("Absence in this upload does not mean they were deleted from your agreement.");
  });

  it("changed wording tab uses in-page topic cards, not the full-document scrollport", () => {
    const currentPlain = consultingAgreementLongFixture();
    const proposedPlain = sarahCollinsCondensedRevisedFixture();
    const vm = buildLegalRedlineDocumentViewModel(currentPlain, proposedPlain);
    const cards = buildCondensedTopicReviewCards(vm, currentPlain, compareChips);
    const ref = createRef<HTMLDivElement>();
    render(
      <RecipientCondensedRevisionSurface
        ref={ref}
        proposedPlainClean={proposedPlain}
        topicCards={cards}
        notRestatedLabels={["Liability"]}
        legalVm={vm}
        onlyChangedRedlineSections={true}
        onOnlyChangedChange={() => {}}
        recipientNarrowIntentAnchors={false}
        narrowRedlineHighlightAnchor={null}
        semanticPresentation={null}
        highlightedSemanticAnchor={null}
        stickyNavRows={[]}
        onStickySelect={() => {}}
        onDenseExactWording={() => {}}
        selectedTab="changed"
        onTabChange={() => {}}
      />,
    );
    expect(screen.getByTestId("recipient-condensed-panel-changed")).toBeTruthy();
    expect(screen.getByTestId("recipient-condensed-topic-card-payment_terms")).toBeTruthy();
    expect(screen.queryByTestId("recipient-suggested-changes-document")).toBeNull();
    fireEvent.click(screen.getByTestId("recipient-condensed-topic-card-payment_terms"));
  });
});
