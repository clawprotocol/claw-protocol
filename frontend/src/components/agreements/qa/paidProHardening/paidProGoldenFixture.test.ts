import { afterEach, describe, expect, it } from "vitest";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { clearConsumedPaidProSignerMetadataAuthority } from "../../paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import {
  assertNoLegacyEntitySignatureTailLines,
  assertNoQaIntelligenceCalloutsInLegalCorpus,
  assertPaidProOpeningRecitalOnce,
  assertPaidProOperativeBodyParity,
  assertSectionNumberingIntactAfterRecitalRepair,
  assertSignatureNameFieldsExcludeLegalEntities,
} from "./paidProHardeningAssertions";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./paidProHardeningFixtures";
import {
  applyPaidProReviewRenderSanitizer,
  resolvePartiesForReviewRender,
} from "../../paidProReviewRenderCorpus";
import { resolvePaidProHardeningSurfaces } from "./paidProHardeningSurfaces";

const FIXTURE_NAME = "freeProQaTemplateATest204";

describe("paidProHardening golden fixture (freeProQaTemplateATest204)", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("acceptance safe-display repairs malformed test204 corpus before SoT establish", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    expect(fixture.rawCorpus).toMatch(/Effective Date This Agreement is between/i);
    expect(fixture.rawCorpus).toMatch(/Professional services shape/i);

    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    assertPaidProOpeningRecitalOnce(acceptedText);
    assertNoLegacyEntitySignatureTailLines(acceptedText);
    assertNoQaIntelligenceCalloutsInLegalCorpus(acceptedText);
    assertSectionNumberingIntactAfterRecitalRepair(acceptedText);

    const parties = resolvePartiesForReviewRender({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const preSignerReview = applyPaidProReviewRenderSanitizer(acceptedText, parties).text;
    assertSignatureNameFieldsExcludeLegalEntities(preSignerReview, [
      PAID_PRO_HARDENING_CLIENT,
      PAID_PRO_HARDENING_PROVIDER,
    ]);
  });

  it("hydrated session surfaces share operative legal body and recital invariants", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const surfaces = resolvePaidProHardeningSurfaces(fixture);

    assertPaidProOperativeBodyParity(surfaces.operativeFingerprints);

    for (const corpus of [
      surfaces.creationDisplay,
      surfaces.reviewPlain,
      surfaces.copyPlain,
      surfaces.signerSetupHandoff,
      surfaces.hydratedFinal,
      surfaces.acceptedDisplay,
    ]) {
      assertPaidProOpeningRecitalOnce(corpus);
      assertNoLegacyEntitySignatureTailLines(corpus);
      assertNoQaIntelligenceCalloutsInLegalCorpus(corpus);
      assertSectionNumberingIntactAfterRecitalRepair(corpus);
    }

    expect(surfaces.hydratedFinal).toMatch(/Email for Notice:\s*ivee23@me\.com/i);
    expect(surfaces.hydratedFinal).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(surfaces.hydratedFinal).toMatch(/Name:\s*Ira Vale/i);
  });
});
