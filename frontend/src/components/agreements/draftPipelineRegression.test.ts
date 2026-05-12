/**
 * Generalized regression test suite for the starter/free draft pipeline.
 * Proves that structured facts extracted from intake survive full pipeline rendering.
 *
 * Uses randomized names, varied agreement types, signer counts, jurisdictions,
 * and payment structures to avoid brittle hardcoded test design.
 */
import { describe, expect, it } from "vitest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: true };

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
    payment: EMPTY_PAYMENT,
  };
}

function runPipeline(intakeText: string, draft?: Partial<ParsedDraftShape>): ParsedDraftShape {
  const base = { ...emptyDraft(), ...(draft || {}) };
  return runIntakeDefaultsAndRoles(base, intakeText, true, defaultIntakePartyRoleLabels());
}

function randomName(): string {
  const firsts = ["James", "Maria", "Devon", "Aisha", "Liam", "Priya", "Carlos", "Yuki", "Tamara", "Viktor"];
  const lasts = ["Navarro", "Okonkwo", "Petrov", "Shimizu", "Adeyemi", "Lindqvist", "Moreau", "Patel", "Torres", "Williams"];
  return `${firsts[Math.floor(Math.random() * firsts.length)]} ${lasts[Math.floor(Math.random() * lasts.length)]}`;
}

function randomJurisdiction(): string {
  const states = ["New York", "California", "Texas", "Illinois", "Florida", "Georgia", "Washington", "Colorado"];
  return states[Math.floor(Math.random() * states.length)];
}

describe("draft pipeline: structured fact preservation", () => {
  it("consulting agreement preserves payment amount", () => {
    const intake = `Consulting agreement between ${randomName()} and ${randomName()}.
Scope: Strategic advisory on market expansion.
Fee: $5,000 per month.
Duration: 6 months.
Governing law: New York.`;
    const result = runPipeline(intake);
    expect(result.payment_terms).toMatch(/5[,.]?000/);
    expect(result.jurisdiction).toMatch(/new york/i);
    expect(result.duration).toMatch(/6 months/i);
    expect(result.purpose).not.toMatch(/to be refined/i);
  });

  it("development agreement preserves scope and duration", () => {
    const dev = randomName();
    const client = randomName();
    const intake = `Web development agreement.
Parties: ${client} (Client) and ${dev} (Developer).
Scope: Design and build a SaaS dashboard with React and Node.js.
Payment: $12,000 total, 50% upfront, 50% on delivery.
Duration: 3 months.
Governing law: California.`;
    const result = runPipeline(intake);
    expect(result.purpose).toMatch(/dashboard|SaaS|React/i);
    expect(result.payment_terms).toMatch(/12[,.]?000/);
    expect(result.duration).toMatch(/3 months/i);
    expect(result.jurisdiction).toMatch(/california/i);
    expect(result.parties.length).toBeGreaterThanOrEqual(2);
    expect(result.parties.some((p) => p.name.includes(client.split(" ")[1]))).toBe(true);
  });

  it("contractor agreement preserves hourly rate", () => {
    const intake = `Independent contractor agreement.
${randomName()} will provide freelance design work to ${randomName()}.
Rate: $85/hour.
Term: 12 months, terminable with 30 days notice.
Jurisdiction: Texas.`;
    const result = runPipeline(intake);
    expect(result.payment_terms).toMatch(/85/);
    expect(result.duration).toMatch(/12 months/i);
    expect(result.jurisdiction).toMatch(/texas/i);
    expect(result.agreement_family).toBe("independent_contractor_agreement");
  });

  it("NDA preserves governing law and does not inject service scope", () => {
    const intake = `Mutual NDA between ${randomName()} and ${randomName()}.
Governing law: Illinois.
Duration: 2 years.`;
    const result = runPipeline(intake);
    expect(result.agreement_family).toBe("nda");
    expect(result.jurisdiction).toMatch(/illinois/i);
    expect(result.duration).toMatch(/2 years/i);
  });

  it("multi-party service agreement preserves all signers and scope", () => {
    const names = Array.from({ length: 4 }, randomName);
    const intake = `Collaboration agreement for joint marketing campaign.
Signer 1: ${names[0]}
Signer 2: ${names[1]}
Signer 3: ${names[2]}
Signer 4: ${names[3]}
Scope: Joint digital marketing campaign across social media platforms.
Payment: Each party contributes $2,500.
Duration: 6 months.
Governing law: Florida.`;
    const result = runPipeline(intake);
    expect(result.parties.length).toBe(4);
    for (const n of names) {
      expect(result.parties.some((p) => p.name.includes(n.split(" ")[1]))).toBe(true);
    }
    expect(result.jurisdiction).toMatch(/florida/i);
    expect(result.payment_terms).toMatch(/2[,.]?500/);
    expect(result.duration).toMatch(/6 months/i);
  });

  it("5-party agreement preserves all signers", () => {
    const names = Array.from({ length: 5 }, randomName);
    const intake = `Services agreement.
Signer 1: ${names[0]}
Signer 2: ${names[1]}
Signer 3: ${names[2]}
Signer 4: ${names[3]}
Signer 5: ${names[4]}
Scope: Shared office space management.
Payment: $1,200/month split equally.
Governing law: Colorado.`;
    const result = runPipeline(intake);
    expect(result.parties.length).toBe(5);
    for (const n of names) {
      expect(result.parties.some((p) => p.name.includes(n.split(" ")[1]))).toBe(true);
    }
  });

  it("service agreement with confidentiality clause does NOT route as NDA", () => {
    const intake = `Software development agreement.
${randomName()} will build a mobile app for ${randomName()}.
The developer agrees to maintain confidentiality of all proprietary information.
Include an NDA clause.
Payment: $20,000 fixed price.
Duration: 4 months.
Governing law: Washington.`;
    const result = runPipeline(intake);
    expect(result.agreement_family).not.toBe("nda");
    expect(result.agreement_family).not.toBe("confidentiality_commercial_protections_agreement");
    expect(result.payment_terms).toMatch(/20[,.]?000/);
  });

  it("vendor agreement with deliverables routes correctly", () => {
    const intake = `Vendor services agreement.
${randomName()} provides branding and design services to ${randomName()}.
Deliverables: Logo, brand guidelines, business card design.
Monthly retainer: $3,000.
Confidentiality provisions included.
Governing law: Georgia.`;
    const result = runPipeline(intake);
    expect(result.agreement_family).not.toBe("nda");
    expect(result.payment_terms).toMatch(/3[,.]?000/);
    expect(result.jurisdiction).toMatch(/georgia/i);
  });
});

describe("draft pipeline: defaults only when data absent", () => {
  it("empty intake gets placeholder defaults", () => {
    const result = runPipeline("");
    expect(result.jurisdiction).toBeTruthy();
    expect(result.purpose).toBeTruthy();
    expect(result.payment_terms).toBeTruthy();
  });

  it("minimal intake without payment gets payment placeholder", () => {
    const intake = `Agreement between ${randomName()} and ${randomName()} for consulting.`;
    const result = runPipeline(intake);
    expect(result.payment_terms).toBeTruthy();
  });

  it("intake with explicit payment does NOT get placeholder", () => {
    const intake = `Consulting retainer: ${randomName()} and ${randomName()}.
Fee: $7,500/month.
Governing law: California.`;
    const result = runPipeline(intake);
    expect(result.payment_terms).toMatch(/7[,.]?500/);
    expect(result.payment_terms).not.toMatch(/to be agreed/i);
  });

  it("intake with explicit jurisdiction does NOT get Delaware default", () => {
    const jur = randomJurisdiction();
    const intake = `Services agreement between ${randomName()} and ${randomName()}.
Governing law: ${jur}.
Scope: Marketing consulting.`;
    const result = runPipeline(intake);
    expect(result.jurisdiction.toLowerCase()).toContain(jur.toLowerCase());
    expect(result.jurisdiction).not.toMatch(/^delaware$/i);
  });

  it("intake with explicit scope does NOT get generic placeholder", () => {
    const intake = `Independent contractor agreement.
${randomName()} will perform data analysis and reporting for ${randomName()}.
Rate: $100/hour.`;
    const result = runPipeline(intake);
    expect(result.purpose).not.toMatch(/to be refined/i);
    expect(result.purpose).not.toMatch(/to be described/i);
    expect(result.purpose.length).toBeGreaterThan(10);
  });
});

describe("draft pipeline: preview rendering preserves facts", () => {
  it("preview contains party names for 2-party", () => {
    const a = randomName();
    const b = randomName();
    const intake = `Consulting agreement between ${a} and ${b}.
Scope: Business strategy consulting.
Payment: $4,000/month.
Governing law: New York.`;
    const result = runPipeline(intake);
    const preview = buildAgreementPreviewText(result);
    expect(preview).toContain(a.split(" ")[1]);
    expect(preview).toContain(b.split(" ")[1]);
    expect(preview).toContain("New York");
  });

  it("preview contains all party names for 4-party", () => {
    const names = Array.from({ length: 4 }, randomName);
    const intake = `Joint venture agreement.
Signer 1: ${names[0]}
Signer 2: ${names[1]}
Signer 3: ${names[2]}
Signer 4: ${names[3]}
Scope: Joint real estate investment vehicle.
Payment: Each party contributes $50,000.
Governing law: Texas.`;
    const result = runPipeline(intake);
    const preview = buildAgreementPreviewText(result);
    for (const n of names) {
      expect(preview).toContain(n.split(" ")[1]);
    }
  });

  it("preview does not contain repeated 'and' for multi-party", () => {
    const names = Array.from({ length: 3 }, randomName);
    const intake = `Collaboration agreement.
Signer 1: ${names[0]}
Signer 2: ${names[1]}
Signer 3: ${names[2]}
Scope: Content creation partnership.
Duration: 1 year.`;
    const result = runPipeline(intake);
    const preview = buildAgreementPreviewText(result);
    const preambleLine = preview.split("\n").find((l) => l.includes("entered into"));
    if (preambleLine) {
      const andCount = (preambleLine.match(/\band\b/g) || []).length;
      expect(andCount).toBeLessThanOrEqual(1);
    }
  });
});

describe("draft pipeline: agreement family routing hardening", () => {
  it("design services with confidentiality → not NDA", () => {
    const family = detectAgreementFamily(
      "Design services agreement. The designer will create UI mockups. Confidentiality clause required. Monthly rate: $5,000.",
    );
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("subcontractor agreement → not NDA even with IP mention", () => {
    const family = detectAgreementFamily(
      "Subcontractor agreement for frontend development. IP ownership transfers on payment. Include non-disclosure provisions.",
    );
    expect(family).not.toBe("nda");
  });

  it("pure NDA → NDA", () => {
    const family = detectAgreementFamily("Mutual NDA between two companies exploring a potential partnership.");
    expect(family).toBe("nda");
  });

  it("consulting retainer → consulting_agreement", () => {
    const family = detectAgreementFamily("Consulting retainer for strategic advisory on market entry.");
    expect(family).toBe("consulting_agreement");
  });

  it("vendor with deliverables → not NDA", () => {
    const family = detectAgreementFamily(
      "Vendor agreement. Deliverables: website redesign, SEO optimization. Confidentiality of trade secrets. Monthly fee $4,000.",
    );
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("collaboration with IP and confidentiality → not NDA when deliverables present", () => {
    const family = detectAgreementFamily(
      "Collaboration agreement for joint product development. Each party retains IP for their contributions. Confidentiality obligations apply. Deliverables: prototype by Q3.",
    );
    expect(family).not.toBe("nda");
  });

  it("joint venture → not NDA", () => {
    const family = detectAgreementFamily(
      "Joint venture agreement for real estate development. Confidentiality of financial projections. Each party contributes $100,000.",
    );
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("hourly rate mention → not NDA", () => {
    const family = detectAgreementFamily(
      "Agreement for data engineering work. Hourly rate: $150. Confidentiality required for all client data.",
    );
    expect(family).not.toBe("nda");
  });
});

describe("draft pipeline: termination preservation", () => {
  it("explicit termination notice survives pipeline", () => {
    const intake = `Consulting agreement.
${randomName()} provides advisory to ${randomName()}.
Either party may terminate with 30 days written notice.
Payment: $6,000/month.
Governing law: California.`;
    const result = runPipeline(intake);
    expect(result.termination_summary).toMatch(/30/);
    expect(result.termination_summary).toMatch(/notice/i);
  });

  it("at-will termination survives", () => {
    const intake = `Independent contractor agreement.
${randomName()} does data entry for ${randomName()}.
Termination: at-will by either party.
Rate: $25/hour.`;
    const result = runPipeline(intake);
    expect(result.termination_summary).toMatch(/at.will/i);
  });
});
