import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { sanitizeCanonicalPartyAddress } from "./canonicalPartyStructuredAddress";
import { projectPaidProFrozenSoTDisplayPlain } from "./paidProDisplayPlainAuthority";
import { establishLegalPartyAuthorityFromIntake } from "./legalPartyAuthority";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import {
  countOperativeIfToNoticeStanzas,
  ensureOperativeIfToNoticeDelivery,
  extractPartyAddressesFromOperativeNoticeStanzas,
  formatNoticeAddressLines,
} from "./paidProPartyNoticeDetails";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

const INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit for $2,400, term 30 days, governing law Texas.";
const NORTHLINE = "Northline Studio";
const HARBOR = "Harbor Marks LLC";
const FUSED = "Northline Studio Harbor Marks LLC";
const STUFFED_ADDRESS =
  "30 days, Upon full execution by the parties unless otherwise specified., Texas";

const NOTICE_CONTAMINATION_MARKERS = [
  "$2,400",
  "2,400",
  "30 days",
  "Texas",
  "logo",
  "brand kit",
  "Upon full execution",
  FUSED,
  "Party A",
  "Party B",
  "generic_placeholder",
] as const;

function northlineDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: [
      { name: NORTHLINE, role: "Client" },
      { name: HARBOR, role: "Service Provider" },
    ],
    purpose: "logo and brand kit",
    payment_terms: "$2,400",
    duration: "30 days",
    due_date: null,
    effective_date: "Upon full execution by the parties unless otherwise specified.",
    payment: { amount: 2400, cadence: "one_time", valid: true },
  };
}

function northlineParties(address = ""): PaidProSignerMetadataParty[] {
  return [
    {
      partyIndex: 0,
      partyLegalName: NORTHLINE,
      signerEmail: "",
      signerName: "Priya Shah",
      signerTitle: "",
      partyAddress: address,
    },
    {
      partyIndex: 1,
      partyLegalName: HARBOR,
      signerEmail: "",
      signerName: "Diego Alvarez",
      signerTitle: "",
      partyAddress: address,
    },
  ];
}

/** Live staging regen: two If-to stanzas, fused heading + term/law stuffed into Harbor Address. */
function liveRegenerateTwoStanzaNorthlineHarborCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${FUSED} ("Service Provider") and Service Provider ("Service Provider").`,
    "",
    "1. Scope of Services",
    "Provider will design a logo and brand kit.",
    "",
    "2. Compensation",
    "The total fee is $2,400.",
    "",
    "3. Term",
    "The term is 30 days.",
    "",
    "10. Confidentiality",
    "Each party shall keep confidential information confidential.",
    "",
    "12. NOTICES",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    `If to ${FUSED}:`,
    FUSED,
    "",
    `If to ${HARBOR}:`,
    HARBOR,
    `Address: ${STUFFED_ADDRESS}`,
    "",
    "13. Entire Agreement",
    `This Agreement is the entire agreement This Agreement is between ${FUSED} ("Service Provider") and Service Provider ("Service Provider").`,
    "",
    "11. Governing Law",
    "This Agreement is governed by the laws of Texas.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    NORTHLINE,
    "By: ____________________",
    "",
    "SERVICE PROVIDER:",
    HARBOR,
    "By: ____________________",
  ].join("\n");
}

function assertIndependentNorthlineHarborNotices(text: string): void {
  const region = noticesRegion(text);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(2);
  expect(region).toMatch(new RegExp(`If to ${NORTHLINE}\\s*:`, "i"));
  expect(region).toMatch(new RegExp(`If to ${HARBOR}\\s*:`, "i"));
  expect(region).not.toMatch(new RegExp(`If to ${FUSED}`, "i"));
  expect(region).not.toMatch(/Party [AB]/i);
  expect(region).not.toMatch(/generic_placeholder/i);
  for (const marker of NOTICE_CONTAMINATION_MARKERS) {
    expect(region).not.toContain(marker);
  }
  const addresses = extractPartyAddressesFromOperativeNoticeStanzas(text);
  for (const addr of addresses) {
    expect(addr).not.toMatch(/30\s*days/i);
    expect(addr).not.toMatch(/Texas/i);
    expect(addr).not.toMatch(/\$2,400/);
    expect(addr).not.toMatch(/logo|brand kit/i);
  }
}

function contaminatedNorthlineHarborCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${FUSED} ("Service Provider") and Service Provider ("Service Provider").`,
    "",
    "1. Scope of Services",
    "Provider will design a logo and brand kit.",
    "",
    "2. Compensation",
    "The total fee is $2,400.",
    "",
    "3. Term",
    "The term is 30 days.",
    "",
    "10. Confidentiality",
    "Each party shall keep confidential information confidential.",
    "",
    "12. NOTICES",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    `If to ${FUSED}:`,
    FUSED,
    `Address: ${STUFFED_ADDRESS}`,
    "",
    "13. Entire Agreement",
    `This Agreement is the entire agreement This Agreement is between ${FUSED} ("Service Provider") and Service Provider ("Service Provider").`,
    "",
    "11. Governing Law",
    "This Agreement is governed by the laws of Texas.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    NORTHLINE,
    "By: ____________________",
    "",
    "SERVICE PROVIDER:",
    HARBOR,
    "By: ____________________",
  ].join("\n");
}

function noticesRegion(text: string): string {
  const start = text.search(/(?:^|\n)\s*\d+\.\s+NOTICES\b|(?:^|\n)If to\s+/im);
  if (start < 0) return "";
  const from = text.slice(start);
  const nextTop = from.search(/\n(?=\d+\.(?!\d)\s+(?!NOTICES\b)\S)/i);
  return nextTop >= 0 ? from.slice(0, nextTop) : from;
}

describe("Northline Studio / Harbor Marks LLC Notices fidelity", () => {
  it("does not treat term, effective-date, or jurisdiction as a postal address", () => {
    expect(sanitizeCanonicalPartyAddress(STUFFED_ADDRESS)).toBe("");
    expect(formatNoticeAddressLines(STUFFED_ADDRESS)).toEqual([]);
    expect(formatNoticeAddressLines("100 Mesa Drive, Austin, Texas").join(" ")).toMatch(/100 Mesa Drive/);
  });

  it("legal-party authority stays two independent entities, not Priya/Diego or a fused name", () => {
    const authority = establishLegalPartyAuthorityFromIntake(INTAKE);
    expect(authority.parties).toHaveLength(2);
    expect(authority.parties[0]?.legalEntityName).toBe(NORTHLINE);
    expect(authority.parties[1]?.legalEntityName).toBe(HARBOR);
    expect(authority.parties.some((p) => p.legalEntityName === FUSED)).toBe(false);
  });

  it("rebuilds one independent If-to stanza per party and strips stuffed Address fields", () => {
    const corpus = contaminatedNorthlineHarborCorpus();
    const parties = northlineParties(STUFFED_ADDRESS);
    const repaired = ensureOperativeIfToNoticeDelivery(corpus, parties, {
      intakeText: INTAKE,
      draftPartyNames: [NORTHLINE, HARBOR],
      acceptedCorpus: corpus,
    });
    const region = noticesRegion(repaired.text);

    expect(countOperativeIfToNoticeStanzas(repaired.text)).toBe(2);
    expect(region).toMatch(new RegExp(`If to ${NORTHLINE}\\s*:`, "i"));
    expect(region).toMatch(new RegExp(`If to ${HARBOR}\\s*:`, "i"));
    expect(region).not.toMatch(new RegExp(`If to ${FUSED}`, "i"));
    expect(region).not.toMatch(/Party [AB]/i);
    expect(region).not.toMatch(/generic_placeholder/i);

    for (const marker of NOTICE_CONTAMINATION_MARKERS) {
      expect(region).not.toContain(marker);
    }

    const addresses = extractPartyAddressesFromOperativeNoticeStanzas(repaired.text);
    for (const addr of addresses) {
      expect(addr).not.toMatch(/30\s*days/i);
      expect(addr).not.toMatch(/Texas/i);
      expect(addr).not.toMatch(/\$2,400/);
      expect(addr).not.toMatch(/logo|brand kit/i);
    }
  });

  it("notice contact authority keeps certified terms outside Notices and independent stanzas inside", () => {
    const corpus = contaminatedNorthlineHarborCorpus();
    const out = applyPaidProNoticeContactAuthority(corpus, {
      draft: northlineDraft(),
      intakeText: INTAKE,
      authorityParties: northlineParties(),
      acceptedCorpus: corpus,
    });
    const region = noticesRegion(out.text);
    const outside = out.text.replace(region, "");

    expect(countOperativeIfToNoticeStanzas(out.text)).toBe(2);
    expect(region).toMatch(new RegExp(`If to ${NORTHLINE}\\s*:`, "i"));
    expect(region).toMatch(new RegExp(`If to ${HARBOR}\\s*:`, "i"));
    expect(region).not.toMatch(new RegExp(`If to ${FUSED}`, "i"));
    expect(region).not.toMatch(/\$2,400|30 days|Texas|logo and brand kit/i);

    expect(outside).toContain(NORTHLINE);
    expect(outside).toContain(HARBOR);
    expect(outside).toMatch(/\$2,400/);
    expect(outside).toMatch(/30 days/);
    expect(outside).toMatch(/Texas/);
    expect(outside).toMatch(/logo and brand kit/i);
    expect(outside).not.toMatch(/Party [AB]/i);
  });

  afterEach(() => {
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("rebuilds the live two-stanza regen (fused heading + stuffed Harbor Address) with empty party addresses", () => {
    const corpus = liveRegenerateTwoStanzaNorthlineHarborCorpus();
    const parties = northlineParties("");
    const repaired = ensureOperativeIfToNoticeDelivery(corpus, parties, {
      intakeText: INTAKE,
      draftPartyNames: [NORTHLINE, HARBOR],
      acceptedCorpus: corpus,
    });
    assertIndependentNorthlineHarborNotices(repaired.text);
    expect(repaired.repairs.length).toBeGreaterThan(0);
  });

  it("persist-rewrite (safe display) and frozen SoT display skip fused If-to and omit term/law Address", () => {
    const corpus = liveRegenerateTwoStanzaNorthlineHarborCorpus();
    const persist = applyAcceptedProCorpusSafeDisplay(corpus, {
      draft: northlineDraft(),
      intakeText: INTAKE,
      surface: "premium_completion_pipeline",
    });
    assertIndependentNorthlineHarborNotices(persist.text);

    setConsumedPaidProSignerMetadataAuthority({
      parties: northlineParties(""),
      source: "live_ui",
      hash: "northline-harbor-live-regen",
      updatedAt: 1,
    });
    const displayed = projectPaidProFrozenSoTDisplayPlain(corpus);
    assertIndependentNorthlineHarborNotices(displayed);

    const notice = applyPaidProNoticeContactAuthority(corpus, {
      draft: northlineDraft(),
      intakeText: INTAKE,
      authorityParties: northlineParties(""),
      acceptedCorpus: corpus,
    });
    assertIndependentNorthlineHarborNotices(notice.text);
    const outside = notice.text.replace(noticesRegion(notice.text), "");
    expect(outside).toContain(NORTHLINE);
    expect(outside).toContain(HARBOR);
    expect(outside).toMatch(/\$2,400/);
    expect(outside).toMatch(/30 days/);
    expect(outside).toMatch(/Texas/);
    expect(outside).toMatch(/logo and brand kit/i);
  });
});
