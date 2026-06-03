import { describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  auditProAgreementClosingSequence,
  scoreProAgreementQualityForQa,
} from "./paidProAgreementQualityQaScorer";

const HEALTHY_CLOSING = `
14. DISPUTE RESOLUTION. Mediation then arbitration in Texas.
15. GOVERNING LAW. Laws of Texas.
16. MISCELLANEOUS. Entire agreement; counterparts; electronic signatures are valid.
17. SURVIVAL. Confidentiality, IP, and limitation of liability survive termination.
IN WITNESS WHEREOF, the Parties execute this Agreement.
CLIENT: Acme LLC
`.trim();

const THIN_CLOSING = `
15. GOVERNING LAW. Texas law applies.
16. NOTICES. Send to designated contacts.
IN WITNESS WHEREOF, the Parties execute this Agreement.
`.trim();

const SUBSTANTIVE_BODY = `
MUTUAL CONSULTING AGREEMENT
1. SCOPE. Professional services.
5. FEES. $5,000 fixed fee.
7. DATA PROTECTION AND CONFIDENTIALITY. Reasonable safeguards.
8. INTELLECTUAL PROPERTY. Provider assigns work product to Client.
9. WARRANTIES. Mutual authority; non-infringement of deliverables.
10. LIMITATION OF LIABILITY. Cap on direct damages; no consequential damages.
11. TERMINATION. Notice and cure.
12. CHANGE CONTROL. Changes require written approval.
13. SUBCONTRACTING. No subcontract without consent.
14. ASSIGNMENT. No assignment without consent.
`.trim();

describe("paidProAgreementQualityQaScorer", () => {
  it("does not mutate input plain text", () => {
    const input = `${SUBSTANTIVE_BODY}\n${HEALTHY_CLOSING}`;
    const frozen = input;
    scoreProAgreementQualityForQa(input);
    auditProAgreementClosingSequence(input);
    expect(input).toBe(frozen);
  });

  it("detects thin_closing_sequence when witness follows governing law/notices without misc/survival/esign", () => {
    const closing = auditProAgreementClosingSequence(THIN_CLOSING);
    expect(closing.thinClosingSequence).toBe(true);
    expect(closing.reason).toContain("governing_law_or_notices");
  });

  it("does not flag thin closing when miscellaneous survival and e-sign precede witness", () => {
    const closing = auditProAgreementClosingSequence(HEALTHY_CLOSING);
    expect(closing.thinClosingSequence).toBe(false);
  });

  it("scores healthy substantive agreement with key provisions present", () => {
    const full = `${SUBSTANTIVE_BODY}\n${HEALTHY_CLOSING}`;
    const score = scoreProAgreementQualityForQa(full);
    const byId = Object.fromEntries(score.provisions.map((p) => [p.id, p.status]));
    expect(byId.governing_law_venue).toBe("present");
    expect(byId.limitation_of_liability).toBe("present");
    expect(byId.data_protection_confidentiality).toBe("present");
    expect(byId.ip_ownership).toBe("present");
    expect(score.closing.thinClosingSequence).toBe(false);
  });

  it("applyAcceptedProCorpusSafeDisplay unchanged with QA scorer run (no logging side effects)", () => {
    const raw =
      "SERVICES AGREEMENT\n\nBetween Red Mesa LLC and Harbor Peak Automation LLC.\n\n1. SCOPE\n\nWork.\n\nIN WITNESS WHEREOF\n\nCLIENT: Red Mesa";
    const a = applyAcceptedProCorpusSafeDisplay(raw, { intakeText: "Red Mesa and Harbor Peak services Texas." });
    scoreProAgreementQualityForQa(a.text);
    const b = applyAcceptedProCorpusSafeDisplay(raw, { intakeText: "Red Mesa and Harbor Peak services Texas." });
    expect(b.text).toBe(a.text);
  });
});
