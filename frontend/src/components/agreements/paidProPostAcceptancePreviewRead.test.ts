/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAgreementPreviewText,
  buildStarterAgreementPreviewForReview,
} from "./agreementPreviewFromDraft";
import {
  clearAuthoritativeAgreementDocument,
  setPostAcceptanceMutationAuditCapture,
  readPostAcceptanceMutationAuditBuffer,
  clearPostAcceptanceMutationAuditBuffer,
} from "./authoritativeAgreementDocument";
import {
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { getPaidProDocumentForSurface } from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { setPostAcceptanceBuilderCallsiteLogForceForTests } from "./paidProPostAcceptancePreviewRead";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import * as agreementPreviewFromDraft from "./agreementPreviewFromDraft";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProPostAcceptancePreviewRead", () => {
  beforeEach(() => {
    setPostAcceptanceBuilderCallsiteLogForceForTests(true);
    setPostAcceptanceMutationAuditCapture(true);
    clearPostAcceptanceMutationAuditBuffer();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeAgreementDocument();
    clearPostAcceptanceMutationAuditBuffer();
    setPostAcceptanceBuilderCallsiteLogForceForTests(false);
    vi.restoreAllMocks();
  });

  it("does not log illegal-post-acceptance events when reading frozen preview (preview_starter)", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    buildAgreementPreviewText(fixture.draft, {
      starterPreview: true,
      intakeText: fixture.intakeText,
    });
    buildStarterAgreementPreviewForReview(fixture.draft, {
      intakeText: fixture.intakeText,
    });

    const illegalErrors = errSpy.mock.calls.filter((c) => c[0] === "[illegal-post-acceptance-mutation-attempt]");
    const illegalWarns = warnSpy.mock.calls.filter(
      (c) =>
        c[0] === "[illegal-post-acceptance-generation-route-fallback]" ||
        c[0] === "[illegal-post-acceptance-mutation-route-fallback]",
    );
    expect(illegalErrors).toHaveLength(0);
    expect(illegalWarns).toHaveLength(0);
    const audit = readPostAcceptanceMutationAuditBuffer();
    expect(audit.filter((e) => e.kind === "generation_route_fallback")).toHaveLength(0);
    expect(audit.filter((e) => e.kind === "mutation_route_fallback")).toHaveLength(0);

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("does not invoke buildAgreementPreviewTextCore after SoT freeze", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const coreSpy = vi.spyOn(agreementPreviewFromDraft, "buildAgreementPreviewTextCore");

    buildAgreementPreviewText(fixture.draft, { starterPreview: true, intakeText: fixture.intakeText });
    buildAgreementPreviewText(fixture.draft, {
      premiumDeliverablePreview: true,
      intakeText: fixture.intakeText,
    });

    expect(coreSpy).not.toHaveBeenCalled();
    coreSpy.mockRestore();
  });

  it("paid_pro_review and copy surfaces use the same canonical hash after freeze", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const record = getPaidProSourceOfTruthText();
    const recordHash = hashPaidProCorpus(record);
    const review = getPaidProDocumentForSurface("review", {
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    })!.text;
    const copy = getPaidProDocumentForSurface("copy", {
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    })!.text;
    expect(hashPaidProCorpus(review)).toBe(recordHash);
    expect(hashPaidProCorpus(copy)).toBe(recordHash);
    expect(review).toBe(copy);
  });

  it("review render after freeze keeps single execution block with signer metadata", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const review = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    expect(countPaidProExecutionBlocks(review)).toBe(1);
    expect(review).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(review).toMatch(/Name:\s*Ira Vale/i);
  });
});
