import { afterEach, describe, expect, it } from "vitest";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { clearConsumedPaidProSignerMetadataAuthority } from "../../paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import { getPaidProDocumentForSurface } from "../../paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "../paidProHardening/paidProHardeningFixtures";
import {
  analyzeCompleteSignatureSections,
  diffNormalizedCorpora,
  normalizeCorpusForCopyCompare,
} from "./paidProCorpusIntegrityMetrics";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProCorpusIntegrity copy-path forensics", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("review render plain equals copy-to-clipboard after whitespace normalization", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const opts = { draft: fixture.draft, intakeText: fixture.intakeText };

    const reviewPlain = resolvePaidProReviewRenderPlain(opts);
    const copyPlain = getPaidProDocumentForSurface("copy", opts)!.text;
    const displayPlain = getPaidProDocumentForSurface("display", opts)!.text;

    const diff = diffNormalizedCorpora(reviewPlain, copyPlain);
    if (diff) {
      // eslint-disable-next-line no-console
      console.error("[paid-pro-copy-path-diff]", diff);
    }
    expect(diff).toBeNull();
    expect(normalizeCorpusForCopyCompare(copyPlain)).toBe(normalizeCorpusForCopyCompare(reviewPlain));
    expect(normalizeCorpusForCopyCompare(displayPlain)).toBe(normalizeCorpusForCopyCompare(reviewPlain));

    const sig = analyzeCompleteSignatureSections(copyPlain);
    expect(sig.legacyEntitySignatureLines).toBe(0);
    expect(copyPlain).not.toMatch(/(?:LLC|Inc\.?)\s+Signature:\s*_{1,}\s*Date:\s*_{1,}/i);
    expect(sig.witnessBlocks).toBeLessThanOrEqual(1);
    expect(sig.clientWithBy).toBeLessThanOrEqual(1);
    expect(sig.serviceProviderWithBy).toBeLessThanOrEqual(1);

    const witnessCount = (copyPlain.match(/\bIN WITNESS WHEREOF\b/gi) || []).length;
    expect(witnessCount).toBeLessThanOrEqual(1);
  });
});
