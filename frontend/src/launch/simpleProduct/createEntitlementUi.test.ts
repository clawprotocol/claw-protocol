import { describe, expect, it } from "vitest";
import {
  formatGenesisAllowanceStatusCopy,
  formatProAllowanceStatusCopy,
  guestMayCreateWithoutPaywall,
  shouldGateCreateEditorUntilEntitlementReady,
  shouldShowCreateAccessChoiceScreen,
} from "./createEntitlementUi";
import { resolveWorkspaceCreateAccess } from "../../access/authenticatedWorkspaceAccessPolicy";

describe("createEntitlementUi", () => {
  it("gates the editor for authenticated users until entitlement is ready (no flash)", () => {
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: true,
        commercialEntitlementReady: false,
        isResumingOwnedAgreement: false,
        hasCheckoutPendingMarker: false,
      }),
    ).toBe(true);
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: true,
        commercialEntitlementReady: true,
        isResumingOwnedAgreement: false,
        hasCheckoutPendingMarker: false,
      }),
    ).toBe(false);
  });

  it("does not gate guests or resume/checkout continuity", () => {
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: false,
        commercialEntitlementReady: false,
        isResumingOwnedAgreement: false,
        hasCheckoutPendingMarker: false,
      }),
    ).toBe(false);
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: true,
        commercialEntitlementReady: false,
        isResumingOwnedAgreement: true,
        hasCheckoutPendingMarker: false,
      }),
    ).toBe(false);
  });

  it("shows access-choice for unentitled signed-in users", () => {
    expect(
      shouldShowCreateAccessChoiceScreen({
        allowed: false,
        showAccessChoiceScreen: true,
      }),
    ).toBe(true);
    expect(
      shouldShowCreateAccessChoiceScreen({
        allowed: true,
        showAccessChoiceScreen: false,
      }),
    ).toBe(false);
  });

  it("allows guest draft before conversion (value before paywall)", () => {
    expect(
      guestMayCreateWithoutPaywall({
        commercialEntitlementReady: true,
        state: "guest",
        canSaveGuestDraft: true,
      }),
    ).toBe(true);
    expect(
      guestMayCreateWithoutPaywall({
        commercialEntitlementReady: true,
        state: "guest",
        canSaveGuestDraft: false,
      }),
    ).toBe(false);
  });

  it("does not render Genesis buyer allowance copy (affiliate-only contract)", () => {
    // Genesis is an affiliate/partner status, never a buyer drafting entitlement.
    const copy = formatGenesisAllowanceStatusCopy({
      agreementsRemaining: 3,
      agreementAllowance: 5,
      periodEndsAt: "2026-07-31T23:59:59Z",
    });
    expect(copy).toBeNull();
  });

  it("formats Pro allowance and renewal from server fields", () => {
    const copy = formatProAllowanceStatusCopy({
      agreementsRemaining: 7,
      agreementAllowance: 10,
      periodEndsAt: "2026-08-15T00:00:00Z",
    });
    expect(copy).toMatch(
      /^Pro access: 7 of 10 successfully finalized premium agreements remaining this month\. Resets /,
    );
  });

  it("does not show access choice screen when Pro user has create_allowed (backend says allowed)", () => {
    // This test covers the reported bug: Pro user (Anthem Blanchard) sees paywall
    // even when backend returns allowed:true. The fix ensures that when
    // commercialEntitlement has state=pro and createAllowed=true, the frontend
    // correctly interprets this as allowed and does NOT show the paywall.
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        state: "pro",
        entitlement: "paid_pro",
        createAllowed: true,
        canCreatePersistedAgreement: true,
        agreementAllowance: 10,
        agreementsRemaining: 8,
        periodEndsAt: "2026-09-01T00:00:00Z",
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("entitled_owner");
    expect(shouldShowCreateAccessChoiceScreen(verdict)).toBe(false);
  });

  it("allows create when only createAllowed is set (canCreatePersistedAgreement undefined)", () => {
    // Backend might return only create_allowed without explicit can_create_persisted_agreement
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      commercialEntitlement: {
        state: "pro",
        entitlement: "paid_pro",
        createAllowed: true,
        agreementAllowance: 10,
        agreementsRemaining: 5,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("entitled_owner");
    expect(shouldShowCreateAccessChoiceScreen(verdict)).toBe(false);
  });
});
