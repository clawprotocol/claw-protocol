import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedDraftShape } from "../../intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "../../partyRoleIntake";
import { runPremiumCompletion } from "../../premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "../../premiumFullDraftApi";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "../../premiumNetworkRecoveryLocalDraft";
import {
  paidProCheckoutCompletionHasVisibleOutcome,
  PREMIUM_USABLE_BODY_MIN_LEN,
} from "../../premiumPostCheckoutApplyEligible";
import { hasPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import {
  meetsPaidProDegradedRecoveryDisplayRequirements,
  shouldSuppressPaidProGuidedCompletionUi,
} from "../../paidProPostCheckoutRenderGate";
import { canActivateGuidedCompletionPhase } from "../../starterCreateHandoff";
import {
  clearLastFinishedPaidProPerformanceTrace,
  finishPaidProPerformanceWaterfall,
  readActivePaidProPerformanceTrace,
  readLastFinishedPaidProPerformanceTrace,
  startPaidProPerformanceTrace,
} from "../../paidProPerformanceTrace";
import { clearPaidProAgreementFamilyCache, resolveAuthoritativePaidProAgreementFamily } from "../../paidProAgreementFamilyAuthority";
import { clearPremiumGenerationCallAudit } from "../../paidProPremiumGenerationCallAudit";
import { clearFrozenPremiumSessionBodiesForTests } from "../../premiumAcceptancePolicy";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const TEST224_INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest220.intake.txt"), "utf8").trim();

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const structured: ParsedDraftShape = {
  title: "Mutual Consulting and Implementation Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose: "AI workflow implementation services.",
  payment_terms: "$8,500 fixed fee.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

function buildTest224RejectedDegradedServerBody(targetLen: number): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "Blue Canyon Analytics LLC and Iron Vale Systems Inc. agree to AI workflow implementation.",
    "Fixed fee $8,500. Delaware law governs.",
    "",
  ].join("\n");
  const bannedMarkers = [
    "[claw_full_draft_expansion_v1]",
    "internal generation",
    "gap-trace",
    "sparse-prompt premium expansion",
  ];
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. ${bannedMarkers[i % bannedMarkers.length]} The parties shall perform diligently. `;
    i += 1;
  }
  const tail = [
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT: Blue Canyon Analytics LLC",
    "SERVICE PROVIDER: Iron Vale Systems Inc.",
  ].join("\n");
  return `${body}\n${tail}`;
}

const h = vi.hoisted(() => {
  const doc = buildTest224RejectedDegradedServerBody(6_387);
  return {
    mockResult: {
      title: "Mutual Consulting and Implementation Agreement",
      agreement_family: "services_agreement",
      document_text: doc,
      server_full_document_text: doc,
      key_terms_found: [] as string[],
      missing_material_info: [] as string[],
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    } satisfies PremiumFullDraftResult,
  };
});

vi.mock("../../premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => Promise.resolve({ ok: true as const, result: h.mockResult }),
    postPremiumFullDraftOnce: () => Promise.resolve(h.mockResult),
  };
});

describe("paidPro Test224 performance waterfall and json_parse degraded recovery", () => {
  beforeEach(() => {
    clearPremiumGenerationCallAudit();
    clearPaidProAgreementFamilyCache();
    clearFrozenPremiumSessionBodiesForTests();
    clearLastFinishedPaidProPerformanceTrace();
    const doc = buildTest224RejectedDegradedServerBody(6_387);
    h.mockResult.document_text = doc;
    h.mockResult.server_full_document_text = doc;
  });

  it("records pipeline spans including server_model and json_parse handling", async () => {
    await runPremiumCompletion({
      intakeText: TEST224_INTAKE,
      originalUserIntakeRawForMerge: TEST224_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test224",
      premiumRequestIntakeFingerprint: "fp-test224",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion",
    });
    const finished = readLastFinishedPaidProPerformanceTrace();
    expect(finished).toBeTruthy();
    const names = finished!.spans.map((s) => s.name);
    expect(names).toContain("intake_classification");
    expect(names).toContain("premium_full_draft_api");
    expect(names).toContain("server_model");
    expect(names).toContain("json_parse_degraded_handling");
  });

  it("Blue Canyon / Iron Vale json_parse degraded still yields stable Pro recovery, not guided Q&A", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST224_INTAKE,
      originalUserIntakeRawForMerge: TEST224_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test224-recovery",
      premiumRequestIntakeFingerprint: "fp-test224-r",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(out.winningPremiumBodyText, TEST224_INTAKE)).toBe(true);
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(hasPaidProSourceOfTruth()).toBe(false);
    const gateInput = {
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumRenderSource: out.premiumRenderSource,
      premiumDegradedServerLocalRecovery: true,
    };
    expect(shouldSuppressPaidProGuidedCompletionUi(gateInput)).toBe(true);
    expect(
      canActivateGuidedCompletionPhase({
        premiumPaidDocumentSurface: true,
        paidBodyLen: out.winningPremiumBodyText.trim().length,
        suppressPaidProGuidedCompletion: true,
      }),
    ).toBe(false);
  });

  it("one authoritative family when server hints consulting vs services", () => {
    clearPaidProAgreementFamilyCache();
    const a = resolveAuthoritativePaidProAgreementFamily({
      intakeText: TEST224_INTAKE,
      serverFamilyHint: "consulting_agreement",
      traceId: "t224",
      sessionGenerationId: "g224",
      intakeFingerprint: "fp224",
    });
    const b = resolveAuthoritativePaidProAgreementFamily({
      intakeText: TEST224_INTAKE,
      serverFamilyHint: "services_agreement",
      traceId: "t224",
      sessionGenerationId: "g224",
      intakeFingerprint: "fp224",
    });
    expect(a.family).toBe(b.family);
  });

  it("manual trace can finish with span metadata", () => {
    startPaidProPerformanceTrace({ traceId: "manual", intakeFingerprint: "fp" });
    const trace = readActivePaidProPerformanceTrace();
    expect(trace?.traceId).toBe("manual");
    finishPaidProPerformanceWaterfall();
    expect(readActivePaidProPerformanceTrace()).toBeNull();
  });
});
