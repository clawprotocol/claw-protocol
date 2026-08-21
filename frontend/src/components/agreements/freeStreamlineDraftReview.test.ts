import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CreateUiStage } from "./createUiStage";
import {
  buildStarterAgreementPreviewForReview,
} from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildCommitFreeDraftForReviewPatch,
  resolveIsFreeStreamlineDraftReview,
} from "./freeStreamlineDraftReview";

describe("resolveIsFreeStreamlineDraftReview", () => {
  const base = {
    simpleProductFlow: true,
    liveWorkspaceTwoPane: true,
    createProductionTwoPane: true,
    createUiStage: CreateUiStage.DRAFT,
    createFlowPhase: "draft_ready_for_review" as const,
    hasDraft: true,
    paidProAuthoritative: false,
    premiumPaidDocumentSurface: false,
    premiumPersistedFlowActive: false,
    premiumSendPathUnlocked: false,
    hasPaidPremiumCompletionSession: () => false,
    showUpgradeToFullDraftOnReview: false,
  };

  it("is true for free DRAFT review on simple create two-pane", () => {
    expect(resolveIsFreeStreamlineDraftReview(base)).toBe(true);
  });

  it("is false for paid Pro surfaces", () => {
    expect(resolveIsFreeStreamlineDraftReview({ ...base, paidProAuthoritative: true })).toBe(false);
    expect(resolveIsFreeStreamlineDraftReview({ ...base, premiumPaidDocumentSurface: true })).toBe(false);
  });

  it("is false outside DRAFT stage", () => {
    expect(
      resolveIsFreeStreamlineDraftReview({ ...base, createUiStage: CreateUiStage.RECIPIENTS }),
    ).toBe(false);
  });
});

describe("free streamline draft review wiring (static)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("uses commitFreeDraftForReview and isFreeStreamlineDraftReview", () => {
    expect(intake).toContain("commitFreeDraftForReview");
    expect(intake).toContain("isFreeStreamlineDraftReview");
    expect(intake).toContain("logFreeReviewSurfaceResolved");
    expect(intake).toContain("logFreeReviewLegacySurfaceBlocked");
    expect(intake).toContain("logFreeReviewApiLateMerge");
  });

  it("renders StarterDraftDocumentSurface from isFreeStreamlineDraftReview", () => {
    expect(intake).toContain("isFreeStreamlineDraftReview");
    expect(intake).toContain("useStarterDocumentPaperSurface");
    expect(intake).toContain("StarterDraftDocumentSurface");
  });

  it("normalizes free hydrate through commitFreeDraftForReview (no intake flash)", () => {
    expect(intake).toContain("freeNonProHydrate");
    expect(intake).toContain('source: displayPhaseRef.current === "review" ? "api_late_merge" : "api_hydrate"');
    expect(intake).not.toMatch(
      /setDisplayPhase\(nextDisplayAfterPersist\)[\s\S]{0,120}commitFreeDraftForReview/,
    );
  });

  it("uses free starter review headings whenever isFreeStreamlineDraftReview", () => {
    expect(intake).toContain("STARTER_REVIEW_HEADLINE");
    expect(intake).toContain("FREE_STARTER_REVIEW_TITLE");
    expect(intake).toMatch(/isFreeStreamlineDraftReview\s*&&/);
    expect(intake).toContain("STARTER_REVIEW_SUBLINE");
    expect(intake).toContain("STARTER_REVIEW_HELPER");
    expect(intake).toContain("FREE_STARTER_REVIEW_BADGE");
  });

  it("blocks duplicate sticky Continue with Pro when free streamline review is active", () => {
    expect(intake).toContain("hideStickyForStarterProContinuation");
    expect(intake).toContain("isFreeStreamlineDraftReview");
    expect(intake).toContain("freeTrackBlocksRecipientAdvance");
    expect(intake).toMatch(/inlineFallback:[\s\S]*!isFreeStreamlineDraftReview/);
  });

  it("commit patch normalizes review display phase", () => {
    expect(buildCommitFreeDraftForReviewPatch().displayPhase).toBe("review");
    expect(buildCommitFreeDraftForReviewPatch().createFlowPhase).toBe("draft_ready_for_review");
  });
});

describe("free starter services output", () => {
  const intake = [
    "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.",
    "Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.",
  ].join(" ");

  const draft: ParsedDraftShape = {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: [
      { name: "Red Mesa", role: "Client" },
      { name: "Harbor Peak", role: "Service Provider" },
    ],
    purpose: "Red Mesa will pay Harbor Peak $5,000.",
    payment_terms: "$5,000",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: 5000, cadence: null, valid: true },
  };

  it("preserves full legal names in the Free opening paragraph", () => {
    const text = buildStarterAgreementPreviewForReview(draft, { intakeText: intake });
    expect(text).toContain("Red Mesa Logistics LLC");
    expect(text).toContain("Harbor Peak Automation LLC");
  });

  it("has no duplicate opening or unresolved placeholders for AI workflow setup", () => {
    const text = buildStarterAgreementPreviewForReview(draft, { intakeText: intake });
    expect(text).not.toMatch(/This Agreement is\s+This Agreement is between/i);
    expect(text).not.toMatch(/\[Not yet specified\]/i);
    expect(text).toMatch(
      /Harbor Peak Automation LLC will provide AI workflow setup services for Red Mesa Logistics LLC/i,
    );
  });

  it("puts extracted AI workflow setup in Scope and keeps payment in Payment Terms", () => {
    const text = buildStarterAgreementPreviewForReview(draft, { intakeText: intake });
    const scope = text.slice(text.indexOf("1. Scope"), text.indexOf("2. Payment Terms"));
    const payment = text.slice(text.indexOf("2. Payment Terms"), text.indexOf("3. Services Term"));
    expect(scope).toMatch(/Harbor Peak Automation LLC will provide AI workflow setup services for Red Mesa Logistics LLC/i);
    expect(scope).not.toMatch(/\bpay\b|\$5,000/i);
    expect(payment).toMatch(/\$5,000/);
  });

  it("extracts Free services scope from intake even when the draft family is generic", () => {
    const genericDraft: ParsedDraftShape = {
      ...draft,
      agreement_family: "generic_business_agreement",
      purpose: "Red Mesa will pay Harbor Peak $5,000.",
    };
    const text = buildStarterAgreementPreviewForReview(genericDraft, { intakeText: intake });
    const scope = text.slice(text.indexOf("1. Scope"), text.indexOf("2. Payment Terms"));
    expect(scope).toMatch(/Harbor Peak Automation LLC will provide AI workflow setup services for Red Mesa Logistics LLC/i);
    expect(scope).not.toContain("[Not yet specified]");
    expect(scope).not.toMatch(/\$5,000/);
  });
});
