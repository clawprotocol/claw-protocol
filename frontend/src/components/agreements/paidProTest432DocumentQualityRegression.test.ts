import { describe, expect, it } from "vitest";
import { isIntakeSectionLabelLine, isInvalidPartyMetadataValue } from "./intakeSectionLabels";
import { parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import {
  definedMultiPartyAgreementOpeningLine,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { repairGluedSectionHeadingsInText } from "./documentSectionHeadingSplit";
import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";
import {
  repairIncompleteIfToNoticeStanzas,
  ensureOperativeIfToNoticeDelivery,
} from "./paidProPartyNoticeDetails";
import { collapseDuplicateNoticeEntityLines } from "./paidProPartyNamePreserve";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { TEST429_FOUR_PARTY_NORTH_STAR_INTAKE } from "./paidProTest429FourPartyNorthStarFixtures";
import { TEST412_THREE_PARTY_INTAKE, TEST412_TWO_PARTY_INTAKE } from "./paidProTest412Fixtures";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function operativeNoticeStanzas(corpus: string): string[] {
  const idx = corpus.search(/\d+\.\s*Notices/i);
  if (idx < 0) return [];
  const witness = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  const region = corpus.slice(idx, witness >= 0 ? witness : corpus.length);
  return region.split(/\n(?=If to\s+)/i).slice(1).map((s) => s.trim()).filter(Boolean);
}

function entityLineCountInStanza(stanza: string, legalName: string): number {
  let count = 0;
  for (const line of stanza.split("\n")) {
    const t = line.trim().replace(/:$/, "");
    if (!t || /^If to\s+/i.test(t) || /^Attn:/i.test(t) || /^Email/i.test(t) || /^Address/i.test(t)) {
      continue;
    }
    if (partyLegalNamesMatch(t, legalName)) count += 1;
  }
  return count;
}

function assertOneCanonicalNamePerNoticeStanza(corpus: string, legalNames: readonly string[]): void {
  const stanzas = operativeNoticeStanzas(corpus);
  expect(stanzas.length).toBe(legalNames.length);
  for (let i = 0; i < legalNames.length; i += 1) {
    const legal = legalNames[i]!;
    expect(stanzas[i]).toMatch(new RegExp(`If to\\s+${escapeRegExp(legal)}\\s*:`, "i"));
    expect(entityLineCountInStanza(stanzas[i]!, legal)).toBeLessThanOrEqual(1);
  }
}

function openingRecitalHasNoIntakeLeakage(intake: string, names: readonly string[]): void {
  const records = resolveCanonicalPartyIdentitiesFromIntake(intake, names);
  const opening = definedMultiPartyAgreementOpeningLine(records, { consulting: true });
  expect(opening).not.toMatch(/Background:/i);
  expect(opening).not.toMatch(/Scope:/i);
  expect(opening).not.toMatch(/principal place of business at Background/i);
}

describe("intakeSectionLabels", () => {
  it("detects intake section label lines", () => {
    expect(isIntakeSectionLabelLine("Background:")).toBe(true);
    expect(isIntakeSectionLabelLine("Scope:")).toBe(true);
    expect(isIntakeSectionLabelLine("Governing Law:")).toBe(true);
    expect(isInvalidPartyMetadataValue("Background:")).toBe(true);
    expect(isIntakeSectionLabelLine("If to North Star Manufacturing LLC:")).toBe(false);
  });

  it("labeled party blocks do not capture Background as party address", () => {
    const blocks = parseLabeledPartyBlocks(TEST429_FOUR_PARTY_NORTH_STAR_INTAKE);
    expect(blocks.length).toBe(4);
    for (const block of blocks) {
      expect(block.address).not.toMatch(/background/i);
    }
  });

  it("four-party opening recital never contains Background leakage", () => {
    openingRecitalHasNoIntakeLeakage(
      TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      [
        "North Star Manufacturing LLC",
        "Summit Ridge Advisory Group LLC",
        "Delta Integration Services LLC",
        "Blue Canyon Analytics LLC",
      ],
    );
  });

  it("two-party opening recital never contains intake label leakage", () => {
    openingRecitalHasNoIntakeLeakage(TEST412_TWO_PARTY_INTAKE, [
      "Blue Canyon Analytics LLC",
      "Iron Vale Systems Inc.",
    ]);
  });

  it("three-party opening recital never contains intake label leakage", () => {
    openingRecitalHasNoIntakeLeakage(TEST412_THREE_PARTY_INTAKE, [
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
    ]);
  });
});

describe("TEST432 document quality — notice stanzas", () => {
  const parties: PaidProSignerMetadataParty[] = [
    {
      partyIndex: 0,
      partyLegalName: "North Star Manufacturing LLC",
      signerEmail: "contracts@northstar.example.com",
      signerName: "Alice Client",
      signerTitle: "CEO",
      partyAddress: "",
    },
    {
      partyIndex: 1,
      partyLegalName: "Summit Ridge Advisory Group LLC",
      signerEmail: "legal@summitridge.example.com",
      signerName: "Bob Lead",
      signerTitle: "Managing Partner",
      partyAddress: "",
    },
  ];

  it("collapses duplicated notice entity lines", () => {
    const raw = [
      "If to North Star Manufacturing LLC",
      "North Star Manufacturing LLC:",
      "North Star Manufacturing LLC",
      "North Star Manufacturing LLC",
      "Attn: Alice Client, CEO",
      "Email: contracts@northstar.example.com",
    ].join("\n");
    const out = collapseDuplicateNoticeEntityLines(raw, ["North Star Manufacturing LLC"]);
    const entityCount = out
      .split("\n")
      .filter((l) => /North Star Manufacturing LLC/i.test(l) && !/^If to/i.test(l)).length;
    expect(entityCount).toBe(1);
  });

  it("repairs malformed notice stanzas without Background in address", () => {
    const corpus = [
      "11. NOTICES",
      "",
      "If to North Star Manufacturing LLC",
      "North Star Manufacturing LLC:",
      "North Star Manufacturing LLC",
      "",
      "If to Summit Ridge Advisory Group LLC:",
      "Summit Ridge Advisory Group LLC",
      "Attn: Bob Lead",
      "Email: legal@summitridge.example.com",
      "Address:",
      "Background:",
    ].join("\n");
    const repaired = repairIncompleteIfToNoticeStanzas(corpus, parties);
    expect(repaired.text).not.toMatch(/Address:\s*\n\s*Background:/i);
    expect(repaired.text.match(/North Star Manufacturing LLC/gi)?.length ?? 0).toBeLessThanOrEqual(3);
    assertOneCanonicalNamePerNoticeStanza(repaired.text, [
      "North Star Manufacturing LLC",
      "Summit Ridge Advisory Group LLC",
    ]);
  });

  it("repairs two-party notice stanzas with missing addresses and emails", () => {
    const twoParty: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: "Blue Canyon Analytics LLC",
        signerEmail: "",
        signerName: "",
        signerTitle: "",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: "Iron Vale Systems Inc.",
        signerEmail: "",
        signerName: "",
        signerTitle: "",
        partyAddress: "",
      },
    ];
    const corpus = [
      "11. Notices",
      "Notices must be in writing.",
      "If to Blue Canyon Analytics LLC:",
      "Blue Canyon Analytics LLC",
      "If to Iron Vale Systems Inc.:",
      "Iron Vale Systems Inc.",
    ].join("\n");
    const out = ensureOperativeIfToNoticeDelivery(corpus, twoParty);
    assertOneCanonicalNamePerNoticeStanza(out.text, [
      "Blue Canyon Analytics LLC",
      "Iron Vale Systems Inc.",
    ]);
  });

  it("repairs three-party partial notice data without duplicate entity lines", () => {
    const threeParty: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: "Red Mesa Logistics LLC",
        signerEmail: "alice@client.example.com",
        signerName: "Alice",
        signerTitle: "CEO",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: "Harbor Peak Automation LLC",
        signerEmail: "",
        signerName: "Bob",
        signerTitle: "COO",
        partyAddress: "",
      },
      {
        partyIndex: 2,
        partyLegalName: "Blue Canyon Analytics LLC",
        signerEmail: "carol@analytics.example.com",
        signerName: "Carol",
        signerTitle: "CFO",
        partyAddress: "100 Main St",
      },
    ];
    const corpus = [
      "11. NOTICES",
      "",
      "If to Red Mesa Logistics LLC:",
      "Red Mesa Logistics LLC",
      "Red Mesa Logistics LLC",
      "Email: alice@client.example.com",
      "",
      "If to Harbor Peak Automation LLC",
      "Harbor Peak Automation LLC:",
      "Harbor Peak Automation LLC",
    ].join("\n");
    const repaired = repairIncompleteIfToNoticeStanzas(corpus, threeParty, {
      intakeText: TEST412_THREE_PARTY_INTAKE,
      draftPartyNames: threeParty.map((p) => p.partyLegalName),
    });
    assertOneCanonicalNamePerNoticeStanza(repaired.text, [
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
    ]);
    expect(repaired.text).not.toMatch(/Address:\s*\n\s*Background:/i);
  });

  it("repairs four-party notice stanzas with exactly one canonical name each", () => {
    const fourParty: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: "North Star Manufacturing LLC",
        signerEmail: "contracts@northstar.example.com",
        signerName: "Alice",
        signerTitle: "CEO",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: "Summit Ridge Advisory Group LLC",
        signerEmail: "legal@summitridge.example.com",
        signerName: "Bob",
        signerTitle: "Partner",
        partyAddress: "",
      },
      {
        partyIndex: 2,
        partyLegalName: "Delta Integration Services LLC",
        signerEmail: "ops@delta.example.com",
        signerName: "Carol",
        signerTitle: "Director",
        partyAddress: "",
      },
      {
        partyIndex: 3,
        partyLegalName: "Blue Canyon Analytics LLC",
        signerEmail: "data@bluecanyon.example.com",
        signerName: "Dan",
        signerTitle: "VP",
        partyAddress: "",
      },
    ];
    const corpus = [
      "11. NOTICES",
      "",
      "If to North Star Manufacturing LLC",
      "North Star Manufacturing LLC:",
      "North Star Manufacturing LLC",
      "Email: contracts@northstar.example.com",
      "",
      "If to Summit Ridge Advisory Group LLC:",
      "Summit Ridge Advisory Group LLC",
      "Summit Ridge Advisory Group LLC",
      "Address:",
      "Background:",
    ].join("\n");
    const repaired = repairIncompleteIfToNoticeStanzas(corpus, fourParty, {
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draftPartyNames: fourParty.map((p) => p.partyLegalName),
    });
    assertOneCanonicalNamePerNoticeStanza(repaired.text, fourParty.map((p) => p.partyLegalName));
    expect(repaired.text).not.toMatch(/Address:\s*\n\s*Background:/i);
  });
});

describe("TEST432 document quality — heading integrity", () => {
  it("splits glued word.section headings from body text", () => {
    const glued = "Project records are maintained under this Agreement.12. Governing Law\nOklahoma governs.\nDisputes in venue.12.2 Notices\nIf to Party:";
    const out = repairGluedSectionHeadingsInText(glued);
    expect(out).not.toMatch(/Agreement\.12\./);
    expect(out).not.toMatch(/venue\.12\.2/);
    expect(out).toMatch(/\n12\. Governing Law/);
    expect(out).toMatch(/\n12\.2 Notices/);
  });

  it("merges orphan multi-line heading fragments", () => {
    const split = [
      "Lead",
      "Consultant Responsibilities",
      "Lead Consultant will manage governance.",
      "",
      "Revenue",
      "Allocation",
      "Fees are allocated.",
      "",
      "Termination by",
      "Client Without Cause",
      "Client may terminate without cause.",
    ].join("\n");
    const { text, repairs } = repairSplitPaidProHeadingFragments(split);
    expect(repairs.some((r) => r.includes("orphan_heading_fragment_merged"))).toBe(true);
    expect(text).toMatch(/Lead Consultant Responsibilities/);
    expect(text).toMatch(/Revenue Allocation/);
    expect(text).toMatch(/Termination by Client Without Cause/);
  });
});
