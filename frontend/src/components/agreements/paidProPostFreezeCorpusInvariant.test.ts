/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import {
  buildPremiumAgreementReadonlyHtml,
  stripCorpusSignatureRegionForExternalSignerUi,
} from "./premiumAgreementDocumentHtml";
import {
  assertPostFreezeRenderedCorpusMatchesFrozen,
  classifyPostFreezeCorpusMutation,
  clearPostFreezeCorpusBoundaryTimelineForTests,
  computeByteLevelCorpusDiff,
  formatByteLevelCorpusDiffReport,
  isSignatureRegionOnlyCorpusShrink,
  readPostFreezeCorpusBoundaryTimeline,
  shouldSkipPostFreezeDriftForReadonlyHtmlStrip,
} from "./paidProPostFreezeCorpusInvariant";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { logPostFreezeCorpusDrift } from "./paidProExecutionBlockInstrumentation";
import { polishProAgreementDisplayLayer, sanitizeProReviewDisplayText } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countWitnessExecutionSections } from "./paidProSignerSigningCorpusHygiene";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProPostFreezeCorpusInvariant", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPostFreezeCorpusBoundaryTimelineForTests();
  });

  it("computeByteLevelCorpusDiff prints literal removed/inserted bytes", () => {
    const before = "Alpha LLC\n\n10. Final.\n\nIN WITNESS WHEREOF.\n\nCLIENT:\nAlpha LLC\n";
    const after = "Alpha LLC\n\n10. Final.\n\nIN WITNESS WHEREOF.\n\nCLIENT:\nAlpha LLC\n\n";
    const diff = computeByteLevelCorpusDiff(before, after);
    expect(diff.identical).toBe(false);
    const report = formatByteLevelCorpusDiffReport(diff);
    expect(report).toMatch(/Inserted:/);
    expect(diff.segments.some((s) => s.kind === "insert")).toBe(true);
  });

  it("establish SoT hash matches frozen snapshot and post-freeze review render plain", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const record = getPaidProSourceOfTruth()!;
    const frozen = getFrozenCanonicalAgreementCorpus();
    expect(frozen?.hash).toBe(record.hash);
    expect(record.text).toBe(frozen?.canonicalText);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    expect(hashPaidProCorpus(reviewPlain)).toBe(record.hash);
    expect(countWitnessExecutionSections(reviewPlain)).toBe(1);
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);

    logPostFreezeCorpusDrift({ surface: "test_review", renderedText: reviewPlain, frozenHash: record.hash });
    const timeline = readPostFreezeCorpusBoundaryTimeline();
    expect(timeline.some((t) => t.surface === "test_review" && t.identicalToFrozen)).toBe(true);
  });

  it("polish and sanitize passthrough do not mutate frozen plain", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const sot = getPaidProSourceOfTruth()!.text;
    const polished = polishProAgreementDisplayLayer(sot, { reviewDisplayMode: true });
    const sanitized = sanitizeProReviewDisplayText(sot, { source: "test" });
    expect(polished.text).toBe(sot.trim());
    expect(sanitized.text).toBe(sot.trim());
    expect(hashPaidProCorpus(polished.text)).toBe(getPaidProSourceOfTruth()!.hash);
  });

  it("classifies establish reconcile and readonly signature strip drift surfaces", () => {
    expect(
      classifyPostFreezeCorpusMutation({
        mutationSource: "canonical_establish_reconcile",
        before: "a",
        after: "b",
      }),
    ).toBe("canonical_refreeze");
    expect(
      classifyPostFreezeCorpusMutation({
        mutationSource: "readonly_display_strip",
        before: "a",
        after: "b",
      }),
    ).toBe("display_html");

    const body = "Alpha LLC\n\n10. Final terms.\n\n";
    const witness = "IN WITNESS WHEREOF, the parties execute.\n\nCLIENT:\nAlpha LLC\n";
    const before = body + witness;
    const after = body;
    expect(isSignatureRegionOnlyCorpusShrink(before, after)).toBe(true);
    expect(
      classifyPostFreezeCorpusMutation({
        mutationSource: "unknown",
        before,
        after,
      }),
    ).toBe("display_html");

    expect(shouldSkipPostFreezeDriftForReadonlyHtmlStrip("premium_agreement_readonly_html")).toBe(
      true,
    );
    expect(
      shouldSkipPostFreezeDriftForReadonlyHtmlStrip("buildPremiumAgreementReadonlyHtml:test"),
    ).toBe(false);
    expect(
      shouldSkipPostFreezeDriftForReadonlyHtmlStrip(
        "buildPremiumAgreementReadonlyHtml:premium_agreement_readonly_html",
      ),
    ).toBe(true);
  });

  it("does not record post-freeze drift for readonly display signature strip", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const plain = getPaidProSourceOfTruth()!.text;
    const stripped = stripCorpusSignatureRegionForExternalSignerUi(plain);
    expect(stripped.length).toBeLessThan(plain.length);

    assertPostFreezeRenderedCorpusMatchesFrozen({
      surface: "premium_agreement_readonly_html",
      renderedText: stripped,
      mutationSource: "readonly_display_strip",
    });

    clearPostFreezeCorpusBoundaryTimelineForTests();
    logPostFreezeCorpusDrift({
      surface: "premium_agreement_readonly_html",
      renderedText: stripped,
      mutationSource: "readonly_display_strip",
    });
    expect(readPostFreezeCorpusBoundaryTimeline().some((t) => t.surface === "premium_agreement_readonly_html")).toBe(
      false,
    );

    const sanitized = sanitizeProReviewDisplayText(stripped, {
      source: "premium_agreement_readonly_html",
    });
    expect(sanitized.text).toBe(stripped.trim());
    expect(hashPaidProCorpus(sanitized.text)).not.toBe(getPaidProSourceOfTruth()!.hash);
  });

  it("establish reconcile uses canonical-establish-reconcile log, not illegal drift", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const illegalDrift = infoSpy.mock.calls.filter(
      (c) =>
        c[0] === "[post-freeze-corpus-drift]" &&
        (c[1] as { surface?: string })?.surface === "paid_pro_source_of_truth_establish" &&
        (c[1] as { identical?: boolean })?.identical === false,
    );
    expect(illegalDrift).toHaveLength(0);
    infoSpy.mockRestore();
  });

  it("canonical establish reconcile byte diff report is literal", () => {
    const pre = "HEAD\n\nIN WITNESS WHEREOF\n\nTAIL";
    const post = "HEAD\n\n";
    const diff = computeByteLevelCorpusDiff(pre, post);
    const report = formatByteLevelCorpusDiffReport(diff);
    expect(report).toMatch(/firstChangeOffset/);
    expect(report).toMatch(/Removed:/);
    expect(
      classifyPostFreezeCorpusMutation({
        mutationSource: "canonical_establish_reconcile",
        before: pre,
        after: post,
      }),
    ).toBe("canonical_refreeze");
  });

  it("readonly HTML input plain matches SoT hash (HTML itself differs)", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const plain = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      surface: "test_readonly",
      signatureSectionMode: "execution",
      partyNames: fixture.draft.parties?.map((p) => p.name) ?? [],
      suppressDocumentIntelligenceCallouts: true,
    });
    expect(html.length).toBeGreaterThan(plain.length);
    expect(hashPaidProCorpus(plain)).toBe(getPaidProSourceOfTruth()!.hash);
  });

  it("throws in test when illegal post-freeze opening mutation is attempted", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const frozen = getPaidProSourceOfTruth()!.text;
    expect(() =>
      assertPostFreezeRenderedCorpusMatchesFrozen({
        surface: "test_illegal",
        renderedText: `${frozen}\n\n9. Injected clause after freeze.`,
      }),
    ).toThrow(/paid-pro-post-freeze-corpus-violation/);
  });
});
