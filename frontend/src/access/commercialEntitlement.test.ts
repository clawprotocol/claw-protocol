import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agreement/agreementWorkspaceApi", () => ({
  fetchAgreementUsageSummary: vi.fn(),
}));

import { fetchAgreementUsageSummary } from "../agreement/agreementWorkspaceApi";
import {
  commercialDecisionFromUsageSummary,
  fetchCommercialEntitlement,
} from "./commercialEntitlement";
import { resolveWorkspaceCreateAccess } from "./authenticatedWorkspaceAccessPolicy";

describe("commercialEntitlement", () => {
  beforeEach(() => {
    vi.mocked(fetchAgreementUsageSummary).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps paid_pro summary to unlimited create access", () => {
    const decision = commercialDecisionFromUsageSummary({
      tier: "paid",
      agreements_created: 10,
      agreements_completed: 2,
      drafts_active: 1,
      agreements_remaining: null,
      drafts_remaining: null,
      watermark_required: false,
      storage_persistent: true,
      paywall_required: false,
      soft_throttle: false,
      commercial: {
        entitlement: "paid_pro",
        create_allowed: true,
        upgrade_required: false,
        reason: null,
        genesis_allowance: null,
      },
    });
    expect(decision.entitlement).toBe("paid_pro");
    expect(decision.createAllowed).toBe(true);
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        entitlement: decision.entitlement,
        createAllowed: decision.createAllowed,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.showUpgradeModal).toBe(false);
  });

  it("does not show Pro upgrade modal for active Genesis within allowance", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        entitlement: "genesis_allowance",
        createAllowed: true,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("genesis_allowance");
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
  });

  it("shows Genesis-specific exhausted path, not generic free upgrade modal", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      commercialEntitlement: {
        entitlement: "genesis_allowance",
        createAllowed: false,
        reason: "genesis_monthly_allowance_exhausted",
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showGenesisAllowanceExhausted).toBe(true);
    expect(verdict.reason).toBe("genesis_allowance_exhausted");
  });

  it("allows first-time free users within complimentary allowance", () => {
    const decision = commercialDecisionFromUsageSummary({
      tier: "free",
      agreements_created: 0,
      agreements_completed: 0,
      drafts_active: 0,
      agreements_remaining: 1,
      drafts_remaining: 2,
      watermark_required: true,
      storage_persistent: false,
      paywall_required: false,
      soft_throttle: false,
      commercial: {
        entitlement: "free",
        create_allowed: true,
        upgrade_required: false,
        reason: null,
        genesis_allowance: null,
        free_allowance: { limit: 1, used: 0, remaining: 1, allowed: true },
      },
    });
    expect(decision.createAllowed).toBe(true);
    expect(decision.freeAllowance?.remaining).toBe(1);

    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      commercialEntitlement: {
        entitlement: decision.entitlement,
        createAllowed: decision.createAllowed,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe("free_allowance");
    expect(verdict.showUpgradeModal).toBe(false);
  });

  it("gates free users after complimentary allowance is consumed", () => {
    const decision = commercialDecisionFromUsageSummary({
      tier: "free",
      agreements_created: 1,
      agreements_completed: 1,
      drafts_active: 0,
      agreements_remaining: 0,
      drafts_remaining: 2,
      watermark_required: true,
      storage_persistent: false,
      paywall_required: true,
      soft_throttle: false,
      commercial: {
        entitlement: "free",
        create_allowed: false,
        upgrade_required: true,
        reason: "completed_agreement_limit",
        genesis_allowance: null,
        free_allowance: { limit: 1, used: 1, remaining: 0, allowed: false },
      },
    });
    expect(decision.createAllowed).toBe(false);

    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      commercialEntitlement: {
        entitlement: "free",
        createAllowed: false,
        reason: "completed_agreement_limit",
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("free_allowance_exhausted");
    expect(verdict.showUpgradeModal).toBe(true);
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(false);
  });

  it("legacy free summary without commercial block honors agreements_remaining", () => {
    const decision = commercialDecisionFromUsageSummary({
      tier: "free",
      agreements_created: 0,
      agreements_completed: 0,
      drafts_active: 0,
      agreements_remaining: 1,
      drafts_remaining: 2,
      watermark_required: true,
      storage_persistent: false,
      paywall_required: false,
      soft_throttle: false,
    });
    expect(decision.createAllowed).toBe(true);
    expect(decision.upgradeRequired).toBe(false);
  });

  it("cached paid entitlement cannot override a server free exhausted decision", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "active",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: true,
      commercialEntitlement: {
        entitlement: "free",
        createAllowed: false,
        reason: "completed_agreement_limit",
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("free_allowance_exhausted");
    expect(verdict.showUpgradeModal).toBe(true);
    expect(verdict.showEntitlementProbeError).toBe(false);
  });

  it("server Genesis-exhausted cannot be overridden by cached paid entitlement", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "active",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: true,
      commercialEntitlement: {
        entitlement: "genesis_allowance",
        createAllowed: false,
        reason: "genesis_monthly_allowance_exhausted",
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("genesis_allowance_exhausted");
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showGenesisAllowanceExhausted).toBe(true);
  });

  it("probe error does not unlock Create and is not free-plan upgrade", async () => {
    vi.mocked(fetchAgreementUsageSummary).mockResolvedValue({
      ok: false,
      data: null,
      error: "HTTP 503",
      authFailure: false,
    });
    const decision = await fetchCommercialEntitlement();
    expect(decision.probeFailure).toBe(true);
    expect(decision.createAllowed).toBe(false);
    expect(decision.reason).toBe("probe_failed");

    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "active",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: true,
      commercialEntitlement: {
        entitlement: decision.entitlement,
        createAllowed: decision.createAllowed,
        probeFailure: true,
        reason: decision.reason,
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(true);
    expect(verdict.reason).toBe("entitlement_probe_failed");
  });

  it("auth probe failure is not free or Genesis entitlement", async () => {
    vi.mocked(fetchAgreementUsageSummary).mockResolvedValue({
      ok: false,
      data: null,
      error: "HTTP 401",
      authFailure: true,
    });
    const decision = await fetchCommercialEntitlement();
    expect(decision.authFailure).toBe(true);
    expect(decision.createAllowed).toBe(false);
    expect(decision.reason).toBe("auth_failure");

    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "active",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: true,
      commercialEntitlement: {
        entitlement: decision.entitlement,
        createAllowed: decision.createAllowed,
        authFailure: true,
        reason: decision.reason,
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showEntitlementProbeError).toBe(true);
    expect(verdict.reason).toBe("auth_probe_failed");
  });

  it("paid and active-Genesis-under-limit still unlock with stale free tier cache", () => {
    const paid = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        entitlement: "paid_pro",
        createAllowed: true,
      },
    });
    expect(paid.allowed).toBe(true);
    expect(paid.reason).toBe("entitled_owner");

    const genesis = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        entitlement: "genesis_allowance",
        createAllowed: true,
      },
    });
    expect(genesis.allowed).toBe(true);
    expect(genesis.reason).toBe("genesis_allowance");
    expect(genesis.showUpgradeModal).toBe(false);
  });
});
