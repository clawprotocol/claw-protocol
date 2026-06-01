import { afterEach, describe, expect, it } from "vitest";
import { resolvePaidProFinalHydratedCorpusForSurface } from "../../paidProFinalHydratedCorpus";
import { hashPaidProCorpus } from "../../paidProSourceOfTruth";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { clearConsumedPaidProSignerMetadataAuthority } from "../../paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth, getPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import { fingerprintPaidProAgreementOperativeBody } from "../../paidProAgreementAuthorityChain";
import { assertPaidProOperativeBodyParity } from "./paidProHardeningAssertions";
import { armPaidProHardeningSession, loadPaidProHardeningFixture } from "./paidProHardeningFixtures";
import { resolvePaidProHardeningSurfaces } from "./paidProHardeningSurfaces";

const FIXTURE_NAME = "freeProQaTemplateATest204";

describe("paidProHardening surface parity", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("creation, review, copy, signer setup, hydrated, and accepted display share identical operative body", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const surfaces = resolvePaidProHardeningSurfaces(fixture);
    assertPaidProOperativeBodyParity(surfaces.operativeFingerprints);
  });

  it("review plain and copy plain are byte-identical for clipboard path", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const { reviewPlain, copyPlain } = resolvePaidProHardeningSurfaces(fixture);
    expect(copyPlain).toBe(reviewPlain);
    expect(hashPaidProCorpus(copyPlain)).toBe(hashPaidProCorpus(reviewPlain));
  });

  it("signer setup handoff matches review operative fingerprint", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const surfaces = resolvePaidProHardeningSurfaces(fixture);
    expect(surfaces.operativeFingerprints.signerSetupHandoff).toBe(
      surfaces.operativeFingerprints.reviewPlain,
    );
  });

  it("user-facing surfaces route through resolvePaidProReviewRenderPlain (includes sanitizer + recital)", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const opts = { draft: fixture.draft, intakeText: fixture.intakeText };
    const reviewPlain = resolvePaidProHardeningSurfaces(fixture).reviewPlain;
    const hydratedResolver = resolvePaidProFinalHydratedCorpusForSurface("review", opts).text;
    expect(reviewPlain).toMatch(/collectively as the ["']Parties/i);
    expect(hydratedResolver).toMatch(/Email for Notice:\s*ivee23@me\.com/i);
    expect(fingerprintPaidProAgreementOperativeBody(hydratedResolver)).toBe(
      fingerprintPaidProAgreementOperativeBody(reviewPlain),
    );
  });

  it("SoT hash is stable while surfaces are resolved (read-only)", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const hashBefore = getPaidProSourceOfTruth()?.hash ?? "";
    resolvePaidProHardeningSurfaces(fixture);
    resolvePaidProHardeningSurfaces(fixture);
    expect(getPaidProSourceOfTruth()?.hash).toBe(hashBefore);
  });
});
