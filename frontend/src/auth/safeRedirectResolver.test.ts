import { describe, expect, it } from "vitest";
import {
  buildSignInContinuationPath,
  extractAgreementIdFromCheckoutPath,
  isAllowlistedInternalPath,
  isSecureCheckoutPath,
  resolvePostAuthDestination,
  resolveSafeRedirectPath,
  resolveSignInContinuationDestination,
  resolveSignInContinuationOpts,
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

  it("checkout sign-in is a claim that keeps the pre-auth real agreement id", () => {
    const aid = "5e79c874-91bd-4d43-95f1-80a827e8b26a";
    const dest = `/app/checkout/${aid}?tier=pro&cadence=monthly`;
    expect(extractAgreementIdFromCheckoutPath(dest)).toBe(aid);
    expect(resolveSignInContinuationOpts(dest)).toEqual({
      returningSignIn: false,
      destinationPath: dest,
      agreementId: aid,
    });
    expect(resolveSignInContinuationOpts("/app")).toEqual({
      returningSignIn: true,
      destinationPath: "/app",
    });
    expect(
      extractAgreementIdFromCheckoutPath(
        "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly",
      ),
    ).toBeNull();
    expect(
      resolveSignInContinuationOpts(
        "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly",
      ),
    ).toEqual({
      returningSignIn: false,
      destinationPath: "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly",
    });
  });

  it("pins post-auth checkout destination to the claimed agreement id", () => {
    const claimed = "5e79c874-91bd-4d43-95f1-80a827e8b26a";
    const stale = "36568b4c-1300-4d62-97eb-826bdf2dd6c0";
    const ctx = createAuthContinuationContext({
      agreementId: claimed,
      sourcePath: `/app/checkout/${stale}`,
      destinationPath: `/app/checkout/${stale}?tier=pro&cadence=monthly`,
      workflowStage: "claim",
    });
    expect(resolvePostAuthDestination(ctx)).toBe(
      `/app/checkout/${claimed}?tier=pro&cadence=monthly`,
    );
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
