/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  getPaidProReviewStabilitySnapshot,
  logGuidedFinalReviewRenderStable,
  logReviewPipelineTelemetryOnce,
  resetPaidProReviewStabilityForTests,
} from "./paidProReviewStability";
import { repairDuplicatedLegalEntitySuffixPhrase } from "./paidProLegalEntityNameHygiene";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resetPaidProReviewSignerMetadataSessionActiveForTests } from "./paidProReviewRenderSessionGate";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import {
  PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID,
  resetPremiumReviewScrollResetConsumedForTests,
  resetPremiumReviewScrollToTop,
} from "../../lib/premiumPostCheckoutReturnUx";
import * as agreementPreviewFromDraft from "./agreementPreviewFromDraft";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProReviewStability", () => {
  beforeEach(() => {
    resetPaidProReviewStabilityForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProReviewSignerMetadataSessionActiveForTests();
    resetPremiumReviewScrollResetConsumedForTests();
    vi.restoreAllMocks();
  });

  it("dedupes guided-final-review-render and review pipeline telemetry", () => {
    logGuidedFinalReviewRenderStable({ source: "paidProSourceOfTruth", hash: "abc", len: 5000 });
    logGuidedFinalReviewRenderStable({ source: "paidProSourceOfTruth", hash: "abc", len: 5000 });
    logReviewPipelineTelemetryOnce("review-handoff", { phase: "review" });
    logReviewPipelineTelemetryOnce("review-handoff", { phase: "review" });

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(getPaidProReviewStabilitySnapshot().renderCount).toBe(1);
  });

  it("allows payment_success scroll reset at most once even with force", async () => {
    document.body.innerHTML = "";
    const heading = document.createElement("h1");
    heading.id = PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID;
    document.body.appendChild(heading);
    window.scrollTo = vi.fn();

    resetPremiumReviewScrollResetConsumedForTests();
    resetPremiumReviewScrollToTop({ reason: "payment_success_authoritative_apply" });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });
    resetPremiumReviewScrollToTop({ reason: "payment_success_authoritative_apply", force: true });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });

    const appliedLogs = (console.info as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "[premium-review-scroll-reset]" && c[1]?.applied === true,
    );
    expect(appliedLogs).toHaveLength(1);
    expect(getPaidProReviewStabilitySnapshot().scrollResetCount).toBe(1);
  });

  it("does not invoke buildAgreementPreviewTextCore after SoT is established", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const coreSpy = vi.spyOn(agreementPreviewFromDraft, "buildAgreementPreviewTextCore");

    for (let i = 0; i < 5; i += 1) {
      buildAgreementPreviewText(fixture.draft, {
        premiumDeliverablePreview: true,
        intakeText: fixture.intakeText,
      });
    }

    expect(coreSpy).not.toHaveBeenCalled();
    expect(getPaidProReviewStabilitySnapshot().recomputeCount).toBe(0);
    coreSpy.mockRestore();
  });

  it("repeated review render resolve is stable when SoT is latched", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const h0 = hashPaidProCorpus(
      resolvePaidProReviewRenderPlain({
        draft: fixture.draft,
        intakeText: fixture.intakeText,
      }),
    );
    for (let i = 0; i < 4; i += 1) {
      const next = resolvePaidProReviewRenderPlain({
        draft: fixture.draft,
        intakeText: fixture.intakeText,
      });
      expect(hashPaidProCorpus(next)).toBe(h0);
    }
  });

  it("never produces duplicated legal entity suffix phrases", () => {
    expect(repairDuplicatedLegalEntitySuffixPhrase("Iron Vale Systems Inc. Systems")).toBe(
      "Iron Vale Systems Inc.",
    );
    expect(repairDuplicatedLegalEntitySuffixPhrase("Iron Vale Systems Inc. Systems Inc.")).toBe(
      "Iron Vale Systems Inc.",
    );
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const corrupted = fixture.rawCorpus.replace(
      PAID_PRO_HARDENING_PROVIDER,
      "Iron Vale Systems Inc. Systems",
    );
    establishPaidProSourceOfTruth({
      text: corrupted,
      intakeText: fixture.intakeText,
      source: "server_full_draft",
    });
    const corpus = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    expect(corpus).not.toMatch(/Iron Vale Systems Inc\.\s+Systems\b/i);
  });
});
