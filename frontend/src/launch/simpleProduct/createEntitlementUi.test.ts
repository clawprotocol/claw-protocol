import { describe, expect, it } from "vitest";
import {
  formatGenesisAllowanceStatusCopy,
  formatProAllowanceStatusCopy,
  guestMayCreateWithoutPaywall,
  resolveStableCreateIntakeMountKey,
  shouldChangeCreateIntakeMountKeyOnEntitlementTick,
  shouldGateCreateEditorUntilEntitlementReady,
  shouldHideAgreementEditor,
  shouldKeepCreateEditorMountedAcrossAuthRefresh,
  shouldReplaceCreatePageWithAuthWorkspaceSettling,
  shouldResetCommercialEntitlementReadyOnAuthRefresh,
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

  it("does not remount the editor while a homepage dump or in-flight generate is live", () => {
    expect(
      shouldKeepCreateEditorMountedAcrossAuthRefresh({
        homeHeroAutoGenerate: true,
        editorHasBeenShown: false,
        entitledRewriteInFlight: false,
      }),
    ).toBe(true);
    expect(
      shouldKeepCreateEditorMountedAcrossAuthRefresh({
        homeHeroAutoGenerate: false,
        editorHasBeenShown: true,
        entitledRewriteInFlight: false,
      }),
    ).toBe(true);
    expect(
      shouldKeepCreateEditorMountedAcrossAuthRefresh({
        homeHeroAutoGenerate: false,
        editorHasBeenShown: false,
        entitledRewriteInFlight: true,
      }),
    ).toBe(true);
    expect(
      shouldKeepCreateEditorMountedAcrossAuthRefresh({
        homeHeroAutoGenerate: false,
        editorHasBeenShown: false,
        entitledRewriteInFlight: false,
        alreadyEntitledPro: true,
      }),
    ).toBe(true);
    expect(
      shouldKeepCreateEditorMountedAcrossAuthRefresh({
        homeHeroAutoGenerate: false,
        editorHasBeenShown: false,
        entitledRewriteInFlight: false,
      }),
    ).toBe(false);
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: true,
        commercialEntitlementReady: false,
        isResumingOwnedAgreement: false,
        hasCheckoutPendingMarker: false,
        keepEditorMounted: true,
      }),
    ).toBe(false);
    expect(shouldResetCommercialEntitlementReadyOnAuthRefresh({ keepEditorMounted: true })).toBe(
      false,
    );
    expect(shouldResetCommercialEntitlementReadyOnAuthRefresh({ keepEditorMounted: false })).toBe(
      true,
    );
    expect(
      shouldReplaceCreatePageWithAuthWorkspaceSettling({
        awaitingAuthWorkspace: true,
        keepEditorMounted: true,
      }),
    ).toBe(false);
    expect(
      shouldReplaceCreatePageWithAuthWorkspaceSettling({
        awaitingAuthWorkspace: true,
        keepEditorMounted: false,
      }),
    ).toBe(true);
  });

  it("already-entitled Pro dump never hides ABI or changes its mount key on entitlement tick", () => {
    const keep = shouldKeepCreateEditorMountedAcrossAuthRefresh({
      homeHeroAutoGenerate: true,
      editorHasBeenShown: false,
      entitledRewriteInFlight: false,
      alreadyEntitledPro: true,
    });
    expect(keep).toBe(true);
    expect(
      shouldHideAgreementEditor({
        editorGatedUntilEntitlement: true,
        showAccessChoiceScreen: false,
        entitlementProbeBlocked: false,
        awaitingAuthWorkspace: true,
        keepEditorMounted: keep,
      }),
    ).toBe(false);
    expect(
      shouldHideAgreementEditor({
        editorGatedUntilEntitlement: false,
        showAccessChoiceScreen: true,
        entitlementProbeBlocked: true,
        awaitingAuthWorkspace: false,
        keepEditorMounted: keep,
      }),
    ).toBe(false);
    const beforeReady = resolveStableCreateIntakeMountKey({
      usingTemplate: false,
      pasteOnly: false,
      heroHandoff: { text: "Northline Robotics LLC services", voiceFinalize: false },
      alreadyEntitledPro: false,
      homeHeroAutoGenerate: true,
    });
    const afterReady = resolveStableCreateIntakeMountKey({
      usingTemplate: false,
      pasteOnly: false,
      heroHandoff: { text: "Northline Robotics LLC services", voiceFinalize: false },
      alreadyEntitledPro: true,
      homeHeroAutoGenerate: true,
    });
    expect(beforeReady).toBe("create-intake-stable");
    expect(afterReady).toBe(beforeReady);
    expect(
      shouldChangeCreateIntakeMountKeyOnEntitlementTick({
        previousKey: beforeReady,
        nextKey: afterReady,
        keepEditorMounted: keep,
      }),
    ).toBe(false);
    expect(
      shouldHideAgreementEditor({
        editorGatedUntilEntitlement: true,
        showAccessChoiceScreen: false,
        entitlementProbeBlocked: false,
        awaitingAuthWorkspace: false,
        keepEditorMounted: false,
      }),
    ).toBe(true);
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
});
