/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  mutateCanonicalPartyMetadata,
  readActiveCanonicalBundleIdentity,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import {
  alignIntakeSignerMetadataToLegalEntities,
  countIntakeSignerMetadataSlots,
  extractCanonicalIntakeSignerMetadata,
} from "./intakeSignerMetadataAuthority";
import { applyPremiumRecipientHandoffReadGate } from "./paidProPremiumRecipientHandoffReadGate";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffExact,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  TEST479_FOUR_PARTY,
  TEST479_FOUR_PARTY_INLINE_INTAKE,
  TEST479_FOUR_PARTY_INTAKE,
  TEST479_FOUR_PARTY_LEGAL_ENTITIES,
  type Test479PartyFixture,
} from "./paidProTest479Fixtures";

function assertIntakeExtracted(
  parties: readonly Test479PartyFixture[],
  intake: string,
  legalEntities: string[],
) {
  const rows = extractCanonicalIntakeSignerMetadata(intake);
  expect(rows.length).toBeGreaterThanOrEqual(parties.length);
  for (const party of parties) {
    expect(rows.some((r) => r.signerName === party.signerName)).toBe(true);
    expect(rows.some((r) => r.signerEmail === party.email)).toBe(true);
  }
  const aligned = alignIntakeSignerMetadataToLegalEntities(intake, legalEntities);
  expect(aligned.filter((s) => s.signerName.trim()).length).toBe(parties.length);
  expect(aligned.filter((s) => s.signerTitle.trim()).length).toBe(parties.length);
  expect(aligned.filter((s) => s.signerEmail.trim()).length).toBe(parties.length);
  expect(aligned.filter((s) => s.partyAddress.trim()).length).toBe(parties.length);
}

function simulateProPipeline(intake: string, legalEntities: string[]) {
  const created = establishCanonicalPartyMetadataAtStage({
    stage: "created",
    legalEntities,
    intakeText: intake,
    mutationSource: "structured_intake",
    persistHandoff: false,
  });
  const bundleIdAtIntake = created.bundleId;

  mutateCanonicalPartyMetadata({
    stage: "after-premium",
    legalEntities,
    intakeText: intake,
    mutationSource: "structured_intake",
    replaceSession: false,
    project: true,
  });

  writePremiumRecipientHandoffExact(
    { name: legalEntities[0] ?? "", email: "", role: "party" },
    { name: legalEntities[1] ?? "", email: "", role: "party" },
    legalEntities.slice(2).map((name) => ({ name, email: "", role: "party" })),
    legalEntities.length,
  );

  const seed = runPaidProSignerMetadataAuthoritySeed({
    stage: "test479_signer_setup",
    legalEntities,
    intakeText: intake,
    uiSignerNames: ["", "", "", ""],
    uiSignerTitles: ["", "", "", ""],
    uiSignerEmails: ["", "", "", ""],
    uiPartyAddresses: ["", "", "", ""],
    authoritativePartyCount: legalEntities.length,
  });

  return { bundleIdAtIntake, seed };
}

describe("TEST479 — four-party Represented by metadata survives Pro pipeline", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
  });

  afterEach(() => {
    storage.clear();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
    resetCanonicalPartyMetadataDiagnosticsForTests();
    clearConsumedPaidProSignerMetadataAuthority();
    vi.unstubAllGlobals();
  });

  it("parses Represented by blocks with multiline addresses for all 4 parties", () => {
    assertIntakeExtracted(
      TEST479_FOUR_PARTY,
      TEST479_FOUR_PARTY_INTAKE,
      TEST479_FOUR_PARTY_LEGAL_ENTITIES,
    );
  });

  it("parses inline em-dash entity contact clauses for all 4 parties", () => {
    assertIntakeExtracted(
      TEST479_FOUR_PARTY,
      TEST479_FOUR_PARTY_INLINE_INTAKE,
      TEST479_FOUR_PARTY_LEGAL_ENTITIES,
    );
  });

  it("preserves signer metadata through pro gate, premium checkout handoff, and signer setup", () => {
    const intake = TEST479_FOUR_PARTY_INTAKE;
    const legalEntities = TEST479_FOUR_PARTY_LEGAL_ENTITIES;
    const { bundleIdAtIntake, seed } = simulateProPipeline(intake, legalEntities);

    expect(seed.uiChanged).toBe(true);
    expect(seed.contactFieldsChanged).toBe(true);

    const canonical = readCanonicalPartyMetadata();
    expect(canonical?.bundleId).toBe(bundleIdAtIntake);
    const fieldCounts = computeCanonicalPartyMetadataFieldCounts(canonical);
    expect(fieldCounts.signerNameCount).toBe(4);
    expect(fieldCounts.titleCount).toBe(4);
    expect(fieldCounts.emailCount).toBe(4);
    expect(fieldCounts.addressCount).toBe(4);
    expect(canonical?.parties.map((p) => p.partyId).length).toBe(4);

    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(slots[i]?.signerName).toBe(TEST479_FOUR_PARTY[i]!.signerName);
      expect(slots[i]?.signerTitle).toBe(TEST479_FOUR_PARTY[i]!.signerTitle);
      expect(slots[i]?.email).toBe(TEST479_FOUR_PARTY[i]!.email);
      expect(slots[i]?.partyAddress).toContain(TEST479_FOUR_PARTY[i]!.address.split(",")[0]!.trim());
    }

    const consumed = readConsumedPaidProSignerMetadataAuthority();
    expect(consumed?.parties.filter((p) => p.signerName.trim()).length).toBe(4);

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 4,
      intakeText: intake,
      draftPartyNames: legalEntities,
      partySignerNames: seed.names,
      recipient1Name: legalEntities[0] ?? "",
      recipient2Name: legalEntities[1] ?? "",
      recipient1Email: seed.emails[0] ?? "",
      recipient2Email: seed.emails[1] ?? "",
      extraPartyReviewEmails: seed.emails.slice(2),
      extraPartyLegalNames: legalEntities.slice(2),
    });
    expect(gate.complete).toBe(true);

    const identity = readActiveCanonicalBundleIdentity();
    expect(identity.bundleId).toBe(bundleIdAtIntake);
  });

  it("empty handoff read is ignored when canonical bundle has populated signer fields", () => {
    runPaidProSignerMetadataAuthoritySeed({
      stage: "test479_handoff_gate",
      legalEntities: TEST479_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: TEST479_FOUR_PARTY_INTAKE,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      authoritativePartyCount: 4,
    });
    const populated = readPremiumRecipientHandoff();
    expect(populated).toBeTruthy();
    const emptyRead = applyPremiumRecipientHandoffReadGate(
      {
        v: 2,
        party1: { name: TEST479_FOUR_PARTY[0]!.legalEntity, email: "", role: "party" },
        party2: { name: TEST479_FOUR_PARTY[1]!.legalEntity, email: "", role: "party" },
        partyIndexSlots: TEST479_FOUR_PARTY.slice(2).map((p) => ({
          name: p.legalEntity,
          email: "",
          role: "party",
        })),
        savedAt: populated!.savedAt,
      },
      { partySlotCount: 4 },
    );
    const slots = linearPremiumRecipientSlots(emptyRead, 4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.signerTitle?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.email?.trim()).length).toBe(4);
  });

  it("notices and execution blocks hydrate from canonical authority without placeholders", () => {
    runPaidProSignerMetadataAuthoritySeed({
      stage: "test479_notices_hydrate",
      legalEntities: TEST479_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: TEST479_FOUR_PARTY_INTAKE,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      authoritativePartyCount: 4,
    });
    const authority = readConsumedPaidProSignerMetadataAuthority();
    expect(authority?.parties.length).toBe(4);
    const corpus = [
      "SERVICES AGREEMENT",
      "",
      `Among ${TEST479_FOUR_PARTY.map((p) => p.legalEntity).join(", ")}.`,
      "",
      "10. NOTICES",
      "",
      TEST479_FOUR_PARTY.map(
        (p) =>
          `If to ${p.legalEntity}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
      ).join("\n\n"),
      "",
      "IN WITNESS WHEREOF",
      "",
      ...TEST479_FOUR_PARTY.flatMap((p) => [
        p.legalEntity,
        "By: ______________________________",
        "Name: ______________________________",
        "Title: ______________________________",
        "Date: ______________________________",
        "",
      ]),
    ].join("\n");
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: corpus,
      authority: authority!,
      intakeRaw: TEST479_FOUR_PARTY_INTAKE,
      surface: "test479_notices_hydrate",
    });
    const body = hydrated.corpus;
    for (const party of TEST479_FOUR_PARTY) {
      expect(body).toContain(party.signerName);
      expect(body).toContain(party.signerTitle);
      expect(body).toContain(party.email);
      expect(body).toContain(party.address.split(",")[0]!.trim());
    }
    expect(body).not.toContain("Authorized Signer");
    expect(body).not.toContain("provided during signer setup");
  });

  it("intake slot counts match after checkout entity-only handoff write simulation", () => {
    const intake = TEST479_FOUR_PARTY_INTAKE;
    const legalEntities = TEST479_FOUR_PARTY_LEGAL_ENTITIES;
    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities,
      intakeText: intake,
    });
    writePremiumRecipientHandoffExact(
      { name: legalEntities[0] ?? "", email: "", role: "party" },
      { name: legalEntities[1] ?? "", email: "", role: "party" },
      legalEntities.slice(2).map((name) => ({ name, email: "", role: "party" })),
      4,
    );
    const counts = countIntakeSignerMetadataSlots(intake, legalEntities);
    expect(counts.slotsWithSignerName).toBe(4);
    expect(counts.slotsWithEmail).toBe(4);
    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
  });
});
