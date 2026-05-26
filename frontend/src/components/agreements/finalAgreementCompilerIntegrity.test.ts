import { describe, expect, it } from "vitest";
import {
  finalAgreementHasEmptySubsectionShell,
  finalAgreementHasExecutionContamination,
  stabilizeFinalAgreementCompilerOutput,
} from "./finalAgreementCompilerIntegrity";

const AI_INTAKE = `
AI services agreement. Scope includes AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance.
$120,000 total project fee. 40% build/configuration, 30% rollout/onboarding, 30% support/acceptance. Oklahoma law.
`.trim();

describe("finalAgreementCompilerIntegrity", () => {
  it("repairs empty milestone and services subsection shells", () => {
    const result = stabilizeFinalAgreementCompilerOutput(
      `
AI Services Agreement

1. Purpose and Scope
1.1 Project Services

2. Fees and Payment
2.1 Payment Milestones

3. Miscellaneous
This Agreement is governed by Oklahoma law.
`.trim(),
      { intakeText: AI_INTAKE, surface: "test_empty_subsections" },
    );

    expect(result.repairs).toContain("subsection_payload_repaired:1.1");
    expect(result.repairs).toContain("subsection_payload_repaired:2.1");
    expect(finalAgreementHasEmptySubsectionShell(result.text)).toBe(false);
    expect(result.text).toMatch(/1\.1 Project Services[\s\S]*AI workflow implementation/i);
    expect(result.text).toMatch(/2\.1 Payment Milestones[\s\S]*40% is due for build\/configuration/i);
  });

  it("isolates execution blocks and heals malformed party fragments", () => {
    const result = stabilizeFinalAgreementCompilerOutput(
      `
AI Services Agreement

1. Purpose and Scope
Service Provider will provide automation services.

9. Electronic Signatures and Counterparts
ABC LLC (“ABC”) and Jordan Lee Consulting . (“Jordan Lee”) (each a “Party”
Electronic signatures and counterparts are permitted.
CLIENT:
ABC LLC

IN WITNESS WHEREOF, the parties execute this Agreement.
`.trim(),
      {
        signerIdentities: [
          { partyDisplayName: "ABC LLC", representativeName: "Alex Doe", title: "Manager", blockHeading: "CLIENT" },
          { partyDisplayName: "Jordan Lee Consulting", representativeName: "Jordan Lee", blockHeading: "SERVICE PROVIDER" },
        ],
        surface: "test_execution_isolation",
      },
    );

    expect(result.repairs).toContain("malformed_party_fragment");
    expect(result.repairs).toContain("execution_block:canonical_template_rebuilt");
    expect(finalAgreementHasExecutionContamination(result.text)).toBe(false);
    const bodyBeforeWitness = result.text.slice(0, result.text.search(/\bIN WITNESS WHEREOF\b/i));
    expect(bodyBeforeWitness).not.toMatch(/each a ["“]?Party|CLIENT:/i);
    expect(result.text).toMatch(/CLIENT:\s*\nABC LLC[\s\S]*Name: Alex Doe/i);
  });

  it("renumbers sections and reconciles broken section references", () => {
    const result = stabilizeFinalAgreementCompilerOutput(
      `
Agreement

2. Purpose and Scope
The services described in Section 7 survive only as stated below.

4. Fees and Payment
4.3 Payment Milestones
Payment is due in milestones.

7. Term and Termination
The obligations in Section 4.3 survive termination.
`.trim(),
      { surface: "test_reference_reconciliation" },
    );

    expect(result.repairs).toContain("numbering_rebuilt");
    expect(result.repairs).toContain("reference_reconciled");
    expect(result.text).toMatch(/1\. Purpose and Scope[\s\S]*Section 3 survive/i);
    expect(result.text).toMatch(/2\. Fees and Payment[\s\S]*2\.1 Payment Milestones/i);
    expect(result.text).toMatch(/3\. Term and Termination[\s\S]*Section 2\.1 survive/i);
    expect(result.text).not.toMatch(/4\.3 Payment Milestones|Section 7/);
  });

  it("keeps end-to-end signing output coherent for multi-party AI services", () => {
    const result = stabilizeFinalAgreementCompilerOutput(
      `
AI Services Agreement

1. Purpose and Scope
1.1 Project Services

2. Fees and Payment
2.1 Payment Milestones

3. Ownership and Work Product
Client owns the project deliverables.

4. Term and Termination
Either Party may terminate on 30 days written notice.

9. Electronic Signatures and Counterparts
Electronic signatures and counterparts are permitted.

IN WITNESS WHEREOF, the parties execute below.
CLIENT:
ABC LLC
By: __________________________
Name:
SERVICE PROVIDER:
Jordan Lee Consulting
By: __________________________
Name:
`.trim(),
      {
        intakeText: AI_INTAKE,
        signerIdentities: [
          { partyDisplayName: "ABC LLC", representativeName: "Alex Doe", title: "Manager", blockHeading: "CLIENT" },
          { partyDisplayName: "Jordan Lee Consulting", representativeName: "Jordan Lee", blockHeading: "SERVICE PROVIDER" },
        ],
        surface: "test_e2e_compiler_integrity",
      },
    );

    expect(finalAgreementHasEmptySubsectionShell(result.text)).toBe(false);
    expect(finalAgreementHasExecutionContamination(result.text)).toBe(false);
    expect(result.text).not.toMatch(/Final review needs another pass|Retry final review|could not finish/i);
    expect(result.text).toMatch(/1\.1 Project Services[\s\S]*Dashboard setup/i);
    expect(result.text).toMatch(/2\.1 Payment Milestones[\s\S]*30% is due for support\/acceptance/i);
    expect(result.text).toMatch(/CLIENT:\s*\nABC LLC/i);
  });
});
