/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  persistPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import {
  applyPaidProSectionStructureCompletenessAuthority,
} from "./paidProSectionStructureCompletenessAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import {
  resolvePremiumPreValidationBody,
  isSubstantivePremiumServerFullDocument,
} from "./premiumPreValidationBodyAuthority";
import {
  setConsumedPaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { resolveNoticeStructuralValidationParties } from "./paidProPartyNoticeDetails";
import {
  buildTest444ServerFullDraft,
  TEST444_HARBOR_PEAK,
  TEST444_INTAKE,
  TEST444_MIN_SERVER_LEN,
  TEST444_RED_MESA,
  test444Draft,
} from "./paidProTest444Fixtures";
import { buildTest442ShortDocumentText } from "./paidProTest442Fixtures";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";

const STARTER_FALLBACK = "Starter draft preview — short fallback corpus for TEST444.";

function emptyConsumedAuthorityParties(): PaidProSignerMetadataParty[] {
  return [
    {
      partyIndex: 0,
      partyLegalName: "",
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    },
    {
      partyIndex: 1,
      partyLegalName: "",
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    },
  ];
}

describe("TEST444 — short intake Red Mesa / Harbor Peak freeze after 17k server draft", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearConsumedPaidProSignerMetadataAuthority();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("fixture uses exact Railway QA short prompt", () => {
    expect(TEST444_INTAKE).toContain(TEST444_RED_MESA);
    expect(TEST444_INTAKE).toContain(TEST444_HARBOR_PEAK);
    expect(TEST444_INTAKE).toContain("Oklahoma law");
    expect(TEST444_INTAKE).not.toContain("Client:");
  });

  it("notice authority hydrates legal names from short intake when consumed slots are empty", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: emptyConsumedAuthorityParties(),
      source: "live_ui",
      hash: "test444-empty",
      updatedAt: Date.now(),
    });
    persistPremiumRecipientHandoff({
      party1: { name: "", email: "", role: "Client" },
      party2: { name: "", email: "", role: "Service Provider" },
    });

    const reviewParties = resolvePartiesForReviewRender({
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
    });
    expect(reviewParties[0]?.partyLegalName).toBe(TEST444_RED_MESA);
    expect(reviewParties[1]?.partyLegalName).toBe(TEST444_HARBOR_PEAK);

    const server = buildTest444ServerFullDraft();
    const noticeParties = resolveNoticeStructuralValidationParties(reviewParties, {
      intakeText: TEST444_INTAKE,
      draftPartyNames: test444Draft().parties?.map((p) => p.name) ?? [],
      acceptedCorpus: server,
    });
    expect(noticeParties[0]?.partyLegalName).toBe(TEST444_RED_MESA);
    expect(noticeParties[1]?.partyLegalName).toBe(TEST444_HARBOR_PEAK);
  });

  it("pre-validation adopts substantive server full before freeze prep", () => {
    const shortDoc = buildTest442ShortDocumentText();
    const serverFull = buildTest444ServerFullDraft();
    const effectiveFull = {
      document_text: shortDoc,
      server_full_document_text: serverFull,
      generation_outcome: "ok",
    } as PremiumFullDraftResult;
    expect(isSubstantivePremiumServerFullDocument(serverFull.length, effectiveFull)).toBe(true);

    const adopted = resolvePremiumPreValidationBody({
      clientDocumentText: shortDoc,
      effectiveFull,
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      wireServerFullDocumentText: serverFull,
    });
    expect(adopted.adoptedServerFull).toBe(true);
    expect(adopted.text.length).toBeGreaterThan(shortDoc.length * 2);
    expect(adopted.text).toContain(TEST444_RED_MESA);
  });

  it("freeze accepts ~17k server draft — no Party 1/2 notice stanzas or heading anomaly rejection", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: emptyConsumedAuthorityParties(),
      source: "live_ui",
      hash: "test444-freeze",
      updatedAt: Date.now(),
    });
    persistPremiumRecipientHandoff({
      party1: { name: "", email: "", role: "Client" },
      party2: { name: "", email: "", role: "Service Provider" },
    });

    const server = buildTest444ServerFullDraft();
    expect(server.length).toBeGreaterThan(TEST444_MIN_SERVER_LEN - 500);

    const adopted = resolvePremiumPreValidationBody({
      clientDocumentText: buildTest442ShortDocumentText(),
      effectiveFull: {
        document_text: buildTest442ShortDocumentText(),
        server_full_document_text: server,
        generation_outcome: "ok",
      } as PremiumFullDraftResult,
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      wireServerFullDocumentText: server,
    }).text;

    const prepared = preparePaidProServerDocumentForAcceptance(
      adopted,
      test444Draft(),
      TEST444_INTAKE,
      { surface: "test444_prepare" },
    );

    const structure = applyPaidProSectionStructureCompletenessAuthority(prepared.text, {
      source: "test444_structure",
      phase: "pre_freeze",
    });
    expect(structure.rejectReason).not.toBe("section_heading_title_anomaly");
    expect(structure.rejected).toBe(false);

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      agreementGenerationId: "gen-test444",
      surface: "test444_freeze_commit",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text).not.toMatch(/\bParty 1\b/);
    expect(freezeCommit.text).not.toMatch(/\bParty 2\b/);
    expect(freezeCommit.text).toContain(TEST444_RED_MESA);
    expect(freezeCommit.text).toContain(TEST444_HARBOR_PEAK);
  });

  it("establishes SoT from server_full_draft and renders long authoritative review", () => {
    const server = buildTest444ServerFullDraft();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test444Draft(),
      TEST444_INTAKE,
      { surface: "test444_sot_prepare" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      surface: "test444_sot_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      reviewSessionId: "gen-test444-sot",
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(10000);
    expect(sot).toContain(TEST444_RED_MESA);
    expect(sot).toContain(TEST444_HARBOR_PEAK);
    expect(isAuthoritativePremiumPipelineRenderSource("server_full_draft")).toBe(true);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(10000);

    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: sot,
      renderedPreviewPlain: STARTER_FALLBACK,
      finalReviewAuthorityOnly: true,
    });
    expect(finalReview.source).not.toBe("rejected_paid_corpus");
    expect(finalReview.source).not.toBe("free_starter");
    expect(finalReview.plainText.length).toBeGreaterThan(10000);
    expect(finalReview.authoritativeLen).toBeGreaterThan(10000);
    expect(finalReview.plainText).toContain(TEST444_HARBOR_PEAK);

    const validation = validatePaidProOutput({
      text: sot,
      rawIntake: TEST444_INTAKE,
      draft: test444Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok, validation.reasons.join("|") || "validation_failed").toBe(true);
    expect(validation.reasons).not.toContain("section_heading_title_anomaly");
    expect(validation.reasons).not.toContain("rejected_paid_corpus");
  });
});
