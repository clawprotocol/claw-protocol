import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
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
import { countStructuralFatals } from "../../premiumAcceptancePolicy";
import { rejectPremiumBodyForProRender } from "../../premiumFullDraftClientAcceptance";
import { countPaidProExecutionBlocks } from "../../paidProExecutionBlockAuthority";
import { hasPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import {
  meetsPaidProDegradedRecoveryDisplayRequirements,
  resolvePaidProPostCheckoutRecoveryDisplayPlain,
  shouldSuppressPaidProGuidedCompletionUi,
  isPaidProExplicitRecoveryRetryLabel,
} from "../../paidProPostCheckoutRenderGate";
import { canActivateGuidedCompletionPhase } from "../../starterCreateHandoff";
import { resolveGuidedProUxState } from "../../guidedDealCompletion/guidedProUxState";
import { friendlyLowConfidenceCopy } from "../../guidedDealCompletion/friendlyProCompletionCopy";
import { GUIDED_COMPLETION_PHASE_INACTIVE } from "../../starterCreateHandoff";
import { clearPremiumGenerationCallAudit } from "../../paidProPremiumGenerationCallAudit";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const TEST220_INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest220.intake.txt"), "utf8").trim();

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

function buildTest220RejectedDegradedServerBody(targetLen: number): string {
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

const rejectedDegradedDoc = buildTest220RejectedDegradedServerBody(6_387);

const h = vi.hoisted(() => {
  const doc = buildTest220RejectedDegradedServerBody(6_387);
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
    postPremiumFullDraftWithRetry: () =>
      Promise.resolve({ ok: true as const, result: h.mockResult }),
    postPremiumFullDraftOnce: () => Promise.resolve(h.mockResult),
  };
});

describe("paidPro Test220 degraded recovery must not route to guided questions", () => {
  beforeEach(() => {
    clearPremiumGenerationCallAudit();
    const doc = buildTest220RejectedDegradedServerBody(6_387);
    h.mockResult.document_text = doc;
    h.mockResult.server_full_document_text = doc;
  });

  it("rejects mocked ~6387 server corpus at client gates before local recovery", () => {
    const acc = rejectPremiumBodyForProRender(rejectedDegradedDoc, {
      intakeLower: TEST220_INTAKE.toLowerCase(),
      intakeText: TEST220_INTAKE,
      partyNames: structured.parties?.map((p) => p.name) ?? null,
    });
    expect(acc.ok).toBe(false);
    expect(countStructuralFatals(acc.reasons)).toBeGreaterThanOrEqual(1);
    expect(rejectedDegradedDoc.length).toBeGreaterThan(6_000);
    expect(rejectedDegradedDoc.length).toBeLessThan(7_000);
  });

  it("pipeline yields displayable degraded local recovery without establishing SoT", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST220_INTAKE,
      originalUserIntakeRawForMerge: TEST220_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test220",
      premiumRequestIntakeFingerprint: "fp-test220",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });

    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(4_000);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(out.winningPremiumBodyText, TEST220_INTAKE)).toBe(
      true,
    );
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBe(1);
    expect(out.winningPremiumBodyText).toMatch(/Blue Canyon Analytics LLC/i);
    expect(out.winningPremiumBodyText).toMatch(/Iron Vale Systems Inc\./i);
    expect(out.winningPremiumBodyText).toMatch(/Delaware/i);
    expect(out.winningPremiumBodyText).toMatch(/\$8[,.]?500|8500/i);

    const recoveryPlain = resolvePaidProPostCheckoutRecoveryDisplayPlain({
      draft: out.premiumDraft,
      intakeText: TEST220_INTAKE,
      winningPremiumBodyText: out.winningPremiumBodyText,
      premiumRenderSource: out.premiumRenderSource,
      premiumDegradedServerLocalRecovery: true,
    });
    expect(recoveryPlain.length).toBeGreaterThan(4_000);
    expect(recoveryPlain).toBe(out.winningPremiumBodyText.trim());
  });

  it("post-checkout gate blocks guided activation and guided UX states", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST220_INTAKE,
      originalUserIntakeRawForMerge: TEST220_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test220-ux",
      premiumRequestIntakeFingerprint: "fp-test220-ux",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });

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
        paidBodyLen: out.winningPremiumBodyText.length,
        suppressPaidProGuidedCompletion: true,
      }),
    ).toBe(false);

    const ux = resolveGuidedProUxState({
      premiumPaidDocumentSurface: true,
      hasGuidedSession: true,
      paidProAcceptedCorpusReady: false,
      suppressPaidProGuidedCompletion: true,
      postCheckoutRecoveryBodyLen: out.winningPremiumBodyText.length,
      guidedCompletionPhase: "collecting_answers",
      createFlowPhase: "draft_ready_for_review",
      premiumRecipientUxActive: false,
      finalReviewExplicitlyOpened: false,
      sendIntentSelected: false,
    });
    expect(ux).toBe("paid_pro_draft");
    expect(ux).not.toBe("guided_questions_active");
    expect(GUIDED_COMPLETION_PHASE_INACTIVE).toBe("inactive");

    const copy = friendlyLowConfidenceCopy(null, { canRenderGuidedQuestions: false });
    expect(copy.title).not.toMatch(/almost done/i);
    expect(copy.body).not.toMatch(/0 of 2 completed/i);
    expect(copy.body).not.toMatch(/Question 1 of 2/i);

    expect(isPaidProExplicitRecoveryRetryLabel("Retry Pro draft")).toBe(true);
    expect(out.proIntentGateMessage).toBeNull();
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(PREMIUM_USABLE_BODY_MIN_LEN);
  });
});
