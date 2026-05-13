/**
 * Universal starter-draft intent regression suite.
 *
 * These tests encode the universal invariants for the starter / free draft pipeline so
 * intake routing, multi-party extraction, role handling, complexity gating, and field
 * extraction stay correct across the full breadth of multi-party agreement shapes:
 *
 *   1. Entity suffixes (LLC / Inc / Trust / LP / etc.) NEVER decide agreement family.
 *   2. Explicit document intent ALWAYS wins (lease, purchase, advisor, NDA, services,
 *      OA, co-ownership, property management, etc.).
 *   3. Complexity gates require strong securities / structured-finance signals — never
 *      ordinary commercial terms (price, rent, fee, deposit, escrow, monthly payment,
 *      ownership percentage, multiple parties).
 *   4. Multi-party extraction is lossless: 3+ parties survive cleanup, dedupe, and
 *      role-annotation stripping.
 *   5. Role labels ("landlord", "buyer", "advisor", "guarantor", etc.) are stripped from
 *      party names without dropping the party from the list.
 *   6. Field extraction stays section-safe: payment terms never receive confidentiality
 *      language, scope/property fields never swallow command phrases or trailing prose.
 */

import { describe, expect, it } from "vitest";
import {
  detectAgreementFamily,
  type AgreementFamily,
} from "./agreementFamilyRouter";
import {
  matchesAdvancedCommercialStructureSignals,
  matchesAdvancedInstrumentPhrases,
  shouldInterceptAdvancedDocumentFamily,
} from "./agreementLaunchFamilies";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";

function emptyDraft(): any {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
  };
}

function runStarter(intake: string) {
  const family = detectAgreementFamily(intake);
  const gated = shouldInterceptAdvancedDocumentFamily(intake, family);
  const draft = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
  const partyNames = (draft.parties ?? []).map((p: any) => String(p.name).trim());
  return { family, gated, draft, partyNames };
}

function expectAllNamesPresent(actual: string[], expected: string[]) {
  for (const name of expected) {
    expect(
      actual.some((p) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(p)),
      `expected "${name}" to be among parties [${actual.join(", ")}]`,
    ).toBe(true);
  }
}

function expectNoRoleSuffixes(parties: string[]) {
  for (const p of parties) {
    expect(p, `party "${p}" must not contain parenthetical role hint`).not.toMatch(
      /\((?:landlord|tenant|lessor|lessee|guarantor|seller|buyer|purchaser|advisor|advisory|investor|observer|escrow|escrow\s+agent|owner|manager|managing\s+member|disclosing\s+party|receiving\s+party|trustee|consultant|contractor|client|service\s+provider)\)/i,
    );
    expect(p, `party "${p}" must not contain trailing "as <role>" clause`).not.toMatch(
      /\bas\s+(?:an?\s+)?(?:landlord|tenant|lessor|lessee|guarantor|seller|buyer|advisor|investor|escrow\s+agent|owner|manager|consultant|contractor|client)\b/i,
    );
  }
}

describe("Universal invariant 1+2: explicit document intent dominates entity-shape routing", () => {
  it("multi-party residential lease (LLC landlord + 2 individual tenants) is titled Lease Agreement and never gates", () => {
    const intake =
      "Create a residential lease agreement between Sunset Holdings LLC, as landlord, and Alex Park and Jamie Chen as tenants for 123 Mockingbird Lane, Austin TX. Rent: $3,200/month. Term: 12 months starting July 1, 2026. Security deposit $3,200. Governing law: Texas.";
    const { draft, gated, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/^lease\s+agreement$/i);
    expect(gated).toBe(false);
    expectAllNamesPresent(partyNames, ["Sunset Holdings LLC", "Alex Park", "Jamie Chen"]);
    expect(partyNames.length).toBe(3);
    expectNoRoleSuffixes(partyNames);
    expect(draft.jurisdiction).toMatch(/texas/i);
  });

  it("multi-party residential lease with guarantor preserves all 3 parties without role labels in name", () => {
    const intake =
      "Lease agreement between Riverbend Properties LLC (landlord), Maya Patel (tenant), and David Patel (guarantor). Premises: Apartment 4B, 22 Hudson St, NYC. Rent: $4,500 monthly. Term: 24 months. Security deposit $9,000. New York law.";
    const { draft, gated, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/^lease\s+agreement$/i);
    expect(gated).toBe(false);
    expectAllNamesPresent(partyNames, ["Riverbend Properties LLC", "Maya Patel", "David Patel"]);
    expect(partyNames.length).toBe(3);
    expectNoRoleSuffixes(partyNames);
    expect(draft.jurisdiction).toMatch(/new\s+york/i);
  });

  it("multi-party real-estate purchase agreement (seller / buyer trust / escrow agent) is titled Real Estate Purchase Agreement and never gates", () => {
    const intake =
      "Real estate purchase agreement between Apex Sellers LLC (seller), the Chen Family Trust (buyer), and Title Pro Escrow (escrow agent). Property: 901 Pine Rd, Denver CO. Purchase price: $1,250,000. Closing date: August 15, 2026. Earnest money: $25,000. Governing law: Colorado.";
    const { draft, gated, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/real\s+estate\s+purchase\s+agreement/i);
    expect(gated).toBe(false);
    expectAllNamesPresent(partyNames, ["Apex Sellers LLC", "Chen Family Trust", "Title Pro Escrow"]);
    expect(partyNames.length).toBe(3);
    expectNoRoleSuffixes(partyNames);
    expect(draft.jurisdiction).toMatch(/colorado/i);
  });

  it("co-ownership agreement (trust + LLC + individual) preserves 3 parties and never gates on pro-rata cost-sharing", () => {
    const intake =
      "Co-ownership agreement between The Olson Family Trust, Northgate Holdings LLC, and Priya Patel for vacation cabin at 12 Lakeside Dr, Vermont. Ownership: Olson Trust 40%, Northgate 35%, Priya 25%. Annual costs split pro-rata. Vermont law.";
    const { draft, gated, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/co[-\s]?ownership\s+agreement/i);
    expect(gated).toBe(false);
    expectAllNamesPresent(partyNames, ["Olson Family Trust", "Northgate Holdings LLC", "Priya Patel"]);
    expect(partyNames.length).toBe(3);
    expect(draft.jurisdiction).toMatch(/vermont/i);
  });

  it("property management agreement is titled Property Management Agreement (not Business Agreement)", () => {
    const intake =
      "Property management agreement between Maple Grove LLC (owner) and Beacon Property Co. (manager) for 14 single-family rentals in Phoenix. Management fee: 8% of monthly rent. Term: 24 months. Arizona law.";
    const { draft, gated, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/property\s+management\s+agreement/i);
    expect(gated).toBe(false);
    expectAllNamesPresent(partyNames, ["Maple Grove LLC", "Beacon Property"]);
    expect(partyNames.length).toBe(2);
    expectNoRoleSuffixes(partyNames);
    expect(draft.jurisdiction).toMatch(/arizona/i);
  });
});

describe("Universal invariant 4: lossless multi-party extraction across families", () => {
  it("services agreement with 3 parties surfaces all 3 names cleanly (no purpose tail in 3rd party)", () => {
    const intake =
      "Services agreement between Acme LLC, Beta Inc, and Charlie Holdings for SaaS implementation. Fee: $25,000 fixed + $5,000/month support. Term: 6 months. California law.";
    const { draft, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/services\s+agreement/i);
    expectAllNamesPresent(partyNames, ["Acme LLC", "Beta Inc", "Charlie Holdings"]);
    expect(partyNames.length).toBe(3);
    expect(partyNames.every((n) => !/saas\s+implementation/i.test(n))).toBe(true);
  });

  it("advisor agreement with company + advisor + entity investor yields 3 clean parties", () => {
    const intake =
      "Advisor agreement between FoundCo Inc., Jane Smith (advisor), and East Bay Ventures (observer). Equity: 0.5% subject to 4-year vesting. Delaware law.";
    const { draft, gated, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/advisor\s+agreement/i);
    expect(gated).toBe(false);
    expectAllNamesPresent(partyNames, ["FoundCo Inc", "Jane Smith", "East Bay Ventures"]);
    expect(partyNames.length).toBe(3);
    expectNoRoleSuffixes(partyNames);
  });

  it("NDA with 3 parties is mutual and lists all 3", () => {
    const intake =
      "NDA between Northstar Labs, Riverbend Partners, and Atlas Capital. Purpose: evaluating partnership. Term: 2 years. New York law. Mutual confidentiality.";
    const { draft, gated, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/mutual\s+non[-\s]?disclosure\s+agreement/i);
    expect(gated).toBe(false);
    expectAllNamesPresent(partyNames, ["Northstar Labs", "Riverbend Partners", "Atlas Capital"]);
    expect(partyNames.length).toBe(3);
  });

  it("consulting/services agreement with 3 LLC + Inc + Holdings parties never collapses into 2", () => {
    const intake =
      "Consulting agreement between Apex Strategy LLC, Bridge Advisory Inc, and Summit Holdings for product roadmap work. Fee: $12,000/month. Term: 4 months. Massachusetts law.";
    const { gated, partyNames } = runStarter(intake);
    expect(gated).toBe(false);
    expectAllNamesPresent(partyNames, ["Apex Strategy LLC", "Bridge Advisory", "Summit Holdings"]);
    expect(partyNames.length).toBe(3);
  });

  it("4-party services agreement keeps all 4 names", () => {
    const intake =
      "Services agreement between Acme LLC, Beta Inc, Gamma Studios, and Delta Holdings. Fee $7,500/month. Term 12 months.";
    const { partyNames } = runStarter(intake);
    expectAllNamesPresent(partyNames, ["Acme LLC", "Beta Inc", "Gamma Studios", "Delta Holdings"]);
    expect(partyNames.length).toBe(4);
  });
});

describe("Universal invariant 1: entity suffix alone never causes operating-agreement routing", () => {
  it("Acme LLC + Beta LLC marketing services routes as commercial (NOT operating_agreement) and never gates", () => {
    const intake = "Marketing services between Acme LLC and Beta LLC. Fee $5,000/month. 6 months. Texas.";
    const { family, gated } = runStarter(intake);
    expect(family).not.toBe("operating_agreement");
    expect(gated).toBe(false);
  });

  it("LP + Inc + Trust mix without 'operating agreement' phrase never routes as OA", () => {
    const intake =
      "Distribution agreement between Pacific Partners LP, Westlake Inc, and the Hadley Family Trust. Term: 12 months. Oregon law.";
    const { family } = runStarter(intake);
    expect(family).not.toBe("operating_agreement");
  });
});

describe("Universal invariant 3: ordinary commercial terms never trip the complexity gate", () => {
  const ordinaryTerms = [
    {
      label: "rent + security deposit + escrow (commercial lease)",
      intake:
        "Commercial lease between Pinetree Properties LLC and Espresso Café Inc. Rent $6,000/month, $12,000 security deposit, escrow held by First National. Term 36 months. Oregon law.",
    },
    {
      label: "purchase price + closing date + earnest money + escrow",
      intake:
        "Real estate purchase between Lakeside LLC and Mark Wallace. Purchase price: $850,000. Closing date: October 1, 2026. Earnest money: $20,000 in escrow. Massachusetts law.",
    },
    {
      label: "monthly payment + ownership percentages + co-ownership",
      intake:
        "Co-ownership agreement between Atlas Holdings LLC and Sarah Park. Ownership: Atlas 60%, Sarah 40%. Monthly payment: $4,200 toward mortgage. Vermont law.",
    },
    {
      label: "guarantor + LLC + multiple parties (lease)",
      intake:
        "Lease between Bayview Properties LLC, Anjali Reddy (tenant), and Vivek Reddy (guarantor). Rent $3,000/month. Term 12 months. New Jersey.",
    },
  ];

  for (const c of ordinaryTerms) {
    it(`does not gate on ${c.label}`, () => {
      const family = detectAgreementFamily(c.intake);
      const gated = shouldInterceptAdvancedDocumentFamily(c.intake, family);
      expect(gated).toBe(false);
      expect(matchesAdvancedCommercialStructureSignals(c.intake)).toBe(false);
    });
  }
});

describe("Universal invariant 3: true advanced finance / securities deals still gate", () => {
  it("SAFE financing agreement gates", () => {
    const intake =
      "SAFE financing agreement between FoundCo Inc. and Acme Ventures Fund II LP. $500,000 SAFE with 20% discount and $5M valuation cap.";
    const family = detectAgreementFamily(intake);
    expect(shouldInterceptAdvancedDocumentFamily(intake, family)).toBe(true);
    expect(matchesAdvancedInstrumentPhrases(intake)).toBe(true);
  });

  it("convertible note gates", () => {
    const intake =
      "Convertible note purchase agreement for $1,000,000 between FoundCo Inc. and several accredited investors. 8% interest, 24-month maturity, 20% discount.";
    const family = detectAgreementFamily(intake);
    expect(shouldInterceptAdvancedDocumentFamily(intake, family)).toBe(true);
  });

  it("LLC operating agreement with class A/B + vesting + drag-along gates", () => {
    const intake =
      "Operating agreement for ApexCo LLC: Class A common units and Class B preferred units, 4-year vesting with 1-year cliff, drag-along and pro-rata participation rights, waterfall distributions.";
    const family = detectAgreementFamily(intake);
    expect(family).toBe("operating_agreement");
    expect(shouldInterceptAdvancedDocumentFamily(intake, family)).toBe(true);
  });
});

describe("Universal invariant 2: true LLC operating agreement still routes correctly", () => {
  it("simple 3-member LLC operating agreement extracts company + members and does NOT gate", () => {
    const intake =
      "Operating agreement for Sunrise Ventures LLC. Members: Alice 40%, Bob 35%, Carol 25%. Manager-managed. Delaware.";
    const { family, gated, draft, partyNames } = runStarter(intake);
    expect(family).toBe("operating_agreement");
    expect(gated).toBe(false);
    expect(draft.title).toMatch(/^operating\s+agreement$/i);
    expect(draft.llc_company_name).toMatch(/sunrise\s+ventures\s+llc/i);
    expect(draft.management_structure).toMatch(/manager[-\s]?managed/i);
    expect(draft.members_ownership_summary).toMatch(/Alice\s+40%/i);
    expect(draft.members_ownership_summary).toMatch(/Bob\s+35%/i);
    expect(draft.members_ownership_summary).toMatch(/Carol\s+25%/i);
    expectAllNamesPresent(partyNames, ["Alice", "Bob", "Carol"]);
    expect(draft.jurisdiction).toMatch(/delaware/i);
  });

  it("operating agreement title is canonical 'Operating Agreement' (no imperative phrases bleed through)", () => {
    const intake = "Create an LLC operating agreement for Apollo Data LLC. Members: Alpha Trust 50%, Beta Capital LLC 50%.";
    const { draft } = runStarter(intake);
    expect(draft.title).toMatch(/^operating\s+agreement$/i);
    expect(draft.title).not.toMatch(/create\b/i);
    expect(draft.llc_company_name).toMatch(/apollo\s+data\s+llc/i);
  });
});

describe("Universal invariant 5: role labels become metadata, never replace the party list", () => {
  it("guarantor role does not remove the guarantor from the party list", () => {
    const intake =
      "Lease between Riverbend Properties LLC (landlord), Maya Patel (tenant), and David Patel (guarantor). Rent $4,500 monthly. 24 months. New York law.";
    const { partyNames } = runStarter(intake);
    expect(partyNames.length).toBe(3);
    expect(partyNames.some((n) => /david\s+patel/i.test(n))).toBe(true);
  });

  it("escrow agent role does not remove the escrow party from the list", () => {
    const intake =
      "Real estate purchase agreement between Apex Sellers LLC (seller), the Chen Family Trust (buyer), and Title Pro Escrow (escrow agent). Purchase price: $1,250,000. Closing date: August 15, 2026.";
    const { partyNames } = runStarter(intake);
    expect(partyNames.length).toBe(3);
    expect(partyNames.some((n) => /title\s+pro\s+escrow/i.test(n))).toBe(true);
  });
});

describe("Universal invariant 6: section-safe field extraction", () => {
  it("payment terms never receive confidentiality language", () => {
    const intake =
      "Mutual NDA between Northstar Labs, Riverbend Partners, and Atlas Capital. Purpose: evaluating partnership. Mutual confidentiality. Term: 2 years. New York law.";
    const { draft } = runStarter(intake);
    expect(draft.payment_terms).not.toMatch(/confidential|nda|non[-\s]?disclosure|mutual\s+confidentiality|disclosing\s+party|receiving\s+party/i);
  });

  it("payment terms with leading colon noise are normalized clean", () => {
    const intake =
      "Property management agreement between Maple Grove LLC and Beacon Property Co. Management fee: 8% of monthly rent. Term: 24 months. Arizona law.";
    const { draft } = runStarter(intake);
    expect(draft.payment_terms).toMatch(/8%/);
    expect(draft.payment_terms.trim()).not.toMatch(/^[:\-]/);
  });

  it("party names never absorb a trailing purpose phrase ('for SaaS implementation', 'for 14 single-family rentals')", () => {
    const intake1 =
      "Services agreement between Acme LLC, Beta Inc, and Charlie Holdings for SaaS implementation. Fee: $25,000.";
    const { partyNames: pn1 } = runStarter(intake1);
    expect(pn1.every((n) => !/saas|implementation/i.test(n))).toBe(true);

    const intake2 =
      "Property management agreement between Maple Grove LLC and Beacon Property Co. for 14 single-family rentals in Phoenix.";
    const { partyNames: pn2 } = runStarter(intake2);
    expect(pn2.every((n) => !/14|single|rentals|phoenix/i.test(n))).toBe(true);
  });

  it("explicit governing law overrides Delaware default across families", () => {
    const cases: { intake: string; expected: RegExp }[] = [
      { intake: "Lease agreement between A LLC and B. Texas law.", expected: /texas/i },
      { intake: "Services agreement between A LLC and B. California law.", expected: /california/i },
      { intake: "NDA between A and B. New York law.", expected: /new\s+york/i },
      { intake: "Co-ownership agreement between A and B. Vermont law.", expected: /vermont/i },
      {
        intake: "Operating agreement for ABC LLC. Members: A 50%, B 50%. Oklahoma law.",
        expected: /oklahoma/i,
      },
    ];
    for (const c of cases) {
      const { draft } = runStarter(c.intake);
      expect(draft.jurisdiction, `intake: ${c.intake}`).toMatch(c.expected);
    }
  });
});

describe("Family routing summary (router classification only — independent of starter render)", () => {
  it("explicit document-intent phrases route to expected families", () => {
    const cases: { intake: string; family: AgreementFamily | null }[] = [
      { intake: "Mutual NDA between A and B. New York law.", family: "nda" },
      { intake: "Services agreement between A and B. Fee $5,000.", family: "services_agreement" },
      { intake: "Consulting agreement between A and B. $10,000/month.", family: "consulting_agreement" },
      { intake: "Independent contractor agreement between A and B.", family: "independent_contractor_agreement" },
      { intake: "Operating agreement for X LLC. Members: A 50%, B 50%.", family: "operating_agreement" },
      // Lease / purchase / co-ownership don't have dedicated families — they're generic_business_agreement
      // with explicit-intent canonical titles applied at render time.
      { intake: "Lease agreement between A LLC and B. $3,000/month.", family: "generic_business_agreement" },
      {
        intake: "Real estate purchase agreement between A LLC and B.",
        family: "generic_business_agreement",
      },
    ];
    for (const c of cases) {
      expect(detectAgreementFamily(c.intake), `intake: ${c.intake}`).toBe(c.family);
    }
  });

  it("LLC + ordinary 'team members' wording does not route to operating_agreement on entity noise alone", () => {
    const intake =
      "Marketing services agreement between Alpha Growth LLC and Beta Inc for team members in NYC. Fee $8,000/month. 6 months. New York law.";
    expect(detectAgreementFamily(intake)).not.toBe("operating_agreement");
  });
});

/**
 * Final universal hardening (party capacity, address boundaries, employment title, signer rows).
 */
describe("Universal hardening: party capacity, property boundaries, employment title, signer rows", () => {
  it("3-party purchase: trustee-of-trust buyer + escrow; Property line with commas is not absorbed into party names", () => {
    const intake =
      "Real estate purchase agreement between Apex Sellers LLC (seller), John Smith, Trustee of the Stone Family Trust (buyer), and First County Escrow Services as escrow agent. Property: 10 Oak Ave, Austin, TX 78701, Unit 2. Purchase price: $900,000. Governing law: Texas.";
    const { draft, gated, partyNames } = runStarter(intake);
    expect(gated).toBe(false);
    expect(draft.title).toMatch(/real\s+estate\s+purchase|purchase\s+agreement/i);
    expect(draft.jurisdiction).toMatch(/texas/i);
    expectAllNamesPresent(partyNames, ["Apex Sellers LLC", "John Smith", "First County Escrow"]);
    expect(partyNames.length).toBe(3);
    expect(partyNames.every((n) => !/78701|oak\s+ave|unit\s+2|purchase\s+price/i.test(n))).toBe(true);
  });

  it("residential lease: LLC landlord + 3 individual tenants (no first-party drop)", () => {
    const intake =
      "Residential lease agreement between Sunset Holdings LLC, as landlord, and Alex Park, Jamie Chen, Morgan Liu, and Sam Rivera as tenants. Rent $2,800/month. Term 12 months. Property: 404 Cedar Ln, Portland, OR. Oregon law.";
    const { partyNames, gated } = runStarter(intake);
    expect(gated).toBe(false);
    expect(partyNames.length).toBe(5);
    expectAllNamesPresent(partyNames, ["Sunset Holdings LLC", "Alex Park", "Jamie Chen", "Morgan Liu", "Sam Rivera"]);
    expect(partyNames.every((n) => !/cedar|portland|404/i.test(n))).toBe(true);
  });

  it("property management: owner + manager + individual contact", () => {
    const intake =
      "Property management agreement between Maple Grove LLC (owner), Beacon Property Co. (manager), and Jordan Lee (contact). Management fee: 7% of collected rent. Term 18 months. Arizona law.";
    const { partyNames, draft, gated } = runStarter(intake);
    expect(gated).toBe(false);
    expect(draft.title).toMatch(/property\s+management\s+agreement/i);
    expect(partyNames.length).toBe(3);
    expectAllNamesPresent(partyNames, ["Maple Grove LLC", "Beacon Property", "Jordan Lee"]);
  });

  it("consulting / services agreement with 4 entity parties preserves all four", () => {
    const intake =
      "Services agreement between Northwind LLC, Southbay Inc, Eastgate Corp, and Westline Holdings. Fee $9,000/month. Term 9 months. Illinois law.";
    const { partyNames } = runStarter(intake);
    expect(partyNames.length).toBe(4);
    expectAllNamesPresent(partyNames, ["Northwind LLC", "Southbay", "Eastgate", "Westline Holdings"]);
  });

  it("operating agreement with members only under Members: still surfaces member names", () => {
    const intake =
      "Operating agreement for Delta Works LLC. Members: Dana 34%, Eli 33%, Fran 33%. Manager-managed. Delaware law.";
    const { draft, partyNames, gated } = runStarter(intake);
    expect(gated).toBe(false);
    expect(draft.llc_company_name).toMatch(/delta\s+works\s+llc/i);
    expectAllNamesPresent(partyNames, ["Dana", "Eli", "Fran"]);
    expect(partyNames.length).toBeGreaterThanOrEqual(3);
  });

  it("explicit employment agreement title on generic family", () => {
    const intake = "Employment agreement between BrightCo Inc and Casey Jordan. Salary $95,000/year. California law.";
    const { draft } = runStarter(intake);
    expect(draft.title).toMatch(/^employment\s+agreement$/i);
  });

  it("d/b/a trade name survives in party list", () => {
    const intake =
      "Services agreement between ABC LLC d/b/a Rocket Labs and ClientCo Inc. Fee $4,000/month. Texas law.";
    const { partyNames } = runStarter(intake);
    expect(partyNames.some((n) => /rocket\s+labs/i.test(n))).toBe(true);
    expect(partyNames.some((n) => /abc\s+llc/i.test(n))).toBe(true);
  });

  it("commercial lease: individual tenant + Jamie Chen individually and as guarantor", () => {
    const intake =
      "Commercial lease between River Plaza LLC and Morgan Blake, with Jamie Chen individually and as guarantor. Rent $5,500/month. Term 24 months. New York law.";
    const { partyNames } = runStarter(intake);
    expectAllNamesPresent(partyNames, ["River Plaza LLC", "Morgan Blake", "Jamie Chen"]);
    expect(partyNames.length).toBe(3);
    const jamie = partyNames.find((n) => /jamie/i.test(n));
    expect(jamie).toBeDefined();
    expect(jamie).toMatch(/^Jamie Chen$/i);
  });

  it("four explicit signer rows are all preserved", () => {
    const intake = `Mutual NDA. Governing law: Washington. Term: 2 years.
Signer 1: Taylor Avery
Signer 2: Riley Brooks
Signer 3: Morgan Cruz
Signer 4: Jordan Dale`;
    const { partyNames } = runStarter(intake);
    expect(partyNames.length).toBe(4);
    expectAllNamesPresent(partyNames, ["Taylor Avery", "Riley Brooks", "Morgan Cruz", "Jordan Dale"]);
  });
});
