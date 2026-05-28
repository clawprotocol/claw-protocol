import { describe, expect, it } from "vitest";
import {
  isCommercialServicesIntake,
  resolveAgreementIntentContract,
  resolvePaidProIntentContract,
  validationMinimumContractElementsSatisfied,
} from "./agreementIntentContract";
import { corpusMatchesFreeBasicDraft } from "./premiumReadonlyRenderCorpus";
import { resolvePaidProCorpusAuthority } from "./paidProCorpusAuthority";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { repairFullAgreementPartyIdentity } from "./canonicalPartyIdentityResolver";
import { polishPaidProAgreementText } from "./paidProAgreementPolish";
import { resolveAuthoritativePremiumSnapshotPlain } from "./premiumAuthoritativeBodyPreservation";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { buildPremiumPostCheckoutStitchedBody } from "./premiumCheckoutStitchedBody";
import {
  aiWorkflowPremiumQualitySignals,
  buildCommercialFactGraph,
} from "./proOperationalSynthesis";
import type { AgreementValidationResult } from "./premiumFullDraftApi";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const MINIMAL_SERVICES_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();

const passedValidation: AgreementValidationResult = {
  passed: true,
  failures: [],
  warnings: [],
  minimum_contract_elements: {
    identifiable_parties: true,
    agreement_purpose_or_scope: true,
    exchange_of_value_or_consideration: true,
    obligations_or_performance: true,
    execution_or_acceptance_mechanism: true,
  },
  summary: { failure_count: 0, warning_count: 0, checked_at: "2026-05-27T00:00:00.000Z" },
};

function padServicesProBody(core: string, minLen = 3_200): string {
  const clause =
    " The parties shall perform services in good faith. Fees, scope, deliverables, confidentiality, and limitation of liability apply. ";
  let t = core;
  while (t.length < minLen) t += clause;
  return t;
}

const minimalServicesBody = padServicesProBody(`
# Services Agreement

This Services Agreement is between **Red Mesa Logistics LLC** ("Client") and **Harbor Peak Automation LLC** ("Provider").

## Scope
Provider shall perform AI workflow setup and related professional services for Client.

## Fees
Client shall pay Provider **$5,000** as total consideration for the Services.

## Governing Law
This Agreement is governed by the laws of the **State of Texas**.

## Execution
The parties may execute this Agreement using **electronic signatures**.
`);

const structuredServices: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Provider" },
  ],
  purpose: "AI workflow setup.",
  payment_terms: "$5,000",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: 5000, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

describe("paid Pro minimal services acceptance", () => {
  it("extracts a commercial fact graph for AI workflow services before premium synthesis", () => {
    const graph = buildCommercialFactGraph(MINIMAL_SERVICES_INTAKE, structuredServices);
    expect(graph.agreementKind).toBe("ai_workflow_services");
    expect(graph.parties.client).toBe("Red Mesa Logistics LLC");
    expect(graph.parties.serviceProvider).toBe("Harbor Peak Automation LLC");
    expect(graph.payment.amount).toBe("$5,000");
    expect(graph.governingLaw).toBe("Texas");
    expect(graph.electronicSignaturesAllowed).toBe(true);
    expect(graph.deliverableType).toEqual(
      expect.arrayContaining(["workflow mapping", "configuration support", "implementation assistance"]),
    );
    expect(graph.supportPeriod.unresolvedOptional).toBe(true);
  });

  it("golden AI workflow services Pro corpus is operationally premium without fake blanks", () => {
    const body = buildPremiumPostCheckoutStitchedBody(structuredServices, MINIMAL_SERVICES_INTAKE);
    const low = body.toLowerCase();
    expect(body).toContain("Red Mesa Logistics LLC");
    expect(body).toContain("Harbor Peak Automation LLC");
    expect(body).toContain("$5,000");
    expect(body).toMatch(/laws of Texas/i);
    expect(body).toMatch(/electronic signatures/i);
    expect(low).toMatch(/workflow mapping/);
    expect(low).toMatch(/configuration/);
    expect(low).toMatch(/implementation support/);
    expect(low).toMatch(/demonstration|acceptance review/);
    expect(low).toMatch(/client owns|client-specific deliverables/);
    expect(low).toMatch(/pre-existing tools|pre-existing.*methods/);
    expect(low).toMatch(/support.*optional|support period.*unresolved/);
    expect(body).not.toMatch(/principal place of business|_{3,}|\[[^\]]+\]|Address:/i);
    expect(body).not.toMatch(/\bWHEREAS\b/i);
    expect(body.length).toBeGreaterThan(2_200);
    expect(body.length).toBeLessThan(7_500);
    expect(aiWorkflowPremiumQualitySignals(body).missing).toEqual([]);
  });

  it("golden AI workflow services Pro corpus passes paid Pro acceptance", () => {
    const body = buildPremiumPostCheckoutStitchedBody(structuredServices, MINIMAL_SERVICES_INTAKE);
    const v = validatePaidProOutput({
      text: body,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
      agreementValidation: passedValidation,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok, v.reasons.join(", ")).toBe(true);
    const resolution = resolvePaidProCorpusAuthority({
      candidates: [
        {
          plainText: body,
          tier: "server_authoritative_paid_pro",
          sourceLabel: "server_full_draft",
          pipelineSource: "server_full_draft",
        },
      ],
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
      freeBaselinePlain: "Free starter services agreement.",
      allowDeterministicFallback: false,
    });
    expect(resolution.mode).toBe("authoritative");
  });

  it("minimal services prompt is not classified as estate_family_admin", () => {
    const c = resolveAgreementIntentContract(MINIMAL_SERVICES_INTAKE);
    expect(c.intent_id).not.toBe("estate_family_admin");
    expect(c.intent_id).toBe("consulting_services");
  });

  it("modal will pay does not trigger estate family context", () => {
    expect(isCommercialServicesIntake(MINIMAL_SERVICES_INTAKE)).toBe(true);
    expect(MINIMAL_SERVICES_INTAKE.toLowerCase()).toContain("will pay");
  });

  it("preserves full legal party names through paid Pro polish on truncated draft", () => {
    const truncated = [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Red Mesa and Harbor Peak.",
      "",
      "1. Services",
      "Red Mesa will pay Harbor Peak $5,000.",
    ].join("\n");
    const polished = polishPaidProAgreementText(truncated, MINIMAL_SERVICES_INTAKE, [
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
    ]);
    expect(polished.text).toContain('Red Mesa Logistics LLC ("Client")');
    expect(polished.text).toMatch(/Client will pay Service Provider/i);
    const repaired = repairFullAgreementPartyIdentity({
      text: polished.text,
      intakeRaw: MINIMAL_SERVICES_INTAKE,
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    });
    expect(repaired.text).toContain("Red Mesa Logistics LLC");
    expect(repaired.text).toContain("Harbor Peak Automation LLC");
  });

  it("minimal services prompt passes paid Pro acceptance with backend validation", () => {
    const contract = resolvePaidProIntentContract({
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draftFamily: structuredServices.agreement_family,
      agreementValidation: passedValidation,
    });
    expect(contract.intent_id).toBe("consulting_services");
    const v = validatePaidProOutput({
      text: minimalServicesBody,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
      agreementValidation: passedValidation,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok, v.reasons.join(", ")).toBe(true);
    expect(v.reasons.some((r) => r.includes("estate_family_admin"))).toBe(false);
  });

  it("backend agreement_validation minimum elements helper passes", () => {
    expect(validationMinimumContractElementsSatisfied(passedValidation)).toBe(true);
  });

  it("starter clone is still rejected for paid authority resolution", () => {
    const starter = "1. Scope\n2. Payment\n3. Term\n4. Law\n5. Signatures\n".repeat(40);
    const resolution = resolvePaidProCorpusAuthority({
      candidates: [
        {
          plainText: starter,
          tier: "server_authoritative_paid_pro",
          sourceLabel: "server_full_draft",
        },
      ],
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
      freeBaselinePlain: starter,
      allowDeterministicFallback: false,
    });
    expect(resolution.mode).not.toBe("authoritative");
    expect(corpusMatchesFreeBasicDraft(starter, starter)).toBe(true);
  });

  it("empty Pro doc is rejected", () => {
    const v = validatePaidProOutput({
      text: "",
      rawIntake: MINIMAL_SERVICES_INTAKE,
      agreementValidation: passedValidation,
    });
    expect(v.ok).toBe(false);
  });

  it("placeholder Pro doc is rejected", () => {
    const v = validatePaidProOutput({
      text: "[TBD] [PLACEHOLDER] Agreement between parties.",
      rawIntake: MINIMAL_SERVICES_INTAKE,
      agreementValidation: passedValidation,
    });
    expect(v.ok).toBe(false);
  });

  it("stitched LawDog Pro preview shell is rejected", () => {
    const stitched =
      "This LawDog Pro preview organizes your structured fields into fuller sections for serious review.\n\n" +
      minimalServicesBody.slice(0, 800);
    const v = validatePaidProOutput({
      text: stitched,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      agreementValidation: passedValidation,
    });
    expect(v.ok).toBe(false);
  });

  it("enterprise detailed services agreement still passes", () => {
    const enterpriseIntake = `
Master services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.
Provider delivers AI workflow automation, integration, training, and support for $187,500 over six milestones.
Texas governing law. Net 30 invoicing. Two revision rounds. Electronic signatures.
    `.trim();
    const body = padServicesProBody(
      `
# Master Services Agreement
Red Mesa Logistics LLC and Harbor Peak Automation LLC agree to enterprise AI workflow services.
Total fees of $187,500 with milestone invoicing, scope, deliverables, acceptance, confidentiality, and Texas law.
Electronic signatures permitted.
`,
      12_000,
    );
    const v = validatePaidProOutput({
      text: body,
      rawIntake: enterpriseIntake,
      agreementValidation: passedValidation,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok, v.reasons.join(", ")).toBe(true);
  });

  it("accepted server_full_draft is not downgraded to shorter resolved snapshot text", () => {
    const winning = minimalServicesBody;
    const shortResolved = "z".repeat(880);
    const r = resolveAuthoritativePremiumSnapshotPlain({
      winningBody: winning,
      resolvedText: shortResolved,
      pipelineSource: "server_full_draft",
      resolvedSource: "server_full_document_text",
      intakeText: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
    });
    expect(r.text.length).toBeGreaterThanOrEqual(Math.floor(winning.length * 0.8));
    expect(r.downgradePrevented).toBe(true);
  });

  it("display polish repairs duplicate opening and strips monthly arrears", () => {
    const raw = [
      'This Agreement (the "Agreement") is This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.',
      "1. Scope.",
      "3.1",
      "Client pays $5,000.",
      "Contractor will invoice Company monthly in arrears.",
      "2. Confidentiality. Duties apply.",
      "3. Confidentiality. Duties apply.",
      "IN WITNESS WHEREOF.",
    ].join("\n\n");
    const { text } = polishProAgreementDisplayLayer(raw, {
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
    });
    expect(text).not.toMatch(/is This Agreement is between/i);
    expect(text).not.toMatch(/monthly in arrears/i);
    expect(text).toMatch(/Payment Terms/i);
    expect(text).toContain("Red Mesa Logistics LLC");
  });
});
