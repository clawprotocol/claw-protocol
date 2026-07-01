/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { parseAllStructuredPartyContactBlocks } from "./labeledPartyBlockParse";
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
  TEST482_FOUR_PARTY,
  TEST482_FOUR_PARTY_INTAKE,
  TEST482_FOUR_PARTY_LEGAL_ENTITIES,
  test482Draft,
} from "./paidProTest482Fixtures";

function buildPartyBlock(args: {
  entity: string;
  name: string;
  title: string;
  email: string;
  addressLines: readonly string[];
  index: number;
}): string {
  return [
    `Party ${args.index}:`,
    args.entity,
    "Represented by:",
    args.name,
    args.title,
    `Email: ${args.email}`,
    "Address:",
    ...args.addressLines,
  ].join("\n");
}

describe("TEST483 — canonical structured address authority", () => {
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

  it("preserves multiline addresses with blank lines and enriches partial UI prefill", () => {
    const intake = [
      buildPartyBlock({
        index: 1,
        entity: TEST482_FOUR_PARTY[0]!.legalEntity,
        name: TEST482_FOUR_PARTY[0]!.signerName,
        title: TEST482_FOUR_PARTY[0]!.signerTitle,
        email: TEST482_FOUR_PARTY[0]!.email,
        addressLines: ["123 Main Street", "", "Suite 500", "Dallas, TX 75201"],
      }),
      buildPartyBlock({
        index: 2,
        entity: TEST482_FOUR_PARTY[1]!.legalEntity,
        name: TEST482_FOUR_PARTY[1]!.signerName,
        title: TEST482_FOUR_PARTY[1]!.signerTitle,
        email: TEST482_FOUR_PARTY[1]!.email,
        addressLines: ["221B Baker Street", "London NW1", "United Kingdom"],
      }),
    ].join("\n\n");

    const blocks = parseAllStructuredPartyContactBlocks(intake);
    expect(blocks[0]?.address).toContain("Suite 500");
    expect(blocks[0]?.address).toContain("Dallas, TX 75201");
    expect(blocks[1]?.address).toContain("United Kingdom");

    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities: TEST482_FOUR_PARTY_LEGAL_ENTITIES.slice(0, 2),
      intakeText: intake,
      mutationSource: "structured_intake",
    });

    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test483_partial_ui_address",
      legalEntities: TEST482_FOUR_PARTY_LEGAL_ENTITIES.slice(0, 2),
      intakeText: intake,
      draft: test482Draft(),
      uiSignerNames: ["", ""],
      uiSignerTitles: ["", ""],
      uiSignerEmails: TEST482_FOUR_PARTY.slice(0, 2).map((p) => p.email),
      uiPartyAddresses: ["123 Main Street", "221B Baker Street"],
      authoritativePartyCount: 2,
    });

    expect(seed.addresses[0]).toContain("Suite 500");
    expect(seed.addresses[0]).toContain("Dallas, TX 75201");
    expect(seed.addresses[1]).toContain("London NW1");
    expect(seed.addresses[1]).toContain("United Kingdom");

    const counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.addressCount).toBe(2);
  });

  it("propagates identical full addresses through handoff, notices, and execution for 4 parties", () => {
    const intake = TEST482_FOUR_PARTY_INTAKE;
    const legalEntities = TEST482_FOUR_PARTY_LEGAL_ENTITIES;
    const draft = {
      ...test482Draft(),
      parties: legalEntities.map((name) => ({ name, role: "party" })) as never[],
    };

    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities,
      intakeText: intake,
      mutationSource: "structured_intake",
    });

    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test483_signer_setup",
      legalEntities,
      intakeText: intake,
      draft,
      uiSignerEmails: TEST482_FOUR_PARTY.map((p) => p.email),
      uiPartyAddresses: TEST482_FOUR_PARTY.map((p) => p.address.split(",")[0]!.trim()),
      authoritativePartyCount: 4,
    });

    for (let i = 0; i < TEST482_FOUR_PARTY.length; i += 1) {
      const expected = TEST482_FOUR_PARTY[i]!.address;
      expect(seed.addresses[i]).toBe(expected);
    }

    const canonical = readCanonicalPartyMetadata()!;
    const consumed = readConsumedPaidProSignerMetadataAuthority()!;
    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 4);

    for (let i = 0; i < 4; i += 1) {
      const expected = TEST482_FOUR_PARTY[i]!.address;
      expect(canonical.parties[i]?.partyAddress).toBe(expected);
      expect(consumed.parties[i]?.partyAddress).toBe(expected);
      expect(slots[i]?.partyAddress).toBe(expected);
    }

    const noticeHydrated = applyPaidProNoticeContactAuthority(
      [
        "10. NOTICES",
        "",
        ...TEST482_FOUR_PARTY.map(
          (p) =>
            `If to ${p.legalEntity}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
        ),
      ].join("\n\n"),
      { draft, intakeText: intake },
    ).text;

    for (const party of TEST482_FOUR_PARTY) {
      for (const segment of party.address.split(",").map((s) => s.trim()).filter(Boolean)) {
        expect(noticeHydrated).toContain(segment);
      }
    }
  });
});
