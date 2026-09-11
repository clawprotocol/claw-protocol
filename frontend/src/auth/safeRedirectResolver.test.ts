import { describe, expect, it } from "vitest";
import {
  buildSignInContinuationPath,
  isAllowlistedInternalPath,
  isSecureCheckoutPath,
  resolveAuthCallbackDestination,
  resolvePostAuthDestination,
  resolveSafeRedirectPath,
  resolveSignInContinuationDestination,
} from "./safeRedirectResolver";
import { createAuthContinuationContext } from "./authContinuationContext";

const CHECKOUT_DEST =
  "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate";

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
    expect(isSecureCheckoutPath("/app/checkout/__claw_create_checkout__")).toBe(true);
    expect(isAllowlistedInternalPath(CHECKOUT_DEST)).toBe(true);
    expect(
      buildSignInContinuationPath(
        "/app/checkout/__claw_create_checkout__",
        "?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate",
      ),
    ).toBe(`/app/sign-in?next=${encodeURIComponent(CHECKOUT_DEST)}`);
    expect(
      resolveSignInContinuationDestination(`?next=${encodeURIComponent(CHECKOUT_DEST)}`, "/app"),
    ).toBe(CHECKOUT_DEST);
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

  it("rejects prefix tricks, encoded variants, and recipient tokens", () => {
    const rejected = [
      "/app.evil",
      "/app/evil",
      "/reviewevil",
      "/signature",
      "/review",
      "/sign",
      "/app/quick",
      "/app/admin",
      "/agreements/ag-1/sign?t=secret",
      "/app/create?t=secret-token",
      "/app/create?token=secret-token",
      "/app/esign/doc-1?vs01_recipient_sign=1&t=secret",
      "javascript:alert(1)",
      "/\\evil",
      "/%2f%2fevil.example",
      "/app/create/%2e%2e/%2e%2e/evil",
      "/app%2eevil",
      "//evil.example",
      "/app/create?next=https://evil.example",
    ];
    for (const path of rejected) {
      expect(isAllowlistedInternalPath(path), path).toBe(false);
      expect(resolveSafeRedirectPath(path, "/app"), path).toBe("/app");
    }
  });

  it("preserves valid owner workflow destinations", () => {
    const allowed = [
      "/app",
      "/app/create",
      "/app/create?agreementId=ag-1",
      "/app/settings",
      "/app/billing",
      "/app/send/ag-1",
      "/app/send/ag-1?phase=send",
      "/app/done/ag-1",
      "/app/checkout/ag-1",
      "/app?join=genesis-dogs",
      CHECKOUT_DEST,
    ];
    for (const path of allowed) {
      expect(isAllowlistedInternalPath(path), path).toBe(true);
      expect(resolveSafeRedirectPath(path, "/dashboard"), path).toBe(path);
    }
    expect(isAllowlistedInternalPath("/dashboard")).toBe(true);
    expect(resolveSafeRedirectPath("/dashboard", "/app/billing")).toBe("/app");
    expect(buildSignInContinuationPath("/dashboard", "")).toBe("/app/sign-in?next=%2Fapp");
  });

  it("lets server continuation win over a caller-supplied next", () => {
    expect(
      resolveAuthCallbackDestination({
        serverDestination: "/app/create?agreementId=ag-1",
        usedContinuation: true,
        callerNext: "/app/evil",
      }),
    ).toBe("/app/create?agreementId=ag-1");
    expect(
      resolveAuthCallbackDestination({
        serverDestination: "/app/create?agreementId=ag-1",
        usedContinuation: true,
        callerNext: "https://evil.example",
      }),
    ).toBe("/app/create?agreementId=ag-1");
    expect(
      resolveAuthCallbackDestination({
        serverDestination: "",
        usedContinuation: true,
        callerNext: "/app/billing",
      }),
    ).toBe("/app");
    expect(
      resolveAuthCallbackDestination({
        serverDestination: "",
        usedContinuation: false,
        callerNext: "/app/billing",
      }),
    ).toBe("/app/billing");
    expect(
      resolveAuthCallbackDestination({
        serverDestination: "",
        usedContinuation: false,
        callerNext: "/app.evil",
      }),
    ).toBe("/app");
  });
});

describe("safeRedirectResolver source contract", () => {
  it("exposes visible sign-in URL sanitization", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./safeRedirectResolver.ts", import.meta.url), "utf8"),
    );
    expect(src).toContain("sanitizeVisibleSignInUrl");
    expect(src).toContain("stripSensitiveAuthCallbackUrl");
    expect(src).not.toContain("ALLOWED_PREFIXES");
  });
});
