/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import {
  definedMultiPartyAgreementOpeningLine,
  canonicalPartyRecordsFromSignerIdentities,
} from "./canonicalPartyIdentityResolver";
import { sanitizeCanonicalPartyAddress } from "./canonicalPartyStructuredAddress";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { parseAllStructuredPartyContactBlocks, parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import {
  isIntakeSectionLabelLine,
  isStructuredPromptSectionLabelToken,
  splitTextAtStructuredPromptSectionLabels,
} from "./intakeSectionLabels";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  authorityPartiesToCanonicalPartyIdentities,
} from "./paidProSignerMetadataAuthority";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  TEST485_ADDRESS_CONTAMINATION_MARKERS,
  TEST485_BEACON,
  TEST485_FOUR_PARTY,
  TEST485_FOUR_PARTY_INTAKE,
  TEST485_FOUR_PARTY_LEGAL_ENTITIES,
  test485Draft,
} from "./paidProTest485FinalPartyAddressBoundaryFixtures";

describe("TEST485 — final party address stops at structured prompt sections", () => {
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

  it("recognizes Purpose/Initial Term comma labels as section boundaries", () => {
    expect(isStructuredPromptSectionLabelToken("Purpose")).toBe(true);
    expect(isStructuredPromptSectionLabelToken("Purpose,")).toBe(true);
    expect(isIntakeSectionLabelLine("Initial Term,")).toBe(true);
    expect(isIntakeSectionLabelLine("Scope of Work,")).toBe(true);

    const contaminated =
      "610 Constitution Avenue, Boston, MA 02110, Purpose, The Parties will jointly develop";
    expect(sanitizeCanonicalPartyAddress(contaminated)).toBe(
      "610 Constitution Avenue, Boston, MA 02110",
    );
  });

  it("splits labeled prompt sections for recital/purpose theming", () => {
    const sections = splitTextAtStructuredPromptSectionLabels(
      "610 Constitution Avenue, Boston, MA 02110, Purpose, The Parties will jointly develop, Initial Term, 36 months.",
    );
    expect(sections[0]).toBe("610 Constitution Avenue, Boston, MA 02110");
    expect(sections.some((s) => s.includes("jointly develop"))).toBe(true);
    expect(sections.some((s) => s.includes("36 months"))).toBe(true);
  });

  it("parses all four party addresses without consuming post-party sections", () => {
    const blocks = parseLabeledPartyBlocks(TEST485_FOUR_PARTY_INTAKE);
    expect(blocks).toHaveLength(4);
    for (let i = 0; i < TEST485_FOUR_PARTY.length; i += 1) {
      expect(blocks[i]!.address).toBe(TEST485_FOUR_PARTY[i]!.address);
      for (const marker of TEST485_ADDRESS_CONTAMINATION_MARKERS) {
        expect(blocks[i]!.address).not.toContain(marker);
      }
    }

    const all = parseAllStructuredPartyContactBlocks(TEST485_FOUR_PARTY_INTAKE);
    expect(all).toHaveLength(4);
    expect(all[3]!.address).toBe(TEST485_FOUR_PARTY[3]!.address);
  });

  it("canonical, seed, handoff, notices, and recital exclude post-party prose from party 4 address", () => {
    const intake = TEST485_FOUR_PARTY_INTAKE;
    const legalEntities = TEST485_FOUR_PARTY_LEGAL_ENTITIES;
    const draft = test485Draft();

    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities,
      intakeText: intake,
      mutationSource: "structured_intake",
    });

    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test485_signer_setup",
      legalEntities,
      intakeText: intake,
      draft,
      uiSignerEmails: TEST485_FOUR_PARTY.map((p) => p.email),
      authoritativePartyCount: 4,
    });

    expect(seed.addresses[3]).toBe(TEST485_FOUR_PARTY[3]!.address);

    const counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.addressCount).toBe(4);

    const canonical = readCanonicalPartyMetadata()!;
    const consumed = readConsumedPaidProSignerMetadataAuthority()!;
    const slots = linearPremiumRecipientSlots(readPremiumRecipientHandoff(), 4);

    for (const addr of [
      canonical.parties[3]?.partyAddress,
      consumed.parties[3]?.partyAddress,
      slots[3]?.partyAddress,
    ]) {
      expect(addr).toBe(TEST485_FOUR_PARTY[3]!.address);
      for (const marker of TEST485_ADDRESS_CONTAMINATION_MARKERS) {
        expect(addr).not.toContain(marker);
      }
    }

    const records = canonicalPartyRecordsFromSignerIdentities(
      authorityPartiesToCanonicalPartyIdentities(consumed.parties),
    );
    const opening = definedMultiPartyAgreementOpeningLine(records, { consulting: true });
    expect(opening).toContain(TEST485_BEACON);
    expect(opening).toContain("610 Constitution Avenue, Boston, MA 02110");
    expect(opening).not.toContain("Purpose");
    expect(opening).not.toContain("The Parties will jointly develop");
    expect(opening).not.toContain("Initial Term");

    const noticeHydrated = applyPaidProNoticeContactAuthority(
      [
        "10. NOTICES",
        "",
        ...TEST485_FOUR_PARTY.map(
          (p) =>
            `If to ${p.legalEntity}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
        ),
      ].join("\n\n"),
      { draft, intakeText: intake },
    ).text;

    expect(noticeHydrated).toContain("610 Constitution Avenue");
    expect(noticeHydrated).toContain("Boston, MA 02110");
    for (const marker of TEST485_ADDRESS_CONTAMINATION_MARKERS) {
      expect(noticeHydrated).not.toContain(marker);
    }
  });
});
