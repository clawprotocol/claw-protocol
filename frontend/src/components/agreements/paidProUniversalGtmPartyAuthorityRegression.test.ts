/** @vitest-environment jsdom */
/**
 * Universal GTM party-authority regression — product-wide across agreement families,
 * messy legal names, affiliates, governing-law variants, stale-session clear, and
 * clarification follow-up. Not limited to the prior bipartite NDA reproduction path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessAgreementIntakeCapability,
  buildAgreementIntakeClarification,
} from "./agreementIntakeCapabilityGate";
import {
  extractListedSigningPartyNames,
  resolveSigningPartyCountSignals,
} from "./agreementIntakeClarification";
import {
  applyIntakeDraftPlaceholders,
  extractGoverningLawFromIntake,
  resolveIntakeDraftPartyNames,
} from "./applyIntakeDraftPlaceholders";
import {
  buildCanonicalPartyMetadataBundle,
  clearCanonicalPartyMetadata,
  persistCanonicalPartyMetadata,
  readCanonicalPartyMetadata,
} from "./canonicalPartyMetadataAuthority";
import {
  countOperativeIfToNoticeStanzas,
  resolveCanonicalNoticePartyCount,
  resolveNoticeStructuralValidationParties,
  trimOperativeNoticeStanzasToPartyCount,
} from "./paidProPartyNoticeDetails";
import {
  canAddAnotherSignerParty,
  resolveInitialSignerSetupPartyCount,
} from "./paidProNPartySignerSetup";
import {
  clearPriorPaidAuthorityForFreshCreateSubmit,
  initializeNewAgreementSession,
} from "../../launch/newAgreementSessionReset";
import { establishLegalPartyAuthorityFromIntake } from "./legalPartyAuthority";

type FamilyCase = {
  family: string;
  intake: string;
  party0: string;
  party1: string;
  law: string | null;
  feeNeedle: RegExp;
  termNeedle?: RegExp;
};

const FAMILY_CASES: FamilyCase[] = [
  {
    family: "msa",
    intake:
      "Draft a master services agreement between Orion Labs LLC and Contoso Retail Inc for $180k over 12 months. Governing law: New York.",
    party0: "Orion Labs LLC",
    party1: "Contoso Retail Inc",
    law: "New York",
    feeNeedle: /\$180k|180k/i,
    termNeedle: /12\s*-?\s*month/i,
  },
  {
    family: "sow",
    intake:
      "Draft a statement of work between Riverbend Design LLC and Harbor Peak Automation Inc for $12,500 over 6 weeks. Governing law: Texas.",
    party0: "Riverbend Design LLC",
    party1: "Harbor Peak Automation Inc",
    law: "Texas",
    feeNeedle: /\$12,500|12,500/,
    termNeedle: /6\s*-?\s*week/i,
  },
  {
    family: "saas_subscription",
    intake:
      "Draft a 12-month SaaS subscription agreement between NovaGrid Systems LLC and Prairie Signal Holdings LP for $96,000 ACV. Governing law: Delaware.",
    party0: "NovaGrid Systems LLC",
    party1: "Prairie Signal Holdings LP",
    law: "Delaware",
    feeNeedle: /\$96,000|96,000/,
    termNeedle: /12\s*-?\s*month/i,
  },
  {
    family: "license",
    intake:
      "Draft a software license agreement between Apex Holdings LP and Meridian Workforce Group LLC for $40k. Governing law: California.",
    party0: "Apex Holdings LP",
    party1: "Meridian Workforce Group LLC",
    law: "California",
    feeNeedle: /\$40k|40k/i,
  },
  {
    family: "dpa",
    intake:
      "Draft a data processing agreement between Cedar Ridge LLC and Maple Grove Inc covering customer personal data for 24 months. Governing law: New York.",
    party0: "Cedar Ridge LLC",
    party1: "Maple Grove Inc",
    law: "New York",
    feeNeedle: /personal data|24\s*-?\s*month/i,
    termNeedle: /24\s*-?\s*month/i,
  },
  {
    family: "purchase",
    intake:
      "Draft a purchase agreement between Summit Valley Holdings LLC and Ironwood Components Inc for $250,000 equipment. Governing law: Texas.",
    party0: "Summit Valley Holdings LLC",
    party1: "Ironwood Components Inc",
    law: "Texas",
    feeNeedle: /\$250,000|250,000/,
  },
  {
    family: "loi",
    intake:
      "Draft a letter of intent between Blue Harbor Systems LLC and Redwood Analytics Inc for a potential SaaS partnership. Term 90 days. Governing law: Delaware.",
    party0: "Blue Harbor Systems LLC",
    party1: "Redwood Analytics Inc",
    law: "Delaware",
    feeNeedle: /SaaS|partnership/i,
    termNeedle: /90\s*-?\s*day/i,
  },
  {
    family: "amendment",
    intake:
      "Draft an amendment to the services agreement between Oak Street Partners LLC and Willow Creek Media Inc extending the term by 12 months for $18k. Governing law: California.",
    party0: "Oak Street Partners LLC",
    party1: "Willow Creek Media Inc",
    law: "California",
    feeNeedle: /\$18k|18k/i,
    termNeedle: /12\s*-?\s*month/i,
  },
];

function demoCorpusWithExtraNotices(_party0: string, _party1: string, law: string): string {
  return `AGREEMENT
This Agreement is entered into by and between Demo Vendor LLC ("Provider") and Demo Customer Inc ("Customer").

1. Scope
The Parties will perform the services described herein.

10. Governing Law
This Agreement is governed by the laws of ${law}.

11. Notices
Notices must be in writing.

If to Demo Vendor LLC:
Demo Vendor LLC
provided during signer setup.

If to Demo Customer Inc:
Demo Customer Inc
provided during signer setup.

If to Party 3:
Party 3
provided during signer setup.

If to Party 4:
Party 4
provided during signer setup.

If to Party 5:
Party 5
provided during signer setup.

IN WITNESS WHEREOF, the Parties execute this Agreement.

PROVIDER:
Demo Vendor LLC
By: __________________________

CUSTOMER:
Demo Customer Inc
By: __________________________
`;
}

function multiPartyDemoCorpus(demoNames: readonly string[], extraPlaceholderSlots = 0): string {
  const opening =
    demoNames.length === 2
      ? `between ${demoNames[0]} and ${demoNames[1]}`
      : `among ${demoNames.slice(0, -1).join(", ")}, and ${demoNames[demoNames.length - 1]}`;
  const stanzas = [
    ...demoNames.map(
      (name) => `If to ${name}:\n${name}\nprovided during signer setup.`,
    ),
    ...Array.from({ length: extraPlaceholderSlots }, (_, i) => {
      const n = demoNames.length + i + 1;
      return `If to Party ${n}:\nParty ${n}\nprovided during signer setup.`;
    }),
  ];
  return `Agreement ${opening}.

Notices

${stanzas.join("\n\n")}

IN WITNESS WHEREOF
`;
}

function authorityParties(names: readonly string[]) {
  return names.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail: "",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
  }));
}

function assertCanonicalPartySurfacesAgree(args: {
  intake: string;
  expectedNames: readonly string[];
  corpus: string;
}): void {
  const { intake, expectedNames, corpus } = args;
  const n = expectedNames.length;
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(4);

  const fromIntake = resolveIntakeDraftPartyNames(intake);
  expect(fromIntake).not.toBeNull();
  expect(fromIntake!.slice(0, n)).toEqual([...expectedNames]);

  const signals = resolveSigningPartyCountSignals(intake);
  expect(signals.overCap).toBe(false);
  expect(signals.suggestedCount).toBe(n);

  const roleContext = {
    intakeText: intake,
    draftPartyNames: [...expectedNames],
    acceptedCorpus: corpus,
  };
  const noticeCount = resolveCanonicalNoticePartyCount(authorityParties(expectedNames), roleContext);
  expect(noticeCount).toBe(n);

  const structural = resolveNoticeStructuralValidationParties(
    authorityParties(expectedNames),
    roleContext,
  );
  expect(structural).toHaveLength(n);
  expect(structural.map((p) => p.partyLegalName)).toEqual([...expectedNames]);

  const signerUi = resolveInitialSignerSetupPartyCount({
    generatedPartyCount: n,
    intakeText: intake,
    draftParties: expectedNames.map((name) => ({ name })),
  });
  expect(signerUi).toBe(n);
  expect(canAddAnotherSignerParty(n)).toBe(n < 4);

  const metadata = buildCanonicalPartyMetadataBundle({
    legalEntities: [...expectedNames],
    intakeText: intake,
    mutationSource: "structured_intake",
  });
  expect(metadata.parties).toHaveLength(n);
  expect(metadata.parties.map((p) => p.partyLegalName)).toEqual([...expectedNames]);

  // Identity overlay (intake names) then notice-count trim are the acceptance chain.
  const filled = applyIntakeDraftPlaceholders({ text: corpus, intakeText: intake });
  for (const name of expectedNames) {
    expect(filled.text).toContain(name);
  }
  const trimmed = trimOperativeNoticeStanzasToPartyCount(filled.text, n);
  expect(trimmed.repairs.length > 0 || countOperativeIfToNoticeStanzas(corpus) <= n).toBe(true);
  expect(countOperativeIfToNoticeStanzas(trimmed.text)).toBe(n);
  expect(trimmed.text).not.toMatch(/If to Party [345]:/i);
  for (const name of expectedNames) {
    expect(trimmed.text).toContain(name);
  }
}

describe("universal GTM party authority (all agreement families)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearCanonicalPartyMetadata();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCanonicalPartyMetadata();
    sessionStorage.clear();
  });

  it.each(FAMILY_CASES)(
    "$family: proceeds, resolves 2 parties + law, and keeps one canonical party set across surfaces",
    ({ family, intake, party0, party1, law, feeNeedle, termNeedle }) => {
      const decision = assessAgreementIntakeCapability(intake);
      expect(decision.ok, `${family} should proceed`).toBe(true);

      const names = resolveIntakeDraftPartyNames(intake);
      expect(names).toEqual([party0, party1]);
      expect(extractGoverningLawFromIntake(intake)).toBe(law);
      expect(intake).toMatch(feeNeedle);
      if (termNeedle) expect(intake).toMatch(termNeedle);

      const corpus = demoCorpusWithExtraNotices(party0, party1, law || "Delaware");
      assertCanonicalPartySurfacesAgree({
        intake,
        expectedNames: [party0, party1],
        corpus,
      });

      const filled = applyIntakeDraftPlaceholders({ text: corpus, intakeText: intake });
      const trimmed = trimOperativeNoticeStanzasToPartyCount(filled.text, 2);
      expect(trimmed.text).not.toMatch(/\bDemo Vendor LLC\b|\bDemo Customer Inc\b/);
      expect(trimmed.text).not.toMatch(/If to Party [345]:/i);
      if (law) expect(trimmed.text).toContain(law);
    },
  );

  it("handles messy legal names (commas, d/b/a, long entities) without inventing affiliate signers", () => {
    const longA =
      'The Commonwealth Procurement Consortium of Mid-Atlantic States, LLC d/b/a "Commonwealth Procure"';
    const longB = "Harbor Peak Automation Inc";
    const intake =
      `Draft a master services agreement between "${longA}" and ${longB} ` +
      `(a wholly owned subsidiary of Harbor Peak Holdings) for $75,000 over 9 months. ` +
      `Governing law: New York. Contoso affiliates may receive reports but will not sign.`;

    const decision = assessAgreementIntakeCapability(intake);
    expect(decision.ok).toBe(true);

    const names = resolveIntakeDraftPartyNames(intake);
    expect(names).not.toBeNull();
    expect(names!).toHaveLength(2);
    expect(names![0]).toMatch(/Commonwealth Procurement Consortium|Commonwealth Procure/i);
    expect(names![1]).toMatch(/Harbor Peak Automation/i);
    expect(names!.join(" ")).not.toMatch(/\baffiliate/i);
    expect(names!.join(" ")).not.toMatch(/Harbor Peak Holdings/i);

    const signals = resolveSigningPartyCountSignals(intake);
    expect(signals.suggestedCount).toBe(2);
    expect(signals.overCap).toBe(false);
    expect(extractListedSigningPartyNames(intake).length).toBeLessThanOrEqual(2);
  });

  it("blocks open-ended affiliate signer language; allows notice-only affiliate mentions", () => {
    const willSign = assessAgreementIntakeCapability(
      "Draft a SaaS subscription between Northstar Analytics LLC and Contoso Retail Inc for $100k ACV. " +
        "All affiliates will sign. Term 12 months. Governing law: Delaware.",
    );
    expect(willSign.ok).toBe(false);
    if (willSign.ok) return;
    expect(willSign.code).toBe("party_count_cap");
    expect(willSign.clarification.suggestedRewrite).not.toMatch(/Party 5/i);
    expect(willSign.clarification.suggestedRewrite).toMatch(/Northstar Analytics LLC|Contoso Retail Inc/);

    const noticeOnlyIntake =
      "Draft a SaaS subscription between Northstar Analytics LLC and Contoso Retail Inc for $100k ACV. " +
      "Term 12 months. Contoso affiliates may receive reports but will not sign. Governing law: Delaware.";
    const noticeOnly = assessAgreementIntakeCapability(noticeOnlyIntake);
    expect(noticeOnly.ok).toBe(true);
    expect(resolveIntakeDraftPartyNames(noticeOnlyIntake)).toEqual([
      "Northstar Analytics LLC",
      "Contoso Retail Inc",
    ]);
  });

  it.each([
    { law: "New York", intake: "Draft a mutual NDA between Cedar Ridge LLC and Maple Grove Inc for 2 years. Governing law: New York." },
    { law: "Delaware", intake: "Draft a mutual NDA between Cedar Ridge LLC and Maple Grove Inc for 2 years. Governing law: Delaware." },
    { law: "California", intake: "Draft a mutual NDA between Cedar Ridge LLC and Maple Grove Inc for 2 years. Governing law: California." },
    { law: "Texas", intake: "Draft a mutual NDA between Cedar Ridge LLC and Maple Grove Inc for 2 years. Governing law: Texas." },
  ])("governing law $law fills [State] from intake", ({ law, intake }) => {
    expect(assessAgreementIntakeCapability(intake).ok).toBe(true);
    expect(extractGoverningLawFromIntake(intake)).toBe(law);
    const { text } = applyIntakeDraftPlaceholders({
      text: "This Agreement is governed by the laws of [State].",
      intakeText: intake,
    });
    expect(text).toContain(law);
    expect(text).not.toMatch(/\[State\]/);
  });

  it("no-law prompts proceed without inventing a jurisdiction", () => {
    const intake =
      "Draft a mutual NDA between Cedar Ridge LLC and Maple Grove Inc covering confidential business information for a 2-year term.";
    expect(assessAgreementIntakeCapability(intake).ok).toBe(true);
    expect(extractGoverningLawFromIntake(intake)).toBeNull();
    const { text } = applyIntakeDraftPlaceholders({
      text: "This Agreement is governed by the laws of [State].",
      intakeText: intake,
    });
    expect(text).toMatch(/\[State\]/);
  });

  it("Dashboard → Create new / fresh submit clears stale 3/4/5-party metadata before a 2-party deal", () => {
    for (const n of [3, 4, 5] as const) {
      const entities = ["Alpha LLC", "Beta Inc", "Gamma Corp", "Delta LP", "Echo Ltd"].slice(0, n);
      const stale = buildCanonicalPartyMetadataBundle({
        legalEntities: entities,
        intakeText:
          n === 5
            ? "among Alpha LLC, Beta Inc, Gamma Corp, Delta LP, and Echo Ltd"
            : n === 4
              ? "among Alpha LLC, Beta Inc, Gamma Corp, and Delta LP"
              : "among Alpha LLC, Beta Inc, and Gamma Corp",
        mutationSource: "structured_intake",
      });
      persistCanonicalPartyMetadata(stale);
      expect(readCanonicalPartyMetadata()?.parties.length).toBeGreaterThanOrEqual(3);

      if (n === 3) {
        initializeNewAgreementSession();
      } else {
        clearPriorPaidAuthorityForFreshCreateSubmit();
      }
      expect(readCanonicalPartyMetadata(), `stale ${n}-party metadata must clear`).toBeNull();

      const freshIntake =
        "Draft a services agreement between Orion Labs LLC and Contoso Retail Inc for $10k over 30 days. Governing law: Texas.";
      const fresh = buildCanonicalPartyMetadataBundle({
        legalEntities: ["Orion Labs LLC", "Contoso Retail Inc"],
        intakeText: freshIntake,
        existing: stale,
        mutationSource: "structured_intake",
      });
      expect(fresh.parties).toHaveLength(2);
      expect(fresh.parties.map((p) => p.partyLegalName)).toEqual([
        "Orion Labs LLC",
        "Contoso Retail Inc",
      ]);
      expect(resolveInitialSignerSetupPartyCount({
        generatedPartyCount: 2,
        intakeText: freshIntake,
        draftParties: [{ name: "Orion Labs LLC" }, { name: "Contoso Retail Inc" }],
      })).toBe(2);
    }
  });

  it("clarification follow-up answers override the generic rewrite and preserve facts", () => {
    const sparse = assessAgreementIntakeCapability("need a SaaS agreement for about 100k");
    expect(sparse.ok).toBe(false);
    if (sparse.ok) return;
    expect(sparse.clarification.suggestedRewrite).toBeTruthy();
    const rewrite = sparse.clarification.suggestedRewrite!;
    expect(rewrite).toMatch(/between .+ and .+/i);
    expect(rewrite).toMatch(/\[Your Company Legal Name\]|\[Party/i);

    const filled = rewrite
      .replace(/\[Your Company Legal Name\]/g, "Orion Labs LLC")
      .replace(/\[Customer Legal Name\]/g, "Contoso Retail Inc")
      .replace(/\[Party A Legal Name\]/g, "Orion Labs LLC")
      .replace(/\[Party B Legal Name\]/g, "Contoso Retail Inc")
      .replace(/\[Party 1 Legal Name\]/g, "Orion Labs LLC")
      .replace(/\[Party 2 Legal Name\]/g, "Contoso Retail Inc")
      .replace(/\[State\]/g, "New York");

    const again = assessAgreementIntakeCapability(filled);
    expect(again.ok).toBe(true);
    expect(resolveIntakeDraftPartyNames(filled)).toEqual(["Orion Labs LLC", "Contoso Retail Inc"]);
    expect(extractGoverningLawFromIntake(filled)).toBe("New York");
    expect(filled).toMatch(/100k/i);
    expect(resolveSigningPartyCountSignals(filled).suggestedCount).toBe(2);

    // Three-party clarification rewrite → filled follow-up preserves N=3.
    const threeMissing = assessAgreementIntakeCapability(
      "We need a three-party services agreement for $25k over 90 days covering integration work.",
    );
    expect(threeMissing.ok).toBe(false);
    if (threeMissing.ok) return;
    expect(threeMissing.clarification.suggestedRewrite).toMatch(/among \[Party 1 Legal Name\]/i);
    const threeFilled = (threeMissing.clarification.suggestedRewrite || "")
      .replace(/\[Party 1 Legal Name\]/g, "Alpha Services LLC")
      .replace(/\[Party 2 Legal Name\]/g, "Beta Operations Inc")
      .replace(/\[Party 3 Legal Name\]/g, "Gamma Partners LP")
      .replace(/\[fee amount\]/g, "$25k")
      .replace(/\[State\]/g, "Delaware");
    const threeAgain = assessAgreementIntakeCapability(threeFilled);
    expect(threeAgain.ok).toBe(true);
    expect(resolveIntakeDraftPartyNames(threeFilled)).toEqual([
      "Alpha Services LLC",
      "Beta Operations Inc",
      "Gamma Partners LP",
    ]);
    expect(resolveSigningPartyCountSignals(threeFilled).suggestedCount).toBe(3);
    expect(extractGoverningLawFromIntake(threeFilled)).toBe("Delaware");
  });

  it("3- and 4-party among intakes keep one canonical set on body/notices/signer/metadata", () => {
    const three =
      "Draft a 6-month services agreement among Alpha Services LLC, Beta Operations Inc, and Gamma Partners LP " +
      "for $40,000 covering joint integration work. Governing law: Delaware.";
    expect(assessAgreementIntakeCapability(three).ok).toBe(true);
    const threeNames = ["Alpha Services LLC", "Beta Operations Inc", "Gamma Partners LP"] as const;
    assertCanonicalPartySurfacesAgree({
      intake: three,
      expectedNames: threeNames,
      corpus: multiPartyDemoCorpus(["Demo Alpha LLC", "Demo Beta Inc", "Demo Gamma LP"], 1),
    });

    const four =
      "Draft a four-party services agreement among Alpha LLC, Beta Inc, Gamma Corp, and Delta LP " +
      "for $80k over 12 months for shared platform operations. Governing law: California.";
    expect(assessAgreementIntakeCapability(four).ok).toBe(true);
    assertCanonicalPartySurfacesAgree({
      intake: four,
      expectedNames: ["Alpha LLC", "Beta Inc", "Gamma Corp", "Delta LP"],
      corpus: multiPartyDemoCorpus(
        ["Demo Alpha LLC", "Demo Beta Inc", "Demo Gamma Corp", "Demo Delta LP"],
        1,
      ),
    });
  });

  it("counsel-prep salvage stays bipartite until more parties are named (family-agnostic)", () => {
    const c = buildAgreementIntakeClarification(
      "Hey LawDog, help me thinking through a customer contract. 12-month SaaS, $100k ACV.\n" +
        "Can you help me figure out:\n" +
        "1. Whether we should accept their paper with edits.\n" +
        "2. Which terms are actual deal risks.\n" +
        "I'm not looking for a law school memo.",
    );
    expect(c?.kind).toBe("counsel_prep");
    expect(c?.suggestedRewrite).toMatch(/between /i);
    expect(c?.suggestedRewrite).not.toMatch(/among |Party 3/i);
  });

  it("'Person of Org is hiring Person of Org' intake extracts legal entities, not human names (GTM P0)", () => {
    const intake =
      "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit for $2,400, term 30 days, governing law Texas.";
    const authority = establishLegalPartyAuthorityFromIntake(intake);

    // Authority must recognize the two legal organizations, not generic placeholders
    expect(authority.parties).toHaveLength(2);
    expect(authority.fallbackCount).toBe(0);
    expect(authority.parties[0].legalEntityName).toBe("Northline Studio");
    expect(authority.parties[1].legalEntityName).toBe("Harbor Marks LLC");

    // Ensure no Party A / Party B fallback
    expect(authority.parties[0].provenance.extractedFrom).not.toBe("fallback");
    expect(authority.parties[1].provenance.extractedFrom).not.toBe("fallback");
    expect(authority.parties.some((p) => p.legalEntityName === "Party A")).toBe(false);
    expect(authority.parties.some((p) => p.legalEntityName === "Party B")).toBe(false);

    // Canonical metadata bundle should reflect the same entities
    const metadata = buildCanonicalPartyMetadataBundle({
      legalEntities: authority.parties.map((p) => p.legalEntityName),
      intakeText: intake,
      mutationSource: "structured_intake",
    });
    expect(metadata.parties).toHaveLength(2);
    expect(metadata.parties[0].partyLegalName).toBe("Northline Studio");
    expect(metadata.parties[1].partyLegalName).toBe("Harbor Marks LLC");
    expect(metadata.source).not.toBe("generic_placeholder");
  });
});
