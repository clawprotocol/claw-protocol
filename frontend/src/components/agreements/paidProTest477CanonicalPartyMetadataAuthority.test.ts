/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import {
  alignIntakeSignerMetadataToLegalEntities,
  countIntakeSignerMetadataSlots,
  extractCanonicalIntakeSignerMetadata,
} from "./intakeSignerMetadataAuthority";
import { applyPremiumRecipientHandoffReadGate } from "./paidProPremiumRecipientHandoffReadGate";
import { readConsumedPaidProSignerMetadataAuthority, clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  TEST477_FOUR_PARTY,
  TEST477_FOUR_PARTY_ENTITY_HEADER_INTAKE,
  TEST477_FOUR_PARTY_INTAKE,
  TEST477_FOUR_PARTY_LEGAL_ENTITIES,
  TEST477_ONE_PARTY,
  TEST477_ONE_PARTY_INTAKE,
  TEST477_ONE_PARTY_LEGAL_ENTITIES,
  TEST477_THREE_PARTY,
  TEST477_THREE_PARTY_INTAKE,
  TEST477_THREE_PARTY_LEGAL_ENTITIES,
  TEST477_TWO_PARTY,
  TEST477_TWO_PARTY_INTAKE,
  TEST477_TWO_PARTY_LEGAL_ENTITIES,
  type Test477PartyFixture,
} from "./paidProTest477Fixtures";

function assertIntakeExtracted(parties: readonly Test477PartyFixture[], intake: string, legalEntities: string[]) {
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

function assertSeedPipeline(
  label: string,
  intake: string,
  legalEntities: string[],
  parties: readonly Test477PartyFixture[],
) {
  const seed = runPaidProSignerMetadataAuthoritySeed({
    stage: `test477_${label}`,
    legalEntities,
    intakeText: intake,
    uiSignerNames: legalEntities.map(() => ""),
    uiSignerTitles: legalEntities.map(() => ""),
    uiSignerEmails: legalEntities.map(() => ""),
    uiPartyAddresses: legalEntities.map(() => ""),
    authoritativePartyCount: legalEntities.length,
  });
  expect(seed.uiChanged).toBe(true);
  expect(seed.contactFieldsChanged).toBe(true);

  const counts = countIntakeSignerMetadataSlots(intake, legalEntities);
  expect(counts.slotsWithSignerName).toBe(parties.length);
  expect(counts.slotsWithSignerTitle).toBe(parties.length);
  expect(counts.slotsWithEmail).toBe(parties.length);
  expect(counts.slotsWithAddress).toBe(parties.length);

  const canonical = readCanonicalPartyMetadata();
  expect(canonical).toBeTruthy();
  const fieldCounts = computeCanonicalPartyMetadataFieldCounts(canonical);
  expect(fieldCounts.signerNameCount).toBe(parties.length);
  expect(fieldCounts.titleCount).toBe(parties.length);
  expect(fieldCounts.emailCount).toBe(parties.length);
  expect(fieldCounts.addressCount).toBe(parties.length);

  const handoff = readPremiumRecipientHandoff();
  expect(handoff).toBeTruthy();
  const slots = linearPremiumRecipientSlots(handoff, legalEntities.length);
  expect(slots.filter((s) => s.signerName?.trim()).length).toBe(parties.length);
  expect(slots.filter((s) => s.signerTitle?.trim()).length).toBe(parties.length);
  expect(slots.filter((s) => s.email?.trim()).length).toBe(parties.length);
  expect(slots.filter((s) => s.partyAddress?.trim()).length).toBe(parties.length);

  const consumed = readConsumedPaidProSignerMetadataAuthority();
  expect(consumed?.parties.filter((p) => p.signerName.trim()).length).toBe(parties.length);

  const gate = resolvePaidProSignerDetailsGate({
    partyCount: legalEntities.length,
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
}

describe("TEST477 — canonical party metadata authority", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
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

  it("extracts representative-style intake for 1-party agreement", () => {
    assertIntakeExtracted([TEST477_ONE_PARTY], TEST477_ONE_PARTY_INTAKE, TEST477_ONE_PARTY_LEGAL_ENTITIES);
  });

  it("extracts representative-style intake for 2-party agreement", () => {
    assertIntakeExtracted(TEST477_TWO_PARTY, TEST477_TWO_PARTY_INTAKE, TEST477_TWO_PARTY_LEGAL_ENTITIES);
  });

  it("extracts representative-style intake for 3-party agreement", () => {
    assertIntakeExtracted(
      TEST477_THREE_PARTY,
      TEST477_THREE_PARTY_INTAKE,
      TEST477_THREE_PARTY_LEGAL_ENTITIES,
    );
  });

  it("extracts representative-style intake for 4-party agreement", () => {
    assertIntakeExtracted(
      TEST477_FOUR_PARTY,
      TEST477_FOUR_PARTY_INTAKE,
      TEST477_FOUR_PARTY_LEGAL_ENTITIES,
    );
  });

  it("extracts entity-heading contact blocks without Party N headers", () => {
    assertIntakeExtracted(
      TEST477_FOUR_PARTY,
      TEST477_FOUR_PARTY_ENTITY_HEADER_INTAKE,
      TEST477_FOUR_PARTY_LEGAL_ENTITIES,
    );
  });

  it("1-party: extraction + canonical bundle preserve all fields", () => {
    assertIntakeExtracted([TEST477_ONE_PARTY], TEST477_ONE_PARTY_INTAKE, TEST477_ONE_PARTY_LEGAL_ENTITIES);
    const bundle = establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities: TEST477_ONE_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_ONE_PARTY_INTAKE,
      persistHandoff: false,
    });
    expect(bundle.parties[0]?.signerName).toBe(TEST477_ONE_PARTY.signerName);
    expect(bundle.parties[0]?.signerTitle).toBe(TEST477_ONE_PARTY.signerTitle);
    expect(bundle.parties[0]?.signerEmail).toBe(TEST477_ONE_PARTY.email);
    expect(bundle.parties[0]?.partyAddress).toBe(TEST477_ONE_PARTY.address);
  });

  it("2-party: seed + canonical + handoff + gate preserve all fields", () => {
    assertSeedPipeline("two_party", TEST477_TWO_PARTY_INTAKE, TEST477_TWO_PARTY_LEGAL_ENTITIES, TEST477_TWO_PARTY);
  });

  it("3-party: seed + canonical + handoff + gate preserve all fields", () => {
    assertSeedPipeline(
      "three_party",
      TEST477_THREE_PARTY_INTAKE,
      TEST477_THREE_PARTY_LEGAL_ENTITIES,
      TEST477_THREE_PARTY,
    );
  });

  it("4-party: seed + canonical + handoff + gate preserve all fields", () => {
    assertSeedPipeline(
      "four_party",
      TEST477_FOUR_PARTY_INTAKE,
      TEST477_FOUR_PARTY_LEGAL_ENTITIES,
      TEST477_FOUR_PARTY,
    );
  });

  it("handoff read gate restores canonical metadata instead of clearing signer fields", () => {
    runPaidProSignerMetadataAuthoritySeed({
      stage: "test477_handoff_gate",
      legalEntities: TEST477_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_FOUR_PARTY_INTAKE,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      authoritativePartyCount: 4,
    });
    const populated = readPremiumRecipientHandoff();
    expect(populated).toBeTruthy();
    const emptyRead = applyPremiumRecipientHandoffReadGate(
      {
        v: 2,
        party1: { name: TEST477_FOUR_PARTY[0]!.legalEntity, email: "", role: "party" },
        party2: { name: TEST477_FOUR_PARTY[1]!.legalEntity, email: "", role: "party" },
        partyIndexSlots: TEST477_FOUR_PARTY.slice(2).map((p) => ({
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
  });

  it("notices and execution blocks hydrate from canonical authority", () => {
    runPaidProSignerMetadataAuthoritySeed({
      stage: "test477_notices_hydrate",
      legalEntities: TEST477_THREE_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_THREE_PARTY_INTAKE,
      uiSignerNames: ["", "", ""],
      uiSignerTitles: ["", "", ""],
      authoritativePartyCount: 3,
    });
    const authority = readConsumedPaidProSignerMetadataAuthority();
    expect(authority?.parties.length).toBe(3);
    const corpus = [
      "TRIPARTITE AGREEMENT",
      "",
      `Among ${TEST477_THREE_PARTY.map((p) => p.legalEntity).join(", ")}.`,
      "",
      "10.4 Notices",
      "",
      TEST477_THREE_PARTY.map(
        (p) =>
          `If to ${p.legalEntity}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
      ).join("\n\n"),
      "",
      "IN WITNESS WHEREOF",
      "",
      ...TEST477_THREE_PARTY.flatMap((p) => [
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
      intakeRaw: TEST477_THREE_PARTY_INTAKE,
      surface: "test477_notices_hydrate",
    });
    const body = hydrated.corpus;
    for (const party of TEST477_THREE_PARTY) {
      expect(body).toContain(party.signerName);
      expect(body).toContain(party.signerTitle);
      expect(body).toContain(party.email);
    }
    expect(body).not.toContain("Authorized Signer");
    expect(body).not.toContain("provided during signer setup");
  });

  it("user-edited UI fields remain authoritative over intake on re-seed", () => {
    runPaidProSignerMetadataAuthoritySeed({
      stage: "test477_user_edit_seed",
      legalEntities: TEST477_TWO_PARTY_LEGAL_ENTITIES,
      intakeText: TEST477_TWO_PARTY_INTAKE,
      uiSignerNames: ["Edited Name A", "Edited Name B"],
      uiSignerTitles: ["Edited Title A", "Edited Title B"],
      uiSignerEmails: ["edited-a@example.com", "edited-b@example.com"],
      uiPartyAddresses: ["111 Edit Ln", "222 Edit Ln"],
      authoritativePartyCount: 2,
    });
    const consumed = readConsumedPaidProSignerMetadataAuthority();
    expect(consumed?.parties[0]?.signerName).toBe("Edited Name A");
    expect(consumed?.parties[1]?.signerName).toBe("Edited Name B");
    expect(consumed?.parties[0]?.signerTitle).toBe("Edited Title A");
    expect(consumed?.parties[0]?.signerEmail).toBe("edited-a@example.com");
  });
});
