import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { repairDuplicateAgreementOpening } from "./canonicalPartyIdentityResolver";
import {
  polishProAgreementDisplayLayer,
  polishedAuthoritativeProPlainForCopy,
  stripFixedFeeDisplayBoilerplateLines,
} from "./polishProAgreementDisplayLayer";
import { normalizeProAgreementSectionContinuity } from "./normalizeProAgreementSectionContinuity";

const MINIMAL_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();

const servicesDraft: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Service Provider" },
  ],
  purpose: "AI workflow setup.",
  payment_terms: "$5,000",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: 5000, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

const records = [
  {
    fullLegalName: "Red Mesa Logistics LLC",
    roleLabel: "Client",
    displayAlias: "Red Mesa",
    signerName: null,
    signerTitle: null,
  },
  {
    fullLegalName: "Harbor Peak Automation LLC",
    roleLabel: "Service Provider",
    displayAlias: "Harbor Peak",
    signerName: null,
    signerTitle: null,
  },
];

describe("polishProAgreementDisplayLayer", () => {
  it("repairs duplicate opening phrase", () => {
    const broken =
      'This Agreement (the "Agreement") is This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.';
    const { text } = repairDuplicateAgreementOpening(broken, records);
    expect(text).not.toMatch(/is This Agreement is between/i);
    expect(text).toContain("entered into by and between");
  });

  it("adds parent heading for bare 3.1 payment subsection", () => {
    const body = [
      "1. Scope. Services.",
      "3.1",
      "Client shall pay Service Provider $5,000 as total fixed consideration.",
      "4.1",
      "Either party may terminate on thirty days notice.",
      "6. Governing Law. Texas.",
      "8. Entire Agreement.",
    ].join("\n");
    const { text } = normalizeProAgreementSectionContinuity(body);
    expect(text).toMatch(/^\d+\.\s+Payment Terms/m);
    expect(text).toMatch(/\d+\.1\s+/);
    expect(text).not.toMatch(/^8\.\s+Entire/m);
    const tops = [...text.matchAll(/^(\d+)\.\s+/gm)].map((m) => Number(m[1]));
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i]).toBe(tops[i - 1]! + 1);
    }
  });

  it("strips contractor monthly arrears for fixed-fee intake", () => {
    const body =
      "2. Fees\nClient pays $5,000.\nContractor will invoice Company monthly in arrears within thirty days.";
    const { text, repairs } = stripFixedFeeDisplayBoilerplateLines(body, MINIMAL_INTAKE);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/monthly in arrears/i);
    expect(text).toContain("$5,000");
  });

  it("dedupes confidentiality sections in full display polish", () => {
    const confPara =
      "Confidentiality. Mutual obligations apply to all non-public information exchanged under this Agreement and shall survive termination.";
    const body = [
      "1. Scope.",
      `2. ${confPara}`,
      `3. ${confPara}`,
      "4. Fees. $5,000 fixed.",
      "IN WITNESS WHEREOF.",
    ].join("\n\n");
    const { text } = polishProAgreementDisplayLayer(body, {
      draft: servicesDraft,
      intakeText: MINIMAL_INTAKE,
    });
    const confTops = (text.match(/^\d+\.\s+Confidentiality/gim) || []).length;
    expect(confTops).toBeLessThanOrEqual(1);
  });

  it("polishProAgreementDisplayLayer preserves length for long accepted body", () => {
    const core = [
      "SERVICES AGREEMENT",
      'This Agreement (the "Agreement") is This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.',
      "1. Scope. AI workflow setup.",
      "3.1",
      "Client pays $5,000 fixed.",
      "Contractor will invoice Company monthly in arrears.",
      "2. Confidentiality. Mutual duties.",
      "3. Confidentiality. Mutual duties repeated.",
      "6. Law. Texas.",
      "8. Signatures.",
      "IN WITNESS WHEREOF, the parties execute.",
      "CLIENT:\nRed Mesa Logistics LLC\nBy: ____",
      "SERVICE PROVIDER:\nHarbor Peak Automation LLC\nBy: ____",
    ].join("\n\n");
    const pad = " Operative clause with commercially reasonable performance. ".repeat(50);
    const raw = core + pad;
    const { text } = polishProAgreementDisplayLayer(raw, {
      draft: servicesDraft,
      intakeText: MINIMAL_INTAKE,
    });
    expect(text.length).toBeGreaterThanOrEqual(raw.length * 0.8);
    expect(text).not.toMatch(/is This Agreement is between/i);
    expect(text).not.toMatch(/monthly in arrears/i);
    expect(text).toMatch(/Payment Terms/);
  });

  it("polishedAuthoritativeProPlainForCopy uses long authoritative candidate", () => {
    const long = "x".repeat(3_200);
    const short = "y".repeat(800);
    const out = polishedAuthoritativeProPlainForCopy([short, long], {
      acceptedAuthoritativeBody: long,
      draft: servicesDraft,
      intakeText: MINIMAL_INTAKE,
      minLen: 1_500,
    });
    expect(out.length).toBeGreaterThanOrEqual(1_500);
  });

  it("removes unsupplied corporation and address placeholders", () => {
    const raw = [
      "1. Parties.",
      "Red Mesa Logistics LLC, a [corporation] with an address at [address].",
      "Harbor Peak Automation LLC principal office: __________________.",
      "2. Scope. AI workflow setup.",
    ].join("\n");
    const { text } = polishProAgreementDisplayLayer(raw, {
      draft: servicesDraft,
      intakeText: MINIMAL_INTAKE,
    });
    expect(text).not.toMatch(/\[address\]|\[corporation\]|principal office:\s*_/i);
  });
});
