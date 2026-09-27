/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { clearPreAuthCheckoutAgreementId } from "./preAuthCheckoutAgreement";
import {
  buildSignInContinuationPath,
  extractAgreementIdFromCheckoutPath,
  isAllowlistedInternalPath,
  isSecureCheckoutPath,
  resolveAuthCallbackDestination,
  resolvePostAuthDestination,
  resolveSafeRedirectPath,
  resolveSignInContinuationDestination,
  resolveSignInContinuationOpts,
} from "./safeRedirectResolver";
import { createAuthContinuationContext } from "./authContinuationContext";

const CHECKOUT_DEST =
  "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate";

describe("safeRedirectResolver", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearPreAuthCheckoutAgreementId();
  });

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
      destinationPath: `/app/checkout/${aid}?tier=pro&cadence=monthly`,
      agreementId: aid,
    });
  });

  it("pins a stale checkout UUID back to the pre-auth conversion id", () => {
    const claimed = "5e79c874-91bd-4d43-95f1-80a827e8b26a";
    const stale = "36568b4c-1300-4d62-97eb-826bdf2dd6c0";
    const ctx = createAuthContinuationContext({
      agreementId: claimed,
      sourcePath: `/app/checkout/${claimed}`,
      destinationPath: `/app/checkout/${stale}?tier=pro&cadence=monthly`,
      workflowStage: "claim",
    });
    expect(resolvePostAuthDestination(ctx)).toBe(
      `/app/checkout/${claimed}?tier=pro&cadence=monthly`,
    );
    const sentinelCtx = createAuthContinuationContext({
      agreementId: claimed,
      sourcePath: "/app/checkout/__claw_create_checkout__",
      destinationPath: "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly",
      workflowStage: "claim",
    });
    expect(resolvePostAuthDestination(sentinelCtx)).toBe(
      `/app/checkout/${claimed}?tier=pro&cadence=monthly`,
    );
  });

  it("pins placeholder checkout dest to active generation when pre_auth is null", () => {
    const aid = "9216ed40-eb15-4356-9ba4-a7ada836a0d6";
    sessionStorage.setItem("claw_active_agreement_generation_id_v1", aid);
    const dest = `/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
      "/app/create?restore=starterReview",
    )}`;
    const cleaned = `/app/checkout/${aid}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`;
    expect(
      buildSignInContinuationPath(
        "/app/checkout/__claw_create_checkout__",
        `?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create?restore=starterReview")}`,
      ),
    ).toBe(`/app/sign-in?next=${encodeURIComponent(cleaned)}`);
    expect(resolveSignInContinuationOpts(dest)).toEqual({
      returningSignIn: false,
      destinationPath: cleaned,
      agreementId: aid,
    });
  });

  it("pins placeholder checkout dest to session persist and drops restore decoy", () => {
    const aid = "d0e90b0c-f301-4b18-a755-dea64b4ac6cd";
    sessionStorage.setItem("claw_pre_auth_checkout_agreement_id_v1", aid);
    const dest = `/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
      "/app/create?restore=starterReview",
    )}`;
    const cleaned = `/app/checkout/${aid}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`;
    expect(
      buildSignInContinuationPath(
        "/app/checkout/__claw_create_checkout__",
        `?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create?restore=starterReview")}`,
      ),
    ).toBe(`/app/sign-in?next=${encodeURIComponent(cleaned)}`);
    expect(resolveSignInContinuationOpts(dest)).toEqual({
      returningSignIn: false,
      destinationPath: cleaned,
      agreementId: aid,
    });
  });

  it("drops restore=starterReview from checkout/OAuth dest when persist exists", () => {
    const aid = "e5a71257-87bb-47cc-aa03-63adf6b61089";
    const dest = `/app/checkout/${aid}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
      "/app/create?restore=starterReview",
    )}`;
    const cleaned = `/app/checkout/${aid}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`;
    expect(buildSignInContinuationPath(`/app/checkout/${aid}`, `?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create?restore=starterReview")}`)).toBe(
      `/app/sign-in?next=${encodeURIComponent(cleaned)}`,
    );
    expect(resolveSignInContinuationOpts(dest)).toEqual({
      returningSignIn: false,
      destinationPath: cleaned,
      agreementId: aid,
    });
    const ctx = createAuthContinuationContext({
      agreementId: aid,
      sourcePath: `/app/checkout/${aid}`,
      destinationPath: dest,
      workflowStage: "claim",
    });
    expect(resolvePostAuthDestination(ctx)).toBe(cleaned);
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
    expect(
      resolveAuthCallbackDestination({
        serverDestination: "/app/quick?start=pdf",
        usedContinuation: true,
        callerNext: "/app/quick?start=pdf&t=secret",
      }),
    ).toBe("/app/quick?start=pdf");
    expect(
      resolveAuthCallbackDestination({
        serverDestination: "",
        usedContinuation: false,
        callerNext: "/app/quick?start=pdf",
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
