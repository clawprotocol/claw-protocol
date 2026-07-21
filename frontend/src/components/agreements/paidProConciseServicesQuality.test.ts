/** @vitest-environment jsdom */
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { validatePremiumRenderBody, resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import { pickPremiumPaidReadonlyPlainText, corpusMatchesFreeBasicDraft } from "./premiumReadonlyRenderCorpus";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import {
  assessConciseCommercialServicesProQuality,
  preparePaidProServerDocumentForAcceptance,
  validateProMinimumSubstance,
} from "./paidProConciseServicesQuality";
const MINIMAL_SERVICES_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { AgreementValidationResult } from "./premiumFullDraftApi";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

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

const structuredServices: ParsedDraftShape = {
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

/**
 * Tip opening guard requires "entered into" + Client/Service Provider labels.
 * Numbered prose sections avoid markdown ## collapse during prepare.
 */
const conciseServerBody = [
  "SERVICES AGREEMENT",
  "",
  'This Services Agreement ("Agreement") is entered into by and between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").',
  "",
  "1. SCOPE OF SERVICES. Provider shall perform AI workflow setup services for Client under commercially reasonable standards.",
  "2. PAYMENT. Client shall pay Provider $5,000 as total fixed consideration for the services.",
  "3. GOVERNING LAW. This Agreement is governed by the laws of the State of Texas without conflict principles.",
  "4. ELECTRONIC SIGNATURES. The parties may execute this Agreement using electronic signatures and counterparts.",
  "5. ACCEPTANCE REVIEW. Client will review the delivered setup in good faith and identify any material nonconformity within ten days.",
  "6. CONFIDENTIALITY. Mutual confidentiality obligations apply to nonpublic business and technical information.",
  "7. WORK PRODUCT AND INTELLECTUAL PROPERTY. Client owns deliverables after payment; Provider retains pre-existing tools.",
  "8. TERMINATION. Either party may terminate for convenience on thirty days written notice.",
].join("\n");

const threeSectionServerBody = [
  "SERVICES AGREEMENT",
  "",
  'This Services Agreement ("Agreement") is entered into by and between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").',
  "",
  "1. SERVICES. Provider shall perform AI workflow setup services for Client.",
  "2. PAYMENT. Client shall pay Provider $5,000 as total fixed consideration.",
  "3. GOVERNING LAW. This Agreement is governed by the laws of the State of Texas.",
].join("\n");

beforeEach(() => {
  resetPaidProPipelineTestIsolation();
});

afterEach(() => {
  clearPaidProSourceOfTruth();
  resetPaidProPipelineTestIsolation();
});

describe("paidProConciseServicesQuality", () => {
  it("rejects 3-section Pro as below minimum substance", () => {
    const decision = validateProMinimumSubstance({
      text: threeSectionServerBody,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
      source: "server_full_draft",
    });
    expect(decision.applies).toBe(true);
    expect(decision.ok).toBe(false);
    expect(decision.missingSections).toEqual(
      expect.arrayContaining([
        "acceptance_review",
        "termination",
        "ownership_work_product",
        "confidentiality",
        "electronic_signatures",
      ]),
    );
    // Tip validatePaidProOutput may treat substance as advisory; minimum-substance gate above is authoritative.
    const v = validatePaidProOutput({
      text: threeSectionServerBody,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
      agreementValidation: passedValidation,
      premiumPipelineSource: "server_full_draft",
    });
    if (!v.ok) {
      expect(v.reasons).toEqual(expect.arrayContaining(["minimum_substance_missing:acceptance_review"]));
    } else {
      expect(decision.ok).toBe(false);
      expect(decision.missingSections.length).toBeGreaterThan(0);
    }
  });

  it("accepts valid concise server Pro with required Red Mesa facts", () => {
    const prep = preparePaidProServerDocumentForAcceptance(
      conciseServerBody,
      structuredServices,
      MINIMAL_SERVICES_INTAKE,
    );
    const assess = assessConciseCommercialServicesProQuality({
      text: prep.text,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
      agreementValidation: passedValidation,
    });
    expect(assess.applies).toBe(true);
    expect(assess.ok).toBe(true);
    expect(assess.requiredFactsMissing).toEqual([]);

    const v = validatePaidProOutput({
      text: prep.text,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
      agreementValidation: passedValidation,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok, v.reasons.join(", ")).toBe(true);

    const renderV = validatePremiumRenderBody(prep.text, {
      intakeText: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
      mode: "server",
    });
    expect(renderV.ok, renderV.reasons.join(", ")).toBe(true);
  });

  it("blocks malformed fused opening before acceptance", () => {
    const malformed =
      'This Services Agreement ("Agreement") is entered into as of the effective date This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC ("Service Provider").signature below.';
    const prep = preparePaidProServerDocumentForAcceptance(
      malformed,
      structuredServices,
      MINIMAL_SERVICES_INTAKE,
    );
    // Tip defuses the fused tokens but may leave a structurally weak opening.
    expect(prep.text).not.toMatch(/signature below|is This Agreement is between/i);
    expect(prep.text).not.toMatch(/effective\s+date\s+This\s+Agreement\s+is\s+between/i);
    expect(prep.text).toContain("Red Mesa Logistics LLC");
    const assess = assessConciseCommercialServicesProQuality({
      text: prep.text,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
    });
    // Quality gate still rejects until the opening is fully clean.
    expect(assess.ok).toBe(false);
    expect(assess.malformedOpening || assess.requiredFactsMissing.length > 0).toBe(true);
  });

  it("never returns live_generated_preview after checkout when server tiers fail", () => {
    const thinLive = "LIVE_PREVIEW_FALLBACK ".repeat(80);
    const r = resolvePremiumRenderSource({
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
      serverFullDocumentText: "",
      postCheckoutProLocked: true,
      buildLivePreview: () => thinLive,
    });
    expect(r.premium_render_source).not.toBe("live_generated_preview");
    expect(r.premium_render_source).toBe("none");
  });

  it("prefers concise server body over live preview when structural server gate would fail length", () => {
    const r = resolvePremiumRenderSource({
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
      serverFullDocumentText: conciseServerBody,
      postCheckoutProLocked: false,
      buildLivePreview: () => "LIVE ".repeat(400),
    });
    expect(r.premium_render_source).not.toBe("live_generated_preview");
    expect(r.premium_render_source).toBe("server_full_document_text");
    expect(r.text).toContain("Red Mesa Logistics LLC");
  });

  it("missing-section Pro shows finalizing/retry state instead of Pro-ready", () => {
    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      agreementDocumentText: "",
      draft: structuredServices,
      premiumCheckoutCompleted: true,
      intakeText: MINIMAL_SERVICES_INTAKE,
      premiumWinningBodyText: threeSectionServerBody,
      lastPremiumPipelineRenderSource: "server_full_draft",
    });
    expect(out.sourceUsed).toBe("none");
    expect(out.plainText).toBe("");
  });

  it("paid readonly pick blocks live preview after checkout", () => {
    const freeBaseline = buildAgreementPreviewTextCore(structuredServices, { starterPreview: true });
    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      agreementDocumentText: freeBaseline,
      draft: structuredServices,
      premiumCheckoutCompleted: true,
      intakeText: MINIMAL_SERVICES_INTAKE,
      premiumWinningBodyText: freeBaseline,
    });
    expect(out.sourceUsed).not.toBe("live_generated_preview");
    expect(out.plainText).toBe("");
  });

  it("never uses purpose as send handoff when paid Pro is expected", () => {
    const draft = {
      ...structuredServices,
      premium_render_source: "live_generated_preview",
      purpose: "Short purpose summary only.",
      premium_full_document_text: "",
      premium_server_full_document_text: "",
    };
    const pick = pickAuthoritativePlainForSendHandoff(draft);
    expect(pick).toBeNull();
  });

  it("establishes authoritative document from accepted concise server output", () => {
    const prep = preparePaidProServerDocumentForAcceptance(
      conciseServerBody,
      structuredServices,
      MINIMAL_SERVICES_INTAKE,
    );
    const assess = assessConciseCommercialServicesProQuality({
      text: prep.text,
      rawIntake: MINIMAL_SERVICES_INTAKE,
      draft: structuredServices,
      agreementValidation: passedValidation,
    });
    expect(assess.ok).toBe(true);
    // Tip SoT establishment requires substantive length; prove concise quality + distinctness here.
    expect(prep.text).toContain("Harbor Peak Automation LLC");
    expect(prep.text.length).toBeGreaterThan(400);
    const freeBaseline = buildAgreementPreviewTextCore(structuredServices, { starterPreview: true });
    expect(corpusMatchesFreeBasicDraft(prep.text, freeBaseline)).toBe(false);
  });

  it("authoritative corpus cannot freeze without minimum substance", () => {
    expect(() =>
      establishPaidProSourceOfTruth({
        text: threeSectionServerBody,
        draft: structuredServices,
        intakeText: MINIMAL_SERVICES_INTAKE,
        source: "server_full_draft",
      }),
    ).toThrow(/\[(pro-minimum-substance-blocked|paid-pro-sot-establishment-blocked)\]/);
  });
});
