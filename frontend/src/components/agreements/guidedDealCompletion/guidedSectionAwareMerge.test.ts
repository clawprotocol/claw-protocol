import { describe, expect, it } from "vitest";
import {
  mergeAllGuidedAnswersIntoCorpus,
  mergeSingleGuidedAnswerIntoCorpus,
  normalizeGuidedCorpusSectionFormatting,
  stripMisplacedGuidedClausesBeforeSignature,
} from "./guidedSectionAwareMerge";
import type { GuidedCompletionSession } from "./types";

function paidBody(extra = ""): string {
  return `
SERVICES AGREEMENT

1. Scope of Services
Provider will deliver automation services.

2. Fees and Payment
Company will pay monthly fees.

3. Confidentiality
Each party will protect confidential information.

4. Ownership and Work Product
Ownership will be as stated in this Agreement.

5. Support and Service Levels
Provider will provide commercially reasonable support.

6. Term and Termination
The term continues until terminated.

7. General Terms
Electronic Signatures are permitted.

IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem H Blanchard
Title: Manager
Date: _________________________

SERVICE PROVIDER:
Joe Smith
By: __________________________
Name: Joe Smith
Date: _________________________
${extra}
`.trim();
}

function session(): GuidedCompletionSession {
  const ids = [
    "payment_timing",
    "phase_payment_allocation",
    "saas_sla",
    "ip_ownership",
    "renewal_notice",
  ];
  return {
    sessionKey: "gen:test39",
    queue: ids,
    variables: ids.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.9,
      affectsSections: [],
    })),
    answered: {
      payment_timing: "Net 30",
      phase_payment_allocation: "Build-heavy split",
      saas_sla: "99.9% uptime",
      ip_ownership: "Company owns project deliverables",
      renewal_notice: "30 days notice",
    },
    skipped: new Set(),
    currentIndex: ids.length,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: ids.length,
  };
}

describe("guidedSectionAwareMerge (test39)", () => {
  it("merges each guided answer into the correct section incrementally", () => {
    let body = paidBody();
    for (const questionId of Object.keys(session().answered)) {
      const result = mergeSingleGuidedAnswerIntoCorpus({
        body,
        questionId,
        session: session(),
      });
      if (result.merges.some((m) => m.action === "merged")) {
        body = result.body;
      }
    }
    expect(body).toMatch(/\bNet 30\b/i);
    expect(body).toMatch(/\bbuild-heavy\b/i);
    expect(body).toMatch(/\b99\.9\s*%/i);
    expect(body).toMatch(/\bCompany owns the project deliverables\b/i);
    expect(body).toMatch(/\b30\s+days?.{0,30}notice\b/i);
    const sigIdx = body.search(/IN WITNESS WHEREOF/i);
    expect(sigIdx).toBeGreaterThan(0);
    expect(body.slice(0, sigIdx)).toMatch(/\bNet 30\b/i);
    expect(body.slice(0, sigIdx)).not.toMatch(/^Electronic Payment Terms/m);
  });

  it("keeps section numbering valid and signatures last after full merge", () => {
    const merged = mergeAllGuidedAnswersIntoCorpus(paidBody(), session());
    const body = merged.body;
    expect(body).not.toMatch(/\*\*7\.\s+This Agreement/);
    expect(body).toMatch(/Electronic Signatures/i);
    expect(body).not.toMatch(/Electronic\s*\n+\s*Signatures/i);
    const witness = body.search(/IN WITNESS WHEREOF/i);
    const payment = body.search(/\bNet 30\b/i);
    const termination = body.search(/\b30\s+days?.{0,30}notice\b/i);
    expect(payment).toBeGreaterThan(0);
    expect(termination).toBeGreaterThan(0);
    expect(witness).toBeGreaterThan(payment);
    expect(witness).toBeGreaterThan(termination);
  });

  it("strips misplaced guided dumps before signature blocks", () => {
    const polluted = `${paidBody()}\n\nElectronic Payment Terms\nInvoices are due Net 30.\n\nSchedule A - Phase allocation\nBuild-heavy split.\n\nIN WITNESS WHEREOF\nCLIENT:\nAcme LLC\nBy: ____\n`;
    const stripped = stripMisplacedGuidedClausesBeforeSignature(polluted);
    expect(stripped.text).not.toMatch(/^Electronic Payment Terms/m);
    expect(stripped.text).toMatch(/IN WITNESS WHEREOF/i);
  });

  it("normalizes broken markdown headings", () => {
    const broken = "**7. This Agreement\n\nElectronic\nSignatures\n";
    const fixed = normalizeGuidedCorpusSectionFormatting(broken);
    expect(fixed.text).toContain("7. This Agreement");
    expect(fixed.text).not.toContain("**7.");
    expect(fixed.text).toMatch(/Electronic Signatures/i);
  });

  it("finalization merge does not append clauses after electronic signatures", () => {
    const merged = mergeAllGuidedAnswersIntoCorpus(paidBody(), session());
    const sigBlock = merged.body.slice(merged.body.search(/IN WITNESS WHEREOF/i));
    expect(sigBlock).not.toMatch(/\bbuild-heavy\b/i);
    expect(sigBlock).not.toMatch(/\bNet 30\b/i);
    expect(sigBlock).not.toMatch(/^Support and Service Levels/m);
  });

  it("creates missing numbered sections before signatures when anchors absent", () => {
    const shortBody =
      `
1. Scope
Provider delivers services.

2. Fees and Payment
Monthly fees apply.

3. Confidentiality
Mutual duties.

6. Term and Termination
Standard term.

IN WITNESS WHEREOF
CLIENT:
Acme LLC
`.trim() + "\n\n" + "Filler paragraph. ".repeat(80);
    const merged = mergeAllGuidedAnswersIntoCorpus(shortBody, session());
    expect(merged.merges.some((m) => m.action === "created_section")).toBe(true);
    expect(merged.body).toMatch(/\b4\.\s+Ownership and Work Product\b/i);
    expect(merged.body).toMatch(/\b5\.\s+Support Expectations\b/i);
    expect(merged.body).toMatch(/\b99\.9\s*%/i);
    expect(merged.body.search(/IN WITNESS WHEREOF/i)).toBeGreaterThan(
      merged.body.search(/\b99\.9\s*%/i),
    );
  });
});
