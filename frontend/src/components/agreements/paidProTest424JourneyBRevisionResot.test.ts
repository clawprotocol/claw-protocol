/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { TEST424_FOUR_PARTY_CONSULTING } from "./paidProTest424Fixtures";
import { buildTest423Corpus } from "./paidProTest423Fixtures";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import {
  acceptUploadedRevision,
  applyUploadedRevisionCandidate,
  createInitialReviewContinuityState,
} from "./guidedDealCompletion/guidedReviewSigningContinuity";

function buildJourneyCorpus(scenario: typeof TEST424_FOUR_PARTY_CONSULTING): string {
  return padOperativeCorpusBeforeWitness(
    buildTest423Corpus(scenario),
    Math.max(5200, scenario.expectedN * 900),
  );
}

describe("TEST424 Journey B — owner-approved revision re-SoT (4-party consulting)", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
    resetPaidProPipelineTestIsolation();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("preserves approved term revision in re-established SoT and final review corpus", () => {
    const scenario = TEST424_FOUR_PARTY_CONSULTING;
    const corpus = buildJourneyCorpus(scenario);
    const initialPrep = preparePaidProServerDocumentForAcceptance(
      corpus,
      scenario.draft,
      scenario.intakeText,
    );
    const initialAccepted = padOperativeCorpusBeforeWitness(initialPrep.text, 2000);
    establishPaidProSourceOfTruth({
      text: initialAccepted,
      source: "server_full_draft",
      draft: scenario.draft,
      intakeText: scenario.intakeText,
    });

    const initialSot = getPaidProSourceOfTruthText();
    const termMatch = initialSot.match(/\b(\d+)\s+months?\b/i);
    expect(termMatch).not.toBeNull();
    const revisedToken = `${Number(termMatch![1]) + 6} months`;
    const revisedCorpus = initialSot.replace(termMatch![0], revisedToken);
    expect(revisedCorpus).toContain(revisedToken);

    let continuity = createInitialReviewContinuityState(initialSot);
    continuity = applyUploadedRevisionCandidate(continuity, revisedCorpus);
    continuity = acceptUploadedRevision(continuity);
    expect(continuity.latestAcceptedCorpus).toContain(revisedToken);

    const rePrep = preparePaidProServerDocumentForAcceptance(
      continuity.latestAcceptedCorpus,
      scenario.draft,
      scenario.intakeText,
    );
    const reAccepted = padOperativeCorpusBeforeWitness(rePrep.text, 2000);
    expect(reAccepted).toContain(revisedToken);

    // Owner-approved re-SoT may be shorter after prepare; must opt in like production UI.
    establishPaidProSourceOfTruth({
      text: reAccepted,
      source: "server_full_draft",
      draft: scenario.draft,
      intakeText: scenario.intakeText,
      allowShorterOverwrite: true,
    });

    const reEstablishedSot = getPaidProSourceOfTruthText();
    expect(reEstablishedSot).toContain(revisedToken);

    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: reEstablishedSot,
      renderedPreviewPlain: reEstablishedSot,
      finalReviewAuthorityOnly: true,
    });
    expect(finalReview.plainText).toContain(revisedToken);
    expect(finalReview.authoritativeLen).toBeGreaterThan(3000);
  });
});
