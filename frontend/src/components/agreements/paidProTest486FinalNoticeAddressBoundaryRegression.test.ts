import { describe, expect, it } from "vitest";
import { sanitizeCanonicalPartyAddress } from "./canonicalPartyStructuredAddress";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import {
  ensureOperativeIfToNoticeDelivery,
  extractNoticeAddressFromStanza,
  extractPartyAddressesFromOperativeNoticeStanzas,
  noticeStanzaHasAddressPollution,
  repairIncompleteIfToNoticeStanzas,
  sanitizeNoticeStanzaAddress,
} from "./paidProPartyNoticeDetails";
import {
  TEST486_ADDRESS_CONTAMINATION_MARKERS,
  TEST486_FORTIS,
  TEST486_FOUR_PARTY,
  TEST486_SIGNATURE_INSTRUCTION,
  TEST486_VECTOR,
  buildTest486CorruptedFinalNoticeCorpus,
  buildTest486CorruptedInlineNoticeCorpus,
  test486Draft,
  test486Parties,
} from "./paidProTest486FinalNoticeAddressBoundaryFixtures";

describe("TEST486 — final notice address stops at instructional prose", () => {
  it("sanitizes inline instructional prose fused after a postal address", () => {
    const contaminated = `${TEST486_FOUR_PARTY[3]!.address}, ${TEST486_SIGNATURE_INSTRUCTION}`;
    expect(sanitizeNoticeStanzaAddress(contaminated)).toBe(TEST486_FOUR_PARTY[3]!.address);
    expect(sanitizeCanonicalPartyAddress(contaminated)).toBe(TEST486_FOUR_PARTY[3]!.address);
  });

  it("detects address pollution inside operative notice stanzas", () => {
    const stanza = [
      `If to ${TEST486_VECTOR}:`,
      TEST486_VECTOR,
      "Attn: Rachel Kim, Vice President of Delivery",
      "Email: rachel.kim@vectorcloud.com",
      `Address: ${TEST486_FOUR_PARTY[3]!.address}, ${TEST486_SIGNATURE_INSTRUCTION}`,
    ].join("\n");
    expect(noticeStanzaHasAddressPollution(stanza)).toBe(true);
    expect(extractNoticeAddressFromStanza(stanza)).toBe(TEST486_FOUR_PARTY[3]!.address);
  });

  it("extracts only the postal address from the final notice stanza (TEST486)", () => {
    const corpus = buildTest486CorruptedFinalNoticeCorpus();
    const addresses = extractPartyAddressesFromOperativeNoticeStanzas(corpus);
    expect(addresses).toHaveLength(4);
    expect(addresses[3]).toBe(TEST486_FOUR_PARTY[3]!.address);
    for (const marker of TEST486_ADDRESS_CONTAMINATION_MARKERS) {
      expect(addresses[3]).not.toContain(marker);
    }
    for (let i = 0; i < TEST486_FOUR_PARTY.length; i += 1) {
      expect(addresses[i]).toBe(TEST486_FOUR_PARTY[i]!.address);
    }
  });

  it("repairs final notice address pollution in the agreement body without touching other stanzas", () => {
    const parties = test486Parties();
    const corpus = buildTest486CorruptedFinalNoticeCorpus();
    const repaired = repairIncompleteIfToNoticeStanzas(corpus, parties);
    expect(repaired.text).toContain("2200 Enterprise Drive");
    expect(repaired.text).toContain("Raleigh, NC 27609");
    expect(repaired.text).not.toMatch(/Address:\s[^\n]*Each party should/i);
    const addresses = extractPartyAddressesFromOperativeNoticeStanzas(repaired.text);
    expect(addresses[3]).toBe(TEST486_FOUR_PARTY[3]!.address);
    for (const marker of TEST486_ADDRESS_CONTAMINATION_MARKERS) {
      expect(addresses[3]).not.toContain(marker);
    }
  });

  it("ensureOperativeIfToNoticeDelivery sanitizes preserved complete stanzas with polluted addresses", () => {
    const parties = test486Parties();
    const corpus = buildTest486CorruptedFinalNoticeCorpus();
    const out = ensureOperativeIfToNoticeDelivery(corpus, parties);
    expect(out.text).not.toMatch(/Address:\s[^\n]*Each party should/i);
    const addresses = extractPartyAddressesFromOperativeNoticeStanzas(out.text);
    expect(addresses[3]).toBe(TEST486_FOUR_PARTY[3]!.address);
  });

  it("repairs inline comma contamination on a non-final notice stanza (production Fortis shape)", () => {
    const parties = test486Parties();
    const corpus = buildTest486CorruptedInlineNoticeCorpus();
    const fortisStanza = corpus.split(/\n(?=If to\s+)/i)[3] ?? "";
    expect(noticeStanzaHasAddressPollution(fortisStanza)).toBe(true);
    expect(extractNoticeAddressFromStanza(fortisStanza)).toBe(TEST486_FOUR_PARTY[2]!.address);
    const out = ensureOperativeIfToNoticeDelivery(corpus, parties);
    const addresses = extractPartyAddressesFromOperativeNoticeStanzas(out.text);
    expect(addresses[2]).toBe(TEST486_FOUR_PARTY[2]!.address);
    expect(addresses[2]).not.toContain("Each party should");
    expect(addresses[3]).toBe(TEST486_FOUR_PARTY[3]!.address);
  });

  it("notice contact authority leaves only clean postal addresses in operative stanzas", () => {
    const corpus = buildTest486CorruptedFinalNoticeCorpus();
    const out = applyPaidProNoticeContactAuthority(corpus, {
      draft: test486Draft(),
      intakeText: TEST486_FOUR_PARTY.map((p) => p.legalEntity).join("\n"),
    });
    const addresses = extractPartyAddressesFromOperativeNoticeStanzas(out.text);
    expect(addresses[3]).toBe(TEST486_FOUR_PARTY[3]!.address);
    expect(out.text).toContain(TEST486_FORTIS);
    expect(out.text).toContain("1775 Defense Plaza");
    expect(out.text).not.toMatch(/Address:\s[^\n]*Each party should/i);
    for (const marker of TEST486_ADDRESS_CONTAMINATION_MARKERS) {
      expect(addresses.some((addr) => addr.includes(marker))).toBe(false);
    }
  });

  it("stops multiline notice capture at document boundaries without US postal patterns", () => {
    const stanza = [
      "If to Example Holdings Ltd:",
      "Example Holdings Ltd",
      "Attn: Jane Doe, Director",
      "Email: jane@example.co.uk",
      "Address:",
      "221B Baker Street",
      "London NW1",
      "United Kingdom",
      TEST486_SIGNATURE_INSTRUCTION,
    ].join("\n");
    expect(extractNoticeAddressFromStanza(stanza)).toBe(
      "221B Baker Street, London NW1, United Kingdom",
    );
    expect(extractNoticeAddressFromStanza(stanza)).not.toContain("Each party should");
  });
});
