import { describe, expect, it } from "vitest";
import {
  finalizeGuidedProAgreementCorpus,
  validateFinalGuidedProCorpusBeforeFreeze,
} from "./guidedFinalCorpusFinalizer";
import { mergeAllGuidedAnswersIntoCorpus } from "./guidedSectionAwareMerge";
import {
  detectCorpusStructuralDefects,
  normalizeGuidedProCorpusStructure,
  validateNormalizedCorpusStructure,
} from "./guidedCanonicalCorpusNormalizer";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import type { GuidedCompletionSession } from "./types";

const TEST49_IDENTITIES: CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Acme LLC",
    email: "anthemhayek@gmail.com",
    representativeName: "Anthem H Blanchard",
    title: "Manager",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Joe Smith",
    email: "jsm34@gmail.com",
    representativeName: null,
    title: null,
    blockHeading: "SERVICE PROVIDER",
    isIndividual: true,
  },
];

function test49Session(): GuidedCompletionSession {
  const ids = [
    "payment_timing",
    "phase_payment_allocation",
    "saas_sla",
    "ip_ownership",
    "renewal_notice",
  ];
  return {
    sessionKey: "gen:test49",
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

function malformedTest49Corpus(): string {
  return `
AI Automation Services Agreement

This Agreement is between Acme LLC and Joe Smith and is effective as of the date of the last

2. Fees and Payment
Invoices are due Net 30 from receipt unless a signed change order states otherwise.
Schedule A phase allocation is build-heavy: the larger share is tied to build/configuration work.

4. Ownership and Work Product
Company owns the project deliverables and work product created specifically for Company after payment.

5. Support Expectations
Provider will target 99.9% monthly uptime for production automation components.

6. Term and Termination
Either party may terminate for convenience with 30 days written notice.

signature below ("Effective Date").

1. Purpose and Scope
Provider will deliver AI automation setup, workflows, and dashboards for Client.

2. Compensation
Monthly fee is $6,000.

2. 3. All payments shall be made in U.S. dollars.

3. Confidentiality
Each party will protect confidential information.

4. The Client shall own all rights, title, and interest in and to any work products created by the Service Provider under this Agreement.

4.2. The Service Provider agrees to assign such work product to Client.

5. Support and Performance Expectations
Provider will perform services with reasonable skill and care.

6. Term and Termination
The term continues until terminated with thirty (30) days written notice.

7. 8. Notices
Notices shall be sent to the addresses specified above.

9. Miscellaneous
This Agreement is the entire agreement between the parties.

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
`.trim();
}

function paidBaseCorpus(): string {
  return `
AI Automation Services Agreement

This Agreement is entered into by and between Acme LLC ("Client") and Joe Smith ("Service Provider").
This Agreement is effective as of the date of the last signature below ("Effective Date").

1. Purpose and Scope
Provider will deliver AI automation setup, workflows, and dashboards for Client.

2. Fees and Payment
Company will pay fees as described in Schedule A.

3. Confidentiality
Each party will protect confidential information.

4. Ownership and Work Product
Ownership of deliverables will be as stated in this section.

5. Support Expectations
Provider will provide commercially reasonable support.

6. Term and Termination
The term continues until terminated.

7. Notices
Notices shall be sent to the addresses on the signature page.

8. Miscellaneous
This Agreement is the entire agreement between the parties.

9. Electronic Signatures and Counterparts
Electronic signatures are permitted.

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
${"Additional operational, payment, confidentiality, and support terms apply as described throughout this Agreement. ".repeat(12)}
`;
}

describe("guided final review test49 — corpus normalization", () => {
  it("detects malformed prepended guided mini-agreement structure", () => {
    const defects = detectCorpusStructuralDefects(malformedTest49Corpus());
    expect(defects).toContain("prepended_guided_mini_agreement");
    expect(defects).toContain("malformed_double_section_number");
  });

  it("normalizes malformed corpus into coherent section order without duplicate mini-agreement", () => {
    const normalized = normalizeGuidedProCorpusStructure(malformedTest49Corpus());
    const body = normalized.text;
    const structure = validateNormalizedCorpusStructure(body);
    expect(structure.defects, structure.defects.join(", ")).toEqual([]);
    expect(structure.ok).toBe(true);
    expect(body).not.toMatch(/\b7\.\s+8\.\s+Notices\b/i);
    expect(body).not.toMatch(/\b2\.\s+3\.\s+All payments\b/i);
    expect(body).not.toMatch(/signature below\s*\(\s*"?Effective Date"?\s*\)/i);
    const purposeIdx = body.search(/^\s*1\.\s+Purpose and Scope/im);
    const feesIdx = body.search(/^\s*2\.\s+Fees and Payment/im);
    const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
    expect(purposeIdx).toBeGreaterThanOrEqual(0);
    expect(feesIdx).toBeGreaterThan(purposeIdx);
    expect(witnessIdx).toBeGreaterThan(feesIdx);
    expect(body.match(/\bIN WITNESS WHEREOF\b/gi)?.length).toBe(1);
  });

  it("merges all five test49 guided answers exactly once into correct sections", () => {
    const session = test49Session();
    const merged = mergeAllGuidedAnswersIntoCorpus(paidBaseCorpus(), session);
    const normalized = normalizeGuidedProCorpusStructure(merged.body);
    const body = normalized.text;
    expect(/\bNet\s*30\b/i.test(body)).toBe(true);
    expect(/\bbuild-heavy\b/i.test(body)).toBe(true);
    expect(/\b99\.9\s*%/i.test(body)).toBe(true);
    expect(/\bCompany owns the project deliverables\b/i.test(body)).toBe(true);
    expect(/\b30\s+days?.{0,24}written\s+notice\b/i.test(body)).toBe(true);
    const validation = validateFinalGuidedProCorpusBeforeFreeze({ body, guidedSession: session });
    expect(validation.ok).toBe(true);
  });

  it("finalizes test49 corpus with signature block last and correct party identities", () => {
    const session = test49Session();
    const merged = mergeAllGuidedAnswersIntoCorpus(paidBaseCorpus(), session);
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "canonical_working_draft", body: merged.body, paid: true }],
      guidedSession: session,
      signerIdentities: TEST49_IDENTITIES,
      signerManifest: null,
      originalIntake:
        "hey need an agreement for somebody helping us with AI automation setup workflows and dashboards",
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics.structureDefects).toEqual([]);
    const body = result.body;
    expect(body).toMatch(/CLIENT:\s*\n\s*Acme LLC/i);
    expect(body).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(body).toMatch(/Title:\s*Manager/i);
    expect(body).toMatch(/SERVICE PROVIDER:\s*\n\s*Joe Smith/i);
    expect(body).toMatch(/Name:\s*Joe Smith/i);
    expect(body.indexOf("IN WITNESS WHEREOF")).toBeLessThan(body.lastIndexOf("By:"));
  });
});
