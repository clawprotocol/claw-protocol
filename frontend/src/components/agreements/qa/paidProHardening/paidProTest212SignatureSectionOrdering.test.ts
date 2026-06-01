import { afterEach, describe, expect, it } from "vitest";
import { guardPaidProReviewRenderCorpus } from "../../paidProReviewRenderCorpus";
import { buildTest204SignerAuthority } from "./paidProHardeningFixtures";
import { countPaidProExecutionBlocks } from "../../paidProExecutionBlockAuthority";
import {
  assertPaidProSignatureSectionOrderingInvariant,
  lastNumberedSectionHeadingIndex,
  numberedSectionHeadingsAfterSignatures,
} from "../../paidProSignatureSectionOrdering";
import { polishProAgreementDisplayLayer } from "../../polishProAgreementDisplayLayer";
import { clearPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "./paidProHardeningFixtures";

const FIXTURE = "freeProQaTemplateATest212";

describe("paidProHardening test212 signature section ordering", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("raw fixture fails ordering invariant; repaired review corpus passes", () => {
    const bundle = loadPaidProHardeningFixture(FIXTURE);
    expect(numberedSectionHeadingsAfterSignatures(bundle.rawCorpus).length).toBeGreaterThan(0);

    const polished = polishProAgreementDisplayLayer(bundle.rawCorpus, {
      intakeText: bundle.intakeText,
      draft: bundle.draft,
    });
    assertPaidProSignatureSectionOrderingInvariant(polished.text);

    const sigIdx = polished.text.search(/^\s*SIGNATURES\s*$/im);
    const witnessIdx = polished.text.search(/\bIN WITNESS WHEREOF\b/i);
    expect(sigIdx).toBeGreaterThan(lastNumberedSectionHeadingIndex(polished.text));
    expect(witnessIdx).toBeGreaterThan(sigIdx);
    expect(polished.text).not.toMatch(/(?:Inc|LLC|Ltd)\.\./i);
    expect(countPaidProExecutionBlocks(polished.text)).toBe(1);
  });

  it("hardening session review render keeps single execution block and signature order", () => {
    const bundle = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture: bundle, withSignerMetadata: false });
    const authority = buildTest204SignerAuthority();
    const review = guardPaidProReviewRenderCorpus(acceptedText, authority.parties);
    assertPaidProSignatureSectionOrderingInvariant(review.text);
    expect(countPaidProExecutionBlocks(review.text)).toBe(1);
  });
});
