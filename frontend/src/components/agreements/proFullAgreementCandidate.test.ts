import { describe, expect, it } from "vitest";
import { extractDealVariables } from "./guidedDealCompletion/missingVariableExtractor";
import { finalizeGuidedProAgreementCorpus } from "./guidedDealCompletion/guidedFinalCorpusFinalizer";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";
import {
  repairProCopyQualityWithOpenAI,
  validateProCopyQuality,
} from "./proCopyQualityRepair";
import {
  PRO_AGREEMENT_VALIDATED_READY_MESSAGE,
  repairProFullAgreementCandidateSurgically,
  validateProAgreementConfidenceGate,
  validateProFullAgreementCandidate,
} from "./proFullAgreementCandidate";

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

  it("keeps test104-style paid full drafts primary through Q&A suppression and signer setup", () => {
    const ownership =
      "Client will own the deliverables and custom work product created specifically for Client under this Agreement once Client has paid all amounts due. Service Provider retains its pre-existing tools, templates, know-how, methods, reusable code, workflow patterns, and background materials.";
    const fullDraft = `
AI Automation Services Agreement
This Agreement is between ABC LLC ("Client") and Jordan Lee Consulting ("Service Provider").

1. Purpose and Scope
Service Provider will provide AI workflow implementation, dashboard setup, automation support, onboarding assistance, documentation, and light ongoing maintenance for Client. The services include discovery workshops, workflow mapping, prompt and automation configuration, user handoff, admin guidance, and commercially reasonable coordination with Client's existing software vendors.

2. Fees and Payment
Client will pay Service Provider a total project fee of $120,000 for the services described in this Agreement. The project fee is allocated 40% to build and configuration, 30% to rollout and onboarding, and 30% to support and acceptance. Invoices are due Net 30 from receipt unless the Parties sign a change order stating otherwise.

3. Ownership and Work Product
${ownership}

${ownership}

4. Confidentiality
Each Party may receive confidential business, technical, operational, or customer information from the other Party. Each receiving Party will protect that information using reasonable care, use it only to perform or receive services under this Agreement, and disclose it only to personnel or advisors who need to know it for this Agreement and are bound by confidentiality obligations.

5. Support Expectations
Service Provider will provide no guaranteed third-party AI uptime. Service Provider will provide onboarding assistance, configuration support, and reasonable troubleshooting for workflows it configures, but Client remains responsible for its accounts, credentials, subscription plans, and third-party platform decisions.

6. Term and Termination
This Agreement begins on the effective date and continues until completion of the services unless terminated earlier. Either Party may terminate this Agreement by giving 30 days written notice. Client will pay for services performed and approved expenses incurred through the effective termination date.

7. Notices
Notices under this Agreement must be sent by email, personal delivery, or nationally recognized courier to the notice contacts the Parties use for the project or later designate in writing. Email notices are effective when sent unless the sender receives an automated delivery failure notice.

8. Miscellaneous
This Agreement is governed by Oklahoma law. The Parties are independent contractors. Neither Party may assign this Agreement without the other Party's written consent except in connection with a merger, reorganization, or sale of substantially all assets. This Agreement is the entire agreement for the services and may be amended only in a writing signed by both Parties.

9. Electronic Signatures
The Parties may sign this Agreement electronically and in counterparts. Electronic signatures and counterpart copies will have the same legal effect as original signatures.

Specific compensation mechanics will be completed in Schedule A before execution.

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

    const variables = extractDealVariables({ intakeRaw: INTAKE, body: fullDraft });
    expect(variables.map((v) => v.question).join("\n")).not.toMatch(/standard practical terms/i);

    const repairedDraft = repairProFullAgreementCandidateSurgically(fullDraft, {
      intakeText: INTAKE,
      canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
    });
    expect(validateProFullAgreementCandidate(repairedDraft.text, {
      intakeText: INTAKE,
      canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
    }).ok).toBe(true);
    const preWitnessHash = fingerprintAgreementBody(
      repairedDraft.text.replace(/\bIN WITNESS WHEREOF[\s\S]*$/i, "").trim(),
    );

    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "hydrated_premium", body: fullDraft, paid: true }],
      guidedSession: null,
      signerIdentities: [
        {
          index: 0,
          partyDisplayName: "ABC LLC",
          email: "client@example.com",
          representativeName: "Avery Client",
          title: "CEO",
          blockHeading: "CLIENT",
          isIndividual: false,
        },
        {
          index: 1,
          partyDisplayName: "Jordan Lee Consulting",
          email: "provider@example.com",
          representativeName: "Jordan Lee",
          title: "Owner",
          blockHeading: "SERVICE PROVIDER",
          isIndividual: false,
        },
      ],
      signerManifest: null,
      originalIntake: INTAKE,
      freeBasicDraftPlain: null,
    });

    expect(result.ok).toBe(true);
    expect(result.appliedAnswerIds).toEqual([]);
    expect(result.diagnostics.repairs.some((repair) => repair.startsWith("full_candidate:validated"))).toBe(true);
    expect(result.body).not.toMatch(/Specific compensation mechanics will be completed in Schedule A/i);
    expect(result.body).not.toMatch(/will provide no guaranteed third-party AI uptime/i);
    expect(result.body).toMatch(/Service Provider does not guarantee the uptime, availability, compatibility, or continued operation/i);
    expect(result.body.match(/Client will own the deliverables and custom work product/gi)?.length ?? 0).toBe(1);
    expect(result.body).toMatch(/CLIENT:\nABC LLC\nBy: _+\nName: Avery Client\nTitle: CEO\nDate: _+/);
    expect(result.body).toMatch(/SERVICE PROVIDER:\nJordan Lee Consulting\nBy: _+\nName: Jordan Lee\nTitle: Owner\nDate: _+/);
    expect(
      fingerprintAgreementBody(result.body.replace(/\bIN WITNESS WHEREOF[\s\S]*$/i, "").trim()),
    ).toBe(preWitnessHash);
  });

  it("confidence-gates complete OpenAI drafts with no Q&A, reconstruction, or commercial mutation", () => {
    const completeDraft = `
AI Automation Services Agreement
This Agreement is between ABC LLC ("Client") and Jordan Lee Consulting ("Service Provider").

1. Purpose and Scope
Service Provider will provide AI workflow implementation, dashboard setup, automation support, onboarding assistance, documentation, and light ongoing maintenance for Client. Service Provider will coordinate with Client's team to configure workflows, hand off admin guidance, and support the implementation described in this Agreement.

2. Fees and Payment
Client will pay Service Provider a total project fee of $120,000 for the services described in this Agreement. The project fee is allocated 40% to build and configuration, 30% to rollout and onboarding, and 30% to support and acceptance. Invoices are due Net 30 from receipt unless the Parties sign a written change order stating otherwise.

3. Ownership and Work Product
Client will own the deliverables and custom work product created specifically for Client under this Agreement once Client has paid all amounts due for those deliverables. Service Provider retains its pre-existing tools, templates, know-how, methods, reusable code, workflow patterns, and background materials.

4. Confidentiality
Each Party may receive confidential business, technical, operational, or customer information from the other Party. Each receiving Party will protect that information using reasonable care, use it only to perform or receive services under this Agreement, and disclose it only to personnel or advisors who need to know it for this Agreement and are bound by confidentiality obligations.

5. Support Expectations
Service Provider does not guarantee the uptime, availability, compatibility, or continued operation of third-party AI platforms or services outside Service Provider's control. Service Provider will provide onboarding assistance, configuration support, and reasonable troubleshooting for workflows it configures.

6. Term and Termination
This Agreement begins on the effective date and continues until completion of the services unless terminated earlier. Either Party may terminate this Agreement by giving 30 days written notice. Client will pay for services performed and approved expenses incurred through the effective termination date.

7. Notices
Notices under this Agreement must be sent by email, personal delivery, or nationally recognized courier to the notice contacts the Parties use for the project or later designate in writing. Email notices are effective when sent unless the sender receives an automated delivery failure notice.

8. Miscellaneous
This Agreement is governed by Oklahoma law. The Parties are independent contractors. Neither Party may assign this Agreement without the other Party's written consent except in connection with a merger, reorganization, or sale of substantially all assets. This Agreement is the entire agreement for the services and may be amended only in a writing signed by both Parties.

9. Electronic Signatures
The Parties may sign this Agreement electronically and in counterparts. Electronic signatures and counterpart copies will have the same legal effect as original signatures.

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

    const confidence = validateProAgreementConfidenceGate(completeDraft, {
      intakeText: INTAKE,
      canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
    });
    expect(confidence.ok).toBe(true);
    expect(confidence.readyMessage).toBe(PRO_AGREEMENT_VALIDATED_READY_MESSAGE);
    expect(extractDealVariables({ intakeRaw: INTAKE, body: completeDraft })).toEqual([]);

    const paymentSentence =
      "Client will pay Service Provider a total project fee of $120,000 for the services described in this Agreement.";
    const preWitnessHash = fingerprintAgreementBody(
      completeDraft.replace(/\bIN WITNESS WHEREOF[\s\S]*$/i, "").trim(),
    );
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "hydrated_premium", body: completeDraft, paid: true }],
      guidedSession: null,
      signerIdentities: [
        {
          index: 0,
          partyDisplayName: "ABC LLC",
          email: "client@example.com",
          representativeName: "Avery Client",
          title: "CEO",
          blockHeading: "CLIENT",
          isIndividual: false,
        },
        {
          index: 1,
          partyDisplayName: "Jordan Lee Consulting",
          email: "provider@example.com",
          representativeName: "Jordan Lee",
          title: "Owner",
          blockHeading: "SERVICE PROVIDER",
          isIndividual: false,
        },
      ],
      signerManifest: null,
      originalIntake: INTAKE,
      freeBasicDraftPlain: null,
    });

    expect(result.ok).toBe(true);
    expect(result.appliedAnswerIds).toEqual([]);
    expect(result.diagnostics.repairs).toContain("confidence_gate:ready_for_signatures");
    expect(result.diagnostics.repairs.some((repair) => /semantic_reconstruct|canonical:semantic|structure:|section_merge/.test(repair))).toBe(false);
    expect(result.body).toContain(paymentSentence);
    expect(result.body).not.toMatch(/Specific compensation mechanics will be completed in Schedule A|SCHEDULE A/i);
    expect(result.body.match(/Client will own the deliverables and custom work product/gi)?.length ?? 0).toBe(1);
    expect(result.body.match(/40% to build and configuration/gi)?.length ?? 0).toBe(1);
    expect(
      fingerprintAgreementBody(result.body.replace(/\bIN WITNESS WHEREOF[\s\S]*$/i, "").trim()),
    ).toBe(preWitnessHash);
  });

  it("test106 repairs OpenAI copy defects before freeze and preserves signer-only hydration", async () => {
    const defective = `
AI Automation Services Agreement
This Agreement is between ABC LLC ("Client") and Jordan Lee Consulting ("Service Provider").

1. Purpose and Scope
Service Provider will provide:
- AI workflow implementation
- dashboard setup
- automation support
and

2. Fees and Payment
Client will pay Service Provider a total project fee of total fee for the services described in this Agreement. The project fee is allocated 40% to build and configuration, 30% to rollout and onboarding, and 30% to support and acceptance. Specific compensation mechanics will be completed in Schedule A before execution.

3. Project Administration
- AI workflow implementation
- dashboard setup
- automation support
The applicable Party will coordinate project access.

4. Confidentiality

5. Support Expectations
Service Provider does not guarantee the uptime, availability, compatibility, or continued operation of third-party AI platforms or services outside Service Provider's control.

6. Term and Termination
Either Party may end this Agreement on 30-day termination.

7. Notices
Notices under this Agreement must be sent by email or courier to the contacts designated by the Parties in writing.

8. Miscellaneous
This Agreement is governed by Oklahoma law. Each receiving Party will protect confidential information using reasonable care and use it only for this Agreement.

9. Electronic Signatures
The Parties may sign this Agreement electronically and in counterparts.

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

    const defects = validateProCopyQuality(defective);
    expect(defects.map((d) => d.code)).toEqual(expect.arrayContaining([
      "unresolved_semantic_token",
      "dangling_conjunction",
      "orphan_schedule_a_reference",
      "repeated_scope_bullet",
      "empty_heading",
      "malformed_termination_phrase",
      "confidentiality_outside_section",
      "generic_applicable_party",
    ]));

    const repairedText = `
AI Automation Services Agreement
This Agreement is between ABC LLC ("Client") and Jordan Lee Consulting ("Service Provider").

1. Purpose and Scope
Service Provider will provide AI workflow implementation, dashboard setup, and automation support for Client.

2. Fees and Payment
Client will pay Service Provider a total project fee of $120,000 for the services described in this Agreement. The project fee is allocated 40% to build and configuration, 30% to rollout and onboarding, and 30% to support and acceptance.

3. Ownership and Work Product
Client will own the deliverables and custom work product created specifically for Client under this Agreement once Client has paid all amounts due for those deliverables. Service Provider retains its pre-existing tools, templates, know-how, methods, reusable code, workflow patterns, and background materials.

4. Confidentiality
Each receiving Party will protect confidential information using reasonable care and use it only for this Agreement.

5. Support Expectations
Service Provider does not guarantee the uptime, availability, compatibility, or continued operation of third-party AI platforms or services outside Service Provider's control.

6. Term and Termination
Either Party may terminate this Agreement by giving 30 days written notice.

7. Notices
Notices under this Agreement must be sent by email or courier to the contacts designated by the Parties in writing.

8. Miscellaneous
This Agreement is governed by Oklahoma law.

9. Electronic Signatures
The Parties may sign this Agreement electronically and in counterparts.

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

    const repaired = await repairProCopyQualityWithOpenAI({
      text: defective,
      intakeText: `${INTAKE} $120,000 total project fee. 40% build and configuration, 30% rollout and onboarding, 30% support and acceptance.`,
      context: {
        intakeText: `${INTAKE} $120,000 total project fee. 40% build and configuration, 30% rollout and onboarding, 30% support and acceptance.`,
        canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
      },
      repairClient: async () => ({
        updated_document_text: repairedText,
        summary_changes: ["Fixed listed copy defects only."],
        readiness_score: 100,
        suggested_next_step: "send",
      }),
    });

    expect(repaired.source).toBe("openai");
    expect(validateProCopyQuality(repaired.text)).toEqual([]);
    expect(validateProAgreementConfidenceGate(repaired.text, {
      intakeText: INTAKE,
      canonicalPartyNames: ["ABC LLC", "Jordan Lee Consulting"],
    }).ok).toBe(true);
    expect(extractDealVariables({ intakeRaw: INTAKE, body: repaired.text })).toEqual([]);

    const preWitnessHash = fingerprintAgreementBody(
      repaired.text.replace(/\bIN WITNESS WHEREOF[\s\S]*$/i, "").trim(),
    );
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "hydrated_premium", body: repaired.text, paid: true }],
      guidedSession: null,
      signerIdentities: [
        {
          index: 0,
          partyDisplayName: "ABC LLC",
          email: "client@example.com",
          representativeName: "Avery Client",
          title: "CEO",
          blockHeading: "CLIENT",
          isIndividual: false,
        },
        {
          index: 1,
          partyDisplayName: "Jordan Lee Consulting",
          email: "provider@example.com",
          representativeName: "Jordan Lee",
          title: "Owner",
          blockHeading: "SERVICE PROVIDER",
          isIndividual: false,
        },
      ],
      signerManifest: null,
      originalIntake: INTAKE,
      freeBasicDraftPlain: null,
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.repairs).toContain("confidence_gate:ready_for_signatures");
    expect(result.body).toContain("total project fee of $120,000");
    expect(result.body).toContain("40% to build and configuration, 30% to rollout and onboarding, and 30% to support and acceptance");
    expect(result.body).not.toMatch(/Schedule A|total fee|applicable Party|30-day termination/i);
    expect(
      fingerprintAgreementBody(result.body.replace(/\bIN WITNESS WHEREOF[\s\S]*$/i, "").trim()),
    ).toBe(preWitnessHash);
  });
});
