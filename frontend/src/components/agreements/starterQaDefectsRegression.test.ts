/**
 * Regression suite for the QA-reported starter-flow defects:
 *   P0  — 3-party agreements drop the first party (consulting, advisor)
 *   P1  — Confidentiality intent leaks into Payment Terms in 3-party NDA flow
 *   P2  — LLC operating agreement starter extraction is weak (company / management / ownership)
 *   P3  — Canonical titles (Advisor Agreement, Mutual NDA) need polish
 *   QA  — Existing 4-signer web development prompt must continue to work
 *
 * Acceptance criteria (verbatim from the spec):
 *   - Consulting 3-party prompt: 3 parties, $5,000/month, 6 months, Texas law.
 *   - Advisor 3-party prompt: 3 parties, product strategy scope, 0.5% equity comp,
 *     Delaware law, title "ADVISOR AGREEMENT".
 *   - NDA 3-party prompt: 3 parties, "evaluating a potential partnership" purpose,
 *     2 years, New York law, NDA canonical title, no confidentiality text in payment.
 *   - LLC operating: Apollo Data LLC, 3 owners + percentages, manager-managed, Oklahoma.
 *   - 4-party web dev: 4 signers, $7,500, May 15 / June 30, Oklahoma.
 */
import { describe, expect, it } from "vitest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: true } as const;
function emptyDraft(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { ...EMPTY_PAYMENT },
  };
}
function pipe(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
}

const CONSULTING_3P =
  "Create a consulting agreement between Alpha LLC, Beta Advisors, and Gamma Holdings. Scope: marketing strategy. Payment: $5,000/month. Term: 6 months. Governing law: Texas.";
const ADVISOR_3P =
  "Create an advisor agreement between Nova Labs Inc., Priya Shah, and East Bay Ventures. Scope: product strategy. Compensation: 0.5% equity subject to standard vesting. Governing law: Delaware.";
const NDA_3P =
  "Create an NDA between Northstar Labs, Riverbend Partners, and Atlas Capital. Purpose: evaluating a potential partnership. Term: 2 years. Governing law: New York. Mutual confidentiality.";
const LLC_OP =
  "Create an LLC operating agreement between Alpha Trust, Beta Capital LLC, and Jamie Chen for Apollo Data LLC. Ownership: Alpha Trust 40%, Beta Capital 40%, Jamie Chen 20%. Manager-managed. Governing law: Oklahoma.";
const WEB_DEV_4P = `Web development agreement.
Sender/signer 1: Marcus Webb
Signer 2: Aleksy Kowalski
Signer 3: Raj Patel
Signer 4: Elena Vasquez

Scope: Design and develop a multi-tenant SaaS platform with React frontend, Node.js backend, and PostgreSQL database.
Payment: $7,500 due on signing.
Term: starts May 15, 2026 and ends June 30, 2027.
Governing law: Oklahoma.`;

describe("P0 — 3-party agreements preserve ALL parties (no first-party drop)", () => {
  it("consulting: Alpha LLC, Beta Advisors, Gamma Holdings", () => {
    const r = pipe(CONSULTING_3P);
    const names = r.parties.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Alpha LLC", "Beta Advisors", "Gamma Holdings"]));
    expect(names.length).toBe(3);
  });

  it("advisor: Nova Labs Inc., Priya Shah, East Bay Ventures", () => {
    const r = pipe(ADVISOR_3P);
    const names = r.parties.map((p) => p.name);
    expect(names.some((n) => /^Nova Labs Inc\.?$/.test(n))).toBe(true);
    expect(names).toContain("Priya Shah");
    expect(names).toContain("East Bay Ventures");
    expect(names.length).toBe(3);
    // Specific guard: "Nova Labs Inc.." double-period is forbidden (entity-suffix dedupe).
    expect(names.every((n) => !/Inc\.\./.test(n))).toBe(true);
  });

  it("NDA: Northstar Labs, Riverbend Partners, Atlas Capital", () => {
    const r = pipe(NDA_3P);
    const names = r.parties.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["Northstar Labs", "Riverbend Partners", "Atlas Capital"]),
    );
    expect(names.length).toBe(3);
  });
});

describe("P0 acceptance — consulting fixture full surface", () => {
  it("preserves $5,000/month, 6 months, Texas law", () => {
    const r = pipe(CONSULTING_3P);
    expect(r.jurisdiction).toMatch(/texas/i);
    expect(r.payment_terms).toMatch(/5[,.]?000/);
    expect(r.payment_terms.toLowerCase()).toContain("month");
    expect(r.duration).toMatch(/6\s*months/i);
    expect(r.title).toMatch(/Consulting Agreement/i);
  });
});

describe("P0 acceptance — advisor fixture full surface (P3 title polish)", () => {
  it("renders 0.5% equity compensation, Delaware, ADVISOR AGREEMENT title", () => {
    const r = pipe(ADVISOR_3P);
    expect(r.jurisdiction).toMatch(/delaware/i);
    expect(r.purpose.toLowerCase()).toContain("product strategy");
    // Equity comp must populate Payment Terms (no $ amount needed).
    expect(r.payment_terms).toMatch(/0\.5\s*%/);
    expect(r.payment_terms.toLowerCase()).toContain("equity");
    expect(r.payment_terms.toLowerCase()).toContain("vesting");
    // Canonical advisor title (regression spec P3).
    expect(r.title).toBe("Advisor Agreement");
  });
});

describe("P1 — Confidentiality NEVER leaks into Payment Terms (NDA fixture)", () => {
  it("3-party NDA: payment is neutral no-fee language, not confidentiality wording", () => {
    const r = pipe(NDA_3P);
    expect(r.payment_terms).not.toMatch(/confidential/i);
    expect(r.payment_terms).not.toMatch(/non[-\s]?disclosure/i);
    expect(r.payment_terms).not.toMatch(/proprietary/i);
    expect(r.payment_terms).not.toMatch(/return\/destroy/i);
    // Neutral fallback contains "no fees" or equivalent.
    expect(r.payment_terms).toMatch(/no\s+fees|no\s+payment/i);
  });

  it("NDA fixture: title is canonical NDA, not legacy Confidentiality Agreement", () => {
    const r = pipe(NDA_3P);
    expect(r.title).toMatch(/Non-Disclosure Agreement/i);
    expect(r.title).not.toMatch(/^confidentiality\s+agreement$/i);
  });

  it("NDA fixture: New York law, 2 years, partnership-evaluation purpose", () => {
    const r = pipe(NDA_3P);
    expect(r.jurisdiction).toMatch(/new york/i);
    expect(r.duration).toMatch(/2\s*years/i);
    expect(r.purpose.toLowerCase()).toContain("evaluating");
    expect(r.purpose.toLowerCase()).toContain("partnership");
  });
});

describe("P2 — LLC operating agreement starter extraction", () => {
  it("extracts entity name from 'for Apollo Data LLC' (not imperative 'Create an LLC')", () => {
    const r = pipe(LLC_OP);
    expect(r.llc_company_name).toBe("Apollo Data LLC");
    // Must NEVER pick up imperative phrasing as the company name.
    expect(r.llc_company_name).not.toMatch(/^create\b/i);
  });

  it("extracts management structure from 'Manager-managed'", () => {
    const r = pipe(LLC_OP);
    expect(r.management_structure).toBe("Manager-managed");
  });

  it("extracts ownership rows with percentages", () => {
    const r = pipe(LLC_OP);
    const ownership = (r.members_ownership_summary || "").toLowerCase();
    expect(ownership).toContain("alpha trust");
    expect(ownership).toContain("40%");
    expect(ownership).toContain("beta capital");
    expect(ownership).toContain("jamie chen");
    expect(ownership).toContain("20%");
  });

  it("preserves all 3 owners as parties (drops 'for Apollo Data LLC' tail from third party)", () => {
    const r = pipe(LLC_OP);
    const names = r.parties.map((p) => p.name);
    // Either the structured-extracted owner trio, or company+members default — never the broken
    // "Jamie Chen for Apollo Data LLC" continuation.
    expect(names.every((n) => !/jamie chen for apollo/i.test(n))).toBe(true);
    if (names.length === 3) {
      expect(names).toContain("Alpha Trust");
      expect(names).toContain("Beta Capital LLC");
      expect(names).toContain("Jamie Chen");
    }
  });

  it("title is canonical 'Operating Agreement' (not 'Operating Agreement — Create an LLC')", () => {
    const r = pipe(LLC_OP);
    expect(r.title).toBe("Operating Agreement");
  });

  it("preserves Oklahoma jurisdiction", () => {
    const r = pipe(LLC_OP);
    expect(r.jurisdiction).toMatch(/oklahoma/i);
  });

  it("never carries imperative phrases anywhere in the rendered shell", () => {
    const r = pipe(LLC_OP);
    expect(r.title).not.toMatch(/^create\b/i);
    expect(r.parties.every((p) => !/^create\b/i.test(p.name))).toBe(true);
    expect((r.llc_company_name || "")).not.toMatch(/^create\b/i);
  });
});

describe("QA — 4-signer web development prompt regression guard", () => {
  it("preserves all 4 signer names", () => {
    const r = pipe(WEB_DEV_4P);
    const names = r.parties.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["Marcus Webb", "Aleksy Kowalski", "Raj Patel", "Elena Vasquez"]),
    );
    expect(names.length).toBeGreaterThanOrEqual(4);
  });

  it("preserves $7,500 payment and clean Start/End date label", () => {
    const r = pipe(WEB_DEV_4P);
    expect(r.payment_terms).toMatch(/7[,.]?500/);
    expect(r.duration).toMatch(/Start Date:\s*May 15, 2026/i);
    expect(r.duration).toMatch(/End Date:\s*June 30, 2027/i);
    // No legacy "Start / date:" hybrid label.
    expect(r.duration).not.toMatch(/start\s*\/\s*date/i);
  });

  it("preserves Oklahoma governing law", () => {
    const r = pipe(WEB_DEV_4P);
    expect(r.jurisdiction).toMatch(/oklahoma/i);
  });

  it("title is NOT the legacy 'Lease Agreement' (multi-tenant false-positive)", () => {
    const r = pipe(WEB_DEV_4P);
    expect(r.title.toLowerCase()).not.toBe("lease agreement");
  });
});

describe("Public-facing copy only — no internal-process phrasing in starter defaults", () => {
  it("payment_terms / purpose / duration never contain 'in review' wording", () => {
    const intakes = [CONSULTING_3P, ADVISOR_3P, NDA_3P, LLC_OP, WEB_DEV_4P];
    for (const intake of intakes) {
      const r = pipe(intake);
      const haystack = [
        r.title,
        r.purpose,
        r.payment_terms,
        r.duration ?? "",
        r.effective_date ?? "",
        r.termination_summary ?? "",
        ...r.parties.map((p) => p.name),
      ].join(" \n ");
      expect(haystack).not.toMatch(/\bin\s+review\b/i);
      expect(haystack).not.toMatch(/edit in review/i);
      expect(haystack).not.toMatch(/specified in review/i);
      expect(haystack).not.toMatch(/refined in review/i);
    }
  });
});
