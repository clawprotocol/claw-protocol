import { describe, expect, it } from "vitest";
import type { CommercialEntitlementDecision } from "../../access/commercialEntitlement";
import { decideQuickPdfAccess } from "./quickIntakeAccess";

function ent(partial: Partial<CommercialEntitlementDecision>): CommercialEntitlementDecision {
  return {
    state: "none",
    grantSource: "none",
    agreementAllowance: null,
    agreementsUsed: 0,
    agreementsRemaining: null,
    periodEndsAt: null,
    canCreatePersistedAgreement: false,
    canSaveGuestDraft: false,
    entitlement: "none",
    createAllowed: false,
    upgradeRequired: true,
    reason: null,
    genesisAllowance: null,
    proAllowance: null,
    freeAllowance: null,
    authFailure: false,
    probeFailure: false,
    tier: null,
    raw: null,
    ...partial,
  };
}

describe("decideQuickPdfAccess", () => {
  it("does not treat a missing React tier as paid or free authority", () => {
    const signedOut = decideQuickPdfAccess({
      authLoading: false,
      authResolved: true,
      isAuthenticated: false,
      entitlement: ent({ state: "pro", entitlement: "paid_pro", canCreatePersistedAgreement: true, tier: "paid" }),
      entitlementSettled: true,
      staleLoadingTooLong: false,
    });
    expect(signedOut.kind).toBe("signed_out");
    expect(signedOut.canUpload).toBe(false);

    const staleClientPaid = decideQuickPdfAccess({
      authLoading: false,
      authResolved: true,
      isAuthenticated: true,
      entitlement: ent({ state: "guest", entitlement: "guest", upgradeRequired: true, tier: "paid" }),
      entitlementSettled: true,
      staleLoadingTooLong: false,
    });
    expect(staleClientPaid.canUpload).toBe(false);
    expect(staleClientPaid.kind).toBe("upgrade_required");

    const staleClientFree = decideQuickPdfAccess({
      authLoading: false,
      authResolved: true,
      isAuthenticated: true,
      entitlement: ent({
        state: "pro",
        entitlement: "paid_pro",
        canCreatePersistedAgreement: true,
        upgradeRequired: false,
        tier: "free",
      }),
      entitlementSettled: true,
      staleLoadingTooLong: false,
    });
    expect(staleClientFree).toEqual({ kind: "paid", canUpload: true });
  });

  it("fails closed for auth, probe, and expired paid allowance", () => {
    expect(
      decideQuickPdfAccess({
        authLoading: false,
        authResolved: true,
        isAuthenticated: true,
        entitlement: ent({ authFailure: true }),
        entitlementSettled: true,
        staleLoadingTooLong: false,
      }).kind,
    ).toBe("auth_failure");
    expect(
      decideQuickPdfAccess({
        authLoading: false,
        authResolved: true,
        isAuthenticated: true,
        entitlement: ent({ probeFailure: true }),
        entitlementSettled: true,
        staleLoadingTooLong: false,
      }).kind,
    ).toBe("probe_failure");
    expect(
      decideQuickPdfAccess({
        authLoading: false,
        authResolved: true,
        isAuthenticated: true,
        entitlement: ent({
          state: "pro",
          entitlement: "paid_pro",
          canCreatePersistedAgreement: true,
          proAllowance: {
            active: true,
            limit: 10,
            used: 10,
            remaining: 0,
            period_start: "",
            period_end: "",
            allowed: false,
          },
        }),
        entitlementSettled: true,
        staleLoadingTooLong: false,
      }).kind,
    ).toBe("expired");
  });
});
