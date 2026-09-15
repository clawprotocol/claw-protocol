/** @vitest-environment jsdom */
/**
 * Local two-to-four-party guided journey on production functions.
 * Fresh-model quality is separately unverified. No provider calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../lib/agreementGenerationId";
import { contentClarificationQuestions } from "../components/agreements/PaidDraftContentAdvisory";
import { applySuppliedContentFactsToAuthorizedPaper } from "../components/agreements/paymentClarificationApplyRecovery";
import { buildNPartyPaidProServerCorpus } from "../components/agreements/paidProNPartyCorpusBuilder";
import { preparePaidProServerDocumentForAcceptance } from "../components/agreements/paidProConciseServicesQuality";
import {
  UNCONFIRMED_MILESTONE_PAYER_QUESTION,
  milestonePayerMaterialItem,
} from "../components/agreements/paidProMilestonePayer";
import { TEST477_THREE_PARTY_LEGAL_ENTITIES } from "../components/agreements/paidProTest477Fixtures";
import {
  TEST487_FOUR_PARTY_LEGAL_ENTITIES,
  TEST487_PRODUCTION_INTAKE,
  buildTest487AcceptedCorpus,
  test487DraftWithFourParsedParties,
} from "../components/agreements/paidProTest487ProductionValidationFixtures";
import {
  TEST490_CLEARSPRING,
  TEST490_NOVAPATH,
  TEST490_STONEBRIDGE,
  TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
} from "../components/agreements/paidProTest490Fixtures";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { markPaidProPipelineValidationPassed } from "../components/agreements/paidProPostAcceptanceValidatorCache";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "../components/agreements/paidProSessionEligibility";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "../components/agreements/paidProSourceOfTruth";
import { cueAssignedToExpectedEntity } from "../components/agreements/paidProPartyEconomicRelationships";
import {
  shouldInterceptAdvancedDocumentFamily,
  shouldRunComplexityInterceptBeforePaidGeneration,
} from "../components/agreements/agreementLaunchFamilies";
import {
  RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
  RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE,
} from "./releaseScopeQualificationCampaign";
import {
  RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED,
  RELEASE_SCOPE_THREE_PARTY_FIRST_DRAFT_SANITIZED,
} from "./fixtures/releaseScopeMultiparty.sanitized";
import {
  checkFourPartyCustomerMeaning,
  checkThreePartyCustomerMeaning,
} from "./qualityEvalCustomerPaper";

function threePartyDraft() {
  return {
    title: "Intellectual Property License and Royalty Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement" as const,
    parties: TEST477_THREE_PARTY_LEGAL_ENTITIES.map((name) => ({ name, role: "" })),
    purpose: "wellness training videos and written course materials hosted on an online training platform",
    payment_terms: "",
    duration: "twelve (12) months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
  };
}

describe("release-scope qualification journey (local production path)", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    sessionStorage.clear();
    clearCurrentSessionProEntitlementMarkers();
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  });

  afterEach(() => {
    storage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProSourceOfTruth();
    vi.unstubAllGlobals();
  });

  it("preserves three-party relationships through prepare, asks no payer question, and keeps shares after reopen", () => {
    const intake = RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE;
    expect(checkThreePartyCustomerMeaning(RELEASE_SCOPE_THREE_PARTY_FIRST_DRAFT_SANITIZED)).toEqual({
      ok: true,
      reasons: [],
    });
    const first = preparePaidProServerDocumentForAcceptance(
      RELEASE_SCOPE_THREE_PARTY_FIRST_DRAFT_SANITIZED,
      threePartyDraft(),
      intake,
    ).text;
    expect(first).toMatch(/Stonebridge Wellness LLC/);
    expect(first).toMatch(/NovaPath Learning Inc/);
    expect(first).toMatch(/ClearSpring Distribution LLC/);
    expect(first).toMatch(/45\s*%/);
    expect(first).toMatch(/35\s*%/);
    expect(first).toMatch(/20\s*%/);
    expect(first).toMatch(/Oklahoma/);
    const questions = contentClarificationQuestions({ intake, body: first });
    expect(questions).not.toContain(UNCONFIRMED_MILESTONE_PAYER_QUESTION);
    expect(milestonePayerMaterialItem({ intakeRaw: intake, body: first })).toBeNull();
    expect(questions.length, "three-party content questions observed").toBe(0);

    const recovery = preparePaidProServerDocumentForAcceptance(
      buildNPartyPaidProServerCorpus({
        parties: TEST477_THREE_PARTY_LEGAL_ENTITIES,
        intakeText: TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
        draft: threePartyDraft(),
        title: "Intellectual Property License and Royalty Agreement",
        minLen: 5200,
      }),
      threePartyDraft(),
      TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
    ).text;
    const shareEntities = [TEST490_STONEBRIDGE, TEST490_NOVAPATH, TEST490_CLEARSPRING];
    expect(cueAssignedToExpectedEntity(recovery, TEST490_STONEBRIDGE, shareEntities, /\b45\s*%/)).toBe(true);
    expect(cueAssignedToExpectedEntity(recovery, TEST490_NOVAPATH, shareEntities, /\b35\s*%/)).toBe(true);
    expect(cueAssignedToExpectedEntity(recovery, TEST490_CLEARSPRING, shareEntities, /\b20\s*%/)).toBe(true);
    expect(recovery).toMatch(/Oklahoma/i);
    expect(recovery).not.toMatch(/\bJane Coordinator\b/);

    markPaidProPipelineValidationPassed({ text: recovery, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: recovery,
      source: "server_full_draft",
      draft: threePartyDraft(),
      intakeText: TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
      generationOutcome: "ok",
    });
    const saved = getPaidProSourceOfTruthText();
    const savedHash = hashPaidProCorpus(saved);
    clearPaidProSourceOfTruth();
    establishPaidProSourceOfTruth({
      text: saved,
      source: "server_full_draft",
      draft: threePartyDraft(),
      intakeText: TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
      generationOutcome: "ok",
    });
    const reopened = getPaidProSourceOfTruthText();
    expect(hashPaidProCorpus(reopened)).toBe(savedHash);
    expect(cueAssignedToExpectedEntity(reopened, TEST490_STONEBRIDGE, shareEntities, /\b45\s*%/)).toBe(true);
    expect(fingerprintAgreementBody(reopened)).toBe(fingerprintAgreementBody(saved));
  });

  it("does not treat TEST487 independent-contractor disclaimer as an advanced-instrument stop", () => {
    expect(shouldInterceptAdvancedDocumentFamily(RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE, "services_agreement")).toBe(
      false,
    );
    expect(shouldInterceptAdvancedDocumentFamily(TEST487_PRODUCTION_INTAKE, "consulting_agreement")).toBe(
      false,
    );
    expect(
      shouldRunComplexityInterceptBeforePaidGeneration({
        skipFreeStarterCreateSubmit: true,
        intakeText: TEST487_PRODUCTION_INTAKE,
        family: "consulting_agreement",
      }),
    ).toBe(false);
  });

  it("keeps the unspecified four-party payer as a guided step and applies labeled test data only", () => {
    const intake = TEST487_PRODUCTION_INTAKE;
    const draft = test487DraftWithFourParsedParties();
    const raw = buildTest487AcceptedCorpus(intake);
    const first = preparePaidProServerDocumentForAcceptance(raw, draft, intake).text;
    expect(first).toMatch(/Platform Developer/);
    expect(checkFourPartyCustomerMeaning(first, "first")).toEqual({ ok: true, reasons: [] });
    expect(first).not.toMatch(/\b(?:pays?|shall pay|will pay|paying party)\b/i);

    expect(checkFourPartyCustomerMeaning(RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED, "first")).toEqual({
      ok: true,
      reasons: [],
    });
    const sanitizedPrepared = preparePaidProServerDocumentForAcceptance(
      RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED,
      draft,
      intake,
    ).text;
    expect(sanitizedPrepared).toMatch(/\$250,000/);
    expect(sanitizedPrepared).toMatch(/Massachusetts/);
    expect(sanitizedPrepared).not.toMatch(/\b(?:shall pay|will pay|paying party)\b/i);

    const questions = contentClarificationQuestions({ intake, body: first });
    expect(questions).toEqual([UNCONFIRMED_MILESTONE_PAYER_QUESTION]);
    expect(questions.length, "four-party content questions observed").toBe(1);
    const ask = milestonePayerMaterialItem({ intakeRaw: intake, body: first });
    expect(ask?.canProceedWithoutAnswer).toBe(true);

    expect(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA).toMatch(
      /^TEST DATA \(synthetic customer answer; not part of the original intake\)/,
    );
    const applied = applySuppliedContentFactsToAuthorizedPaper(
      first,
      intake,
      RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    );
    expect(checkFourPartyCustomerMeaning(applied, "applied")).toEqual({ ok: true, reasons: [] });
    expect(applied).toMatch(/Lumen Bioinformatics Inc\. pays each listed milestone amount to the named recipient/);
    expect(applied).toMatch(/Thalassa Data Systems LLC receives \$180,000/);
    expect(applied).toMatch(/Massachusetts/);
    expect(applied).not.toMatch(/Acme Holdings/);
    expect(applied).not.toMatch(/North Star Manufacturing/);
    expect(contentClarificationQuestions({ intake, appliedAnswers: RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA, body: applied })).toEqual(
      [],
    );

    const remembered = applySuppliedContentFactsToAuthorizedPaper(
      first,
      intake,
      RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    );
    expect(hashPaidProCorpus(remembered)).toBe(hashPaidProCorpus(applied));
    expect(checkFourPartyCustomerMeaning(remembered, "applied")).toEqual({ ok: true, reasons: [] });
    expect(fingerprintAgreementBody(remembered)).toBe(fingerprintAgreementBody(applied));

    markPaidProPipelineValidationPassed({ text: first, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: first,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });
    const sotFirst = getPaidProSourceOfTruthText();
    expect(sotFirst).toMatch(/Lumen Bioinformatics Inc/);
    expect(sotFirst).toMatch(/Massachusetts/);
    expect(checkFourPartyCustomerMeaning(sotFirst, "first").ok).toBe(true);

    markPaidProPipelineValidationPassed({ text: first, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: applied,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
      allowShorterOverwrite: true,
    });
    const savedApplied = getPaidProSourceOfTruthText();
    expect(savedApplied).toMatch(/Lumen Bioinformatics Inc\. pays each listed milestone amount to the named recipient/);
    expect(savedApplied).toMatch(/Thalassa Data Systems LLC receives \$180,000/);
    expect(savedApplied).toMatch(/Massachusetts/);
    expect(savedApplied).toMatch(/Platform Developer/);
    expect(savedApplied).not.toMatch(/JOINT VENTURE AGREEMENT/);
    expect(savedApplied).not.toMatch(/as of the Effective Date by and among/);
    expect(savedApplied).not.toMatch(/The "Effective Date" is the date on which the Agreement has been fully executed/);
    expect(savedApplied).not.toMatch(/Vanguard Regulatory Sciences Ltd\. Sciences Ltd\./);
    expect(checkFourPartyCustomerMeaning(savedApplied, "applied")).toEqual({ ok: true, reasons: [] });
    expect(contentClarificationQuestions({ intake, appliedAnswers: RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA, body: savedApplied })).toEqual(
      [],
    );
  });
});
