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
import { deriveIntegrityRecommendation } from "./paidProCorpusIntegrityRecommendation";
import {
  capturePaidProIntegritySurfaces,
  integritySnapshotHashes,
  metricsForIntegritySurfaces,
} from "./paidProCorpusIntegritySurfaces";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProCorpusIntegrity snapshot and verdict", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("integrity snapshot: user-visible surface hashes align; emits recommendation", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const texts = capturePaidProIntegritySurfaces(fixture);
    const hashes = integritySnapshotHashes(texts);
    const metrics = metricsForIntegritySurfaces(texts);
    const { duplicateSectionIssues, unexpectedHashDrift, informationalHashDrift } =
      compareSurfaceMetrics(metrics);

    const snapshot = {
      authoritativeHash: hashes.sourceOfTruth,
      reviewHash: hashes.reviewRenderPlain,
      copyHash: hashes.copyToClipboard,
      signerHash: hashes.signerSetupCorpus,
      hydratedHash: hashes.hydratedCorpus,
      acceptedHash: hashes.finalAcceptedCorpus,
    };

    expect(snapshot.reviewHash).toBe(snapshot.copyHash);
    expect(snapshot.signerHash).toBe(snapshot.reviewHash);

    const recommendation = deriveIntegrityRecommendation({
      duplicateSectionIssues,
      unexpectedHashDrift,
      informationalHashDrift,
      copyPathMismatch: snapshot.reviewHash !== snapshot.copyHash,
      visibleTextChangedAfterGuard: false,
      safeGuardrailEvents: 0,
      unsafeGuardrailEvents: 0,
    });

    const verdict = {
      snapshot,
      signatureBlockHeadings: Object.fromEntries(
        metrics.map((m) => [m.surface, m.signatureSections.signatureBlockHeadings]),
      ),
      completeSections: Object.fromEntries(
        metrics.map((m) => [
          m.surface,
          {
            client: m.signatureSections.clientWithBy,
            serviceProvider: m.signatureSections.serviceProviderWithBy,
          },
        ]),
      ),
      duplicateSectionIssues,
      unexpectedHashDrift,
      informationalHashDrift,
      copyPathParity: snapshot.reviewHash === snapshot.copyHash ? "PASS" : "FAIL",
      hydratedVsReview:
        snapshot.hydratedHash === snapshot.reviewHash ? "ALIGNED" : "DRIFT_RECORDED",
      recommendation,
    };

    // eslint-disable-next-line no-console
    console.info("[paid-pro-corpus-integrity-verdict]", verdict);

    expect(duplicateSectionIssues).toEqual([]);
    expect(unexpectedHashDrift).toEqual([]);
    expect(snapshot.hydratedHash).toBe(snapshot.reviewHash);
    expect(recommendation).toBe("NO ACTION REQUIRED");
  });
});
