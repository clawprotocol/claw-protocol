/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import {
  shouldHydrateStoredAgreementResumeId,
  shouldSkipHomeAutoGenerateForStoredReview,
} from "../components/agreements/createReviewRefreshRestore";
import {
  FREE_STARTER_REVIEW_TITLE,
  resetStalePaidReviewShellForFreeStarter,
  resolveReviewShellChrome,
} from "../components/agreements/freeStarterReviewShell";
import { resolveCanonicalFinalPartyManifest } from "../components/agreements/guidedDealCompletion/canonicalFinalPartyManifest";
import { extractBetweenPartyNameList } from "../components/agreements/partyBetweenParse";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "../components/agreements/paidProSourceOfTruth";
import {
  clearCurrentSessionProEntitlementMarkers,
  hasCurrentSessionFreeStarterIntent,
  markCurrentSessionFreeStarterIntent,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "../components/agreements/paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  readPremiumRecipientHandoff,
  writePremiumRecipientHandoffExact,
} from "../components/agreements/premiumPartyNamesHandoff";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import { resolvePremiumRenderSource } from "../components/agreements/premiumRenderSourceResolver";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";

const TEST332_INTAKE = [
  "Create a consulting agreement",
  'between Red Mesa Logistics, LLC ("party_a") and Harbor Peak Automation, LLC ("party_b")',
  "for AI workflow setup.",
  "Oklahoma law governs.",
].join(" ");

const PRO_BODY = `CONSULTING AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"x".repeat(900)}`;
const SERVER_FULL_DRAFT = PRO_BODY;

describe("homeFreeStarterAsyncRace (test332)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPremiumPartyNamesHandoff();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPremiumPartyNamesHandoff();
  });

  it("initializeNewAgreementSession then home submit latches free starter", () => {
    initializeNewAgreementSession();
    resetStalePaidReviewShellForFreeStarter("home_create_submit");
    expect(hasCurrentSessionFreeStarterIntent()).toBe(true);
  });

  it("delayed server_full_draft resolve does not establish SoT during free starter session", () => {
    markCurrentSessionFreeStarterIntent();
    const resolved = resolvePremiumRenderSource({
      draft: {
        parties: [
          { name: "Red Mesa Logistics LLC", role: "Client" },
          { name: "Harbor Peak Automation LLC", role: "Service Provider" },
        ],
        premium_server_full_document_text: SERVER_FULL_DRAFT,
      } as ParsedDraftShape,
      intakeText: TEST332_INTAKE,
      serverFullDocumentText: SERVER_FULL_DRAFT,
      premiumWinningCorpusFallback: SERVER_FULL_DRAFT,
      paidAuthoritativeProBody: SERVER_FULL_DRAFT,
      buildLivePreview: () => "starter preview",
    });
    expect(resolved.premium_render_source).toBe("server_full_document_text");
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("stored_agreement_resume_id cannot skip fresh homepage auto-generate", () => {
    writeCreateReviewAgreementResumeId("stale-agreement-id");
    expect(shouldSkipHomeAutoGenerateForStoredReview({ freshHomeHeroHandoff: true })).toBe(false);
    expect(shouldHydrateStoredAgreementResumeId({ freshHomeHeroHandoff: true })).toBe(false);
  });

  it("stored_agreement_resume_id cannot hydrate during free starter session", () => {
    writeCreateReviewAgreementResumeId("stale-agreement-id");
    markCurrentSessionFreeStarterIntent();
    expect(shouldHydrateStoredAgreementResumeId()).toBe(false);
  });

  it("last_known_good style corpus cannot establish SoT without pro entitlement", () => {
    markCurrentSessionFreeStarterIntent();
    expect(() =>
      establishPaidProSourceOfTruth({ text: SERVER_FULL_DRAFT, source: "server_full_draft" }),
    ).toThrow(/establishment-suppressed/);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("claw_premium_recipient_handoff_v2 partyIndexSlots ignored in free starter flow", () => {
    markCurrentSessionFreeStarterIntent();
    writePremiumRecipientHandoffExact(
      { name: "Red Mesa Logistics LLC", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      { name: "Harbor Peak Automation LLC", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      [
        { name: "Extra 3", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
        { name: "Extra 4", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
        { name: "Extra 5", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      ],
    );
    const handoff = readPremiumRecipientHandoff();
    expect(handoff?.partyIndexSlots).toBeUndefined();
  });

  it("free review shell stays Review your draft when async SoT establishment is suppressed", () => {
    markCurrentSessionFreeStarterIntent();
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: true,
      isFreeStarterReviewSurface: true,
      premiumPaidDocumentSurface: false,
      paidProAuthoritative: false,
      paidProReviewReadyBase: false,
      guidedCompletionActive: false,
    });
    expect(chrome.title).toBe(FREE_STARTER_REVIEW_TITLE);
    expect(chrome.blockPaidProShell).toBe(true);
  });

  it("pro CTA + payment still establishes SoT after free starter latch cleared", () => {
    markCurrentSessionFreeStarterIntent();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    establishPaidProSourceOfTruth({ text: SERVER_FULL_DRAFT, source: "server_full_draft" });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: false,
      isFreeStarterReviewSurface: false,
      premiumPaidDocumentSurface: true,
      paidProAuthoritative: true,
      paidProReviewReadyBase: true,
      guidedCompletionActive: false,
      premiumCheckoutCompleted: true,
    });
    expect(chrome.kind).toBe("paid_pro");
  });

  it("test330 party normalization stays at exactly two parties", () => {
    markCurrentSessionFreeStarterIntent();
    expect(extractBetweenPartyNameList(TEST332_INTAKE)).toEqual([
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
    ]);
    const manifest = resolveCanonicalFinalPartyManifest({
      sendMode: "review",
      recipientsDeferred: false,
      partyCount: 2,
      recipient1Name: "Red Mesa Logistics",
      recipient2Name: "LLC",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: ["Red Mesa Logistics", "LLC", "Harbor Peak Automation"],
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
      intakeText: TEST332_INTAKE,
    });
    expect(manifest.parties).toHaveLength(2);
  });
});
