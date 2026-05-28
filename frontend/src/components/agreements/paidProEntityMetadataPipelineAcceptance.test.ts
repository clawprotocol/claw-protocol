/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { authoritativePremiumPipelineResultForUiApply } from "./premiumPostCheckoutApplyEligible";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftApiResult, PremiumFullDraftResult } from "./premiumFullDraftApi";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";

const MINIMAL_SERVICES_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();

const structured: ParsedDraftShape = {
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

function padEntityMetadataBody(core: string, minLen = 3_200): string {
  const filler =
    " Provider will deliver AI workflow setup. Client will pay $5,000. Texas law governs. Electronic signatures permitted. ";
  let t = core;
  while (t.length < minLen) t += filler;
  return t;
}

const entityMetadataCore = `
SERVICES AGREEMENT

This Agreement is between Red Mesa Logistics LLC, a [State] corporation with principal place of business at [Address], [State], and Harbor Peak Automation LLC, a [State] corporation with principal place of business at [Address], [State].

Scope: AI workflow setup and related professional services.
Fees: Client shall pay Provider $5,000.
Governing law: State of Texas.
Electronic signatures are permitted.

IN WITNESS WHEREOF, the parties execute this Agreement.
`;

const h = vi.hoisted(() => ({
  mockResp: null as PremiumFullDraftApiResult | null,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      h.mockResp ? Promise.resolve(h.mockResp) : Promise.reject(new Error("net::ERR_CONNECTION_REFUSED")),
  };
});

function okFullDraftWithEntityPlaceholders(): PremiumFullDraftResult {
  const document_text = padEntityMetadataBody(entityMetadataCore);
  return {
    title: structured.title || "Services Agreement",
    agreement_family: "services_agreement",
    document_text,
    generation_outcome: "ok",
    generation_ok: true,
    retryable: false,
    agreement_intelligence: {
      extracted_terms: {
        parties: structured.parties.map((p) => ({ name: p.name, role: p.role })),
        party_roles: [],
        governing_law: "Texas",
        payment_terms: { total_amount: "$5,000", currency: "USD", milestones: [], recurring_support: null },
        electronic_signatures: true,
      },
      ambiguities: [],
      conflicts: [],
      missing_material_terms: [],
      recommended_questions: [],
      quality_flags: [],
    },
    agreement_validation: {
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
    },
    key_terms_found: [],
    missing_material_info: [],
  };
}

describe("paid Pro pipeline accepts server draft with harmless entity-metadata placeholders", () => {
  beforeEach(() => {
    vi.stubEnv("MODE", "test");
    clearPaidProSourceOfTruth();
    h.mockResp = { ok: true, result: okFullDraftWithEntityPlaceholders() };
  });

  it("does not reject to rejected_paid_corpus when only [State]/[Address] stubs are present", async () => {
    const out = await runPremiumCompletion({
      intakeText: MINIMAL_SERVICES_INTAKE,
      originalUserIntakeRawForMerge: MINIMAL_SERVICES_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-entity-meta-1",
      premiumRequestIntakeFingerprint: "fp-entity-meta",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumRenderSource).not.toBe("live_generated_preview");
    expect(out.premiumRenderSource).not.toBe("premium_readonly_pick");
    const body = (out.winningPremiumBodyText || "").trim();
    expect(body.length).toBeGreaterThan(1_500);
    expect(body).not.toMatch(/\[State\]|\[Address\]/);
    expect(body).toContain("Red Mesa Logistics LLC");
    expect(body).toContain("$5,000");
  });
});
