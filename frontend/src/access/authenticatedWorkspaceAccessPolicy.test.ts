import { describe, expect, it } from "vitest";
import {
  resolveWorkspaceCreateAccess,
  shouldBlockAuthenticatedCreateWithoutEntitlement,
} from "./authenticatedWorkspaceAccessPolicy";

describe("authenticatedWorkspaceAccessPolicy", () => {
  it("allows anonymous starter without inventing authenticated free tier", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "unauthenticated",
      entitlement: "none",
      isStarterAnonymousSession: true,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("anonymous_starter");
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(false);
  });

  it("blocks authenticated create without entitlement when commercial probe is absent", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.showUpgradeModal).toBe(true);
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(false);
    expect(shouldBlockAuthenticatedCreateWithoutEntitlement({
      isAuthenticated: true,
      tier: "free",
      workspaceProEntitled: false,
      isStarterAnonymousSession: false,
    })).toBe(true);
  });

  it("allows authenticated free create while complimentary allowance remains", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        entitlement: "free",
        createAllowed: true,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("free_allowance");
    expect(verdict.showUpgradeModal).toBe(false);
  });

  it("blocks authenticated free create after complimentary allowance is consumed", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        entitlement: "free",
        createAllowed: false,
        reason: "completed_agreement_limit",
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("free_allowance_exhausted");
    expect(verdict.showUpgradeModal).toBe(true);
  });

  it("allows checkout-pending authenticated continuity", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: true,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("checkout_pending");
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(false);
  });

  it("allows entitled owner create", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "active",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("entitled_owner");
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(false);
  });
});
