import { describe, expect, it } from "vitest";
import { finalizeAgreementOutput } from "../agreementOutputQuality";
import {
  applyProAgreementCompletenessPipeline,
  buildMaterialMissingItems,
} from "./index";

const PARTY_A = "Acme Analytics LLC";
const PARTY_B = "Beta Ventures Inc";

function proBody(sections: string): string {
  return [
    "SERVICES AGREEMENT",
    `This Agreement is between ${PARTY_A} and ${PARTY_B}.`,
    "",
    ...sections.split("\n").filter(Boolean),
    "",
    "IN WITNESS WHEREOF, the Parties have executed this Agreement.",
    "KEY CONTACTS",
    `Party A: ${PARTY_A}`,
    `Party B: ${PARTY_B}`,
  ].join("\n");
}

const PLACEHOLDER_RE = /\bTBD\b|\[ORG_\d+\]|\[INSERT|\blorem ipsum\b|placeholder/i;
const MD_TABLE_RE = /^\s*\|.+\|/m;
const EMPTY_HEADING_CHAIN_RE = /^\s*\d+\.\d+\s+[^.]+\.\s*\n\s*\d+\.\d+\s/m;

type FamilyFixture = {
  name: string;
  intake: string;
  rawSections: string;
  expectMaterialIds?: string[];
};

const FIXTURES: FamilyFixture[] = [
  {
    name: "services agreement",
    intake: "Services agreement for marketing deliverables. Payment TBD. No milestone dates yet.",
    rawSections: `1. Scope\nProfessional services as described.\n2. Payment\nFees to be mutually agreed.\n3. Term\nOne year unless terminated.`,
    expectMaterialIds: ["payment_timing"],
  },
  {
    name: "SaaS MSA",
    intake: "SaaS master services agreement for platform access. Need SLA and support terms.",
    rawSections: `1. Services\nHosted software access.\n2. Service Levels\nCommercially reasonable availability.\n3. Fees\nSubscription fees invoiced monthly.`,
    expectMaterialIds: ["saas_sla"],
  },
  {
    name: "referral agreement",
    intake: "Referral partner introduces enterprise accounts. Commission structure not finalized.",
    rawSections: `1. Referrals\nPartner may introduce qualified leads.\n2. Compensation\nReferral fees per schedule.\n3. Term\nTwelve months.`,
    expectMaterialIds: ["referral_economics"],
  },
  {
    name: "NDA",
    intake: "Mutual NDA for evaluating a pilot. Survival period not specified.",
    rawSections: `1. Confidential Information\nEach Party may disclose confidential information.\n2. Term\nTwo years.\n3. Return\nUpon request, materials will be returned.`,
    expectMaterialIds: [],
  },
  {
    name: "consulting agreement",
    intake: "Consulting engagement with milestone deliverables. Acceptance process TBD.",
    rawSections: `1. Services\nConsultant will provide advisory services.\n2. Deliverables\nMilestones in a statement of work.\n3. Fees\nFixed fee invoiced on completion.`,
    expectMaterialIds: ["milestone_schedule"],
  },
  {
    name: "licensing agreement",
    intake: "Software license for internal use. Sublicensing not discussed.",
    rawSections: `1. License Grant\nLicensee may use the software.\n2. Restrictions\nNo reverse engineering.\n3. Fees\nAnnual license fee.`,
    expectMaterialIds: [],
  },
  {
    name: "generic business agreement",
    intake: "Business collaboration. Governing law not specified.",
    rawSections: `1. Purpose\nParties will collaborate on a joint initiative.\n2. Obligations\nEach Party will act in good faith.\n3. Term\nUntil terminated.`,
    expectMaterialIds: ["governing_venue"],
  },
];

describe("proAgreementCompleteness — multi-family regression", () => {
  for (const fx of FIXTURES) {
    it(`${fx.name}: normalizes body without placeholders or markdown tables`, () => {
      const raw = proBody(fx.rawSections);
      const out = applyProAgreementCompletenessPipeline(raw, {
        intakeRaw: fx.intake,
        partyNames: [PARTY_A, PARTY_B],
        surface: `test_${fx.name}`,
      });
      expect(out.text.length).toBeGreaterThan(280);
      expect(PLACEHOLDER_RE.test(out.text)).toBe(false);
      expect(MD_TABLE_RE.test(out.text)).toBe(false);
      expect(EMPTY_HEADING_CHAIN_RE.test(out.text)).toBe(false);
      expect(out.structuralCatastrophic).toBe(false);
    });

    it(`${fx.name}: routes material gaps to Ask LawDog items`, () => {
      const items = buildMaterialMissingItems({
        intakeRaw: fx.intake,
        body: proBody(fx.rawSections),
      });
      expect(items.length).toBeGreaterThan(0);
      for (const id of fx.expectMaterialIds ?? []) {
        expect(items.some((i) => i.id === id), `missing material id ${id}`).toBe(true);
      }
      expect(items.every((i) => i.question.length > 8)).toBe(true);
      expect(items.every((i) => i.canProceedWithoutAnswer)).toBe(true);
    });
  }

  it("repairs empty numbered subsection and placeholder leakage", () => {
    const raw = proBody(`1. Scope\nServices.\n5.3 Restrictions.\n6. Fees\nNet 30.\n| Milestone | Amount |\n| --- | --- |\n| TBD | TBD |`);
    const out = applyProAgreementCompletenessPipeline(raw, {
      intakeRaw: "Services with incomplete schedule",
      partyNames: [PARTY_A, PARTY_B],
      surface: "test_repair",
    });
    expect(PLACEHOLDER_RE.test(out.text)).toBe(false);
    expect(MD_TABLE_RE.test(out.text)).toBe(false);
    expect(/5\.3\s+Restrictions/.test(out.text)).toBe(true);
    expect(out.text).toMatch(/Restrictions[\s\S]{20,}/);
  });

  it("finalizeAgreementOutput premium path preserves Pro success with material items", () => {
    const fin = finalizeAgreementOutput(
      proBody(
        "1. Scope\nHosted services.\n2. Payment\nFees to be confirmed in writing.\n3. Term\nOne year.",
      ),
      {
        intakeRaw: "SaaS services — confirm SLA and payment timing",
        partyNames: [PARTY_A, PARTY_B],
        surface: "test_finalize",
        tier: "premium",
      },
    );
    expect(fin.text.length).toBeGreaterThan(280);
    expect(PLACEHOLDER_RE.test(fin.text)).toBe(false);
    expect((fin.materialMissingItems ?? []).length).toBeGreaterThan(0);
    expect(fin.structuralCatastrophic).not.toBe(true);
  });

  it("catastrophic only for extremely short corrupt body", () => {
    const out = applyProAgreementCompletenessPipeline("Short.", {
      intakeRaw: "x",
      surface: "test_short",
    });
    expect(out.structuralCatastrophic).toBe(true);
  });
});
