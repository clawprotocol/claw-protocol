import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftApiResult } from "./premiumFullDraftApi";
import { PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveGuidedFinalReviewAuthoritativeBody } from "./guidedDealCompletion/guidedFinalReviewAuthoritativeBody";
import {
  clearPremiumCompletionSnapshot,
  markPaidPremiumCompletionSession,
  persistPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import { clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  hasRenderablePaidProFirstReviewCorpus,
  isPaidProPostCheckoutRecoveryReviewActive,
  resolvePaidProPostCheckoutRecoveryDisplayPlain,
  shouldBlockPaidProReviewShellWithoutCanonicalCorpus,
} from "./paidProPostCheckoutRenderGate";
import { tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth } from "./paidProPostCheckoutRecoveryAuthority";
import { shouldBlockStarterRegenerationAfterPaidAuthority } from "./paidProPostAcceptanceStateGuard";
import {
  evaluatePremiumAdvisorySkipAfterAuthoritativeAccept,
  shouldSkipPremiumAdvisoryAfterAuthoritativeAccept,
} from "./premiumAdvisorySkipAfterAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "qa/paidProHardening/fixtures");
const TEST243_INTAKE = readFileSync(
  join(FIXTURE_DIR, "freeProQaTemplateATest220.intake.txt"),
  "utf8",
).trim();

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

const h = vi.hoisted(() => ({
  mockResp: null as PremiumFullDraftApiResult | null,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      h.mockResp
        ? Promise.resolve(h.mockResp)
        : Promise.resolve({
            ok: false as const,
            failure_kind: "network" as const,
            retryable: true,
            error_code: "network_changed" as const,
            document_text: "" as const,
            attemptCount: 2,
          }),
  };
});

describe("paidPro Test243 post-checkout recovery render handoff", () => {
  beforeEach(() => {
    h.mockResp = {
      ok: false,
      failure_kind: "network",
      retryable: true,
      error_code: "network_changed",
      document_text: "",
      attemptCount: 2,
    };
    clearPaidProSourceOfTruth();
    clearPremiumCompletionSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearPremiumGenerationCallAudit();
    clearFrozenPremiumSessionBodiesForTests();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumCompletionSnapshot();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("premium_network_local_recovery with valid body commits SoT and yields non-empty authoritative review", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST243_INTAKE,
      originalUserIntakeRawForMerge: TEST243_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test243-net",
      premiumRequestIntakeFingerprint: "fp-test243",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumNetworkLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE);
    const localWinning = (out.winningPremiumBodyText || "").trim();
    expect(localWinning.length).toBeGreaterThan(4_000);

    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: { ...out.premiumDraft, premium_full_document_text: localWinning },
      intakeText: TEST243_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
      reviewSessionId: "g-test243-net",
    });
    expect(commit.committed).toBe(true);
    if (!commit.committed) return;

    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: out.premiumDraft,
      intakeText: TEST243_INTAKE,
    });
    expect(renderPlain.length).toBeGreaterThanOrEqual(500);

    const guided = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [
        { source: "last_known_good_authoritative", body: localWinning },
        { source: "server_full_document_text", body: localWinning },
      ],
      signingCorpusReady: false,
    });
    expect(guided.source).not.toBe("none");
    expect(guided.len).toBeGreaterThanOrEqual(500);

    expect(
      hasRenderablePaidProFirstReviewCorpus({
        draft: out.premiumDraft,
        intakeText: TEST243_INTAKE,
        premiumRenderSource: out.premiumRenderSource,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockPaidProReviewShellWithoutCanonicalCorpus({
        draft: out.premiumDraft,
        intakeText: TEST243_INTAKE,
        premiumRenderSource: out.premiumRenderSource,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(false);
  });

  it("invalid/empty recovery body does not qualify for paid first-review shell", () => {
    markPaidPremiumCompletionSession();
    persistPremiumCompletionSnapshot({
      premiumDraft: structured,
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: "",
      premiumReadonlyPlainText: "",
      premiumPipelineRenderSource: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
      premiumAccepted: false,
    });
    expect(
      isPaidProPostCheckoutRecoveryReviewActive({
        draft: structured,
        intakeText: TEST243_INTAKE,
        premiumRenderSource: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockPaidProReviewShellWithoutCanonicalCorpus({
        draft: structured,
        intakeText: TEST243_INTAKE,
        premiumRenderSource: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(true);
    expect(tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: "",
      draft: structured,
      intakeText: TEST243_INTAKE,
      premiumRenderSource: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    }).committed).toBe(false);
  });

  it("blocks paid review shell when checkout latched without SoT or recovery plain", () => {
    markPaidPremiumCompletionSession();
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(
      shouldBlockPaidProReviewShellWithoutCanonicalCorpus({
        draft: structured,
        intakeText: TEST243_INTAKE,
        premiumRenderSource: "premium_network_retryable",
        premiumCheckoutCompleted: true,
      }),
    ).toBe(true);
    expect(
      resolvePaidProPostCheckoutRecoveryDisplayPlain({
        draft: structured,
        intakeText: TEST243_INTAKE,
        premiumRenderSource: "premium_network_retryable",
        winningPremiumBodyText: "short",
      }).length,
    ).toBe(0);
  });

  it("server_full_draft acceptance path unchanged (SoT + render + advisory skip)", () => {
    const intake = TEST243_INTAKE;
    const core = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      "Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).",
      "Delaware law. Fixed fee $8,500.",
      "",
      "1. Scope. AI workflow implementation.",
      "2. Payment. $8,500 upon execution.",
      "3. IP. Work product vests in Client after payment.",
      "4. Confidentiality. Mutual obligations apply.",
      "5. Term. Twelve months unless terminated.",
      "",
      "IN WITNESS WHEREOF",
      "CLIENT: Blue Canyon Analytics LLC",
      "SERVICE PROVIDER: Iron Vale Systems Inc.",
    ].join("\n");
    let body = core;
    while (body.length < 6_500) {
      body += "\n6. Additional operative clause for substance and acceptance gates.";
    }
    const record = establishPaidProSourceOfTruth({
      text: body,
      source: "server_full_draft",
      draft: structured,
      intakeText: intake,
    });
    expect(record.hash).toBeTruthy();
    expect(isAuthoritativePremiumPipelineRenderSource("server_full_draft")).toBe(true);
    const render = resolvePaidProReviewRenderPlain({ draft: structured, intakeText: intake });
    expect(render.length).toBeGreaterThanOrEqual(500);
    expect(hashPaidProCorpus(render)).toBe(record.hash);
    expect(shouldSkipPremiumAdvisoryAfterAuthoritativeAccept()).toBe(true);
    expect(evaluatePremiumAdvisorySkipAfterAuthoritativeAccept().skip).toBe(true);
  });

  it("recovery commit blocks starter draft regeneration when latched body exists", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST243_INTAKE,
      originalUserIntakeRawForMerge: TEST243_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test243-block-starter",
      premiumRequestIntakeFingerprint: "fp-test243b",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(
      out.premiumNetworkLocalRecovery ||
        out.premiumRenderSource === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    ).toBe(true);
    const localWinning = (out.winningPremiumBodyText || "").trim();
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: out.premiumDraft,
      intakeText: TEST243_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
    });
    expect(commit.committed).toBe(true);
    persistPremiumCompletionSnapshot({
      premiumDraft: out.premiumDraft,
      premiumParties: out.premiumParties,
      recipientCandidates: out.recipientCandidates,
      premiumWinningBodyText: commit.committed ? commit.record.text : localWinning,
      premiumReadonlyPlainText: commit.committed ? commit.record.text : localWinning,
      premiumPipelineRenderSource: out.premiumRenderSource,
      premiumAccepted: true,
    });
    markPaidPremiumCompletionSession();
    expect(
      shouldBlockStarterRegenerationAfterPaidAuthority({
        draft: out.premiumDraft,
        intakeText: TEST243_INTAKE,
        premiumRenderSource: out.premiumRenderSource,
      }),
    ).toBe(true);
  });

  it("signer execution block invariant preserved on recovery SoT commit", async () => {
    const contract = resolveAgreementIntentContract(TEST243_INTAKE);
    expect(contract.pro_strict).toBe(true);
    clearPaidProSourceOfTruth();
    const out = await runPremiumCompletion({
      intakeText: TEST243_INTAKE,
      originalUserIntakeRawForMerge: TEST243_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test243-signer",
      premiumRequestIntakeFingerprint: "fp-test243s",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(
      out.premiumNetworkLocalRecovery ||
        out.premiumRenderSource === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    ).toBe(true);
    const localWinning = (out.winningPremiumBodyText || "").trim();
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: out.premiumDraft,
      intakeText: TEST243_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
    });
    expect(commit.committed).toBe(true);
    if (!commit.committed) return;
    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: out.premiumDraft,
      intakeText: TEST243_INTAKE,
    });
    expect(countPaidProExecutionBlocks(renderPlain)).toBe(1);
    expect(countPaidProExecutionBlocks(getPaidProSourceOfTruth()!.text)).toBe(1);
  });
});
