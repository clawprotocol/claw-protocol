/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import {
  isPartyAddressBoundaryLine,
  sanitizeCanonicalPartyAddress,
} from "./canonicalPartyStructuredAddress";
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
  TEST484_ADDRESS_CONTAMINATION_MARKERS,
  TEST484_FOUR_PARTY,
  TEST484_FOUR_PARTY_INTAKE,
  TEST484_FOUR_PARTY_LEGAL_ENTITIES,
  test484Draft,
} from "./paidProTest484Fixtures";

describe("TEST484 — address boundary / party over-capture", () => {
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

  it("detects party/prose lines as address boundaries", () => {
    expect(isPartyAddressBoundaryLine("Party 3 (Exclusive Distributor)")).toBe(true);
    expect(isPartyAddressBoundaryLine("Draft a detailed agreement under which")).toBe(true);
    expect(isPartyAddressBoundaryLine("—")).toBe(true);
    expect(isPartyAddressBoundaryLine("Madison, WI 53703")).toBe(false);
    expect(isPartyAddressBoundaryLine("United Kingdom")).toBe(false);

    const contaminated =
      "4220 Industrial Drive, Fort Wayne, IN 46808, Party 3 (Exclusive Distributor)";
    expect(sanitizeCanonicalPartyAddress(contaminated)).toBe(
      "4220 Industrial Drive, Fort Wayne, IN 46808",
    );
  });

  it("parses role-header intake without party/prose contamination in addresses", () => {
    const blocks = parseAllStructuredPartyContactBlocks(TEST484_FOUR_PARTY_INTAKE);
    expect(blocks).toHaveLength(4);
    for (let i = 0; i < TEST484_FOUR_PARTY.length; i += 1) {
      const expected = TEST484_FOUR_PARTY[i]!.address;
      const block = blocks[i]!;
      expect(block.address).toBe(expected);
      for (const marker of TEST484_ADDRESS_CONTAMINATION_MARKERS) {
        expect(block.address).not.toContain(marker);
      }
    }
  });

  it("canonical, seed, handoff, and notices receive exact clean addresses only", () => {
    const intake = TEST484_FOUR_PARTY_INTAKE;
    const legalEntities = TEST484_FOUR_PARTY_LEGAL_ENTITIES;
    const draft = {
      ...test484Draft(),
      parties: legalEntities.map((name) => ({ name, role: "party" })) as never[],
    };

    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities,
      intakeText: intake,
      mutationSource: "structured_intake",
    });

    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test484_signer_setup",
      legalEntities,
      intakeText: intake,
      draft,
      uiSignerEmails: TEST484_FOUR_PARTY.map((p) => p.email),
      authoritativePartyCount: 4,
    });

    for (let i = 0; i < TEST484_FOUR_PARTY.length; i += 1) {
      expect(seed.addresses[i]).toBe(TEST484_FOUR_PARTY[i]!.address);
    }

    const counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.addressCount).toBe(4);

    const canonical = readCanonicalPartyMetadata()!;
    const consumed = readConsumedPaidProSignerMetadataAuthority()!;
    const slots = linearPremiumRecipientSlots(readPremiumRecipientHandoff(), 4);

    for (let i = 0; i < 4; i += 1) {
      const expected = TEST484_FOUR_PARTY[i]!.address;
      for (const addr of [
        canonical.parties[i]?.partyAddress,
        consumed.parties[i]?.partyAddress,
        slots[i]?.partyAddress,
      ]) {
        expect(addr).toBe(expected);
        for (const marker of TEST484_ADDRESS_CONTAMINATION_MARKERS) {
          expect(addr).not.toContain(marker);
        }
      }
    }

    const noticeHydrated = applyPaidProNoticeContactAuthority(
      [
        "10. NOTICES",
        "",
        ...TEST484_FOUR_PARTY.map(
          (p) =>
            `If to ${p.legalEntity}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
        ),
      ].join("\n\n"),
      { draft, intakeText: intake },
    ).text;

    for (const party of TEST484_FOUR_PARTY) {
      for (const segment of party.address.split(",").map((s) => s.trim())) {
        expect(noticeHydrated).toContain(segment);
      }
      for (const marker of TEST484_ADDRESS_CONTAMINATION_MARKERS) {
        expect(noticeHydrated).not.toContain(marker);
      }
    }
  });
});
