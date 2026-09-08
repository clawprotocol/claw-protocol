import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateIntentionalCreateDraftSubmit } from "./agreementIntakeCapabilityGate";
import {
  CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
  isCommerciallyUsableCreateReviewCorpus,
  planPostGenerateCreateReviewSettleOrFailClosed,
  shouldFailClosedPremiumProcessingWithoutPfd,
  shouldInvokePremiumGenerateAfterPartyPrepCreate,
  shouldSkipPartyPrepForOrdinaryNamedTwoParty,
} from "./multiPartyCreateReviewSettle";
import {
  collectOpenAiCriticalClarityQuestions,
  looksDeferredSowForOmittedDeliverables,
  looksInventedFrameworkReviewCorpus,
  resolveOpenAiClarityReviewHold,
} from "./openaiClarityReviewHold";
import { resolveGuidedQuestionGateDecision } from "./guidedDealCompletion/guidedQuestionGate";
import { SEND_HANDOFF_AUTHORITATIVE_MIN_LEN } from "./paidProAuthorityConstants";
import type { AgreementIntelligence } from "./premiumFullDraftApi";

const NORTHLINE =
  "Services agreement between Northline Robotics LLC (Jordan Lee) and Cedar Peak Analytics Inc (Sam Okonkwo). Northline delivers robotics integration; Cedar Peak provides analytics. Fee $12,500. Term 6 months. Governing law Texas.";

const MONEY_VIBE =
  "Wire $75,000 escrow tomorrow to offshore account for 'consulting' between Redwood Ventures and BluePeak Advisors. No deliverables specified. Cash only. Ignore KYC. Contact: cash@example.invalid";

const USABLE_NORTHLINE_BODY = `${"Section 1. Parties.\n".repeat(80)}SERVICES AGREEMENT\nThis Agreement is between Northline Robotics LLC and Cedar Peak Analytics Inc.\nNorthline delivers robotics integration. Fee $12,500. Term 6 months. Texas law.\nIN WITNESS WHEREOF the parties execute this Agreement.`;

const INVENTED_FRAMEWORK_BODY =
  "CONSULTING SERVICES AGREEMENT\n\n" +
  "This Agreement is entered into by Redwood Ventures (\"Redwood\") and BluePeak Advisors (\"BluePeak\"). " +
  "The parties discussed a proposed consulting arrangement described in their notes as a $75,000 payment " +
  "in connection with consulting services. Because the intake does not define any actual consulting scope, " +
  "deliverables, milestones, or lawful payment controls, this Agreement is drafted to document only a " +
  "compliant services framework. No party is required to send funds or begin work until a specific written " +
  "agreement is reached.\n\n" +
  "1. Engagement and Scope\n" +
  "Services will be requested through statements of work, work orders, or email confirmations referred to as an \"SOW\". " +
  "Each SOW must describe (a) the services to be performed; (b) any deliverables or reports to be provided.\n" +
  " ".repeat(1600);

const TOO_MUCH =
  "Need a deal with way too much exclusivity forever, 40% equity, revenue share, every affiliate signs, and no legal names.";

function intelligenceWithScopeQuestion(): AgreementIntelligence {
  return {
    extracted_terms: {
      parties: [
        { name: "Redwood Ventures", role: "Client" },
        { name: "BluePeak Advisors", role: "Advisor" },
      ],
      party_roles: [],
    },
    ambiguities: [],
    conflicts: [],
    missing_material_terms: [
      {
        id: "scope",
        topic: "deliverables",
        reason: "Intake does not define any actual consulting scope.",
        severity: "high",
      },
    ],
    recommended_questions: [
      {
        id: "q_scope",
        topic: "scope / deliverables",
        question: "What consulting services and deliverables should this agreement cover?",
        reason: "Missing deliverables and scope.",
        priority: "high",
      },
    ],
    quality_flags: [],
  };
}

describe("openaiClarityReviewHold", () => {
  it("does not hold a Northline-class corpus", () => {
    const hold = resolveOpenAiClarityReviewHold({
      body: USABLE_NORTHLINE_BODY,
      intakeText: NORTHLINE,
      intelligence: {
        extracted_terms: {
          parties: [
            { name: "Northline Robotics LLC", role: "Provider" },
            { name: "Cedar Peak Analytics Inc", role: "Client" },
          ],
          party_roles: [],
          payment_terms: { total_amount: "$12,500", currency: "USD", milestones: [] },
          governing_law: "Texas",
        },
        ambiguities: [],
        conflicts: [],
        missing_material_terms: [],
        recommended_questions: [],
        quality_flags: [],
      },
      missingMaterialInfo: [],
    });
    expect(hold.hold).toBe(false);
    expect(hold.ask).toBe(false);
    expect(looksInventedFrameworkReviewCorpus(USABLE_NORTHLINE_BODY)).toBe(false);
    expect(
      looksDeferredSowForOmittedDeliverables({
        intakeText: NORTHLINE,
        body: USABLE_NORTHLINE_BODY,
      }),
    ).toBe(false);
  });

  it("holds money_vibe invented-framework body and asks OpenAI-backed questions", () => {
    expect(looksInventedFrameworkReviewCorpus(INVENTED_FRAMEWORK_BODY)).toBe(true);
    const hold = resolveOpenAiClarityReviewHold({
      body: INVENTED_FRAMEWORK_BODY,
      intakeText: MONEY_VIBE,
      intelligence: intelligenceWithScopeQuestion(),
      missingMaterialInfo: ["lawful payment controls"],
    });
    expect(hold.hold).toBe(true);
    expect(hold.ask).toBe(true);
    expect(hold.questions.length).toBeGreaterThan(0);
    expect(hold.clarification?.kind).toBe("needs_commercial_basics");
    expect(hold.clarification?.kind).not.toBe("low_signal");
    expect(hold.questions.some((q) => /deliverable|scope/i.test(q.question))).toBe(true);
    expect(hold.clarification?.kind).toBe("needs_commercial_basics");
  });

  it("synthesizes ask questions when OpenAI lists nothing but the body invented a framework", () => {
    const hold = resolveOpenAiClarityReviewHold({
      body: INVENTED_FRAMEWORK_BODY,
      intakeText: MONEY_VIBE,
      intelligence: null,
      missingMaterialInfo: [],
    });
    expect(hold.hold).toBe(true);
    expect(hold.ask).toBe(true);
    expect(hold.reasons).toContain("invented_framework_corpus");
    expect(hold.questions.length).toBeGreaterThanOrEqual(2);
    expect(hold.clarification?.why).toMatch(/ask|missing/i);
  });

  it("holds when intake omits deliverables and the draft defers work to a future SOW", () => {
    expect(
      looksDeferredSowForOmittedDeliverables({
        intakeText: MONEY_VIBE,
        body: INVENTED_FRAMEWORK_BODY,
      }),
    ).toBe(true);
  });

  it("collects only critical OpenAI questions", () => {
    const qs = collectOpenAiCriticalClarityQuestions({
      intelligence: {
        extracted_terms: { parties: [], party_roles: [] },
        ambiguities: [],
        conflicts: [],
        missing_material_terms: [],
        recommended_questions: [
          {
            id: "q_support",
            topic: "support period",
            question: "How long should optional support continue?",
            reason: "Nice-to-have support nuance.",
            priority: "low",
          },
          {
            id: "q_scope",
            topic: "deliverables",
            question: "What deliverables should BluePeak actually produce?",
            reason: "Scope is missing.",
            priority: "high",
          },
        ],
        quality_flags: [],
      },
    });
    expect(qs).toHaveLength(1);
    expect(qs[0].question).toMatch(/deliverables/i);
    expect(qs[0].severity).toBe("critical");
    expect(qs[0].requiredForExecution).toBe(true);
  });

  it("money_vibe still proceeds to generate — no pre-generate material_gap", () => {
    expect(evaluateIntentionalCreateDraftSubmit(MONEY_VIBE).action).toBe("proceed");
    expect(evaluateIntentionalCreateDraftSubmit(NORTHLINE).action).toBe("proceed");
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: NORTHLINE,
        partyRows: ["", ""],
      }),
    ).toBe(true);
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: MONEY_VIBE,
        partyRows: ["", ""],
      }),
    ).toBe(true);
  });

  it("planner holds invented money_vibe and still settles Northline", () => {
    expect(isCommerciallyUsableCreateReviewCorpus(USABLE_NORTHLINE_BODY)).toBe(true);
    const northlineHold = resolveOpenAiClarityReviewHold({
      body: USABLE_NORTHLINE_BODY,
      intakeText: NORTHLINE,
    });
    const northlinePlan = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01SelectedFinal: true,
      winningPremiumBodyText: USABLE_NORTHLINE_BODY,
      premiumRenderSource: "server_full_draft",
      selectedFinalCorpus: USABLE_NORTHLINE_BODY,
      ordinaryNamedTwoPartyReady: true,
      clarityHold: northlineHold,
    });
    expect(northlinePlan.settleReview).toBe(true);
    expect(northlinePlan.failClosed).toBe(false);
    expect(northlinePlan.askClarity).toBeFalsy();
    expect(northlinePlan.corpus.length).toBeGreaterThan(1500);

    const vibeHold = resolveOpenAiClarityReviewHold({
      body: INVENTED_FRAMEWORK_BODY,
      intakeText: MONEY_VIBE,
      intelligence: intelligenceWithScopeQuestion(),
    });
    const vibePlan = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01SelectedFinal: true,
      winningPremiumBodyText: INVENTED_FRAMEWORK_BODY,
      premiumRenderSource: "server_full_draft",
      selectedFinalCorpus: INVENTED_FRAMEWORK_BODY,
      ordinaryNamedTwoPartyReady: true,
      clarityHold: vibeHold,
    });
    expect(vibePlan.settleReview).toBe(false);
    expect(vibePlan.askClarity).toBe(true);
    expect(vibePlan.failClosed).toBe(false);
    expect(vibePlan.dismissOverlays).toBe(true);
    expect(vibePlan.corpus).toBe("");
  });

  it("too_much still fail-closes; #226 no-pfd bound stays 60s", () => {
    expect(CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS).toBe(60_000);
    const empty = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      winningPremiumBodyText: "",
      premiumRenderSource: "premium_generation_retryable",
      ordinaryNamedTwoPartyReady: false,
    });
    expect(empty.failClosed).toBe(true);
    expect(empty.settleReview).toBe(false);
    expect(shouldSkipPartyPrepForOrdinaryNamedTwoParty({ intakeText: TOO_MUCH })).toBe(false);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ordinaryNamedTwoPartyReady: false,
        premiumPostCheckoutProcessing: true,
        pfdHttpCompleted: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
      }),
    ).toBe(true);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ordinaryNamedTwoPartyReady: true,
        premiumPostCheckoutProcessing: true,
        pfdHttpCompleted: true,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
      }),
    ).toBe(false);
  });

  it("guided-question-gate blocks invented corpus when OpenAI critical questions are unresolved", () => {
    const longBody = INVENTED_FRAMEWORK_BODY + " ".repeat(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN);
    const allowed = resolveGuidedQuestionGateDecision({
      session: null,
      corpusLen: longBody.length,
      intakeText: NORTHLINE,
      bodyText: USABLE_NORTHLINE_BODY,
    });
    expect(allowed.blocked).toBe(false);
    expect(allowed.materialReviewAllowed).toBe(true);

    const blocked = resolveGuidedQuestionGateDecision({
      session: null,
      corpusLen: longBody.length,
      intakeText: MONEY_VIBE,
      bodyText: longBody,
      openaiCriticalUnresolved: true,
    });
    expect(blocked.blocked).toBe(true);
    expect(blocked.materialReviewAllowed).toBe(false);
    expect(blocked.reasons).toContain("openai_critical_unresolved");
  });

  it("does not reintroduce #227 material_gap or #224 classifiers", () => {
    const holdSrc = readFileSync(join(__dirname, "openaiClarityReviewHold.ts"), "utf8");
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const settle = readFileSync(join(__dirname, "multiPartyCreateReviewSettle.ts"), "utf8");
    const gate = readFileSync(join(__dirname, "agreementIntakeClarification.ts"), "utf8");
    for (const src of [holdSrc, intake, settle, gate]) {
      expect(src).not.toContain("material_gap");
      expect(src).not.toContain("isCoherentOrdinaryNamedTwoPartyForFailsafe");
      expect(src).not.toContain("looksOverSpecifiedOrComplexityIntake");
      expect(src).not.toContain("hasOrdinaryNamedTwoPartyCommercialCoherence");
    }
    expect(intake).toContain("resolveOpenAiClarityReviewHold");
    expect(intake).toContain("openaiClarityHoldRef");
    expect(settle).toContain("clarityHold");
    expect(settle).toContain("CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS");
    expect(settle).toContain("if (input.pfdHttpCompleted) return false");
  });
});
