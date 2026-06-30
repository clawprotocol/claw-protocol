/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  buildCanonicalPartyMetadataBundle,
  CANONICAL_PARTY_METADATA_DEPENDENCY_MAP,
  computeCanonicalPartyMetadataFieldCounts,
  findCanonicalPartyById,
  mutateCanonicalPartyMetadata,
  projectCanonicalMetadataToSurfaces,
  readActiveCanonicalBundleIdentity,
  readCanonicalPartyMetadata,
  readLastCanonicalProjectionBundleId,
  resetCanonicalPartyMetadataDiagnosticsForTests,
  stablePartyIdForLegalEntity,
} from "./canonicalPartyMetadataAuthority";
import {
  assertCanonicalMetadataNotFromAgreementBody,
  enableCorpusCanonicalMutationGuardForTests,
  isDisplayOnlyCanonicalInferenceSource,
} from "./canonicalPartyMetadataGuard";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
  readConsumedProjectionBundleId,
} from "./paidProSignerMetadataAuthority";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import { extractSignerMetadataFromCorpus } from "./universalSignerMetadataAuthority";
import {
  TEST477_FOUR_PARTY,
  TEST477_FOUR_PARTY_INTAKE,
  TEST477_FOUR_PARTY_LEGAL_ENTITIES,
  TEST477_THREE_PARTY,
  TEST477_THREE_PARTY_INTAKE,
  TEST477_THREE_PARTY_LEGAL_ENTITIES,
  TEST477_TWO_PARTY,
  TEST477_TWO_PARTY_INTAKE,
  TEST477_TWO_PARTY_LEGAL_ENTITIES,
} from "./paidProTest477Fixtures";

function simulateStagePipeline(
  intake: string,
  legalEntities: string[],
  partyCount: number,
  userEdits?: { names?: string[]; titles?: string[]; emails?: string[]; addresses?: string[] },
) {
  const created = mutateCanonicalPartyMetadata({
    stage: "created",
    legalEntities,
    intakeText: intake,
    uiParties: legalEntities.map((entity, i) => ({
      partyIndex: i,
      partyLegalName: entity,
      signerName: userEdits?.names?.[i] ?? "",
      signerTitle: userEdits?.titles?.[i] ?? "",
      signerEmail: userEdits?.emails?.[i] ?? "",
      partyAddress: userEdits?.addresses?.[i] ?? "",
    })),
    mutationSource: userEdits ? "user_edited_ui" : "structured_intake",
    replaceSession: true,
    project: false,
  });
  const afterCheckout = mutateCanonicalPartyMetadata({
    stage: "after-checkout",
    legalEntities,
    intakeText: intake,
    mutationSource: "structured_intake",
    replaceSession: false,
    project: false,
  });
  const afterPremium = mutateCanonicalPartyMetadata({
    stage: "after-premium",
    legalEntities,
    intakeText: intake,
    mutationSource: "structured_intake",
    replaceSession: false,
    project: true,
  });
  const review = readCanonicalPartyMetadata()!;
  projectCanonicalMetadataToSurfaces(review, "review");
  const signerSetup = mutateCanonicalPartyMetadata({
    stage: "signer-setup",
    legalEntities,
    intakeText: intake,
    uiParties: review.parties.map((p) => ({
      partyIndex: p.partyIndex,
      partyLegalName: p.partyLegalName,
      signerName: p.signerName,
      signerTitle: p.signerTitle,
      signerEmail: p.signerEmail,
      partyAddress: p.partyAddress,
    })),
    mutationSource: "signer_setup_form",
    replaceSession: false,
    project: true,
  });
  return { created, afterCheckout, afterPremium, review, signerSetup, partyCount };
}

describe("TEST478 — canonical party metadata architecture hardening", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    enableCorpusCanonicalMutationGuardForTests(true);
  });

  afterEach(() => {
    storage.clear();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
    resetCanonicalPartyMetadataDiagnosticsForTests();
    clearConsumedPaidProSignerMetadataAuthority();
    enableCorpusCanonicalMutationGuardForTests(false);
    vi.unstubAllGlobals();
  });

  it("documents dependency map with mutation boundaries", () => {
    expect(CANONICAL_PARTY_METADATA_DEPENDENCY_MAP.length).toBeGreaterThanOrEqual(8);
    const mutable = CANONICAL_PARTY_METADATA_DEPENDENCY_MAP.filter((e) => e.mutation);
    const readOnly = CANONICAL_PARTY_METADATA_DEPENDENCY_MAP.filter((e) => !e.mutation);
    expect(mutable.some((e) => e.stage === "Intake")).toBe(true);
    expect(readOnly.some((e) => e.stage === "Notices")).toBe(true);
    expect(readOnly.some((e) => e.stage === "Execution")).toBe(true);
  });

  it("corpus inference is display-only and cannot mutate canonical metadata", () => {
    expect(isDisplayOnlyCanonicalInferenceSource("ai_generated_corpus")).toBe(true);
    expect(isDisplayOnlyCanonicalInferenceSource("generated_corpus_inference")).toBe(true);
    expect(() => assertCanonicalMetadataNotFromAgreementBody("ai_generated_corpus")).toThrow(
      /cannot mutate canonical metadata/,
    );
    const corpusRows = extractSignerMetadataFromCorpus(
      "Blue Canyon Analytics LLC\nName: Wrong Name\nTitle: Wrong Title",
      ["Blue Canyon Analytics LLC"],
    );
    expect(corpusRows.length).toBeGreaterThan(0);
    expect(() =>
      buildCanonicalPartyMetadataBundle({
        legalEntities: ["Blue Canyon Analytics LLC"],
        mutationSource: "ai_generated_corpus" as never,
      }),
    ).toThrow(/cannot mutate canonical metadata/);
  });

  it("stable party IDs survive intake → seed → review → signer setup (2-party)", () => {
    const { created, signerSetup } = simulateStagePipeline(
      TEST477_TWO_PARTY_INTAKE,
      TEST477_TWO_PARTY_LEGAL_ENTITIES,
      2,
    );
    expect(created.bundleId).toBeTruthy();
    expect(signerSetup.bundleId).toBe(created.bundleId);
    for (const party of TEST477_TWO_PARTY) {
      const id = stablePartyIdForLegalEntity(party.legalEntity);
      expect(findCanonicalPartyById(signerSetup, id)?.signerName).toBe(party.signerName);
    }
  });

  it("stable party IDs survive all stages (3-party)", () => {
    const ids = TEST477_THREE_PARTY.map((p) => stablePartyIdForLegalEntity(p.legalEntity));
    const { signerSetup } = simulateStagePipeline(
      TEST477_THREE_PARTY_INTAKE,
      TEST477_THREE_PARTY_LEGAL_ENTITIES,
      3,
    );
    expect(signerSetup.parties.map((p) => p.partyId)).toEqual(ids);
    expect(signerSetup.parties.map((p) => p.signerName)).toEqual(TEST477_THREE_PARTY.map((p) => p.signerName));
  });

  it("stable party IDs survive all stages (4-party)", () => {
    const { signerSetup } = simulateStagePipeline(
      TEST477_FOUR_PARTY_INTAKE,
      TEST477_FOUR_PARTY_LEGAL_ENTITIES,
      4,
    );
    expect(signerSetup.parties).toHaveLength(4);
    for (const party of TEST477_FOUR_PARTY) {
      expect(findCanonicalPartyById(signerSetup, stablePartyIdForLegalEntity(party.legalEntity))?.signerEmail).toBe(
        party.email,
      );
    }
  });

  it("handoff and consumed authority are projections with matching bundleId", () => {
    runPaidProSignerMetadataAuthoritySeed({
      stage: "test478_projection",
      legalEntities: TEST477_THREE_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_THREE_PARTY_INTAKE,
      uiSignerNames: ["", "", ""],
      uiSignerTitles: ["", "", ""],
      authoritativePartyCount: 3,
    });
    const bundle = readCanonicalPartyMetadata()!;
    expect(readLastCanonicalProjectionBundleId()).toBe(bundle.bundleId);
    expect(readConsumedProjectionBundleId()).toBe(bundle.bundleId);
    expect(readActiveCanonicalBundleIdentity().bundleId).toBe(bundle.bundleId);
    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 3);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(3);
    expect(readConsumedPaidProSignerMetadataAuthority()?.parties).toHaveLength(3);
  });

  it("user edits override intake and remain authoritative downstream", () => {
    const { signerSetup } = simulateStagePipeline(
      TEST477_TWO_PARTY_INTAKE,
      TEST477_TWO_PARTY_LEGAL_ENTITIES,
      2,
      {
        names: ["Edited Alpha", "Edited Beta"],
        titles: ["Title A", "Title B"],
        emails: ["alpha@example.com", "beta@example.com"],
        addresses: ["1 Edit St", "2 Edit St"],
      },
    );
    expect(["user_edited_ui", "signer_setup_form"]).toContain(signerSetup.source);
    expect(signerSetup.parties[0]?.signerName).toBe("Edited Alpha");
    expect(signerSetup.parties[1]?.signerEmail).toBe("beta@example.com");
    expect(signerSetup.parties[0]?.signerName).not.toBe(TEST477_TWO_PARTY[0]!.signerName);
  });

  it("session restoration preserves bundleId and field counts", () => {
    mutateCanonicalPartyMetadata({
      stage: "after-premium",
      legalEntities: TEST477_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_FOUR_PARTY_INTAKE,
      mutationSource: "structured_intake",
      replaceSession: true,
      project: true,
    });
    const before = readCanonicalPartyMetadata()!;
    const countsBefore = computeCanonicalPartyMetadataFieldCounts(before);
    clearConsumedPaidProSignerMetadataAuthority();
    mutateCanonicalPartyMetadata({
      stage: "review",
      legalEntities: TEST477_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_FOUR_PARTY_INTAKE,
      mutationSource: "session_restoration",
      replaceSession: false,
      project: true,
    });
    const after = readCanonicalPartyMetadata()!;
    const countsAfter = computeCanonicalPartyMetadataFieldCounts(after);
    expect(after.bundleId).toBe(before.bundleId);
    expect(countsAfter.signerNameCount).toBe(countsBefore.signerNameCount);
    expect(countsAfter.emailCount).toBe(countsBefore.emailCount);
  });

  it("retry/regeneration after timeout does not drop party metadata counts", () => {
    runPaidProSignerMetadataAuthoritySeed({
      stage: "premium_completion_timeout_retry",
      legalEntities: TEST477_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_FOUR_PARTY_INTAKE,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      authoritativePartyCount: 4,
    });
    const first = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    runPaidProSignerMetadataAuthoritySeed({
      stage: "premium_second_generation_triggered",
      legalEntities: TEST477_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_FOUR_PARTY_INTAKE,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      authoritativePartyCount: 4,
    });
    const second = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(second.partyCount).toBe(first.partyCount);
    expect(second.signerNameCount).toBe(first.signerNameCount);
    expect(second.emailCount).toBe(first.emailCount);
  });

  it("notices and execution hydrate from canonical projection without mutating bundle", () => {
    runPaidProSignerMetadataAuthoritySeed({
      stage: "test478_hydrate",
      legalEntities: TEST477_THREE_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_THREE_PARTY_INTAKE,
      authoritativePartyCount: 3,
    });
    const before = readCanonicalPartyMetadata()!;
    const beforeHash = before.bundleHash;
    const authority = readConsumedPaidProSignerMetadataAuthority()!;
    const corpus = [
      "AGREEMENT",
      "10.4 Notices",
      TEST477_THREE_PARTY.map(
        (p) =>
          `If to ${p.legalEntity}:\nAttention: Authorized Signer\nEmail: provided during signer setup.`,
      ).join("\n\n"),
      "IN WITNESS WHEREOF",
      ...TEST477_THREE_PARTY.flatMap((p) => [p.legalEntity, "Name: ______________________________", ""]),
    ].join("\n");
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: corpus,
      authority,
      intakeRaw: TEST477_THREE_PARTY_INTAKE,
      surface: "test478_hydrate",
    });
    const after = readCanonicalPartyMetadata()!;
    expect(after.bundleHash).toBe(beforeHash);
    for (const party of TEST477_THREE_PARTY) {
      expect(hydrated.corpus).toContain(party.signerName);
      expect(hydrated.corpus).toContain(party.email);
    }
  });

  it("N-party canonical bundle is not silently truncated below legal entity count", () => {
    const sixEntities = [
      ...TEST477_FOUR_PARTY_LEGAL_ENTITIES,
      "Fifth Party Holdings LLC",
      "Sixth Party Ventures Inc",
    ];
    const bundle = buildCanonicalPartyMetadataBundle({
      legalEntities: sixEntities,
      intakeText: TEST477_FOUR_PARTY_INTAKE,
      mutationSource: "structured_intake",
    });
    expect(bundle.parties.length).toBe(6);
    expect(bundle.parties[5]?.partyLegalName).toBe("Sixth Party Ventures Inc");
  });
});
