import { afterEach, describe, expect, it } from "vitest";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { clearConsumedPaidProSignerMetadataAuthority } from "../../paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "../paidProHardening/paidProHardeningFixtures";
import { compareSurfaceMetrics } from "./paidProCorpusIntegrityMetrics";
import {
  capturePaidProIntegritySurfaces,
  metricsForIntegritySurfaces,
} from "./paidProCorpusIntegritySurfaces";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProCorpusIntegrity signature block surface audit", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("emits surface comparison report with signature metrics for Blue Canyon / Iron Vale fixture", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const texts = capturePaidProIntegritySurfaces(fixture);
    const metrics = metricsForIntegritySurfaces(texts);
    const { report, duplicateSectionIssues, unexpectedHashDrift, informationalHashDrift } =
      compareSurfaceMetrics(metrics);

    // eslint-disable-next-line no-console
    console.info("[paid-pro-corpus-integrity-surface-audit]", report);

    expect(metrics.length).toBe(6);
    for (const m of metrics) {
      expect(m.signatureSections.clientWithBy).toBeLessThanOrEqual(1);
      expect(m.signatureSections.serviceProviderWithBy).toBeLessThanOrEqual(1);
      expect(m.signatureSections.legacyEntitySignatureLines).toBe(0);
    }

    const review = metrics.find((m) => m.surface === "reviewRenderPlain")!;
    const copy = metrics.find((m) => m.surface === "copyToClipboard")!;
    expect(review.lineCounts.clientHeading).toBe(copy.lineCounts.clientHeading);
    expect(review.lineCounts.serviceProviderHeading).toBe(copy.lineCounts.serviceProviderHeading);
    expect(review.signatureSections.signatureBlockHeadings).toBe(
      copy.signatureSections.signatureBlockHeadings,
    );

    expect(duplicateSectionIssues).toEqual([]);
    expect(unexpectedHashDrift).toEqual([]);
    if (informationalHashDrift.length > 0) {
      // eslint-disable-next-line no-console
      console.info("[paid-pro-corpus-integrity-informational-drift]", informationalHashDrift);
    }
  });
});
