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
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showAccessChoiceScreen).toBe(true);
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(false);
    expect(shouldBlockAuthenticatedCreateWithoutEntitlement({
      isAuthenticated: true,
      tier: "free",
      workspaceProEntitled: false,
      isStarterAnonymousSession: false,
    })).toBe(true);
  });

  it("allows guest temporary draft when server permits can_save_guest_draft", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "unauthenticated",
      entitlement: "none",
      isStarterAnonymousSession: true,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        state: "guest",
        entitlement: "guest",
        createAllowed: true,
        canSaveGuestDraft: true,
        canCreatePersistedAgreement: false,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("guest_draft");
    expect(verdict.showUpgradeModal).toBe(false);
  });

  it("blocks authenticated none without inventing a free allowance", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        state: "none",
        entitlement: "none",
        createAllowed: false,
        canCreatePersistedAgreement: false,
        reason: "entitlement_required",
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("entitlement_required");
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showAccessChoiceScreen).toBe(true);
    expect(verdict.showRequestGenesisCta).toBe(false);
  });

  it("keeps guest draft allowed without access-choice paywall before value", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "unauthenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      commercialEntitlement: {
        state: "guest",
        entitlement: "guest",
        createAllowed: true,
        canSaveGuestDraft: true,
        canCreatePersistedAgreement: false,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("guest_draft");
    expect(verdict.showAccessChoiceScreen).toBe(false);
    expect(verdict.showUpgradeModal).toBe(false);
  });

  it("does not treat retired Genesis buyer payloads as create entitlement", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      commercialEntitlement: {
        state: "genesis",
        entitlement: "genesis_allowance",
        createAllowed: true,
        canCreatePersistedAgreement: true,
        agreementAllowance: 5,
        agreementsRemaining: 4,
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("entitlement_required");
    expect(verdict.showAccessChoiceScreen).toBe(true);
    expect(verdict.showRequestGenesisCta).toBe(false);
    expect(verdict.showUpgradeModal).toBe(false);
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

  it("allows entitled owner create only from server Pro commercial entitlement", () => {
    const withoutProbe = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "active",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
    });
    expect(withoutProbe.allowed).toBe(false);
    expect(withoutProbe.reason).toBe("entitlement_required");

    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "active",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      commercialEntitlement: {
        state: "pro",
        entitlement: "paid_pro",
        createAllowed: true,
        canCreatePersistedAgreement: true,
        agreementAllowance: 25,
        agreementsRemaining: 24,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("entitled_owner");
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(false);
  });
});
