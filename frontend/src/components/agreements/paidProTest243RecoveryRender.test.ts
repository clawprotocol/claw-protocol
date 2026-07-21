/** @vitest-environment jsdom */
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

/** Short intake for the single pipeline-flag check — avoids TemplateA parse/polish cost. */
const TEST243_LIGHT_INTAKE = "Blue Canyon Analytics LLC and Iron Vale Systems Inc. $8,500 consulting";

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

/**
 * Test243 asserts recovery handoff / SoT / shell gates after a network failure — not the
 * deterministic recovery builder itself (covered by Test209 in the long suite). A fixed >4k
 * recovery body keeps handoff cases under the default 5s budget; one light pipeline call still
 * proves the network-failure → premium_network_local_recovery flag path.
 */
const h = vi.hoisted(() => {
  const buildFastRecoveryBody = (): string => {
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
      "By: _________________________________",
      "Name: Authorized Signer",
      "Title: Authorized Representative",
      "",
      "SERVICE PROVIDER: Iron Vale Systems Inc.",
      "By: _________________________________",
      "Name: Authorized Signer",
      "Title: Authorized Representative",
    ].join("\n");
    let body = core;
    while (body.length < 4_200) {
      body += "\n6. Additional operative clause for substance and recovery gates.";
    }
    return body;
  };
  return {
    mockResp: null as PremiumFullDraftApiResult | null,
    fastRecoveryBody: buildFastRecoveryBody(),
  };
});

vi.mock("./premiumNetworkRecoveryLocalDraft", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumNetworkRecoveryLocalDraft")>();
  return {
    ...mod,
    buildPremiumPostCheckoutLocalRecoveryProDraft: () => ({
      ok: true as const,
      body: h.fastRecoveryBody,
      reasons: ["test243_fast_recovery_fixture"],
    }),
  };
});

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

  it("network failure yields premium_network_local_recovery via completion pipeline", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST243_LIGHT_INTAKE,
      originalUserIntakeRawForMerge: TEST243_LIGHT_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test243-net-flag",
      premiumRequestIntakeFingerprint: "fp-test243-flag",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumNetworkLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE);
    expect((out.winningPremiumBodyText || "").trim().length).toBeGreaterThan(4_000);
  });

  it("premium_network_local_recovery with valid body commits SoT and yields non-empty authoritative review", () => {
    const localWinning = h.fastRecoveryBody;
    expect(localWinning.length).toBeGreaterThan(4_000);
    const premiumDraft = { ...structured, premium_full_document_text: localWinning };
    const premiumRenderSource = PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;

    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: premiumDraft,
      intakeText: TEST243_INTAKE,
      premiumRenderSource,
      reviewSessionId: "g-test243-net",
    });
    expect(commit.committed).toBe(true);
    if (!commit.committed) return;

    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: premiumDraft,
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
        draft: premiumDraft,
        intakeText: TEST243_INTAKE,
        premiumRenderSource,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockPaidProReviewShellWithoutCanonicalCorpus({
        draft: premiumDraft,
        intakeText: TEST243_INTAKE,
        premiumRenderSource,
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

  it("recovery commit blocks starter draft regeneration when latched body exists", () => {
    const localWinning = h.fastRecoveryBody;
    const premiumDraft = { ...structured, premium_full_document_text: localWinning };
    const premiumRenderSource = PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: premiumDraft,
      intakeText: TEST243_INTAKE,
      premiumRenderSource,
    });
    expect(commit.committed).toBe(true);
    persistPremiumCompletionSnapshot({
      premiumDraft,
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: commit.committed ? commit.record.text : localWinning,
      premiumReadonlyPlainText: commit.committed ? commit.record.text : localWinning,
      premiumPipelineRenderSource: premiumRenderSource,
      premiumAccepted: true,
    });
    markPaidPremiumCompletionSession();
    expect(
      shouldBlockStarterRegenerationAfterPaidAuthority({
        draft: premiumDraft,
        intakeText: TEST243_INTAKE,
        premiumRenderSource,
      }),
    ).toBe(true);
  });

  it("signer execution block invariant preserved on recovery SoT commit", () => {
    const contract = resolveAgreementIntentContract(TEST243_INTAKE);
    expect(contract.pro_strict).toBe(true);
    clearPaidProSourceOfTruth();
    const localWinning = h.fastRecoveryBody;
    const premiumDraft = { ...structured, premium_full_document_text: localWinning };
    const premiumRenderSource = PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: premiumDraft,
      intakeText: TEST243_INTAKE,
      premiumRenderSource,
    });
    expect(commit.committed).toBe(true);
    if (!commit.committed) return;
    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: premiumDraft,
      intakeText: TEST243_INTAKE,
    });
    expect(countPaidProExecutionBlocks(renderPlain)).toBe(1);
    expect(countPaidProExecutionBlocks(getPaidProSourceOfTruth()!.text)).toBe(1);
  });
});
