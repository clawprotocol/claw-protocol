import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alignIntakeSignerMetadataToLegalEntities,
  countIntakeSignerMetadataSlots,
  extractCanonicalIntakeSignerMetadata,
} from "./intakeSignerMetadataAuthority";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  resolveHandoffPartySlotCount,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  TEST412_COORDINATOR_ONLY_INTAKE,
  TEST412_LEGAL_ENTITIES,
  TEST412_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST412_REVENUE_SHARE_INTAKE,
  TEST412_THREE_PARTY_INTAKE,
  TEST412_TWO_PARTY_INTAKE,
  TEST412_PARTY_EMAILS,
  TEST412_SIGNER_NAMES,
  TEST412_SIGNER_TITLES,
  test412Draft,
} from "./paidProTest412Fixtures";

describe("TEST412_INTAKE_SIGNER_METADATA_PREFILL", () => {
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
    vi.unstubAllGlobals();
  });

  it("extracts production quad-party entity signer clauses with email and address", () => {
    const rows = extractCanonicalIntakeSignerMetadata(TEST412_PRODUCTION_QUAD_PARTY_INTAKE);
    expect(rows.filter((r) => r.source === "entity_signer_clause")).toHaveLength(4);
    expect(rows.map((r) => r.legalEntity)).toEqual([
      "Red Mesa Logistics LLC",
      "Blue Canyon Analytics LLC",
      "Harbor Peak Automation LLC",
      "Iron Vale Systems Inc.",
    ]);
    expect(rows.some((r) => r.signerName === "Joe Doe" && r.signerEmail === TEST412_PARTY_EMAILS.red)).toBe(
      true,
    );
    expect(rows.some((r) => r.signerName === "Ira Vale" && r.signerTitle === "CTO")).toBe(true);
  });

  it("aligns metadata by legal entity — never writes signer names into entity fields", () => {
    const aligned = alignIntakeSignerMetadataToLegalEntities(
      TEST412_PRODUCTION_QUAD_PARTY_INTAKE,
      TEST412_LEGAL_ENTITIES,
    );
    expect(aligned).toHaveLength(4);
    expect(aligned.map((s) => s.partyLegalName)).toEqual([...TEST412_LEGAL_ENTITIES]);
    expect(aligned.map((s) => s.signerName)).toEqual([...TEST412_SIGNER_NAMES]);
    expect(aligned.map((s) => s.signerTitle)).toEqual([...TEST412_SIGNER_TITLES]);
    expect(aligned.every((s) => s.signerEmail.includes("@"))).toBe(true);
    expect(aligned.every((s) => s.partyAddress.length >= 8)).toBe(true);
    for (const slot of aligned) {
      expect(slot.partyLegalName).not.toBe(slot.signerName);
    }
  });

  it("production fixture: seed + handoff + gate complete with intake_prefill_requires_confirmation path", () => {
    const draft = test412Draft();
    const legalEntities = [...TEST412_LEGAL_ENTITIES];
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test412_production_prefill",
      legalEntities,
      intakeText: TEST412_PRODUCTION_QUAD_PARTY_INTAKE,
      draft,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: ["", "", "", ""],
      uiPartyAddresses: ["", "", "", ""],
      authoritativePartyCount: 4,
    });
    expect(seed.uiChanged).toBe(true);
    expect(seed.contactFieldsChanged).toBe(true);

    const counts = countIntakeSignerMetadataSlots(TEST412_PRODUCTION_QUAD_PARTY_INTAKE, legalEntities);
    expect(counts.partySlotCount).toBe(4);
    expect(counts.slotsWithSignerName).toBe(4);
    expect(counts.slotsWithSignerTitle).toBe(4);
    expect(counts.slotsWithEmail).toBe(4);
    expect(counts.slotsWithAddress).toBe(4);

    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots).toHaveLength(4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.signerTitle?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.email?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.partyAddress?.trim()).length).toBe(4);
    expect(resolveHandoffPartySlotCount(handoff!, 4)).toBe(4);

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 4,
      intakeText: TEST412_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: draft.parties?.map((p) => String(p.name ?? "")) ?? [],
      partySignerNames: seed.names,
      recipient1Name: legalEntities[0]!,
      recipient2Name: legalEntities[1]!,
      recipient1Email: seed.emails[0]!,
      recipient2Email: seed.emails[1]!,
      extraPartyReviewEmails: seed.emails.slice(2),
      extraPartyLegalNames: legalEntities.slice(2),
    });
    expect(gate.complete).toBe(true);
    expect(gate.blockers).toHaveLength(0);

    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 4,
        recipient1Name: legalEntities[0]!,
        recipient2Name: legalEntities[1]!,
        recipient1Email: seed.emails[0]!,
        recipient2Email: seed.emails[1]!,
        extraPartyReviewEmails: seed.emails.slice(2),
        extraPartyLegalNames: legalEntities.slice(2),
        partySignerNames: seed.names,
        partySignerTitles: seed.titles,
        partyAddresses: seed.addresses,
      },
      "live_ui",
      { intakeText: TEST412_PRODUCTION_QUAD_PARTY_INTAKE, draftPartyNames: [legalEntities[0]!, legalEntities[1]!] },
    );
    expect(authority.parties).toHaveLength(4);
    for (const entity of legalEntities) {
      expect(authority.parties.some((p) => p.partyLegalName.includes(entity.replace(/\.$/, "").split(" ")[0]!))).toBe(
        true,
      );
    }
  });

  it("supports 2-party Signer for … is … intake", () => {
    const entities = ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."];
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST412_TWO_PARTY_INTAKE, entities);
    expect(aligned[0]?.signerName).toBe("Sarah Mitchell");
    expect(aligned[1]?.signerName).toBe("Michael Torres");
    expect(aligned[0]?.signerEmail).toContain("@");
  });

  it("supports 3-party Party N signer is … intake", () => {
    const entities = ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC", "Blue Canyon Analytics LLC"];
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST412_THREE_PARTY_INTAKE, entities);
    expect(aligned).toHaveLength(3);
    expect(aligned[0]?.signerName).toBe("Alice One");
    expect(aligned[2]?.signerName).toBe("Carol Three");
  });

  it("coordinator-only intake does not add a fifth party slot to handoff", () => {
    const entities = ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"];
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test412_coordinator_prefill",
      legalEntities: entities,
      intakeText: TEST412_COORDINATOR_ONLY_INTAKE,
      uiSignerNames: ["", ""],
      uiSignerTitles: ["", ""],
      uiSignerEmails: ["", ""],
      uiPartyAddresses: ["", ""],
      authoritativePartyCount: 2,
    });
    expect(seed.names.filter(Boolean)).toHaveLength(2);
    const handoff = readPremiumRecipientHandoff();
    expect(linearPremiumRecipientSlots(handoff, 2)).toHaveLength(2);
    expect(resolveHandoffPartySlotCount(handoff!, 2)).toBe(2);
  });

  it("supports revenue-share labeled Party block intake (TEST396)", () => {
    const entities = [
      "Red Mesa Logistics LLC",
      "Blue Canyon Analytics LLC",
      "Harbor Peak Automation LLC",
      "Iron Vale Systems Inc.",
    ];
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST412_REVENUE_SHARE_INTAKE, entities);
    expect(aligned.filter((s) => s.signerName.trim()).length).toBe(4);
    expect(aligned.filter((s) => s.signerEmail.trim()).length).toBe(4);
  });
});
