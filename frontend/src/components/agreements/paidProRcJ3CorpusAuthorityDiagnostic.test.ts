/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  SHARED_ACCEPTED_PAID_BODY,
  SHARED_TWO_PARTY_INTAKE,
  FROZEN_TWO_PARTY_PROFESSIONAL_V1_HASH,
  buildTwoPartyProfessionalServicesDraft,
} from "./paidProSharedFixtureSystem";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hashPaidProCorpus,
  getPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";

describe("RC J3 corpus authority diagnostic", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("traces raw mock vs safe-display vs SoT vs review-render hashes for shared two-party fixture", () => {
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    const draft = buildTwoPartyProfessionalServicesDraft();
    const safe = applyAcceptedProCorpusSafeDisplay(SHARED_ACCEPTED_PAID_BODY, {
      draft,
      intakeText: SHARED_TWO_PARTY_INTAKE,
    });
    establishPaidProSourceOfTruth({
      text: safe.text,
      source: "server_full_draft",
      draft,
      intakeText: SHARED_TWO_PARTY_INTAKE,
    });
    const sot = getPaidProSourceOfTruth();
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: SHARED_TWO_PARTY_INTAKE });
    const result = {
      rawLen: SHARED_ACCEPTED_PAID_BODY.length,
      rawHash: hashPaidProCorpus(SHARED_ACCEPTED_PAID_BODY),
      frozenHash: FROZEN_TWO_PARTY_PROFESSIONAL_V1_HASH,
      safeLen: safe.text.length,
      safeHash: hashPaidProCorpus(safe.text),
      sotLen: sot?.text.length ?? 0,
      sotHash: sot?.hash ?? "",
      reviewLen: reviewPlain.length,
      reviewHash: hashPaidProCorpus(reviewPlain),
    };
    // eslint-disable-next-line no-console
    console.log("[rc-j3-corpus-authority]", JSON.stringify(result));
    expect(result.rawHash).toBe(FROZEN_TWO_PARTY_PROFESSIONAL_V1_HASH);
    expect(result.sotHash).toBe(result.reviewHash);
  });
});
