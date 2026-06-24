/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { isAgreementCompletedForDashboard } from "../../launch/creatorDashboardAgreementCompletion";
import {
  buildAgreementVs01BridgeSession,
  mergeLiveDraftWithRecipientSetupForVs01Bridge,
  type RecipientSetupEmailInput,
} from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { readFrozenCanonicalManifestPartyCount, readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  buildTest423Corpus,
  TEST423_SCENARIOS,
  TEST423_VENDOR_PARTIES,
  TEST423_VENDOR_SIGNERS,
  type Test423Scenario,
} from "./paidProTest423Fixtures";
import {
  countPartyBlocksInExecutionTail,
  executionTail,
} from "./paidProTest423Helpers";
import { TEST424_FOUR_PARTY_VENDOR } from "./paidProTest424Fixtures";

function vendorScenario(): Test423Scenario {
  return TEST423_SCENARIOS.find((s) => s.id === "four_party_vendor_chain") ?? TEST424_FOUR_PARTY_VENDOR;
}

function buildLiveUi(scenario: Test423Scenario) {
  const parties = scenario.parties.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail: scenario.emails[partyIndex] ?? "",
    signerName: scenario.signerNames[partyIndex] ?? "",
    signerTitle: scenario.signerTitles[partyIndex] ?? "",
    partyAddress: scenario.addresses[partyIndex] ?? "",
  }));
  return {
    partyCount: parties.length,
    recipient1Name: parties[0]!.partyLegalName,
    recipient2Name: parties[1]!.partyLegalName,
    recipient1Email: parties[0]!.signerEmail,
    recipient2Email: parties[1]!.signerEmail,
    extraPartyReviewEmails: parties.slice(2).map((p) => p.signerEmail),
    extraPartyLegalNames: parties.slice(2).map((p) => p.partyLegalName),
    partySignerNames: parties.map((p) => p.signerName),
    partySignerTitles: parties.map((p) => p.signerTitle),
    partyAddresses: parties.map((p) => p.partyAddress),
  };
}

function scenarioDraft(scenario: Test423Scenario, agreementId: string): AgreementDraft {
  const now = new Date().toISOString();
  return {
    id: agreementId,
    title: scenario.draft.title ?? "Agreement",
    jurisdiction: scenario.draft.jurisdiction ?? "Illinois",
    parties: scenario.parties.map((name, i) => ({
      id: `party_${i}`,
      name,
      role: i === 0 ? "owner" : "signer",
      email: scenario.emails[i] ?? "",
    })),
    purpose: scenario.draft.purpose ?? "",
    payment_terms: scenario.draft.payment_terms ?? "",
    duration: scenario.draft.duration ?? null,
    due_date: scenario.draft.due_date ?? null,
    effective_date: scenario.draft.effective_date ?? null,
    created_at: now,
    updated_at: now,
    versions: [{ version: 1, created_at: now }],
    audit_log: [],
    agreement_document_text: getPaidProSourceOfTruthText() || undefined,
  } as AgreementDraft;
}

describe("TEST425 — 4-party vendor-chain signature completion", () => {
  const storage = new Map<string, string>();
  const local = new Map<string, string>();
  const agreementId = "ag_test425_vendor";

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => local.set(k, v),
      removeItem: (k: string) => local.delete(k),
      clear: () => local.clear(),
    });
    storage.clear();
    local.clear();
    resetPremiumRecipientHandoffDedupForTests();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    vi.unstubAllGlobals();
  });

  it("reproduces TEST424 Journey A vendor failure and asserts 4-party completion integrity", () => {
    const scenario = vendorScenario();
    expect(scenario.expectedN).toBe(4);

    const corpus = padOperativeCorpusBeforeWitness(buildTest423Corpus(scenario), 5200);
    const prep = preparePaidProServerDocumentForAcceptance(corpus, scenario.draft, scenario.intakeText);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: padOperativeCorpusBeforeWitness(prep.text, 2000),
      source: "server_full_draft",
      draft: scenario.draft,
      intakeText: scenario.intakeText,
    });

    expect(readFrozenCanonicalManifestPartyCount()).toBe(4);
    const frozenNames = readFrozenCanonicalManifestPartyNames();
    expect(frozenNames).toHaveLength(4);
    for (const party of TEST423_VENDOR_PARTIES) {
      expect(frozenNames.some((n) => n.includes(party.split(" ")[0]!))).toBe(true);
    }

    writePremiumRecipientHandoffFromAuthorityParties(
      scenario.parties.map((partyLegalName, partyIndex) => ({
        partyIndex,
        partyLegalName,
        signerEmail: scenario.emails[partyIndex] ?? "",
        signerName: scenario.signerNames[partyIndex] ?? "",
        signerTitle: scenario.signerTitles[partyIndex] ?? "",
        partyAddress: scenario.addresses[partyIndex] ?? "",
      })),
    );

    const finalizeAuthority = buildPaidProSignerMetadataAuthorityForFinalize(
      buildLiveUi(scenario),
      { intakeText: scenario.intakeText, draftPartyNames: scenario.parties.slice(0, 2) as string[] },
    );

    expect(finalizeAuthority.parties).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(finalizeAuthority.parties[i]!.partyLegalName).toContain(
        TEST423_VENDOR_PARTIES[i]!.split(" ")[0]!,
      );
      expect(finalizeAuthority.parties[i]!.partyLegalName).not.toMatch(/^Vendor\s/i);
      expect(finalizeAuthority.parties[i]!.signerName).toBe(TEST423_VENDOR_SIGNERS[i]);
      expect(isAuthoritativeLegalEntityName(finalizeAuthority.parties[i]!.signerName)).toBe(false);
    }

    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    const recipientSetup: RecipientSetupEmailInput = {
      recipient1Email: slots[0]?.email ?? "",
      recipient2Email: slots[1]?.email ?? "",
      recipientPartyEmails: slots.map((s) => s.email),
      recipientPartySignerNames: slots.map((s) => s.signerName ?? ""),
      recipientPartySignerTitles: slots.map((s) => s.signerTitle ?? ""),
    };
    const draft = scenarioDraft(scenario, agreementId);
    const mergedDraft = mergeLiveDraftWithRecipientSetupForVs01Bridge(draft, recipientSetup) ?? draft;
    const bridge = buildAgreementVs01BridgeSession({
      agreementId,
      vs01DocumentId: `doc_${agreementId}`,
      draft: mergedDraft,
      senderFirstLawdogHandoff: true,
      agreementCorpusText: getPaidProSourceOfTruthText(),
      recipientSetup,
    });

    expect(bridge.counterparties).toHaveLength(3);
    const signerEmails = [bridge.creatorEmail, ...bridge.counterparties.map((c) => c.email)].filter(
      (e) => e.includes("@"),
    );
    expect(signerEmails).toHaveLength(4);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruthText(),
      authority: finalizeAuthority,
      intakeRaw: scenario.intakeText,
      surface: "test424_completion",
      signatureRegionOnly: false,
      repairRecital: true,
    });
    expect(hydrated.rejected).toBe(false);

    const partyBlocks = countPartyBlocksInExecutionTail(hydrated.corpus, scenario.parties);
    expect(partyBlocks).toBe(4);

    const tail = executionTail(hydrated.corpus);
    for (const party of TEST423_VENDOR_PARTIES) {
      expect(tail.toLowerCase()).toContain(party.split(" ")[0]!.toLowerCase());
    }
    for (const signer of TEST423_VENDOR_SIGNERS) {
      expect(hydrated.corpus).toContain(signer);
    }

    expect(
      isAgreementCompletedForDashboard({
        id: agreementId,
        completed_signed: false,
      }),
    ).toBe(false);
  });
});
