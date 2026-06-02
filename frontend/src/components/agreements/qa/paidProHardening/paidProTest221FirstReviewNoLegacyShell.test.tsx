import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedDraftShape } from "../../intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "../../partyRoleIntake";
import { runPremiumCompletion } from "../../premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "../../premiumFullDraftApi";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "../../premiumNetworkRecoveryLocalDraft";
import { countPaidProExecutionBlocks } from "../../paidProExecutionBlockAuthority";
import { clearPaidProSourceOfTruth, hasPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import {
  freezePaidProPostCheckoutRecoveryCanonicalSnapshot,
  isPaidProFirstReviewDisplayActive,
  isPaidProPostCheckoutRecoveryReviewActive,
  meetsPaidProDegradedRecoveryDisplayRequirements,
  PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
  resolvePaidProPostCheckoutRecoveryDisplayPlain,
  shouldHideLegacyPaidProDraftPanels,
} from "../../paidProPostCheckoutRenderGate";
import {
  resolveFreeStarterReviewShellActive,
  resolveReviewShellChrome,
} from "../../freeStarterReviewShell";
import { resolveProDeliveryTrackCanonicalCorpus } from "../../paidProPostAcceptanceStateGuard";
import { fingerprintAgreementBody } from "../../guidedDealCompletion/guidedSigningPacketVersion";
import { buildFreeStarterBaselinePlain } from "../../paidProRenderSurface";
import { polishedAuthoritativeProPlainForCopy } from "../../polishProAgreementDisplayLayer";
import { resolveAuthoritativePaidProReviewPlain } from "../../authoritativePaidProReview";
import { clearPremiumGenerationCallAudit } from "../../paidProPremiumGenerationCallAudit";
import { clearFrozenCanonicalAgreementCorpus } from "../../canonicalAgreementSnapshot";
import {
  clearPaidPremiumCompletionSession,
  clearPremiumCompletionSnapshot,
  markPaidPremiumCompletionSession,
  persistPremiumCompletionSnapshot,
} from "../../premiumCompletionStorage";
import { shouldSkipAgreementDocLivePreviewSync } from "../../premiumAuthoritativeVisibleCommit";
import { SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE } from "../../../../launch/simpleProduct/simpleCreatePaidProReviewShell";
import { computeSimpleCreatePaidProReviewReady } from "../../../../launch/simpleProduct/simpleCreatePaidProReviewShell";
import { CreateUiStage } from "../../createUiStage";
import { PRO_REFINE_NEUTRAL_REVIEW_HEADING } from "../../premiumRefineAcceptance";
import { CHIP_STATE_READY } from "../../draftPreviewLabels";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const TEST221_INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest220.intake.txt"), "utf8").trim();

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

function buildTest221RejectedDegradedServerBody(targetLen: number): string {
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
  const doc = buildTest221RejectedDegradedServerBody(6_387);
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

describe("paidPro Test221 first review after degraded recovery — no legacy starter shell", () => {
  beforeEach(() => {
    clearPremiumGenerationCallAudit();
    const doc = buildTest221RejectedDegradedServerBody(6_387);
    h.mockResult.document_text = doc;
    h.mockResult.server_full_document_text = doc;
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
    clearPremiumCompletionSnapshot();
    clearPaidPremiumCompletionSession();
  });

  it("pipeline yields displayable degraded local recovery without establishing SoT", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST221_INTAKE,
      originalUserIntakeRawForMerge: TEST221_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test221",
      premiumRequestIntakeFingerprint: "fp-test221",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });

    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(4_000);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(out.winningPremiumBodyText, TEST221_INTAKE)).toBe(
      true,
    );
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBe(1);
    expect(out.winningPremiumBodyText).toMatch(/Blue Canyon Analytics LLC/i);
    expect(out.winningPremiumBodyText).toMatch(/Iron Vale Systems Inc\./i);
    expect(out.winningPremiumBodyText).toMatch(/Delaware/i);
    expect(out.winningPremiumBodyText).toMatch(/\$8[,.]?500|8500/i);
  });

  it("post-checkout recovery display blocks starter shell, legacy panels, and starter canonical hash", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST221_INTAKE,
      originalUserIntakeRawForMerge: TEST221_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test221-shell",
      premiumRequestIntakeFingerprint: "fp-test221-shell",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });

    const recoveryPlain = out.winningPremiumBodyText.trim();
    persistPremiumCompletionSnapshot({
      premiumDraft: {
        ...structured,
        premium_full_document_text: recoveryPlain,
        premium_render_source: out.premiumRenderSource,
      },
      premiumParties: structured.parties ?? [],
      recipientCandidates: [],
      premiumWinningBodyText: recoveryPlain,
      premiumReadonlyPlainText: recoveryPlain,
      premiumPipelineRenderSource: out.premiumRenderSource,
      premiumAccepted: false,
      agreementGenerationId: "g-test221-shell",
    });
    markPaidPremiumCompletionSession();

    const gateArgs = {
      draft: {
        ...out.premiumDraft,
        premium_full_document_text: recoveryPlain,
        premium_render_source: out.premiumRenderSource,
      },
      intakeText: TEST221_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
      premiumCheckoutCompleted: true,
    };

    expect(isPaidProPostCheckoutRecoveryReviewActive(gateArgs)).toBe(true);
    expect(isPaidProFirstReviewDisplayActive({ ...gateArgs, isPaidPro: false })).toBe(true);
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: true,
        paidProAuthoritative: false,
        premiumCheckoutCompleted: true,
        intakeText: TEST221_INTAKE,
        draft: out.premiumDraft,
        premiumRenderSource: out.premiumRenderSource,
      }),
    ).toBe(false);

    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: true,
      isFreeStarterReviewSurface: true,
      premiumPaidDocumentSurface: true,
      paidProAuthoritative: false,
      paidProReviewReadyBase: computeSimpleCreatePaidProReviewReady({
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        paidProAuthoritative: true,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
      }),
      guidedCompletionActive: false,
      premiumCheckoutCompleted: true,
      intakeText: TEST221_INTAKE,
      draft: out.premiumDraft,
      premiumRenderSource: out.premiumRenderSource,
    });
    expect(chrome.blockPaidProShell).toBe(false);
    expect(chrome.paidProReviewReady).toBe(true);
    expect(chrome.kind).toBe("paid_pro");
    expect(SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE).toBe("Review your Pro agreement");

    expect(
      shouldHideLegacyPaidProDraftPanels({
        premiumPaidDocumentSurface: true,
        paidProFirstReviewDisplayActive: true,
      }),
    ).toBe(true);

    expect(PRO_REFINE_NEUTRAL_REVIEW_HEADING).toMatch(/Draft ready to review/i);
    expect(CHIP_STATE_READY).toBe("Draft ready to review");

    const starterBaseline = buildFreeStarterBaselinePlain(structured);
    expect(starterBaseline.length).toBeLessThan(PAID_PRO_RECOVERY_MIN_DISPLAY_LEN);
    const starterHash = fingerprintAgreementBody(starterBaseline);

    freezePaidProPostCheckoutRecoveryCanonicalSnapshot({
      text: recoveryPlain,
      draft: out.premiumDraft,
      intakeText: TEST221_INTAKE,
      reviewSessionId: "g-test221-shell",
    });

    const delivery = resolveProDeliveryTrackCanonicalCorpus();
    expect(delivery.hasCanonicalCorpus).toBe(true);
    expect(delivery.hash).not.toBe(starterHash);
    expect(["frozen_canonical", "post_checkout_recovery_display"]).toContain(delivery.source);
    expect(recoveryPlain.length).toBeGreaterThan(4_000);

    expect(
      shouldSkipAgreementDocLivePreviewSync({
        premiumPersistedFlowActive: true,
        snapshot: {
          premiumWinningBodyText: recoveryPlain,
          premiumPipelineRenderSource: out.premiumRenderSource,
        } as import("../../premiumCompletionStorage").PremiumCompletionSnapshot,
        pipelineRenderSourceRef: out.premiumRenderSource,
        hydratedBodyTrimmed: recoveryPlain,
      }),
    ).toBe(true);

    const visiblePlain = resolveAuthoritativePaidProReviewPlain({
      draft: gateArgs.draft,
      intakeText: TEST221_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
    });
    expect(visiblePlain.length).toBeGreaterThan(4_000);
    expect(visiblePlain).toMatch(/Blue Canyon Analytics LLC/i);
    expect(visiblePlain).toMatch(/Iron Vale Systems Inc\./i);
    expect(fingerprintAgreementBody(visiblePlain)).not.toBe(starterHash);

    const copyPlain = polishedAuthoritativeProPlainForCopy(
      [
        resolvePaidProPostCheckoutRecoveryDisplayPlain({
          draft: gateArgs.draft,
          intakeText: TEST221_INTAKE,
          winningPremiumBodyText: recoveryPlain,
          premiumRenderSource: out.premiumRenderSource,
          premiumDegradedServerLocalRecovery: true,
        }),
        visiblePlain,
        starterBaseline,
      ],
      { intakeText: TEST221_INTAKE, draft: gateArgs.draft },
    );
    expect(copyPlain.length).toBeGreaterThan(4_000);
    expect(fingerprintAgreementBody(copyPlain)).not.toBe(starterHash);
    expect(copyPlain).toMatch(/Blue Canyon Analytics LLC/i);
    expect(copyPlain).toMatch(/Iron Vale Systems Inc\./i);
    expect(copyPlain.length).toBeGreaterThanOrEqual(Math.min(visiblePlain.length, recoveryPlain.length) * 0.95);
  });
});
