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

  it("maps pro summary to persisted create access from server fields", () => {
    const decision = commercialDecisionFromUsageSummary({
      tier: "paid",
      state: "pro",
      grant_source: "stripe",
      agreement_allowance: 10,
      agreements_used: 10,
      agreements_remaining: 15,
      period_ends_at: "2026-08-01T00:00:00Z",
      can_create_persisted_agreement: true,
      can_save_guest_draft: false,
      agreements_created: 10,
      agreements_completed: 2,
      drafts_active: 1,
      drafts_remaining: 15,
      watermark_required: false,
      storage_persistent: true,
      paywall_required: false,
      soft_throttle: false,
      commercial: {
        state: "pro",
        grant_source: "stripe",
        agreement_allowance: 10,
        agreements_used: 10,
        agreements_remaining: 15,
        period_ends_at: "2026-08-01T00:00:00Z",
        can_create_persisted_agreement: true,
        can_save_guest_draft: false,
        entitlement: "paid_pro",
        create_allowed: true,
        upgrade_required: false,
        reason: null,
        genesis_allowance: null,
      },
    });
    expect(decision.state).toBe("pro");
    expect(decision.grantSource).toBe("stripe");
    expect(decision.agreementAllowance).toBe(10);
    expect(decision.canCreatePersistedAgreement).toBe(true);
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        state: decision.state,
        entitlement: decision.entitlement,
        createAllowed: decision.createAllowed,
        canCreatePersistedAgreement: decision.canCreatePersistedAgreement,
      },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.showUpgradeModal).toBe(false);
  });

  it("does not grant create from retired Genesis buyer payloads", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      workspaceProEntitledProbe: false,
      commercialEntitlement: {
        state: "genesis",
        entitlement: "genesis_allowance",
        createAllowed: true,
        canCreatePersistedAgreement: true,
        agreementAllowance: 5,
        agreementsRemaining: 3,
        periodEndsAt: "2026-07-31T23:59:59Z",
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("entitlement_required");
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showRequestGenesisCta).toBe(false);
    expect(verdict.showAccessChoiceScreen).toBe(true);
  });

  it("maps exhausted Genesis buyer payloads to Pro access choice, not Genesis CTA", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
      commercialEntitlement: {
        state: "genesis",
        entitlement: "genesis_allowance",
        createAllowed: false,
        canCreatePersistedAgreement: false,
        reason: "genesis_monthly_allowance_exhausted",
        periodEndsAt: "2026-07-31T23:59:59Z",
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showGenesisAllowanceExhausted).toBe(false);
    expect(verdict.showRequestGenesisCta).toBe(false);
    expect(verdict.reason).toBe("entitlement_required");
  });

  it("allows guest temporary draft from server can_save_guest_draft", () => {
    const decision = commercialDecisionFromUsageSummary({
      tier: "guest",
      state: "guest",
      grant_source: "none",
      agreement_allowance: 1,
      agreements_used: 0,
      agreements_remaining: 1,
      can_create_persisted_agreement: false,
      can_save_guest_draft: true,
      agreements_created: 0,
      agreements_completed: 0,
      drafts_active: 0,
      drafts_remaining: 1,
      watermark_required: true,
      storage_persistent: false,
      paywall_required: false,
      soft_throttle: false,
      commercial: {
        state: "guest",
        grant_source: "none",
        agreement_allowance: 1,
        agreements_used: 0,
        agreements_remaining: 1,
        can_create_persisted_agreement: false,
        can_save_guest_draft: true,
        entitlement: "guest",
        create_allowed: true,
        upgrade_required: false,
        reason: null,
      },
    });
    expect(decision.state).toBe("guest");
    expect(decision.canSaveGuestDraft).toBe(true);
    expect(decision.canCreatePersistedAgreement).toBe(false);
  });

  it("blocks authenticated none without inventing a free allowance", () => {
    const verdict = resolveWorkspaceCreateAccess({
      authentication: "authenticated",
      entitlement: "none",
      isStarterAnonymousSession: false,
      isResumingOwnedAgreement: false,
      hasCheckoutPendingMarker: false,
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
    expect(verdict.showRequestGenesisCta).toBe(false);
    expect(verdict.showUpgradeModal).toBe(false);
    expect(verdict.showAccessChoiceScreen).toBe(true);
  });

  it("surfaces auth probe failures without mapping to guest", async () => {
    vi.mocked(fetchAgreementUsageSummary).mockResolvedValue({
      ok: false,
      data: null,
      error: "HTTP 401",
      authFailure: true,
    });
    const decision = await fetchCommercialEntitlement();
    expect(decision.authFailure).toBe(true);
    expect(decision.state).toBe("none");
    expect(decision.createAllowed).toBe(false);
  });
});
