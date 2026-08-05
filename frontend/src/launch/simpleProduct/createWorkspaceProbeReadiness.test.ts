import { describe, expect, it } from "vitest";
import {
  isStaleAnonymousOrgId,
  isUserWorkspaceOrgId,
  resolveCreateWorkspaceProbeReadiness,
  shouldSuppressCreateEntitlementProbeError,
} from "./createWorkspaceProbeReadiness";

describe("createWorkspaceProbeReadiness", () => {
  it("classifies user vs anon org ids", () => {
    expect(isUserWorkspaceOrgId("user-047b01af-4a7f-464e-87df-c39e3b69f042")).toBe(true);
    expect(isUserWorkspaceOrgId("anon-8066d4a6aff6450c969ef2ee62043718")).toBe(false);
    expect(isStaleAnonymousOrgId("anon-8066d4a6aff6450c969ef2ee62043718")).toBe(true);
    expect(isStaleAnonymousOrgId("local-org")).toBe(true);
    expect(isStaleAnonymousOrgId("user-047b01af-4a7f-464e-87df-c39e3b69f042")).toBe(false);
  });

  it("defers probes after OAuth until user-* org is hydrated", () => {
    const settling = resolveCreateWorkspaceProbeReadiness({
      authLoading: false,
      isAuthenticated: true,
      orgId: "anon-8066d4a6aff6450c969ef2ee62043718",
      coldReferralRedirect: false,
      hasColdReferralInSearch: true,
    });
    expect(settling).toEqual({ ready: false, reason: "awaiting_user_org" });

    const ready = resolveCreateWorkspaceProbeReadiness({
      authLoading: false,
      isAuthenticated: true,
      orgId: "user-047b01af-4a7f-464e-87df-c39e3b69f042",
      coldReferralRedirect: false,
      hasColdReferralInSearch: true,
    });
    expect(ready).toEqual({ ready: true, reason: "authenticated_user_org" });
  });

  it("does not probe during auth loading or cold referral redirect", () => {
    expect(
      resolveCreateWorkspaceProbeReadiness({
        authLoading: true,
        isAuthenticated: false,
        orgId: "anon-1",
        coldReferralRedirect: false,
        hasColdReferralInSearch: true,
      }).ready,
    ).toBe(false);

    expect(
      resolveCreateWorkspaceProbeReadiness({
        authLoading: false,
        isAuthenticated: false,
        orgId: "anon-1",
        coldReferralRedirect: true,
        hasColdReferralInSearch: true,
      }).reason,
    ).toBe("cold_referral_redirect");
  });

  it("allows anonymous create probes only when not a cold referral auth path", () => {
    expect(
      resolveCreateWorkspaceProbeReadiness({
        authLoading: false,
        isAuthenticated: false,
        orgId: "anon-1",
        coldReferralRedirect: false,
        hasColdReferralInSearch: false,
      }),
    ).toEqual({ ready: true, reason: "anonymous_ok" });

    expect(
      resolveCreateWorkspaceProbeReadiness({
        authLoading: false,
        isAuthenticated: false,
        orgId: "anon-1",
        coldReferralRedirect: false,
        hasColdReferralInSearch: true,
      }).reason,
    ).toBe("cold_referral_auth_pending");
  });

  it("suppresses workspace-access error while probes are not ready", () => {
    expect(
      shouldSuppressCreateEntitlementProbeError({
        probeReady: false,
        showEntitlementProbeError: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressCreateEntitlementProbeError({
        probeReady: true,
        showEntitlementProbeError: true,
      }),
    ).toBe(false);
  });
});
