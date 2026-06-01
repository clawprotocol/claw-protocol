import { afterEach, describe, expect, it, vi } from "vitest";
import * as paidProAgreementRecitalRepair from "./paidProAgreementRecitalRepair";
import * as paidProOpeningRecitalGuard from "./paidProOpeningRecitalGuard";
import * as paidProReviewRenderCorpus from "./paidProReviewRenderCorpus";
import { shouldDeferPaidProReviewRenderSignerRepair } from "./paidProSignerMetadataCommitPolicy";
import { clearPaidProSourceOfTruth, hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProSignerMetadataStagingPerformance", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("staging deferral is active while signer metadata session is open without snapshot", () => {
    armPaidProHardeningSession({ fixture: loadPaidProHardeningFixture(FIXTURE), withSignerMetadata: false });
    expect(
      shouldDeferPaidProReviewRenderSignerRepair({ signerMetadataSessionActive: true }),
    ).toBe(true);
    expect(
      shouldDeferPaidProReviewRenderSignerRepair({ signerMetadataSessionActive: false }),
    ).toBe(false);
  });

  it.each([
    ["signerName"],
    ["signerTitle"],
    ["signerEmail"],
    ["partyAddress"],
  ] as const)(
    "repeated resolve with deferSignerMetadataRepair (%s) does not run repair or opening guards",
    () => {
      const fixture = loadPaidProHardeningFixture(FIXTURE);
      armPaidProHardeningSession({ fixture, withSignerMetadata: false });

      const guardSpy = vi.spyOn(paidProReviewRenderCorpus, "guardPaidProReviewRenderCorpus");
      const sanitizeSpy = vi.spyOn(paidProReviewRenderCorpus, "applyPaidProReviewRenderSanitizer");
      const openingSpy = vi.spyOn(paidProOpeningRecitalGuard, "ensurePaidProServicesAgreementOpening");
      const recitalSpy = vi.spyOn(paidProAgreementRecitalRepair, "repairMalformedPaidProAgreementRecital");

      const baseline = paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
        draft: fixture.draft,
        intakeText: fixture.intakeText,
        deferSignerMetadataRepair: true,
      });
      const baselineHash = hashPaidProCorpus(baseline);

      for (let i = 0; i < 3; i += 1) {
        const next = paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
          draft: fixture.draft,
          intakeText: fixture.intakeText,
          deferSignerMetadataRepair: true,
        });
        expect(hashPaidProCorpus(next)).toBe(baselineHash);
      }

      expect(guardSpy).not.toHaveBeenCalled();
      expect(sanitizeSpy).not.toHaveBeenCalled();
      expect(openingSpy).not.toHaveBeenCalled();
      expect(recitalSpy).not.toHaveBeenCalled();

      guardSpy.mockRestore();
      sanitizeSpy.mockRestore();
      openingSpy.mockRestore();
      recitalSpy.mockRestore();
    },
  );

  it("partial address staging uses defer path without fused-party guard", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const intake = `between ${PAID_PRO_HARDENING_CLIENT} and ${PAID_PRO_HARDENING_PROVIDER}`;

    const guardSpy = vi.spyOn(paidProReviewRenderCorpus, "guardPaidProReviewRenderCorpus");

    paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: intake,
      deferSignerMetadataRepair: true,
    });
    const lasVegas = paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: intake,
      deferSignerMetadataRepair: true,
    });

    expect(lasVegas.length).toBeGreaterThan(500);
    expect(guardSpy).not.toHaveBeenCalled();
    guardSpy.mockRestore();
  });
});
