/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  commitValidatedPaidProRewriteCorpusHandoff,
  planEnterCanonicalPaidProReviewFlow,
  planFinalizeCanonicalPaidProPipelineSuccess,
} from "./enterCanonicalPaidProReviewFlow";
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
import {
  TEST501_ACCEPTED_PAID_BODY,
  TEST501_INTAKE,
  TEST501_RECIPIENT_CANDIDATES,
  test501Draft,
} from "./paidProTest501Fixtures";

const UNVALIDATED = `PROFESSIONAL SERVICES AGREEMENT. ${"Operative commercial clause. ".repeat(90)}`;

describe("Batch 2 rewrite corpus handoff behavior", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
  });

  afterEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
  });

  it("does not commit an unvalidated rewrite corpus", () => {
    expect(
      commitValidatedPaidProRewriteCorpusHandoff({
        corpusPlain: UNVALIDATED,
        pipelineSource: "server_full_draft",
      }),
    ).toBe(false);
    expect(readPaidProPipelineAcceptedCorpusHash()).toBeNull();
    expect(
      hasPaidProPipelineValidationForCorpus({
        text: UNVALIDATED,
        source: "server_full_draft",
      }),
    ).toBe(false);
  });

  it("commits a genuinely validated corpus before canonical review entry", () => {
    markPaidProPipelineValidationPassed({
      text: TEST501_ACCEPTED_PAID_BODY,
      source: "server_full_draft",
    });
    expect(
      commitValidatedPaidProRewriteCorpusHandoff({
        corpusPlain: TEST501_ACCEPTED_PAID_BODY,
        pipelineSource: "server_full_draft",
        agreementId: "ag_batch2_rewrite_handoff",
        organizationId: "org_batch2_rewrite_handoff",
      }),
    ).toBe(true);
    expect(readPaidProPipelineAcceptedCorpusHash()).not.toBeNull();
    const draft = test501Draft("", TEST501_ACCEPTED_PAID_BODY);
    const first = planFinalizeCanonicalPaidProPipelineSuccess({
      source: "post_checkout_apply_success",
      corpusPlain: TEST501_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST501_INTAKE,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
      winningBody: TEST501_ACCEPTED_PAID_BODY,
    });
    const returning = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      corpusPlain: TEST501_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST501_INTAKE,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
    });
    expect(first.canEnterCanonicalReview).toBe(true);
    expect(returning.shouldApply).toBe(true);
  });
});
