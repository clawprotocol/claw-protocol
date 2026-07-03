/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPaidCheckoutOrgId,
  readPaidCheckoutOrgId,
  writePaidCheckoutOrgId,
} from "./paidCheckoutOrgContext";
import { setOrgId } from "./orgContext";

describe("paidCheckoutOrgContext", () => {
  beforeEach(() => {
    localStorage.clear();
    setOrgId("local-org");
  });

  it("stores and reads checkout org id", () => {
    writePaidCheckoutOrgId("local-org");
    expect(readPaidCheckoutOrgId()).toBe("local-org");
    clearPaidCheckoutOrgId();
    expect(readPaidCheckoutOrgId()).toBeNull();
  });
});
