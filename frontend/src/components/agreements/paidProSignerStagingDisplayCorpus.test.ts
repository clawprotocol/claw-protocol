import { afterEach, describe, expect, it, vi } from "vitest";
import * as paidProOpeningRecitalGuard from "./paidProOpeningRecitalGuard";
import * as paidProReviewRenderCorpus from "./paidProReviewRenderCorpus";
import {
  clearPaidProSignerStagingDisplayCorpus,
  freezePaidProSignerStagingDisplayCorpus,
  paidProSignerStagingDisplayUsesFrozenCorpus,
  readPaidProSignerStagingDisplayCorpus,
  resolvePaidProSignerStagingDisplayPlain,
} from "./paidProSignerStagingDisplayCorpus";
import { clearPaidProSourceOfTruth, getPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "./qa/paidProHardening/paidProHardeningFixtures";

describe("paidProSignerStagingDisplayCorpus", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProSignerStagingDisplayCorpus();
    vi.restoreAllMocks();
  });

  it("returns frozen plain without recomputing while staging is active", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const hash = getPaidProSourceOfTruth()?.hash ?? "";
    freezePaidProSignerStagingDisplayCorpus(acceptedText, hash);

    const guardSpy = vi.spyOn(paidProReviewRenderCorpus, "guardPaidProReviewRenderCorpus");
    const openingSpy = vi.spyOn(paidProOpeningRecitalGuard, "ensurePaidProServicesAgreementOpening");
    const freshSpy = vi.fn(() => "SHOULD_NOT_RUN");

    const resolved = resolvePaidProSignerStagingDisplayPlain({
      stagingActive: true,
      resolveFresh: freshSpy,
    });

    expect(resolved).toBe(acceptedText);
    expect(freshSpy).not.toHaveBeenCalled();
    expect(guardSpy).not.toHaveBeenCalled();
    expect(openingSpy).not.toHaveBeenCalled();
    expect(paidProSignerStagingDisplayUsesFrozenCorpus()).toBe(true);
    expect(readPaidProSignerStagingDisplayCorpus()?.sotHash).toBe(hash);
  });
});
