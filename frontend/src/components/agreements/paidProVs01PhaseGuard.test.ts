import { describe, expect, it } from "vitest";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import {
  resolvePaidProVs01CheckPhase,
  shouldRunPaidProVs01CorpusChecks,
} from "./paidProVs01PhaseGuard";

describe("paidProVs01PhaseGuard", () => {
  it("does not run VS01 corpus checks during premium wait or first review", () => {
    expect(shouldRunPaidProVs01CorpusChecks("premium_wait")).toBe(false);
    expect(shouldRunPaidProVs01CorpusChecks("paid_pro_first_review")).toBe(false);
    expect(shouldRunPaidProVs01CorpusChecks("starter_preview")).toBe(false);
    expect(shouldRunPaidProVs01CorpusChecks("signature_preparation")).toBe(true);
    expect(shouldRunPaidProVs01CorpusChecks("signer_ready")).toBe(true);
  });

  it("resolveFinalVs01CorpusOrBlock defers during premium in progress (no signing corpus)", () => {
    const res = resolveFinalVs01CorpusOrBlock({
      guidedPro: true,
      premiumInProgress: true,
      premiumComplete: false,
      agreementCorpusText: "x".repeat(5000),
    });
    expect(res.blockReason).toMatch(/^vs01_checks_deferred:premium_wait/);
    expect(res.corpus).toBe("");
    expect(res.len).toBe(0);
  });

  it("classifies premium in progress as premium_wait phase", () => {
    expect(
      resolvePaidProVs01CheckPhase({
        premiumCorpusInProgress: true,
        paidProAuthoritative: true,
      }),
    ).toBe("premium_wait");
  });
});
