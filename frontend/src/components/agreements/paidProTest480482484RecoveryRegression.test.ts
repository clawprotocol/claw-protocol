import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import type { PremiumFullDraftApiResult } from "./premiumFullDraftApi";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import {
  hasRenderablePaidProFirstReviewCorpus,
  shouldBlockPaidProReviewShellWithoutCanonicalCorpus,
} from "./paidProPostCheckoutRenderGate";
import { shouldBlockStarterRegenerationAfterPaidAuthority } from "./paidProPostAcceptanceStateGuard";
import {
  previewPostCheckoutRecoverySotCommit,
  tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth,
} from "./paidProPostCheckoutRecoveryAuthority";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { clearPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
} from "./signerCountAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { detectProfessionalCorpusContamination } from "./paidProProfessionalCorpusContamination";
import { preparePaidProFreezeCandidateText } from "./paidProFreezeCandidate";
import {
  BLUE_HARBOR,
  CEDAR_RIDGE,
  MERIDIAN,
  NORTHSTAR,
  TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
  test468Draft,
} from "./paidProTest468Fixtures";

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

function quadRecoveryDraft(): ParsedDraftShape {
  return {
    ...test468Draft(),
    parties: [
      { name: CEDAR_RIDGE, role: "Client" } as never,
      { name: NORTHSTAR, role: "Service Provider" } as never,
      { name: BLUE_HARBOR, role: "party" } as never,
      { name: MERIDIAN, role: "party" } as never,
    ],
  };
}

describe("paidPro TEST480–485 quad-party premium network recovery", () => {
  beforeEach(() => {
    h.mockResp = {
      ok: false,
      failure_kind: "network",
      retryable: true,
      error_code: "network_changed",
      document_text: "",
      attemptCount: 2,
    };
    resetPaidProPipelineTestIsolation();
    clearPremiumCompletionSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearFrozenPremiumSessionBodiesForTests();
    clearPremiumGenerationCallAudit();
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPremiumCompletionSnapshot();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("TEST480 — premium network recovery adopts valid fallback/SoT after network failure", async () => {
    const draft = quadRecoveryDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      originalUserIntakeRawForMerge: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test480",
      premiumRequestIntakeFingerprint: "fp-test480",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });
    expect(out.premiumNetworkLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE);
    const localWinning = (out.winningPremiumBodyText || "").trim();
    expect(localWinning.length).toBeGreaterThan(4_000);

    const preview = previewPostCheckoutRecoverySotCommit({
      body: localWinning,
      draft: out.premiumDraft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
    });
    expect(preview.eligible).toBe(true);
    expect(preview.blockReason).toBe("");

    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: { ...out.premiumDraft, premium_full_document_text: localWinning },
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
      reviewSessionId: "g-test480",
    });
    expect(commit.committed).toBe(true);
    if (!commit.committed) return;
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(commit.record.text.length).toBeGreaterThanOrEqual(4_000);
    expect(getPaidProSourceOfTruth()?.hash).toBeTruthy();
  });

  it("TEST481 — recovery notice repair stays at 4 stanzas without Party placeholders or duplicate_notice_stanza", () => {
    const draft = quadRecoveryDraft();
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      recoverySurface: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);
    const body = recovery.body.trim();
    expect(body.length).toBeGreaterThan(4_000);

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: draft.parties.length,
    });
    expect(authority.count).toBe(4);

    const prep = preparePaidProFreezeCandidateText({
      text: body,
      source: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
      draft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "test481_recovery_freeze_prep",
    });
    const stanzaCount = countOperativeIfToNoticeStanzas(prep.text);
    expect(stanzaCount).toBe(4);
    expect(prep.text).not.toMatch(/If to Party 1:/i);
    expect(prep.text).not.toMatch(/If to Party 3:/i);
    expect(prep.text).toContain(CEDAR_RIDGE);
    expect(prep.text).toContain(MERIDIAN);

    const contamination = detectProfessionalCorpusContamination(prep.text, {
      partyNames: draft.parties.map((p) => String(p.name)),
      partyCount: 4,
    });
    expect(contamination.some((f) => f.code === "duplicate_notice_stanza")).toBe(false);
  });

  it("TEST482 — recovery assigns authoritative snapshot and exits processing shell block", async () => {
    const draft = quadRecoveryDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      originalUserIntakeRawForMerge: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test482",
      premiumRequestIntakeFingerprint: "fp-test482",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });
    const localWinning = (out.winningPremiumBodyText || "").trim();
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: out.premiumDraft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
    });
    expect(commit.committed).toBe(true);
    if (!commit.committed) return;

    expect(
      hasRenderablePaidProFirstReviewCorpus({
        draft: out.premiumDraft,
        intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
        premiumRenderSource: out.premiumRenderSource,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockPaidProReviewShellWithoutCanonicalCorpus({
        draft: out.premiumDraft,
        intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
        premiumRenderSource: out.premiumRenderSource,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(false);

    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: out.premiumDraft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(renderPlain.length).toBeGreaterThanOrEqual(500);
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(commit.reviewCorpusLen).toBeGreaterThanOrEqual(500);
  });

  it("TEST485 — recovery retry is idempotent when substantive SoT already exists", async () => {
    const draft = quadRecoveryDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      originalUserIntakeRawForMerge: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test485",
      premiumRequestIntakeFingerprint: "fp-test485",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });
    const localWinning = (out.winningPremiumBodyText || "").trim();
    const commit1 = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localWinning,
      draft: out.premiumDraft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
      reviewSessionId: "g-test485",
    });
    expect(commit1.committed).toBe(true);
    if (!commit1.committed) return;

    const hashBefore = commit1.record.hash;
    const textBefore = commit1.record.text;
    const stanzasBefore = countOperativeIfToNoticeStanzas(textBefore);
    const execBlocksBefore = countPaidProExecutionBlocks(textBefore);

    const alteredBody = `${localWinning}\n\n7. Retry pollution clause that must not replace authoritative corpus.`;
    const commit2 = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: alteredBody,
      draft: out.premiumDraft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: out.premiumRenderSource,
      reviewSessionId: "g-test485",
    });
    expect(commit2.committed).toBe(true);
    if (!commit2.committed) return;
    expect(commit2.record.hash).toBe(hashBefore);
    expect(getPaidProSourceOfTruth()?.hash).toBe(hashBefore);
    expect(countOperativeIfToNoticeStanzas(commit2.record.text)).toBe(stanzasBefore);
    expect(countPaidProExecutionBlocks(commit2.record.text)).toBe(execBlocksBefore);
    expect(commit2.record.text).not.toContain("Retry pollution clause");
    expect(
      shouldBlockStarterRegenerationAfterPaidAuthority({
        draft: out.premiumDraft,
        intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
        premiumRenderSource: out.premiumRenderSource,
      }),
    ).toBe(true);
    expect(
      hasRenderablePaidProFirstReviewCorpus({
        draft: out.premiumDraft,
        intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
        premiumRenderSource: out.premiumRenderSource,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(true);
  });

  it("TEST484 — enforcePaidProSingleExecutionBlock receives 4-party authority on recovery path", () => {
    const draft = quadRecoveryDraft();
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      recoverySurface: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);

    const prep = preparePaidProFreezeCandidateText({
      text: recovery.body,
      source: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
      draft,
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "test484_recovery_execution",
    });

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: draft.parties.length,
      corpusPlain: prep.text,
    });
    expect(authority.count).toBe(4);

    expect(
      consumeAuthoritativeSignerCount("enforcePaidProSingleExecutionBlock", {
        intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 2,
        corpusPlain: prep.text,
      }),
    ).toBe(4);

    const enforced = enforcePaidProSingleExecutionBlock(prep.text, {
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: draft.parties.map((p) => String(p.name)),
    });
    expect(enforced.text.length).toBeGreaterThan(4_000);
    expect(enforced.text).toContain(CEDAR_RIDGE);
    expect(enforced.text).toContain(NORTHSTAR);
    expect(enforced.text).toContain(BLUE_HARBOR);
    expect(enforced.text).toContain(MERIDIAN);
  });
});
