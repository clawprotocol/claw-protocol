import { describe, expect, it } from "vitest";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";

const TRIPARTITE_SOFTWARE_DEV_INTAKE = `Create a TRIPARTITE SOFTWARE DEVELOPMENT AND REVENUE SHARING AGREEMENT among Red Mesa Logistics LLC, Harbor Peak Automation LLC, and Blue Canyon Analytics LLC.

Purpose: development and maintenance of a custom freight optimization platform, including analytics dashboard work.

Term: twenty-four (24) months.

Payment: $120,000 startup payment plus $3,000 per month maintenance.

Revenue sharing: Red Mesa Logistics LLC 50%, Harbor Peak Automation LLC 30%, Blue Canyon Analytics LLC 20%.

Confidentiality applies. Oklahoma law governs. Electronic execution via LawDog.`;

describe("parseIntakeToStructuredAgreement", () => {
  it("does not put a long Parties: paragraph into parties[]", () => {
    const wall = `Parties: This agreement is entered into by Acme Corp and Beta LLC for the purpose of defining mutual obligations regarding software development, payment milestones, and confidentiality. The parties intend to be bound hereby.
Scope: API integration work.`;
    const s = parseIntakeToStructuredAgreement(wall);
    expect(s.parties.length).toBe(0);
    expect(s.partiesUncertain).toBe(true);
    expect(s.scope.length).toBeGreaterThan(10);
  });

  it("maps money and duration into payment and term only", () => {
    const s = parseIntakeToStructuredAgreement(
      "Between Alice Example and Bob Example for consulting. $5,000 monthly. Term 18 months.",
    );
    expect(s.parties).toHaveLength(2);
    expect(s.partiesUncertain).toBe(false);
    expect(s.payment).toMatch(/\$5,000/i);
    expect(s.term).toMatch(/18\s+months/i);
    expect(s.scope.length).toBeGreaterThan(3);
  });

  it("preserves labeled payment with startup payment wording and revenue sharing splits", () => {
    const s = parseIntakeToStructuredAgreement(
      `Payment: $120,000 startup payment plus $3,000 per month maintenance.

Revenue sharing: Red Mesa Logistics LLC 50%, Harbor Peak Automation LLC 30%, Blue Canyon Analytics LLC 20%.`,
    );
    expect(s.payment).toMatch(/\$120,000/);
    expect(s.payment).toMatch(/\$3,000/);
    expect(s.payment).toMatch(/50\s*%/);
    expect(s.payment).toMatch(/Revenue sharing:/i);
  });

  it("preserves tripartite software dev payment and revenue lines from full intake", () => {
    const s = parseIntakeToStructuredAgreement(TRIPARTITE_SOFTWARE_DEV_INTAKE);
    expect(s.payment).toMatch(/\$120,000/);
    expect(s.payment).toMatch(/\$3,000/);
    expect(s.payment).toMatch(/50\s*%/);
  });

  it("extracts twenty-four (24) months from labeled Term line", () => {
    const s = parseIntakeToStructuredAgreement("Term: twenty-four (24) months.");
    expect(s.term).toMatch(/twenty-four\s*\(24\)\s+months|24\s+months/i);
  });

  it("extracts governing law phrase into governing_law", () => {
    const s = parseIntakeToStructuredAgreement(
      "Between A Test LLC and B Test LLC. Governing law: New York. Scope: data processing.",
    );
    expect(s.governing_law.toLowerCase()).toContain("new york");
  });

  it("detects fuzzy scope-of-work phrasing with signal + inferred flag", () => {
    const raw =
      "Between Acme LLC and Beta LLC. The contractor will be performing administrative and operational work for our startup SaaS platform. Payment is monthly.";
    const s = parseIntakeToStructuredAgreement(raw);
    expect(s.scopeSignalPresent).toBe(true);
    expect(s.scope.length).toBeGreaterThan(10);
    expect(s.termSignalPresent).toBe(false);
    expect(s.term).toBe("");
  });

  it("does not put pay cadence alone into term (monthly + termination + law)", () => {
    const raw =
      "$2000 monthly, either party may terminate by email with 30 days notice, Oklahoma law.";
    const s = parseIntakeToStructuredAgreement(raw);
    expect(s.term).toBe("");
    expect(s.payment.toLowerCase()).toMatch(/monthly|2000/);
    expect(s.termination.toLowerCase()).toMatch(/either party|30|email/);
  });

  it("prefers start date over pay cadence for Monthly … starting May 1", () => {
    const s = parseIntakeToStructuredAgreement("Monthly consulting agreement starting May 1, 2026");
    expect(s.term.toLowerCase()).toContain("may 1");
    expect(s.term.toLowerCase()).not.toContain("timing noted (monthly)");
  });

  it("maps month-to-month to rolling term", () => {
    const s = parseIntakeToStructuredAgreement("Month-to-month consulting agreement");
    expect(s.term.toLowerCase()).toContain("month-to-month");
  });

  it("keeps weekly as cadence when duration is explicit (for 12 months)", () => {
    const s = parseIntakeToStructuredAgreement("$5000 weekly for 12 months");
    expect(s.term).toMatch(/12\s+months/i);
    expect(s.payment.toLowerCase()).toMatch(/5000|weekly/);
  });

  it("routes notice-based termination out of term and into termination", () => {
    const raw =
      "monthly pay of $2000, termination by either party by email with 30 days notice between Acme LLC and Beta LLC";
    const s = parseIntakeToStructuredAgreement(raw);
    expect(s.term.toLowerCase()).not.toMatch(/^\s*30\s+days\s*$/);
    expect(s.termination.toLowerCase()).toMatch(/either party may terminate/);
    expect(s.termination.toLowerCase()).toMatch(/30/);
    expect(s.termination.toLowerCase()).toMatch(/email/);
  });
});

describe("buildLiveDraftPreview uses structured model", () => {
  it("leaves parties line empty when party blob is uncertain", () => {
    const text = `Parties: ${"word ".repeat(40)}between stuff`;
    const live = buildLiveDraftPreview(text);
    expect(live.partiesLine).toBeNull();
    expect(live.partiesUncertain).toBe(true);
  });
});
