import { describe, expect, it } from "vitest";
import { buildPremiumFullDraftContextForProRequest } from "../premiumFullDraftApi";
import { polishPaidProAgreementText } from "../paidProAgreementPolish";
import {
  applyMilestoneTableGeneration,
  applyProOperationalSynthesisPasses,
  applySectionPurityPass,
  buildProOperationalSynthesis,
  classifyDealDna,
  extractPartyResponsibilities,
} from "./index";

const IRONCLAD_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.

Ironclad shall provide white-label AI workflow provisioning and core platform maintenance.
Harborline shall lead data migration and API integration.
Payment in milestones upon acceptance of each phase.`;

const IRONCLAD_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
];

describe("responsibility extraction", () => {
  it("builds structured profiles for five-party Ironclad intake", () => {
    const profiles = extractPartyResponsibilities(IRONCLAD_INTAKE, IRONCLAD_PARTIES);
    expect(profiles.length).toBe(5);
    expect(profiles[0]?.party).toContain("Ironclad");
    expect(profiles[0]?.shortName).toBe("Ironclad");
    expect(profiles[0]?.inferredRole.length).toBeGreaterThan(2);
    expect(profiles.some((p) => p.responsibilities.length > 0)).toBe(true);
  });

  it("does not treat body phrases like 'ownership of' as parties", () => {
    const junk = ["ownership of", "collectively", "the Parties", ...IRONCLAD_PARTIES];
    const profiles = extractPartyResponsibilities(IRONCLAD_INTAKE, junk);
    expect(profiles.length).toBe(5);
    expect(profiles.map((p) => p.party)).not.toContain("ownership of");
    expect(profiles.map((p) => p.party)).not.toContain("the Parties");
  });
});

describe("deal DNA classifier", () => {
  it("infers multi-party consortium for Ironclad rollout", () => {
    const dna = classifyDealDna(IRONCLAD_INTAKE, { partyCount: 5 });
    expect(["multi_party_implementation_consortium", "joint_venture_rollout"]).toContain(dna.archetype);
    expect(dna.governanceComplexity).toBe("enterprise");
  });
});

describe("section purity", () => {
  it("removes dispute language from contacts section", () => {
    const doc = `NOTICES

Contact emails are listed below. Any dispute shall be resolved by binding arbitration in Delaware.

SIGNATURES`;
    const { text, issues } = applySectionPurityPass(doc);
    expect(issues.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).not.toContain("binding arbitration");
  });
});

describe("operational synthesis passes", () => {
  it("replaces vague coordination with operational specifics", () => {
    const synthesis = buildProOperationalSynthesis(IRONCLAD_INTAKE, {
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      title: "Joint Rollout Agreement",
      jurisdiction: "",
      purpose: "",
      payment_terms: "Milestone payments",
      payment: { amount: null, cadence: null, valid: false },
      duration: null,
      due_date: null,
      effective_date: null,
    });
    const body = "SCOPE\n\nThe Parties shall coordinate as needed.\n\nSIGNATURES\n";
    const { text, log } = applyProOperationalSynthesisPasses(body, IRONCLAD_INTAKE, synthesis, {
      paymentTerms: "Milestone payments",
    });
    expect(log.operationalSpecificity.replaced).toBeGreaterThan(0);
    expect(text).toContain("deployment sequencing");
    expect(text).toContain("IMPLEMENTATION MILESTONES");
  });
});

describe("premium context enrichment", () => {
  it("adds operational synthesis block to material asks", () => {
    const ctx = buildPremiumFullDraftContextForProRequest(IRONCLAD_INTAKE, {
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      title: "Agreement",
      jurisdiction: "Delaware",
      purpose: "Joint rollout",
      payment_terms: "Milestones",
      payment: { amount: null, cadence: null, valid: false },
      duration: null,
      due_date: null,
      effective_date: null,
    });
    expect(ctx.additional_terms).toContain("operational synthesis");
    expect(ctx.material_asks?.some((m) => m.includes("Ironclad"))).toBe(true);
  });
});

describe("milestone table generation", () => {
  it("inserts implementation milestone block for milestone intake", () => {
    const body = "SCOPE\n\nMilestone payments on acceptance.\n\nIN WITNESS WHEREOF\n\nParty\nBy: ___\n";
    const { inserted, text } = applyMilestoneTableGeneration(
      body,
      "Milestone payments upon phase acceptance.",
      "Milestone schedule with installments.",
      [],
    );
    expect(inserted).toBe(true);
    expect(text).toContain("IMPLEMENTATION MILESTONES");
    expect(text).toContain("| Milestone |");
  });

  it("inserts for plural commercialization milestones in intake", () => {
    const body = "SCOPE\n\nPhased commercialization milestones.\n\nIN WITNESS WHEREOF\n\nParty\nBy: ___\n";
    const { inserted, text } = applyMilestoneTableGeneration(
      body,
      "Parties co-develop pilots with phased commercialization milestones.",
      "",
      [],
    );
    expect(inserted).toBe(true);
    expect(text).toContain("IMPLEMENTATION MILESTONES");
  });
});

describe("paid pro polish integration", () => {
  it("runs operational passes without breaking recital polish", () => {
    const body = `JOINT ROLLOUT AGREEMENT

This Agreement is between Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.

The Parties shall coordinate project activities.

SIGNATURES

Ironclad: ___________________
`;
    const { text, log } = polishPaidProAgreementText(body, IRONCLAD_INTAKE, IRONCLAD_PARTIES, {
      surface: "test",
    });
    expect(log.recital.partyCount).toBe(5);
    expect(text).toMatch(/Ironclad Systems Group LLC|among/i);
  });
});
