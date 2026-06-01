import { afterEach, describe, expect, it } from "vitest";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { clearConsumedPaidProSignerMetadataAuthority } from "../../paidProSignerMetadataAuthority";
import {
  clearPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "../../paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import {
  assertNoLegacyEntitySignatureTailLines,
  assertPaidProOpeningRecitalOnce,
  LEGACY_ENTITY_INLINE_SIGNATURE_RE,
} from "./paidProHardeningAssertions";
import { armPaidProHardeningSession, loadPaidProHardeningFixture } from "./paidProHardeningFixtures";

const FIXTURE_NAME = "freeProQaTemplateATest204";

describe("paidProHardening copy-path regression", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("raw fixture contains legacy entity Signature/Date tail lines (smoke repro)", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    expect(fixture.rawCorpus).toMatch(LEGACY_ENTITY_INLINE_SIGNATURE_RE);
    expect(fixture.rawCorpus).toContain("Blue Canyon Analytics LLC Signature:");
  });

  it("copy-to-clipboard text matches on-screen review plain and strips legacy signature tails", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const copyPlain = getPaidProDocumentForSurface("copy", {
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    })!.text;
    const displayPlain = getPaidProDocumentForSurface("display", {
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    })!.text;

    expect(copyPlain).toBe(reviewPlain);
    expect(displayPlain).toBe(reviewPlain);

    for (const corpus of [reviewPlain, copyPlain, displayPlain]) {
      assertPaidProOpeningRecitalOnce(corpus);
      assertNoLegacyEntitySignatureTailLines(corpus);
      expect(corpus).not.toContain("Blue Canyon Analytics LLC Signature:");
      expect(corpus).not.toContain("Iron Vale Systems Inc. Signature:");
    }
  });

  it("finalized surface matches copy plain (export-style consumer)", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const copy = getPaidProDocumentForSurface("copy", {
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    })!.text;
    const finalized = getPaidProDocumentForSurface("finalized", {
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    })!.text;
    expect(finalized).toBe(copy);
    assertNoLegacyEntitySignatureTailLines(finalized);
  });
});
