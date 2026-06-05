import { describe, expect, it } from "vitest";
import {
  buildReviewFirstTextDiffSummary,
  canReviewChanges,
  canSubmitReviewFirstProposal,
  normalizeReviewTextForComparison,
  REVIEW_FIRST_FORMATTING_ARTIFACTS_NOTE,
} from "./reviewFirstTextDiff";
import { normalizeReviewFirstAgreementText } from "./reviewFirstPasteNormalization";

const BASE_AGREEMENT = [
  "WEB DEVELOPMENT AGREEMENT",
  "",
  "1. Services. Provider shall perform the services described in the statement of work.",
  "",
  "2. Payment. Client shall pay undisputed invoiced amounts within thirty (30) days after receipt of invoice.",
  "",
  "3. Ownership and Work Product. Client owns deliverables upon full payment. Provider retains background technology.",
  "",
  "4. Termination. Either party may terminate upon thirty days written notice.",
].join("\n");

describe("reviewFirstTextDiff", () => {
  it("ignores whitespace, bullet indentation, smart quotes, and capitalization-only changes", () => {
    const previous = "Schedule A\n\n- Payment is due within 30 days.\nClient owns the final copy.";
    const proposed = "schedule a\n\n   *   Payment   is due within 30 days.\nclient owns the final copy.";

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);

    expect(normalizeReviewTextForComparison(previous)).toBe(normalizeReviewTextForComparison(proposed));
    expect(diff.status).toBe("no_change");
    expect(diff.hasMaterialChanges).toBe(false);
  });

  it("classifies thirty (30) → fifteen (15) days as Payment timing changed with phrase-level delta", () => {
    const previous = BASE_AGREEMENT;
    const proposed = BASE_AGREEMENT.replace(
      "within thirty (30) days after receipt",
      "within fifteen (15) days after receipt",
    );

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);
    const section = diff.changedSections[0];

    expect(diff.status).toBe("changed");
    expect(diff.hasMaterialChanges).toBe(true);
    expect(diff.summary).toBe("1 material wording update found.");
    expect(section?.title).toBe("Payment timing changed");
    expect(section?.summary).toBe("Payment timing changed");
    expect(section?.beforePhrase).toContain("thirty (30) days after receipt");
    expect(section?.afterPhrase).toContain("fifteen (15) days after receipt");
    expect(section?.changeMagnitude).toBe("phrase");
    expect(section?.previous).toContain("thirty (30) days after receipt");
    expect(section?.proposed).toContain("fifteen (15) days after receipt");
    expect(section?.beforePhrase).not.toMatch(/Ownership/i);
    expect(section?.beforePhrase).not.toMatch(/Parties/i);
    expect(section?.beforePhrase.length ?? 0).toBeLessThan(previous.length);
  });

  it("extracts invoicing clause label and exact payment phrase for 30 → 15 day edit", () => {
    const previous = [
      "3.2 Invoicing and Payment Timing",
      "Client shall pay each undisputed invoice within thirty (30) days after receipt of invoice.",
    ].join("\n");
    const proposed = previous.replace(
      "within thirty (30) days after receipt",
      "within fifteen (15) days after receipt",
    );

    const section = buildReviewFirstTextDiffSummary(previous, proposed).changedSections[0];

    expect(section?.title).toBe("Payment timing changed");
    expect(section?.clauseLabel).toBe("3.2 Invoicing and Payment Timing");
    expect(section?.beforePhrase).toBe("within thirty (30) days after receipt");
    expect(section?.afterPhrase).toBe("within fifteen (15) days after receipt");
    expect(section?.clauseContextSnippet).toContain("undisputed invoice");
  });

  it("identifies changed Schedule A wording as payment timing when days change", () => {
    const previous = "Agreement\n\nSchedule A\nPayment is due within 30 days.\nSupport is email only.";
    const proposed = "Agreement\n\nSchedule A\nPayment is due within 15 days.\nSupport includes phone escalation.";

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);

    expect(diff.status).toBe("changed");
    expect(diff.hasMaterialChanges).toBe(true);
    expect(diff.changedSections[0]?.title).toBe("Payment timing changed");
    expect(diff.changedSections[0]?.previous).toContain("30 days");
    expect(diff.changedSections[0]?.proposed).toContain("15 days");
    expect(diff.changedSections[0]?.summary).toBe("Payment timing changed");
    expect(diff.changedSections[0]?.previousParts.some((part) => part.kind === "removed" && part.text.includes("30"))).toBe(true);
    expect(diff.changedSections[0]?.proposedParts.some((part) => part.kind === "added" && part.text.includes("15"))).toBe(true);
  });

  it("ignores PDF title/header/footer noise when agreement body is unchanged", () => {
    const previous = BASE_AGREEMENT;
    const proposed = [
      "Draft Agreement (non-binding template)",
      "LawDog Pro",
      "Page 1 of 2",
      BASE_AGREEMENT.replace(/\n\n/g, "\n"),
      "",
      "Created with LawDog",
      "Page 2 of 2",
    ].join("\n");

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);

    expect(diff.status).toBe("no_change");
    expect(diff.hasMaterialChanges).toBe(false);
    expect(diff.formattingArtifactsIgnored).toBe(true);
    expect(REVIEW_FIRST_FORMATTING_ARTIFACTS_NOTE).toBe("Formatting/header changes ignored.");
  });

  it("surfaces exact party name delta without unrelated clause noise", () => {
    const previous =
      "1. Parties. This Agreement is between Acme LLC (\"Client\") and Beta Corp (\"Provider\"). The parties agree as follows.";
    const proposed =
      "1. Parties. This Agreement is between Acme LLC (\"Client\") and Gamma Inc (\"Provider\"). The parties agree as follows.";

    const section = buildReviewFirstTextDiffSummary(previous, proposed).changedSections[0];

    expect(section?.title).toBe("Party changed");
    expect(section?.beforePhrase).toContain("Beta");
    expect(section?.afterPhrase).toContain("Gamma");
    expect(section?.beforePhrase).not.toContain("Acme LLC");
    expect(section?.changeMagnitude).toBe("phrase");
  });

  it("classifies party/entity name changes as Party changed", () => {
    const previous =
      "1. Parties. This Agreement is between Acme LLC (\"Client\") and Beta Corp (\"Provider\"). The parties agree as follows.";
    const proposed =
      "1. Parties. This Agreement is between Acme LLC (\"Client\") and Gamma Inc (\"Provider\"). The parties agree as follows.";

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);
    const section = diff.changedSections[0];

    expect(diff.hasMaterialChanges).toBe(true);
    expect(section?.title).toBe("Party changed");
    expect(section?.previous).toContain("Beta");
    expect(section?.proposed).toContain("Gamma");
  });

  it("prioritizes ownership phrase delta over full clause wall of text", () => {
    const previous =
      "Ownership and Work Product\nCompany owns the project deliverables and work product created specifically for Company after payment. Existing background materials remain separately owned. This paragraph also confirms routine cooperation, ordinary access, and unchanged project administration terms that do not affect ownership.";
    const proposed =
      "Ownership and Work Product\nClient owns the project deliverables and work product created specifically for Client after full payment. Existing scripts, background technology, and reusable automation components remain separately owned. This paragraph also confirms routine cooperation, ordinary access, and unchanged project administration terms that do not affect ownership.";

    const section = buildReviewFirstTextDiffSummary(previous, proposed).changedSections[0];

    expect(section?.title).toBe("Ownership changed");
    expect(section?.beforePhrase).toContain("Company");
    expect(section?.afterPhrase).toContain("Client");
    expect(section?.beforePhrase.length ?? 0).toBeLessThan(previous.length);
    expect(section?.fullPrevious.length ?? 0).toBeGreaterThan(section?.beforePhrase.length ?? 0);
  });

  it("shows compact changed snippets for ownership/work-product clause changes", () => {
    const previous =
      "Ownership and Work Product\nCompany owns the project deliverables and work product created specifically for Company after payment. Existing background materials remain separately owned. This paragraph also confirms routine cooperation, ordinary access, and unchanged project administration terms that do not affect ownership.";
    const proposed =
      "Ownership and Work Product\nClient owns the project deliverables and work product created specifically for Client after full payment. Existing scripts, background technology, and reusable automation components remain separately owned. This paragraph also confirms routine cooperation, ordinary access, and unchanged project administration terms that do not affect ownership.";

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);
    const section = diff.changedSections[0];

    expect(section?.summary).toBe("Ownership changed");
    expect(section?.previous).toContain("Company");
    expect(section?.previous).toContain("after payment");
    expect(section?.proposed).toContain("Client");
    expect(section?.proposed).toContain("after full payment");
    expect(section?.proposed).toContain("scripts");
    expect(section?.previous.length ?? 0).toBeLessThan(previous.length);
    expect(section?.proposed.length ?? 0).toBeLessThan(proposed.length);
  });

  it("classifies deliverable, term, and liability edits with phrase-level deltas", () => {
    const deliverablePrevious = "Deliverables. Provider shall deliver a final website and source code archive by March 1.";
    const deliverableProposed = "Deliverables. Provider shall deliver a final website, admin guide, and source code archive by March 1.";
    const deliverable = buildReviewFirstTextDiffSummary(deliverablePrevious, deliverableProposed).changedSections[0];
    expect(deliverable?.title).toBe("Deliverable changed");
    expect(deliverable?.beforePhrase).toContain("website");
    expect(deliverable?.afterPhrase).toContain("admin guide");

    const termPrevious = "Term. The initial term is twelve (12) months from the Effective Date.";
    const termProposed = "Term. The initial term is twenty-four (24) months from the Effective Date.";
    const term = buildReviewFirstTextDiffSummary(termPrevious, termProposed).changedSections[0];
    expect(term?.title).toBe("Term changed");
    expect(term?.beforePhrase).toContain("twelve (12)");
    expect(term?.afterPhrase).toContain("twenty-four (24)");

    const liabilityPrevious = "Liability. Provider's aggregate liability shall not exceed fees paid in the prior three months.";
    const liabilityProposed = "Liability. Provider's aggregate liability shall not exceed fees paid in the prior six months.";
    const liability = buildReviewFirstTextDiffSummary(liabilityPrevious, liabilityProposed).changedSections[0];
    expect(liability?.title).toBe("Liability changed");
    expect(liability?.beforePhrase).toContain("three months");
    expect(liability?.afterPhrase).toContain("six months");
  });

  it("does not misclassify payment timing edits as Ownership changed when agreement includes ownership section", () => {
    const previous = BASE_AGREEMENT;
    const proposed = BASE_AGREEMENT.replace(
      "within thirty (30) days after receipt",
      "within fifteen (15) days after receipt",
    );

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);

    expect(diff.changedSections.every((section) => section.title !== "Ownership changed")).toBe(true);
    expect(diff.changedSections[0]?.title).toBe("Payment timing changed");
  });

  it("enables review changes from pasted text diff only (not attribution)", () => {
    const diff = buildReviewFirstTextDiffSummary("Payment is due in 30 days.", "Payment is due in 15 days.");

    expect(canReviewChanges({ diff, proposedText: "Payment is due in 15 days." })).toBe(true);
    expect(canReviewChanges({ diff, proposedText: "" })).toBe(false);
    expect(
      canReviewChanges({
        diff: buildReviewFirstTextDiffSummary("Payment is due in 30 days.", "Payment is due in 30 days."),
        proposedText: "Payment is due in 30 days.",
      }),
    ).toBe(false);
  });

  it("requires changed wording, attribution, and rendered preview before submit", () => {
    const diff = buildReviewFirstTextDiffSummary("Payment is due in 30 days.", "Payment is due in 15 days.");

    expect(
      canSubmitReviewFirstProposal({
        diff,
        hasReviewerAttribution: true,
        comparisonPreviewRendered: true,
      }),
    ).toBe(true);
    expect(
      canSubmitReviewFirstProposal({
        diff,
        hasReviewerAttribution: false,
        comparisonPreviewRendered: true,
      }),
    ).toBe(false);
    expect(
      canSubmitReviewFirstProposal({
        diff,
        hasReviewerAttribution: true,
        comparisonPreviewRendered: false,
      }),
    ).toBe(false);
  });
});

describe("normalizeReviewFirstAgreementText", () => {
  it("strips draft template and page headers from pasted PDF text", () => {
    const noisy = [
      "Draft Agreement (non-binding template)",
      "LawDog Pro",
      "Page 1 of 2",
      "2. Payment. Client shall pay within thirty (30) days after receipt.",
      "Created with LawDog",
    ].join("\n");

    const { text, hadFormattingArtifacts } = normalizeReviewFirstAgreementText(noisy);

    expect(hadFormattingArtifacts).toBe(true);
    expect(text).not.toMatch(/Draft Agreement/i);
    expect(text).not.toMatch(/LawDog Pro/i);
    expect(text).not.toMatch(/Page 1 of 2/i);
    expect(text).toContain("thirty (30) days after receipt");
  });
});
