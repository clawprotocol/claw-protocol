/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  enablePaidProReviewInstrumentationForTests,
  resolvePaidProReviewBranchPath,
  resetPaidProReviewBranchInstrumentationForTests,
} from "./paidProReviewBranchInstrumentation";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  resolveHandoffPartySlotCount,
  writePremiumRecipientHandoffLinear,
} from "./premiumPartyNamesHandoff";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  TEST413_LEGAL_ENTITIES,
  TEST413_PRODUCTION_QUAD_PARTY_INTAKE,
  buildTest413ServerFullDraft,
  test413Draft,
  test413DraftWithPhantomFifthParty,
} from "./paidProTest413Fixtures";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";

function test413Parties() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 4,
      recipient1Name: TEST413_LEGAL_ENTITIES[0],
      recipient2Name: TEST413_LEGAL_ENTITIES[1],
      recipient1Email: "joe.redmesa@example.com",
      recipient2Email: "mary.bluecanyon@example.com",
      extraPartyReviewEmails: ["hen.harborpeak@example.com", "ira.ironvale@example.com"],
      partySignerNames: ["Joe Doe", "Mary Jay", "Hen Park", "Ira Vale"],
      partySignerTitles: ["CEO", "COO", "CFO", "CTO"],
      partyAddresses: [
        "12 Sample St., Sample, MS 20934",
        "49 Picture P., Parma, IL 40302",
        "98 Ute Way, Provo, UT 92828",
        "87 Yahoo Way, Center, CT 10923",
      ],
    },
    "live_ui",
    {
      intakeText: TEST413_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: [TEST413_LEGAL_ENTITIES[0], TEST413_LEGAL_ENTITIES[1]],
    },
  ).parties;
}

beforeEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  getOrInitSessionAgreementGenerationId();
  markCurrentSessionProIntent();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
});

afterEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearPremiumPartyNamesHandoff();
  resetPremiumRecipientHandoffDedupForTests();
  resetPaidProReviewBranchInstrumentationForTests();
});

describe("TEST413_BLANK_RENDER_MISSING_PARTY_NOTICE_STANZAS", () => {
  it("accepted server_full_draft with 4 canonical parties renders — no partySlots 5, no missing stanzas", () => {
    const draft = test413DraftWithPhantomFifthParty();
    const intake = TEST413_PRODUCTION_QUAD_PARTY_INTAKE;
    const parties = test413Parties();
    const raw = buildTest413ServerFullDraft();

    const signerCount = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftParties: draft.parties,
    });
    expect(signerCount.count).toBe(4);
    expect(signerCount.draftCount).toBeGreaterThanOrEqual(4);

    // Stale phantom handoff slot must not inflate partySlots to 5
    writePremiumRecipientHandoffLinear([
      { name: TEST413_LEGAL_ENTITIES[0], email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      { name: TEST413_LEGAL_ENTITIES[1], email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      { name: TEST413_LEGAL_ENTITIES[2], email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      { name: TEST413_LEGAL_ENTITIES[3], email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      { name: "Phantom Slot", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
    ]);
    expect(resolveHandoffPartySlotCount(readPremiumRecipientHandoff()!, signerCount.count)).toBe(4);

    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, intake);
    const acceptedText = prep.text;
    expect(acceptedText.length).toBeGreaterThanOrEqual(PAID_PRO_AUTHORITY_MIN_LEN);

    markPaidProPipelineValidationPassed({ text: acceptedText, source: "server_full_draft" });

    expect(() =>
      establishPaidProSourceOfTruth({
        text: acceptedText,
        source: "server_full_draft",
        draft,
        intakeText: intake,
        generationOutcome: "ok",
      }),
    ).not.toThrow();

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const record = getPaidProSourceOfTruth()!;
    expect(record.text.length).toBeGreaterThanOrEqual(PAID_PRO_AUTHORITY_MIN_LEN);
    expect(countOperativeIfToNoticeStanzas(record.text)).toBe(4);
    expect(countPaidProExecutionBlocks(record.text)).toBe(1);

    const noticeViolations = validateNoticesClauseFamilyStructuralIntegrity(record.text, {
      parties,
      requireTwoPartyStanzas: true,
    });
    expect(noticeViolations.map((v) => v.code)).not.toContain("missing_party_notice_stanzas");

    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    expect(resolveHandoffPartySlotCount(handoff!, signerCount.count)).toBe(4);
    expect(linearPremiumRecipientSlots(handoff, signerCount.count)).toHaveLength(4);

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft: test413Draft(), intakeText: intake });
    expect(reviewPlain.length).toBeGreaterThanOrEqual(PAID_PRO_AUTHORITY_MIN_LEN);
    expect(countOperativeIfToNoticeStanzas(reviewPlain)).toBe(4);

    expect(hasCanonicalReviewCorpusForRender()).toBe(true);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBeGreaterThanOrEqual(500);

    enablePaidProReviewInstrumentationForTests();
    const branch = resolvePaidProReviewBranchPath({
      premiumPaidDocumentSurface: true,
      showPaidProReviewDocumentCard: true,
      proUpgradeUseStarterView: false,
      paidProForcedFirstReviewActive: true,
      guidedPreReviewSignerSetupActive: false,
      paidProAwaitingRuntimeAuthority: false,
      simpleProFinalReviewShellActive: false,
      failedPremiumCorpusActive: false,
      premiumReturnWaitActive: false,
    });
    expect(branch.path).not.toBe("blank_shell");
    expect(branch.path).not.toBe("failed_corpus");
  });
});
