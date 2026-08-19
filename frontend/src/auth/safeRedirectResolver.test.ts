import { describe, expect, it } from "vitest";
import {
  buildSignInContinuationPath,
  isAllowlistedInternalPath,
  isSecureCheckoutPath,
  resolvePostAuthDestination,
  resolveSafeRedirectPath,
  resolveSignInContinuationDestination,
} from "./safeRedirectResolver";
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

  it("preserves complete checkout path and query through sign-in continuation", () => {
    const dest =
      "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate";
    expect(isSecureCheckoutPath("/app/checkout/__claw_create_checkout__")).toBe(true);
    expect(isAllowlistedInternalPath(dest)).toBe(true);
    expect(
      buildSignInContinuationPath(
        "/app/checkout/__claw_create_checkout__",
        "?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate",
      ),
    ).toBe(`/app/sign-in?next=${encodeURIComponent(dest)}`);
    expect(
      resolveSignInContinuationDestination(`?next=${encodeURIComponent(dest)}`, "/app"),
    ).toBe(dest);
  });

  it("rejects unsafe external next destinations after authentication", () => {
    expect(resolveSignInContinuationDestination("?next=https://evil.example", "/app")).toBe("/app");
    expect(resolveSignInContinuationDestination("?next=//evil.example", "/app")).toBe("/app");
    expect(buildSignInContinuationPath("https://evil.example", "")).toBe("/app/sign-in?next=%2Fapp");
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
