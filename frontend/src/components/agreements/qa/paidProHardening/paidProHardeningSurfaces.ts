import { fingerprintPaidProAgreementOperativeBody } from "../../paidProAgreementAuthorityChain";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import { getPaidProDocumentForSurface } from "../../paidProSourceOfTruth";
import type { PaidProHardeningFixtureBundle } from "./paidProHardeningFixtures";

export type PaidProHardeningSurfaceSnapshot = {
  creationDisplay: string;
  reviewPlain: string;
  copyPlain: string;
  signerSetupHandoff: string;
  hydratedFinal: string;
  acceptedDisplay: string;
  operativeFingerprints: Record<keyof Omit<PaidProHardeningSurfaceSnapshot, "operativeFingerprints">, string>;
};

export function resolvePaidProHardeningSurfaces(
  fixture: PaidProHardeningFixtureBundle,
): PaidProHardeningSurfaceSnapshot {
  const opts = { draft: fixture.draft, intakeText: fixture.intakeText };

  const creationDisplay = getPaidProDocumentForSurface("display", opts)?.text ?? "";

  const reviewPlain = resolvePaidProReviewRenderPlain(opts);
  const copyPlain = getPaidProDocumentForSurface("copy", opts)?.text ?? "";
  const signerSetupHandoff = getPaidProDocumentForSurface("signer_setup", opts)?.text ?? "";
  const hydratedFinal = reviewPlain;
  const acceptedDisplay = getPaidProDocumentForSurface("finalized", opts)?.text ?? "";

  const surfaces = {
    creationDisplay,
    reviewPlain,
    copyPlain,
    signerSetupHandoff,
    hydratedFinal,
    acceptedDisplay,
  };

  const operativeFingerprints = {
    creationDisplay: fingerprintPaidProAgreementOperativeBody(surfaces.creationDisplay),
    reviewPlain: fingerprintPaidProAgreementOperativeBody(surfaces.reviewPlain),
    copyPlain: fingerprintPaidProAgreementOperativeBody(surfaces.copyPlain),
    signerSetupHandoff: fingerprintPaidProAgreementOperativeBody(surfaces.signerSetupHandoff),
    hydratedFinal: fingerprintPaidProAgreementOperativeBody(surfaces.hydratedFinal),
    acceptedDisplay: fingerprintPaidProAgreementOperativeBody(surfaces.acceptedDisplay),
  };

  return { ...surfaces, operativeFingerprints };
}
