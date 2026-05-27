import { describe, expect, it } from "vitest";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";
import { validateProFullAgreementCandidate } from "./proFullAgreementCandidate";

const INTAKE = `
ABC LLC hires Jordan Lee Consulting for AI automation services. Oklahoma law. $120,000 total project fee.
Client owns deliverables after payment and Service Provider retains pre-existing tools. 30 days written notice.
`.trim();

const FULL_OPENAI_AGREEMENT = `
AI Automation Services Agreement
This Agreement is between ABC LLC ("Client") and Jordan Lee Consulting ("Service Provider").

1. Purpose and Scope
Service Provider will provide AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance for Client.

2. Fees and Payment
Client will pay Service Provider a total project fee of $120,000 for the services described in this Agreement.

3. Ownership and Work Product
Client will own the deliverables created specifically for Client under this Agreement once Client has paid all amounts due for those deliverables. Service Provider retains its pre-existing tools, templates, know-how, methods, and background materials.

4. Confidentiality
Each Party will protect confidential information using reasonable care and use it only for this Agreement.

5. Support Expectations
Service Provider will provide automation support and onboarding assistance, with no guaranteed third-party AI platform uptime.

6. Term and Termination
Either Party may terminate this Agreement by giving 30 days written notice.

7. Miscellaneous
This Agreement is governed by Oklahoma law.

8. Electronic Signatures
Parties may sign this Agreement electronically and in counterparts, and those signatures will have the same effect as original signatures.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
ABC LLC
By: __________________________
Name: ________________________
Date: _________________________

SERVICE PROVIDER:
Jordan Lee Consulting
By: __________________________
Name: ________________________
Date: _________________________
`.trim();

describe("proFullAgreementCandidate", () => {
  it("accepts a coherent OpenAI full agreement as the primary canonical Pro corpus", () => {
    const validation = validateProFullAgreementCandidate(FULL_OPENAI_AGREEMENT, {
      intakeText: INTAKE,
      canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
    });
    expect(validation.ok).toBe(true);

    const result = canonicalizeProAgreementText(FULL_OPENAI_AGREEMENT, {
      intakeText: INTAKE,
      canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
      surface: "test_full_openai_primary",
    });
    expect(result.repairs).toContain("full_candidate:validated_primary");
    expect(result.repairs.some((repair) => repair.startsWith("semantic_reconstruct:"))).toBe(false);
    expect(result.text).toContain("Client will pay Service Provider a total project fee of $120,000");
    expect(result.text).toContain("Service Provider will provide automation support and onboarding assistance");
    expect(result.text).not.toMatch(/applicable Party|commercial terms include/i);
  });

  it("rejects unsafe full agreements so deterministic repair can take over", () => {
    const unsafe = FULL_OPENAI_AGREEMENT
      .replace("Oklahoma law", "Texas law")
      .replace("Client will pay Service Provider a total project fee of $120,000", "The commercial terms include $120,000")
      .replace("Jordan Lee Consulting", "[ORG_2]");
    const validation = validateProFullAgreementCandidate(unsafe, {
      intakeText: INTAKE,
      canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
    });
    expect(validation.ok).toBe(false);
    expect(validation.defects).toContain("placeholder");
    expect(validation.defects).toContain("generic_renderer_language");
    expect(validation.defects).toContain("governing_law_conflict");

    const result = canonicalizeProAgreementText(unsafe, {
      intakeText: INTAKE,
      canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
      surface: "test_full_openai_repair_fallback",
    });
    expect(result.repairs).not.toContain("full_candidate:validated_primary");
    expect(result.warnings).toEqual(expect.arrayContaining([
      "full_candidate:placeholder",
      "full_candidate:generic_renderer_language",
      "full_candidate:governing_law_conflict",
    ]));
  });
});
