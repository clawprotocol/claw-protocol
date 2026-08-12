import { describe, expect, it } from "vitest";
import {
  formatGenesisAllowanceStatusCopy,
  formatProAllowanceStatusCopy,
  guestMayCreateWithoutPaywall,
  shouldGateCreateEditorUntilEntitlementReady,
  shouldShowCreateAccessChoiceScreen,
} from "./createEntitlementUi";

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
      agreementsRemaining: 20,
      agreementAllowance: 25,
      periodEndsAt: "2026-08-15T00:00:00Z",
    });
    expect(copy).toMatch(
      /^Pro access: 20 of 25 successfully finalized premium agreements remaining this billing period\. Renews /,
    );
  });
});
