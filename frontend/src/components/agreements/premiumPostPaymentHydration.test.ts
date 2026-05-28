/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { premiumSnapshotToResult } from "./premiumCompletionEnsure";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { authoritativePremiumPipelineResultForUiApply } from "./premiumPostCheckoutApplyEligible";
import { resolvePremiumFinalizationDecision } from "./premiumFinalizationFlow";
import type { PremiumFullDraftApiResult, PremiumFullDraftResult } from "./premiumFullDraftApi";
import { finalizePremiumAgreement, isPremiumFullDraftNetworkFailure } from "./premiumFullDraftApi";

const MINIMAL_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();

const emptyPayment = { amount: 5000, cadence: null as string | null, valid: true };

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
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

const proBody = [
  "SERVICES AGREEMENT",
  "This Agreement is between Red Mesa Logistics LLC (Client) and Harbor Peak Automation LLC (Provider).",
  "Scope: AI workflow setup and related professional services.",
  "Consideration: Harbor Peak shall receive $5,000 from Red Mesa for the Services.",
  "Governing law: State of Texas. Electronic signatures are permitted.",
  "EXECUTION — SIGNATURES",
  ...Array(90).fill(
    "Provider will deliver commercially reasonable AI workflow configuration with LawDog Pro commercial safeguards.",
  ),
].join("\n\n");

function okFullDraft(): PremiumFullDraftResult {
  return {
    title: structured.title || "Services Agreement",
    agreement_family: "services_agreement",
    document_text: proBody,
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

const h = vi.hoisted(() => ({
  mockResp: null as PremiumFullDraftApiResult | null,
  finalizeCalls: 0,
}));

vi.mock("./paidProCorpusAcceptance", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./paidProCorpusAcceptance")>();
  return {
    ...mod,
    validatePaidProOutput: () => ({ ok: true, reasons: [] as string[] }),
  };
});

vi.mock("./premiumFullDraftClientAcceptance", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftClientAcceptance")>();
  return {
    ...mod,
    rejectPremiumBodyForProRender: () => ({ ok: true, reasons: [] as string[] }),
    rejectPremiumDegradedFiller: () => ({ ok: true, reasons: [] as string[] }),
  };
});

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      h.mockResp ? Promise.resolve(h.mockResp) : Promise.reject(new Error("net::ERR_CONNECTION_REFUSED")),
    finalizePremiumAgreement: async (...args: Parameters<typeof finalizePremiumAgreement>) => {
      h.finalizeCalls += 1;
      return mod.finalizePremiumAgreement(...args);
    },
  };
});

describe("post-payment Pro hydration", () => {
  beforeEach(() => {
    vi.stubEnv("MODE", "development");
    h.mockResp = { ok: true, result: okFullDraft() };
    h.finalizeCalls = 0;
  });

  it("minimal complete prompt produces authoritative Pro draft after payment pipeline", async () => {
    const out = await runPremiumCompletion({
      intakeText: MINIMAL_INTAKE,
      originalUserIntakeRawForMerge: MINIMAL_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-minimal-1",
      premiumRequestIntakeFingerprint: "fp-min",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
    expect((out.winningPremiumBodyText || "").trim().length).toBeGreaterThanOrEqual(500);
    expect(out.agreementIntelligence?.recommended_questions?.length ?? 0).toBe(0);
  });

  it("no-question happy path does not require finalize endpoint", () => {
    const decision = resolvePremiumFinalizationDecision({
      routing: {
        mode: "no_questions",
        message: "No additional clarification needed.",
        questions: [],
        skippedStaticFallback: true,
      },
      agreementIntelligence: okFullDraft().agreement_intelligence ?? null,
      agreementValidation: okFullDraft().agreement_validation ?? null,
      session: null,
      firstDraft: proBody,
    });
    expect(decision.shouldFinalize).toBe(false);
    expect(h.finalizeCalls).toBe(0);
  });

  it("network failure on first-pass still returns retryable pipeline result without rejected_paid_corpus", async () => {
    h.mockResp = {
      ok: false,
      failure_kind: "network",
      retryable: true,
      error_code: "network_error",
      document_text: "",
      attemptCount: 2,
      browserErrorMessage: "net::ERR_CONNECTION_REFUSED",
    };
    const out = await runPremiumCompletion({
      intakeText: MINIMAL_INTAKE,
      originalUserIntakeRawForMerge: MINIMAL_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-net-1",
      premiumRequestIntakeFingerprint: "fp-net",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumRenderSource).toBe("premium_network_retryable");
    expect(isPremiumFullDraftNetworkFailure(new Error("net::ERR_CONNECTION_REFUSED"))).toBe(true);
  });

  it("restores snapshot without finalization fields via premiumSnapshotToResult", () => {
    const snap = {
      savedAt: Date.now(),
      premiumDraft: structured,
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: proBody,
      premiumReadonlyPlainText: proBody,
      premiumPipelineRenderSource: "server_full_draft",
      premiumAccepted: true,
    } as PremiumCompletionSnapshot;
    const result = premiumSnapshotToResult(snap);
    expect((result.winningPremiumBodyText || "").length).toBeGreaterThanOrEqual(500);
    expect(snap.premiumFinalization).toBeUndefined();
  });
});
