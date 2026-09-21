import { describe, expect, it } from "vitest";
import { isAllowlistedInternalPath, resolveAuthCallbackDestination } from "../auth/safeRedirectResolver";
import { isPublicProductionHostname } from "./devPaymentBypass";
import {
  PHASE4B5_COVERAGE_AGREEMENT_ID,
  PHASE4B5_COVERAGE_RECIPIENT_TOKEN,
  assertPhase4b5AuthEntryRoutes,
  phase4b5CallbackPath,
  phase4b5SignInPath,
} from "./phase4b5AuthEntryCoverage";

describe("Phase 4B.5 authenticated customer entry coverage", () => {
  it("fails closed if sign-in/callback redirect authority is lost", () => {
    expect(() => assertPhase4b5AuthEntryRoutes()).not.toThrow();
    expect(phase4b5SignInPath()).toBe("/app/sign-in");
    expect(
      phase4b5CallbackPath({
        continuationId: "cont-1",
        code: "code-1",
        next: "/app.evil",
      }),
    ).toContain("continuation_id=cont-1");
    expect(
      isAllowlistedInternalPath(`/app/create?agreementId=${PHASE4B5_COVERAGE_AGREEMENT_ID}`),
    ).toBe(true);
    expect(isAllowlistedInternalPath(`/app/create?t=${PHASE4B5_COVERAGE_RECIPIENT_TOKEN}`)).toBe(false);
    expect(
      resolveAuthCallbackDestination({
        serverDestination: `/app/create?agreementId=${PHASE4B5_COVERAGE_AGREEMENT_ID}`,
        usedContinuation: true,
        callerNext: "/app/evil",
      }),
    ).toBe(`/app/create?agreementId=${PHASE4B5_COVERAGE_AGREEMENT_ID}`);
    expect(isPublicProductionHostname("lawdog.me")).toBe(true);
  });
});
