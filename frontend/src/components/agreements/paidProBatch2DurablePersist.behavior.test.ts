/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  planPaidCreateFlowPersistFailureOutcome,
} from "./paidProCreateFlowPersistTerminal";
import {
  resolveFinalizeDurableAgreementId,
  shouldClearCreateFlowDraftPersistErrorAfterDurableId,
} from "./paidProFinalizeDurableAgreementId";
import { pickRecipientNameForHandoff } from "./reviewPlaceholderGuard";
import { shouldUsePaidCreateFlowReviewFirstPersist } from "./paidProCreateFlowReviewHandoff";
import {
  markPaidProPipelineValidationPassed,
  clearPaidProPostAcceptanceValidatorCache,
} from "./paidProPostAcceptanceValidatorCache";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

const ACCEPTED = `PROFESSIONAL SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive paid clause. ".repeat(95)}`;

describe("Batch 2 durable id + persist behavior", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
  });

  afterEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
  });

  it("reuses an existing workspace agreement id and does not ask to remint", () => {
    const resolved = resolveFinalizeDurableAgreementId({
      reviewAgreementId: "ag_existing_paid",
      resumeAgreementId: "ag_resume_other",
    });
    expect(resolved.agreementId).toBe("ag_existing_paid");
    expect(resolved.reuseExisting).toBe(true);
    expect(resolved.needsEnsure).toBe(false);
  });

  it("clears persist errors only after a durable id is bound", () => {
    expect(shouldClearCreateFlowDraftPersistErrorAfterDurableId("")).toBe(false);
    expect(shouldClearCreateFlowDraftPersistErrorAfterDurableId("ag_bound")).toBe(true);
  });

  it("intake legal names win over disposable demo seeds; real names are kept", () => {
    expect(pickRecipientNameForHandoff("ABC LLC", "Red Mesa Logistics LLC")).toBe(
      "Red Mesa Logistics LLC",
    );
    expect(pickRecipientNameForHandoff("Red Mesa Logistics LLC", "Sample Corp")).toBe(
      "Red Mesa Logistics LLC",
    );
  });

  it("accepted paid-create persist uses review-first and never treats draft_limit as success", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED);
    expect(
      shouldUsePaidCreateFlowReviewFirstPersist({
        pipelineWinningBody: ACCEPTED,
      }),
    ).toBe(true);
    const outcome = planPaidCreateFlowPersistFailureOutcome({
      httpStatus: 403,
      responseBody: { detail: { code: "draft_limit_reached" } },
    });
    expect(outcome.treatAsSuccess).toBe(false);
    expect(outcome.reason).toBe("draft_limit_reached");
  });
});
