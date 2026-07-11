import { describe, expect, it } from "vitest";
import { isAllowlistedInternalPath, resolvePostAuthDestination, resolveSafeRedirectPath } from "./safeRedirectResolver";
import { createAuthContinuationContext } from "./authContinuationContext";

describe("safeRedirectResolver", () => {
  it("rejects external redirects", () => {
    expect(isAllowlistedInternalPath("https://evil.example")).toBe(false);
    expect(resolveSafeRedirectPath("https://evil.example", "/app")).toBe("/app");
  });

  it("allows create and checkout paths", () => {
    expect(isAllowlistedInternalPath("/app/create")).toBe(true);
    expect(isAllowlistedInternalPath("/app/checkout/abc")).toBe(true);
  });

  it("appends agreementId to create destination when present", () => {
    const ctx = createAuthContinuationContext({
      agreementId: "aid-99",
      sourcePath: "/app/create",
      destinationPath: "/app/create",
      workflowStage: "starter",
    });
    expect(resolvePostAuthDestination(ctx)).toContain("agreementId=aid-99");
  });
});
