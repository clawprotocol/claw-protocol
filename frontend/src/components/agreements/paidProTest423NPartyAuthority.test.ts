/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import {
  buildPaidProFreezeCandidate,
  previewRecoverPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import { readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import { applyPremiumRecipientHandoffReadGate } from "./paidProPremiumRecipientHandoffReadGate";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  assertAuthorityPartiesMetadata,
  assertCanonicalPartyCount,
  assertCorpusNPartyStructure,
  assertHandoffSlotIntegrity,
} from "./paidProTest423Helpers";
import {
  TEST423_SCENARIOS,
  TEST423_CONSULTING_INTAKE,
  TEST423_TWO_PARTIES,
  TEST423_TWO_INTAKE,
  buildTest423Corpus,
  test423ConsultingDraft,
  test423TwoPartyDraft,
  type Test423Scenario,
} from "./paidProTest423Fixtures";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";

function authorityFromScenario(scenario: Test423Scenario): PaidProSignerMetadataParty[] {
  return scenario.parties.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail: scenario.emails[partyIndex] ?? "",
    signerName: scenario.signerNames[partyIndex] ?? "",
    signerTitle: scenario.signerTitles[partyIndex] ?? "",
    partyAddress: scenario.addresses[partyIndex] ?? "",
  }));
}

function runLifecycleScenario(scenario: Test423Scenario): void {
  const corpus = buildTest423Corpus(scenario);
  const prep = preparePaidProServerDocumentForAcceptance(
    corpus,
    scenario.draft,
    scenario.intakeText,
  );
  const accepted = padOperativeCorpusBeforeWitness(prep.text, 2000);
  markPaidProPipelineValidationPassed({ text: accepted, source: "server_full_draft" });

  assertCanonicalPartyCount(
    scenario.id,
    scenario.intakeText,
    scenario.draft,
    scenario.expectedN,
    accepted,
  );

  establishPaidProSourceOfTruth({
    text: accepted,
    source: "server_full_draft",
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });

  expect(hasPaidProSourceOfTruth()).toBe(true);
  expect(hasCanonicalReviewCorpusForRender()).toBe(true);
  expect(resolveCanonicalReviewCorpusLenForRender()).toBeGreaterThan(3000);
  expect(readFrozenCanonicalManifestPartyCount()).toBe(scenario.expectedN);

  const sot = getPaidProSourceOfTruthText();
  assertCorpusNPartyStructure({
    expectedN: scenario.expectedN,
    intakeText: scenario.intakeText,
    draft: scenario.draft,
    parties: scenario.parties,
    signerNames: scenario.signerNames,
    corpus: sot,
    requireNoticeStanzas: scenario.requireNoticeStanzas ?? true,
  });

  const authority = authorityFromScenario(scenario);
  writePremiumRecipientHandoffFromAuthorityParties(authority);
  assertHandoffSlotIntegrity(readPremiumRecipientHandoff(), scenario.expectedN, scenario.parties);

  const seed = runPaidProSignerMetadataAuthoritySeed({
    stage: `test423_${scenario.id}`,
    legalEntities: [...scenario.parties],
    intakeText: scenario.intakeText,
    draft: scenario.draft,
    handoff: readPremiumRecipientHandoff(),
    uiSignerNames: scenario.signerNames.slice(0, 2),
    uiSignerTitles: scenario.signerTitles.slice(0, 2),
    authoritativePartyCount: scenario.expectedN,
  });
  expect(seed.names.filter((n) => n.trim()).length, `${scenario.id}:seedNames`).toBe(
    scenario.expectedN,
  );
  expect(seed.titles.filter((t) => t.trim()).length, `${scenario.id}:seedTitles`).toBe(
    scenario.expectedN,
  );

  const review = resolvePaidProReviewRenderPlain({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  expect(review.trim().length).toBeGreaterThan(3000);
  for (const party of scenario.parties) {
    expect(review).toContain(party);
  }

  const freeze = buildPaidProFreezeCandidate({
    text: sot,
    draft: scenario.draft,
    intakeText: scenario.intakeText,
    source: "server_full_draft",
  });
  expect(freeze.ok).toBe(true);
  const reGate = buildPaidProFreezeCandidate({
    text: freeze.text,
    draft: scenario.draft,
    intakeText: scenario.intakeText,
    source: "server_full_draft",
  });
  expect(reGate.ok).toBe(true);
  expect(reGate.hash).toBe(freeze.hash);
}

describe("TEST423 — general N-party Pro agreement authority", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    storage.clear();
    vi.unstubAllGlobals();
  });

  for (const scenario of TEST423_SCENARIOS) {
    it(`lifecycle preserves ${scenario.expectedN}-party authority for ${scenario.id}`, () => {
      runLifecycleScenario(scenario);
    });
  }

  it("stale session: prior 4-party handoff does not phantom-slot a new 2-party intake", () => {
    const four = TEST423_SCENARIOS[0]!;
    const fourAuthority = authorityFromScenario(four);
    writePremiumRecipientHandoffFromAuthorityParties(fourAuthority);
    assertHandoffSlotIntegrity(readPremiumRecipientHandoff(), 4, four.parties);

    const twoDraft = test423TwoPartyDraft();
    assertCanonicalPartyCount("stale_high_to_low", TEST423_TWO_INTAKE, twoDraft, 2);

    const gated = applyPremiumRecipientHandoffReadGate(readPremiumRecipientHandoff(), {
      partySlotCount: 2,
    });
    const slots = linearPremiumRecipientSlots(gated, 2);
    expect(slots.length).toBe(2);
    expect(slots.some((s) => /Summit Ridge|Prairie Nova|Coastal Harbor|Cascade Meridian/i.test(s.name))).toBe(
      false,
    );
    expect(slots.every((s) => !(s.signerName || "").trim())).toBe(true);

    const twoAuthority: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: TEST423_TWO_PARTIES[0],
        signerEmail: "ian@lakeside.example.com",
        signerName: "Ian Lake",
        signerTitle: "CEO",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: TEST423_TWO_PARTIES[1],
        signerEmail: "jenna@mountainview.example.com",
        signerName: "Jenna View",
        signerTitle: "President",
        partyAddress: "",
      },
    ];
    writePremiumRecipientHandoffFromAuthorityParties(twoAuthority);
    assertHandoffSlotIntegrity(readPremiumRecipientHandoff(), 2, TEST423_TWO_PARTIES);
  });

  it("stale session: prior 2-party handoff expands cleanly to 4-party intake", () => {
    const twoAuthority: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: TEST423_TWO_PARTIES[0],
        signerEmail: "ian@lakeside.example.com",
        signerName: "Ian Lake",
        signerTitle: "CEO",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: TEST423_TWO_PARTIES[1],
        signerEmail: "jenna@mountainview.example.com",
        signerName: "Jenna View",
        signerTitle: "President",
        partyAddress: "",
      },
    ];
    writePremiumRecipientHandoffFromAuthorityParties(twoAuthority);
    assertHandoffSlotIntegrity(readPremiumRecipientHandoff(), 2, TEST423_TWO_PARTIES);

    const fourDraft = test423ConsultingDraft();
    assertCanonicalPartyCount("stale_low_to_high", TEST423_CONSULTING_INTAKE, fourDraft, 4);

    const fourAuthority = authorityFromScenario(TEST423_SCENARIOS[0]!);
    writePremiumRecipientHandoffFromAuthorityParties(fourAuthority);
    assertHandoffSlotIntegrity(
      readPremiumRecipientHandoff(),
      4,
      TEST423_SCENARIOS[0]!.parties,
    );
    assertAuthorityPartiesMetadata(
      "stale_low_to_high",
      fourAuthority,
      TEST423_SCENARIOS[0]!.parties,
      TEST423_SCENARIOS[0]!.signerNames,
    );
  });

  it("does not mount review corpus from latch or partial authoritative state without frozen SoT", () => {
    const scenario = TEST423_SCENARIOS[0]!;
    const corpus = buildTest423Corpus(scenario);
    markPaidProPipelineValidationPassed({ text: corpus, source: "server_full_draft" });

    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasCanonicalReviewCorpusForRender()).toBe(false);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBe(0);
    expect(resolvePaidProReviewRenderPlain({
      draft: scenario.draft,
      intakeText: scenario.intakeText,
    }).trim().length).toBeLessThan(500);
  });

  it("deterministic recovery preview honors intake party count for varied scenarios", () => {
    for (const scenario of TEST423_SCENARIOS.filter((s) => s.expectedN >= 4).slice(0, 3)) {
      const recovery = previewRecoverPaidProFreezeCandidate({
        draft: scenario.draft,
        intakeText: scenario.intakeText,
        surface: `test423_recovery_${scenario.id}`,
      });
      expect(recovery.ok, `${scenario.id}:${recovery.rejectReason ?? "unknown"}`).toBe(true);
      if (!recovery.ok) continue;
      assertCanonicalPartyCount(
        `recovery_${scenario.id}`,
        scenario.intakeText,
        scenario.draft,
        scenario.expectedN,
        recovery.text,
      );
      expect(hashPaidProCorpus(recovery.text)).toBeTruthy();
    }
  });
});
