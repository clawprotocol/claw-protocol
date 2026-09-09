/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  commitAcceptedPaidProCorpusHandoffSync,
  planEnterCanonicalPaidProReviewFlow,
} from "./enterCanonicalPaidProReviewFlow";
import {
  TEST501_ACCEPTED_PAID_BODY,
  TEST501_INTAKE,
  TEST501_RECIPIENT_CANDIDATES,
  test501Draft,
} from "./paidProTest501Fixtures";
import {
  clearPaidProPipelineAcceptedCorpusHashForTests,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import {
  clearPaidProPostAcceptanceValidatorCache,
  hasPaidProPipelineValidationForCorpus,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN, resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";

const UNVALIDATED_LONG_BODY = `PROFESSIONAL SERVICES AGREEMENT. ${"Operative commercial clause. ".repeat(90)}`;

describe("unvalidated corpus fails closed", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
  });

  it("an unvalidated long pipelineWinningPlain does not render as authoritative", () => {
    expect(UNVALIDATED_LONG_BODY.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    const corpus = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      pipelineWinningPlain: UNVALIDATED_LONG_BODY,
      finalReviewAuthorityOnly: true,
    });
    expect(corpus.plainText).toBe("");
    expect(corpus.corpusBlocked).toBe(true);
    expect(
      hasPaidProPipelineValidationForCorpus({
        text: UNVALIDATED_LONG_BODY,
        source: "server_full_draft",
      }),
    ).toBe(false);
    expect(readPaidProPipelineAcceptedCorpusHash()).toBeNull();
  });

  it("returning paid review is not approved merely because no accepted hash exists", () => {
    expect(readPaidProPipelineAcceptedCorpusHash()).toBeNull();
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      respectAlreadyOpened: false,
      corpusPlain: UNVALIDATED_LONG_BODY,
      pipelineSource: "server_full_draft",
      draft: test501Draft("", UNVALIDATED_LONG_BODY),
      intakeText: TEST501_INTAKE,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
    });
    expect(plan.shouldApply).toBe(false);
    expect(plan.blockedReason).toBe("validation_not_latched_for_corpus");
    expect(readPaidProPipelineAcceptedCorpusHash()).toBeNull();
    expect(
      hasPaidProPipelineValidationForCorpus({
        text: UNVALIDATED_LONG_BODY,
        source: "server_full_draft",
      }),
    ).toBe(false);
  });

  it("commitAcceptedPaidProCorpusHandoffSync does not manufacture validation or hash", () => {
    const committed = commitAcceptedPaidProCorpusHandoffSync({
      corpusPlain: UNVALIDATED_LONG_BODY,
      pipelineSource: "server_full_draft",
    });
    expect(committed).toBe(false);
    expect(readPaidProPipelineAcceptedCorpusHash()).toBeNull();
    expect(
      hasPaidProPipelineValidationForCorpus({
        text: UNVALIDATED_LONG_BODY,
        source: "server_full_draft",
      }),
    ).toBe(false);
  });

  it("a genuinely validated corpus can hand off and enter returning review", () => {
    markPaidProPipelineValidationPassed({
      text: TEST501_ACCEPTED_PAID_BODY,
      source: "server_full_draft",
    });
    const committed = commitAcceptedPaidProCorpusHandoffSync({
      corpusPlain: TEST501_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      agreementId: "ag_test501_validated_handoff",
      organizationId: "org_test501_validated_handoff",
    });
    expect(committed).toBe(true);
    expect(readPaidProPipelineAcceptedCorpusHash()).not.toBeNull();
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      respectAlreadyOpened: false,
      corpusPlain: TEST501_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft: test501Draft("", TEST501_ACCEPTED_PAID_BODY),
      intakeText: TEST501_INTAKE,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
    });
    expect(plan.shouldApply).toBe(true);
    const corpus = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      pipelineWinningPlain: TEST501_ACCEPTED_PAID_BODY,
      finalReviewAuthorityOnly: true,
    });
    expect(corpus.plainText.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(corpus.corpusBlocked).toBeFalsy();
  });
});
