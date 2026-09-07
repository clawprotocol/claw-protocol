/** @vitest-environment jsdom */
/**
 * Entitled named-2p pfd 200 + usable corpus must mount Review even when
 * snapshot prepare / canonical SoT fail-open or shorter-than-accepted churn.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENTITLED_REWRITE_FAIL_OPEN_REVIEW_LATCH_HELPER,
  ENTITLED_REWRITE_FAIL_OPEN_REVIEW_MOUNT_HELPER,
  latchEntitledRewriteFailOpenReviewAuthority,
  planEntitledRewriteFailOpenReviewMount,
  remapEntitledRewriteFailOpenPipelineSource,
} from "./entitledRewriteFailOpenReviewMount";
import { isCommerciallyUsableCreateReviewCorpus } from "./multiPartyCreateReviewSettle";
import { hasCanonicalReviewCorpusForRender } from "./paidProDocumentBodyRouter";
import { clearPaidProPipelineAcceptedCorpusHashForTests } from "./paidProPipelineAcceptedCorpus";
import {
  clearPaidProReviewSessionAuthorityForTests,
  hasPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import { clearPaidProSourceOfTruth, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";

const NORTHLINE_SERVICES = [
  "SERVICES AGREEMENT",
  "",
  "This Agreement is between Northline Robotics LLC (Jordan Lee) and Cedar Peak Analytics Inc (Sam Okonkwo).",
  "Northline delivers robotics integration; Cedar Peak provides analytics.",
  "Fee $12,500. Term 6 months. Governing law Texas.",
  `${"The parties agree to the commercial terms set out in this Agreement. ".repeat(40)}`,
].join("\n").trim();

const USABLE_WITNESS = `${"Section 1. Parties.\n".repeat(80)}IN WITNESS WHEREOF the parties execute this Agreement.`;

describe("entitled rewrite fail-open Review mount after pfd 200", () => {
  beforeEach(() => {
    clearPaidProReviewSessionAuthorityForTests();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidProSourceOfTruth();
  });

  afterEach(() => {
    clearPaidProReviewSessionAuthorityForTests();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidProSourceOfTruth();
  });

  it("Northline-class body is commercially usable without IN WITNESS", () => {
    expect(isCommerciallyUsableCreateReviewCorpus(NORTHLINE_SERVICES)).toBe(true);
    expect(NORTHLINE_SERVICES.length).toBeGreaterThan(1500);
  });

  it("fail-open + SoT failed + shorter-than-accepted still paints Review and never quality-retries", () => {
    const plan = planEntitledRewriteFailOpenReviewMount({
      commerciallyUsableCorpus: NORTHLINE_SERVICES,
      winningPremiumBodyText: NORTHLINE_SERVICES,
      premiumRenderSource: "server_full_draft",
      snapshotPrepareFailed: true,
      canonicalBlocked: true,
      sotEstablishFailed: true,
      shorterThanAcceptedChurn: true,
    });
    expect(plan.paintReview).toBe(true);
    expect(plan.corpus).toBe(NORTHLINE_SERVICES);
    expect(plan.qualityRetry).toBe(false);
    expect(plan.clearDocument).toBe(false);
    expect(plan.latchRenderAuthority).toBe(true);
    expect(plan.trySotAfterPaint).toBe(true);
    expect(plan.displayPhase).toBe("review");
  });

  it("blank/hollow after usable pfd body is impossible — remount last usable on churn", () => {
    const plan = planEntitledRewriteFailOpenReviewMount({
      winningPremiumBodyText: "",
      premiumRenderSource: "rejected_paid_corpus",
      lastCommerciallyUsableCandidate: NORTHLINE_SERVICES,
      snapshotPrepareFailed: true,
      canonicalBlocked: true,
      sotEstablishFailed: true,
      shorterThanAcceptedChurn: true,
    });
    expect(plan.paintReview).toBe(true);
    expect(plan.corpus).toBe(NORTHLINE_SERVICES);
    expect(plan.qualityRetry).toBe(false);
    expect(plan.clearDocument).toBe(false);
  });

  it("does not invent a Review mount for empty / too_much-class bodies", () => {
    const empty = planEntitledRewriteFailOpenReviewMount({
      winningPremiumBodyText: "",
      premiumRenderSource: "premium_generation_retryable",
      snapshotPrepareFailed: true,
      canonicalBlocked: true,
      sotEstablishFailed: true,
      shorterThanAcceptedChurn: true,
    });
    expect(empty.paintReview).toBe(false);
    expect(empty.corpus).toBe("");
    expect(empty.latchRenderAuthority).toBe(false);
  });

  it("latches session/pipeline authority so Review force-renders without SoT", () => {
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasCanonicalReviewCorpusForRender()).toBe(false);
    const latched = latchEntitledRewriteFailOpenReviewAuthority({
      corpusPlain: NORTHLINE_SERVICES,
      pipelineSource: "premium_generation_retryable",
      reviewSessionId: "gen-northline-fail-open",
    });
    expect(latched.latched).toBe(true);
    expect(latched.corpus).toBe(NORTHLINE_SERVICES);
    expect(latched.hasRenderAuthority).toBe(true);
    expect(hasPaidProReviewSessionAuthority()).toBe(true);
    expect(hasCanonicalReviewCorpusForRender()).toBe(true);
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(remapEntitledRewriteFailOpenPipelineSource("rejected_paid_corpus")).toBe(
      "server_full_draft_degraded",
    );
  });

  it("witness-style usable corpus also latches render authority", () => {
    const latched = latchEntitledRewriteFailOpenReviewAuthority({
      corpusPlain: USABLE_WITNESS,
      pipelineSource: "server_full_draft",
    });
    expect(latched.hasRenderAuthority).toBe(true);
    expect(hasCanonicalReviewCorpusForRender()).toBe(true);
  });

  it("intake paints + latches before SoT and never quality-retries on fail-open SoT throw", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain(ENTITLED_REWRITE_FAIL_OPEN_REVIEW_MOUNT_HELPER);
    expect(intake).toContain(ENTITLED_REWRITE_FAIL_OPEN_REVIEW_LATCH_HELPER);
    expect(intake).toContain("entitled_rewrite_canonical_blocked_fail_open_mount");
    expect(intake).toContain("entitled_rewrite_canonical_fail_open_sot_failed");
    expect(intake).toContain("entitled_rewrite_snapshot_prepare_failed_fail_open");

    const earlySettleIdx = intake.indexOf(
      "if (entitledPaidShellPlan.settleReview && entitledPaidShellPlan.corpus)",
    );
    const earlySettleBlock = intake.slice(earlySettleIdx, earlySettleIdx + 1800);
    expect(earlySettleBlock).toContain("latchEntitledRewriteFailOpenReviewAuthority");
    expect(earlySettleBlock).toContain("setAgreementDocumentText(entitledPaidShellPlan.corpus)");

    const snapIdx = intake.indexOf("entitled_rewrite_snapshot_prepare_failed_fail_open");
    const snapBlock = intake.slice(snapIdx, snapIdx + 900);
    expect(snapBlock).toContain("latchEntitledRewriteFailOpenReviewAuthority");
    expect(snapBlock).toContain("setAgreementDocumentText");

    const failOpenIdx = intake.indexOf("const failOpenPlan = planEntitledRewriteFailOpenReviewMount(");
    const paintIdx = intake.indexOf("setAgreementDocumentText(canonicalSalvage)");
    const latchIdx = intake.indexOf("corpusPlain: canonicalSalvage");
    const sotIdx = intake.indexOf("text: canonicalSalvage");
    const sotFailIdx = intake.indexOf("entitled_rewrite_canonical_fail_open_sot_failed");
    expect(failOpenIdx).toBeGreaterThan(-1);
    expect(paintIdx).toBeGreaterThan(failOpenIdx);
    expect(latchIdx).toBeGreaterThan(paintIdx);
    expect(sotIdx).toBeGreaterThan(latchIdx);
    expect(sotFailIdx).toBeGreaterThan(sotIdx);
    const sotFailBlock = intake.slice(sotFailIdx, sotFailIdx + 400);
    expect(sotFailBlock).not.toContain("setProFullDraftQualityRetry(true)");
    expect(sotFailBlock).not.toContain("Your Pro agreement is still preparing");
    expect(intake.slice(failOpenIdx, sotFailIdx + 200)).toContain(
      "planEntitledRewriteFailOpenReviewMount",
    );
  });
});
