/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPaidCheckoutOrgId,
  readPaidCheckoutOrgId,
  resolveEntitlementRepairOrgCandidates,
  writePaidCheckoutOrgId,
} from "./paidCheckoutOrgContext";
import { setOrgId } from "./orgContext";
import { markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";

describe("paidCheckoutOrgContext", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setOrgId("local-org");
  });

  it("stores and reads checkout org id", () => {
    writePaidCheckoutOrgId("local-org");
    expect(readPaidCheckoutOrgId()).toBe("local-org");
    clearPaidCheckoutOrgId();
    expect(readPaidCheckoutOrgId()).toBeNull();
  });

  it("includes paid session local-org repair candidate", () => {
    setOrgId("user-bound-489");
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    expect(resolveEntitlementRepairOrgCandidates()).toEqual(["local-org"]);
  });
});
