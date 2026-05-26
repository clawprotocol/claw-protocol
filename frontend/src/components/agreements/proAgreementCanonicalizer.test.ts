import { describe, expect, it } from "vitest";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";

const BAD_PRO_BODY = `Professional Services Agreement

This Professional Services Agreement is entered into by Bee Lee and Studio LLC.

1. Purpose and Scope
Professional Services Agreement
Provider will provide implementation, support, and advisory services.

2. Fees and Payment
Client will pay $12,000 in three installments. Invoices are payable Net 30.

2. Fees and Payment
Client will pay $12,000 in three installments. Invoices are payable Net 30.

3. Term and Termination
Either party may terminate for convenience on 15 days' written notice.

3.2 Termination Notice.
Either party may terminate for convenience on 30 days' written notice.

4. Ownership and Work Product
Client owns deliverables after full payment. Provider retains pre-existing tools.

5. Confidentiality
Each party shall protect confidential information.

5.3 Confidentiality Obligations.

5.4 Return of Materials.

5.5 Survival.

6. Electronic Signatures and Counterparts
The parties may execute this Agreement using electronic signatures and counterparts.

7. Miscellaneous
The parties may execute this Agreement using electronic signatures and counterparts.

[Not yet specified]

IN WITNESS WHEREOF, the parties execute this Agreement.
`;

describe("canonicalizeProAgreementText", () => {
  it("removes empty numbered headings and repeated title inside Section 1", () => {
    const result = canonicalizeProAgreementText(BAD_PRO_BODY);

    expect(result.text).not.toMatch(/^5\.3\s+Confidentiality Obligations\.?\s*$/m);
    expect(result.text).not.toMatch(/^5\.4\s+Return of Materials\.?\s*$/m);
    expect(result.text).not.toMatch(/^5\.5\s+Survival\.?\s*$/m);
    expect(result.text.match(/^Professional Services Agreement$/gm)).toHaveLength(1);
    expect(result.repairs.some((r) => r.startsWith("empty_heading:"))).toBe(true);
  });

  it("dedupes payment and electronic-signature clauses", () => {
    const result = canonicalizeProAgreementText(BAD_PRO_BODY);

    expect(result.text.match(/\bNet 30\b/g)).toHaveLength(1);
    expect(result.text.match(/electronic signatures and counterparts/gi)).toHaveLength(1);
    expect(result.repairs.some((r) => r.startsWith("duplicate_clause:"))).toBe(true);
  });

  it("resolves conflicting termination notice periods and removes placeholders", () => {
    const result = canonicalizeProAgreementText(BAD_PRO_BODY);

    expect(result.text).toContain("15 days' written notice");
    expect(result.text).not.toContain("30 days' written notice");
    expect(result.text).not.toContain("[Not yet specified]");
    expect(result.warnings).toContain("termination_notice_conflict_resolved");
  });

  it("final output has no bare numbered headings", () => {
    const result = canonicalizeProAgreementText(BAD_PRO_BODY);
    const lines = result.text.split("\n");
    const bareHeading = lines.find((line, index) => {
      if (!/^\d+(?:\.\d+)*\.?\s+[A-Za-z][A-Za-z\s]+\.?\s*$/.test(line.trim())) return false;
      const next = lines.slice(index + 1).find((candidate) => candidate.trim());
      return !next || /^\d+(?:\.\d+)*\.?\s+[A-Za-z]/.test(next.trim());
    });

    expect(bareHeading).toBeUndefined();
  });
});
