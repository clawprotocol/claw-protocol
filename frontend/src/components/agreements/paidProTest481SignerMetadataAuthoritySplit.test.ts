/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  mutateCanonicalPartyMetadata,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  TEST479_FOUR_PARTY,
  TEST479_FOUR_PARTY_INTAKE,
  TEST479_FOUR_PARTY_LEGAL_ENTITIES,
  test479Draft,
} from "./paidProTest479Fixtures";

describe("TEST481 — signer metadata authority split (email without names)", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    vi.stubGlobal("localStorage", {
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

  it("reconciles email-only canonical with intake signer names/titles/addresses", () => {
    const intake = TEST479_FOUR_PARTY_INTAKE;
    const legalEntities = TEST479_FOUR_PARTY_LEGAL_ENTITIES;
    const draft = {
      ...test479Draft(),
      parties: legalEntities.map((name, i) => ({
        name,
        role: i === 0 ? "Licensor" : "party",
      })) as never[],
    };

    // Simulate pro gate: entities established, emails not yet in intake layer.
    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities,
      intakeText: intake,
      mutationSource: "structured_intake",
    });
    let counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.entityCount).toBe(4);
    expect(counts.signerNameCount).toBe(4);
    expect(counts.emailCount).toBe(4);

    // Simulate review handoff write that only carries emails (authority split regression).
    mutateCanonicalPartyMetadata({
      stage: "review",
      legalEntities,
      intakeText: intake,
      uiParties: TEST479_FOUR_PARTY.map((p, i) => ({
        partyIndex: i,
        partyLegalName: p.legalEntity,
        signerName: "",
        signerTitle: "",
        signerEmail: p.email,
        partyAddress: "",
      })),
      mutationSource: "structured_intake",
    });
    counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.emailCount).toBe(4);
    expect(counts.signerNameCount).toBe(4);
    expect(counts.titleCount).toBe(4);

    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "paid_pro_first_review_intake_prefill",
      legalEntities,
      intakeText: intake,
      draft,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: TEST479_FOUR_PARTY.map((p) => p.email),
      uiPartyAddresses: ["", "", "", ""],
      authoritativePartyCount: 4,
    });

    expect(seed.names).toEqual(TEST479_FOUR_PARTY.map((p) => p.signerName));
    expect(seed.titles).toEqual(TEST479_FOUR_PARTY.map((p) => p.signerTitle));
    expect(seed.emails).toEqual(TEST479_FOUR_PARTY.map((p) => p.email));
    expect(seed.addresses.every(Boolean)).toBe(true);

    counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.signerNameCount).toBe(4);
    expect(counts.titleCount).toBe(4);
    expect(counts.emailCount).toBe(4);
    expect(counts.addressCount).toBe(4);

    const consumed = readConsumedPaidProSignerMetadataAuthority();
    expect(consumed?.parties.filter((p) => p.signerName.trim()).length).toBe(4);

    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.signerTitle?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.email?.trim()).length).toBe(4);
  });

  it("preserves manual signer name edits over intake re-sync", () => {
    const intake = TEST479_FOUR_PARTY_INTAKE;
    const legalEntities = TEST479_FOUR_PARTY_LEGAL_ENTITIES;
    const manualName = "Custom Signer Override";

    runPaidProSignerMetadataAuthoritySeed({
      stage: "signer_setup_manual",
      legalEntities,
      intakeText: intake,
      uiSignerNames: [manualName, "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: TEST479_FOUR_PARTY.map((p) => p.email),
      authoritativePartyCount: 4,
    });

    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "signer_setup_resync",
      legalEntities,
      intakeText: intake,
      uiSignerNames: [manualName, "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: TEST479_FOUR_PARTY.map((p) => p.email),
      authoritativePartyCount: 4,
    });

    expect(seed.names[0]).toBe(manualName);
    expect(seed.names[1]).toBe(TEST479_FOUR_PARTY[1]!.signerName);
  });
});
