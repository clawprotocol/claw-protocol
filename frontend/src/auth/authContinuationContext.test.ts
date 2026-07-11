/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  clearAuthContinuationContext,
  createAuthContinuationContext,
  readAuthContinuationContext,
  writeAuthContinuationContext,
} from "./authContinuationContext";

describe("authContinuationContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips continuation context", () => {
    const ctx = createAuthContinuationContext({
      agreementId: "ag-1",
      sourcePath: "/app/create?x=1",
      destinationPath: "/app/create?x=1",
      workflowStage: "pro_review",
    });
    writeAuthContinuationContext(ctx);
    expect(readAuthContinuationContext()?.agreementId).toBe("ag-1");
    clearAuthContinuationContext();
    expect(readAuthContinuationContext()).toBeNull();
  });
});
