/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearCurrentSessionProEntitlementMarkers,
  evaluatePaidProSourceOfTruthEstablishment,
  hasCurrentSessionFreeStarterIntent,
  hasCurrentSessionProEntitlement,
  markCurrentSessionFreeStarterIntent,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

const PRO_BODY = `Consulting agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"x".repeat(700)}`;

describe("paidProSessionEligibility", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProSourceOfTruth();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
  });

  it("free starter latch blocks SoT establishment", () => {
    markCurrentSessionFreeStarterIntent();
    expect(hasCurrentSessionFreeStarterIntent()).toBe(true);
    expect(() =>
      establishPaidProSourceOfTruth({ text: PRO_BODY, source: "server_full_draft" }),
    ).toThrow(/establishment-suppressed/);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("pro intent + entitlement allows SoT establishment", () => {
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    expect(hasCurrentSessionProEntitlement()).toBe(true);
    establishPaidProSourceOfTruth({ text: PRO_BODY, source: "server_full_draft" });
    expect(hasPaidProSourceOfTruth()).toBe(true);
  });

  it("evaluate reports free starter latch when active", () => {
    markCurrentSessionFreeStarterIntent();
    const decision = evaluatePaidProSourceOfTruthEstablishment({ source: "server_full_draft" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("free_starter_session_without_pro_entitlement");
  });

  it("free starter wins over stale pro intent markers", () => {
    markCurrentSessionProIntent();
    markCurrentSessionFreeStarterIntent();
    expect(hasCurrentSessionProEntitlement()).toBe(false);
    expect(hasCurrentSessionFreeStarterIntent()).toBe(true);
    expect(() =>
      establishPaidProSourceOfTruth({ text: PRO_BODY, source: "server_full_draft" }),
    ).toThrow(/establishment-suppressed/);
  });
});
