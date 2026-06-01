import { applyAcceptedProCorpusSafeDisplay } from "../../acceptedProCorpusSafeDisplay";
import { resolvePaidProFinalHydratedCorpusForSurface } from "../../paidProFinalHydratedCorpus";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import {
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "../../paidProSourceOfTruth";
import type { PaidProHardeningFixtureBundle } from "../paidProHardening/paidProHardeningFixtures";
import {
  buildSurfaceMetrics,
  type PaidProSurfaceCorpusMetrics,
  type PaidProSurfaceLabel,
} from "./paidProCorpusIntegrityMetrics";

export type PaidProIntegritySurfaceTexts = Record<PaidProSurfaceLabel, string>;

export function capturePaidProIntegritySurfaces(
  fixture: PaidProHardeningFixtureBundle,
): PaidProIntegritySurfaceTexts {
  const opts = { draft: fixture.draft, intakeText: fixture.intakeText };
  return {
    sourceOfTruth: getPaidProSourceOfTruthText(),
    reviewRenderPlain: resolvePaidProReviewRenderPlain(opts),
    copyToClipboard: getPaidProDocumentForSurface("copy", opts)?.text ?? "",
    signerSetupCorpus: getPaidProDocumentForSurface("signer_setup", opts)?.text ?? "",
    hydratedCorpus: resolvePaidProFinalHydratedCorpusForSurface("review", opts).text,
    finalAcceptedCorpus: applyAcceptedProCorpusSafeDisplay(getPaidProSourceOfTruthText(), opts).text,
  };
}

export function metricsForIntegritySurfaces(
  texts: PaidProIntegritySurfaceTexts,
): PaidProSurfaceCorpusMetrics[] {
  return (Object.keys(texts) as PaidProSurfaceLabel[]).map((surface) =>
    buildSurfaceMetrics(surface, texts[surface]),
  );
}

export function integritySnapshotHashes(texts: PaidProIntegritySurfaceTexts): Record<PaidProSurfaceLabel, string> {
  const metrics = metricsForIntegritySurfaces(texts);
  return Object.fromEntries(metrics.map((m) => [m.surface, m.hash])) as Record<PaidProSurfaceLabel, string>;
}

export function sotRecord() {
  return getPaidProSourceOfTruth();
}
