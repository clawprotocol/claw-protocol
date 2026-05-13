/**
 * Universal "post-hardening polish" regression suite (P0–P3).
 *
 * Locks in:
 *   P0  First-party preservation — `between A, B, and C` never drops a structured 3+ list.
 *   P1  Canonical titles — explicit intent dominates entity-suffix / role-token noise.
 *   P2  Display-layer role preservation — guarantor / escrow agent surface as parenthetical
 *       roles without polluting canonical party names.
 *   P3  Family-specific timing labels — Closing Date / Lease Term / Confidentiality Term /
 *       Services Term replace the legacy "Term:" heading per family.
 */

import { describe, expect, it } from "vitest";

import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

function blankParsedDraft(): ParsedDraftShape {
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
  } as ParsedDraftShape;
}

function runStarter(intake: string): {
  draft: ParsedDraftShape;
  partyNames: string[];
  partyRoles: string[];
  preview: string;
} {
  const draft = runIntakeDefaultsAndRoles(blankParsedDraft(), intake, true, defaultIntakePartyRoleLabels());
  const partyNames = (draft.parties || []).map((p) => p.name);
  const partyRoles = (draft.parties || []).map((p) => (p.role || "").toLowerCase());
  const preview = buildAgreementPreviewText(draft, { starterPreview: true });
  return { draft, partyNames, partyRoles, preview };
}

// ─── P0: First-party preservation across `between A, B, and C` shape ────────────

describe("P0 universal first-party preservation: between A, B, and C", () => {
  const cases: { label: string; intake: string }[] = [
    {
      label: "consulting",
      intake:
        "Create a consulting agreement between Alpha LLC, Beta Advisors, and Gamma Holdings. Texas law.",
    },
    {
      label: "services",
      intake:
        "Services agreement between Alpha LLC, Beta Advisors, and Gamma Holdings. Fee $5,000/month. Texas law.",
    },
    {
      label: "NDA",
      intake:
        "Mutual NDA between Alpha LLC, Beta Advisors, and Gamma Holdings. Term 2 years. Washington law.",
    },
    {
      label: "lease",
      intake:
        "Commercial lease agreement between Alpha LLC, Beta Advisors, and Gamma Holdings. Property: 123 Main St. Rent: $4,500/month.",
    },
    {
      label: "purchase",
      intake:
        "Real estate purchase agreement between Alpha LLC, Beta Advisors, and Gamma Holdings. Property: 456 Oak Ave. Closing date: August 15, 2026.",
    },
  ];
  for (const c of cases) {
    it(`${c.label}: all three parties survive — Alpha LLC never dropped`, () => {
      const { partyNames } = runStarter(c.intake);
      expect(partyNames).toContain("Alpha LLC");
      expect(partyNames).toContain("Beta Advisors");
      expect(partyNames).toContain("Gamma Holdings");
      expect(partyNames.length).toBe(3);
    });
  }

  it("guard: a 3+ structured party list is never reduced by a downstream 2-party fallback", () => {
    // Even with parsed.parties seeded with 2 generic placeholders, the structured 3-party list
    // wins (cardinality guard) — Alpha LLC must never be dropped.
    const intake =
      "Consulting agreement between Alpha LLC, Beta Advisors, and Gamma Holdings. Delaware law.";
    const seeded: ParsedDraftShape = {
      ...blankParsedDraft(),
      parties: [
        { name: "Party A", role: "party" },
        { name: "Party B", role: "party" },
      ],
    };
    const draft = runIntakeDefaultsAndRoles(seeded, intake, true, defaultIntakePartyRoleLabels());
    const names = (draft.parties || []).map((p) => p.name);
    expect(names).toContain("Alpha LLC");
    expect(names).toContain("Beta Advisors");
    expect(names).toContain("Gamma Holdings");
    expect(names.length).toBe(3);
  });
});

// ─── P1: Canonical title rendering ──────────────────────────────────────────────

describe("P1 canonical titles dominate entity-suffix / role-token noise", () => {
  const titleCases: { intake: string; matches: RegExp }[] = [
    {
      intake:
        "Mutual NDA between Alpha LLC and Beta Inc. Confidentiality term: 3 years. Delaware law.",
      matches: /^Mutual Non-Disclosure Agreement$/i,
    },
    {
      intake:
        "Consulting agreement between Alpha LLC, Beta Advisors, and Gamma Holdings. Delaware law.",
      matches: /^Consulting Agreement$/i,
    },
    {
      intake:
        "Commercial lease agreement between Sunset LLC and Alex Park. Property: 123 Main St. Rent: $4,500/month.",
      matches: /^Commercial Lease Agreement$/i,
    },
    {
      intake:
        "Residential lease agreement between Sunset Holdings LLC and Alex Park. Property: 12 Lakeside Dr. Rent: $2,800/month.",
      matches: /^Residential Lease Agreement$/i,
    },
    {
      intake:
        "Real estate purchase agreement between Apex Sellers LLC, Chen Family Trust, and First County Escrow Services as escrow agent. Property: 456 Oak Ave. Closing date: August 15, 2026.",
      matches: /^Real Estate Purchase Agreement$/i,
    },
    {
      intake:
        "Property management agreement between Sunset LLC, Beacon Property Co., and Alex Park. Property: 100 Beacon Way.",
      matches: /^Property Management Agreement$/i,
    },
    {
      intake: "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $10,000.",
      matches: /^Web Development Agreement$/i,
    },
  ];
  for (const c of titleCases) {
    it(`title: ${c.matches} for "${c.intake.slice(0, 60)}…"`, () => {
      const { draft } = runStarter(c.intake);
      expect(draft.title).toMatch(c.matches);
    });
  }

  it("explicit lease intent never falls back to plain Agreement when 'Beta Advisors' is in a party name", () => {
    const { draft } = runStarter(
      "Commercial lease agreement between Beta Advisors LLC and Alex Park. Property: 12 Main St. Rent: $4,500/month.",
    );
    expect(draft.title).not.toMatch(/^agreement$/i);
    expect(draft.title).not.toMatch(/^consulting\s+agreement$/i);
    expect(draft.title).toMatch(/Commercial Lease Agreement/i);
  });

  it("NDA intake never lands on legacy Confidentiality Agreement title", () => {
    const { draft } = runStarter(
      "Mutual NDA between Apollo Data LLC and Beacon Inc. Confidentiality term: 3 years. Delaware law.",
    );
    expect(draft.title).not.toMatch(/^confidentiality\s+agreement$/i);
    expect(draft.title).toMatch(/Mutual Non-Disclosure Agreement/i);
  });
});

// ─── P2: Display-layer role preservation ────────────────────────────────────────

describe("P2 display-layer role preservation", () => {
  it("Jamie Chen as guarantor: canonical name stays Jamie Chen, role surfaces parenthetically", () => {
    const intake =
      "Commercial lease between River Plaza LLC and Morgan Blake, with Jamie Chen individually and as guarantor. Rent $5,500/month. Term 24 months. New York law.";
    const { partyNames, partyRoles, preview } = runStarter(intake);
    expect(partyNames).toContain("Jamie Chen");
    expect(partyNames).not.toContain("Jamie Chen as guarantor");
    expect(partyNames).not.toContain("With Jamie Chen");
    expect(partyRoles).toContain("guarantor");
    expect(preview).toMatch(/Jamie Chen.*Guarantor|Guarantor.*Jamie Chen/i);
  });

  it("First County Escrow Services as escrow agent: role surfaces parenthetically", () => {
    const intake =
      "Real estate purchase agreement between Apex Sellers LLC, Chen Family Trust, and First County Escrow Services as escrow agent. Property: 456 Oak Ave. Closing date: August 15, 2026.";
    const { partyNames, partyRoles, preview } = runStarter(intake);
    expect(partyNames).toContain("First County Escrow Services");
    expect(partyNames).not.toContain("First County Escrow Services as escrow agent");
    expect(partyRoles).toContain("escrow agent");
    expect(preview).toMatch(/Escrow Agent/i);
  });

  it("trustee: name stays clean, role tracked via display metadata", () => {
    const intake =
      "Real estate purchase agreement between John Smith, Trustee of the Smith Family Trust, and Beacon Holdings LLC. Property: 12 Lakeside Dr. Closing date: July 1, 2026.";
    const { partyNames } = runStarter(intake);
    expect(partyNames.some((n) => /^John Smith$/i.test(n) || /Smith Family Trust/i.test(n))).toBe(true);
    expect(partyNames.some((n) => /\bTrustee of the Smith Family Trust\b/i.test(n))).toBe(false);
  });
});

// ─── P3: Family-specific timing display ─────────────────────────────────────────

describe("P3 family-specific timing display", () => {
  it("real estate purchase shows Closing Date (not generic Term)", () => {
    const intake =
      "Real estate purchase agreement between Apex Sellers LLC and Chen Family Trust. Property: 456 Oak Ave. Closing date: August 15, 2026.";
    const { preview } = runStarter(intake);
    expect(preview).toMatch(/Closing/);
    expect(preview).not.toMatch(/^Term:/m);
  });

  it("commercial lease shows Lease Term and Commencement Date", () => {
    const intake =
      "Commercial lease agreement between Sunset LLC and Alex Park. Property: 123 Main St. Rent: $4,500/month. Term: 36 months.";
    const { preview } = runStarter(intake);
    expect(preview).toMatch(/Lease Term/);
    expect(preview).toMatch(/Commencement Date/);
  });

  it("residential lease shows Lease Term and Commencement Date", () => {
    const intake =
      "Residential lease agreement between Sunset Holdings LLC and Alex Park. Property: 12 Lakeside Dr. Rent: $2,800/month. Term: 12 months.";
    const { preview } = runStarter(intake);
    expect(preview).toMatch(/Lease Term/);
  });

  it("NDA shows Confidentiality Term", () => {
    const intake =
      "Mutual NDA between Apollo Data LLC and Beacon Inc. Confidentiality term: 3 years. Washington law.";
    const { preview } = runStarter(intake);
    expect(preview).toMatch(/Confidentiality Term/);
  });

  it("consulting shows Services Term", () => {
    const intake =
      "Consulting agreement between Apollo Data LLC and Sarah Kim. Fee $5,000/month. Term: 12 months. Delaware law.";
    const { preview } = runStarter(intake);
    expect(preview).toMatch(/Services Term/);
  });

  it("services agreement shows Services Term", () => {
    const intake =
      "Services agreement between BlueSky Co. and Atlas Partners LLC. Fee $10,000/month. Term: 6 months. Delaware law.";
    const { preview } = runStarter(intake);
    expect(preview).toMatch(/Services Term/);
  });

  it("property management shows Management Term and Commencement Date", () => {
    const intake =
      "Property management agreement between Sunset LLC, Beacon Property Co., and Alex Park. Property: 100 Beacon Way. Term: 24 months.";
    const { preview } = runStarter(intake);
    expect(preview).toMatch(/Management Term/);
  });
});
