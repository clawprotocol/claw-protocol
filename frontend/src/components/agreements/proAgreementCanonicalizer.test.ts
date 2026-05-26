import { describe, expect, it } from "vitest";
import { assertNoBareProSkeletonClauses, SUE_LEE_QA_BAD_CORPUS } from "./proCorpusSkeletonSafety";
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

const QA_PLACEHOLDER_REGRESSION_BODY = `Professional Services Agreement

This Professional Services Agreement is entered into by party_a (the "Client") and party_b (the "Service Provider").

1. Purpose and Scope

2. Services
The Service Provider will provide workflow automation services to the Client.
(b) materially breaches this Agreement and fails to cure after notice.
(c) repeatedly fails to perform the services.

3. Fees and Payment
Client will pay invoices Net 30.
Invoices are payable Net 30.
Invoices are payable Net 30.
The Company will reimburse approved expenses.

4. Term and Termination
Either party may terminate this Agreement for convenience on 14 days written notice.
Either party may terminate this Agreement for convenience on 30 days written notice.

5. Electronic Signatures and Counterparts
The parties may execute this Agreement using electronic signatures and counterparts.

8. Miscellaneous
The parties agree that e-signatures and counterparts are valid.
[Your Company Name] will receive notices at its address on file.
[Service Provider Name] will receive notices at its address on file.
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
    expect((result.text.match(/electronic signatures and counterparts/gi) ?? []).length).toBeLessThanOrEqual(1);
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

  it("runs the final Pro corpus safety gate for the exact QA placeholder regression", () => {
    const result = canonicalizeProAgreementText(QA_PLACEHOLDER_REGRESSION_BODY, {
      canonicalPartyNames: ["ABC LLC", "Bob Smith"],
      canonicalRoles: ["Client", "Service Provider"],
      canonicalTerminationNoticeDays: 30,
    });

    expect(result.text).toContain('ABC LLC ("Client")');
    expect(result.text).toContain('Bob Smith ("Service Provider")');
    expect(result.text).not.toMatch(/\bparty_a\b|\bparty_b\b|\bpartyA\b|\bpartyB\b/i);
    expect(result.text).not.toContain("[Your Company Name]");
    expect(result.text).not.toContain("[Service Provider Name]");
    expect(result.text).not.toMatch(/^1\. Purpose and Scope\s*(?:\n\s*)*2\./m);
    expect(result.text).not.toMatch(/e-signatures and counterparts are valid/i);
    expect(result.text.match(/\bNet 30\b/g)).toHaveLength(1);
    expect(result.text).not.toMatch(/^\([bc]\)\s+/m);
    expect(result.text).not.toMatch(/\b14 days? written notice\b/i);
    expect(result.text).toMatch(/\b30 days? written notice\b/i);
    expect(result.text).not.toMatch(/\bThe Company\b|\bCompany will\b/);
    expect(result.repairs.some((r) => r.startsWith("placeholder_party:resolved"))).toBe(true);
    expect(result.repairs.some((r) => r.startsWith("orphan_subsection:"))).toBe(true);
  });

  it("fails closed by removing unresolved placeholder party lines when names are unavailable", () => {
    const result = canonicalizeProAgreementText(QA_PLACEHOLDER_REGRESSION_BODY);

    expect(result.text).not.toMatch(/\bparty_a\b|\bparty_b\b|\[Your Company Name\]|\[Service Provider Name\]/i);
    expect(result.warnings).toContain("placeholder_party_unresolved_removed");
  });

  it("repairs Sue Lee QA bare skeleton clauses, notices, billing filler, and e-sign duplicates", () => {
    const result = canonicalizeProAgreementText(SUE_LEE_QA_BAD_CORPUS, {
      canonicalPartyNames: ["Sue Lee", "Example Provider LLC"],
      canonicalRoles: ["Client", "Service Provider"],
      canonicalTerminationNoticeDays: 30,
    });

    expect(result.text).not.toMatch(/^1\. Purpose and Scope\s*(?:\n\s*)*2\./m);
    expect(result.text).toMatch(/Service Provider retains ownership of its pre-existing tools/i);
    expect(result.text).toMatch(/5\.2 Required disclosure\./i);
    expect(result.text).toMatch(/Each party will disclose information only as required by law/i);
    expect(result.text).not.toContain(
      "Invoices will be sent to the billing contact identified in the Notices section.",
    );
    expect(result.text).not.toMatch(/^8\.1\s+Notices\s*$/m);
    expect(result.text.match(/electronic signatures and counterparts/gi)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(assertNoBareProSkeletonClauses(result.text).ok).toBe(true);
    expect(result.repairs.some((r) => r.startsWith("skeleton_heading:"))).toBe(true);
  });
});
