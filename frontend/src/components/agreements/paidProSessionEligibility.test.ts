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
  paintedFreeDumpOpensExistingCheckout,
} from "./paidProSessionEligibility";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";

const PRO_BODY = SHARED_ACCEPTED_PAID_BODY;

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

  it("pipelineSessionAccepted arms pro entitlement over an active free starter latch", () => {
    // Tip: pipeline acceptance marks pro entitlement, which clears the free-starter block.
    markCurrentSessionFreeStarterIntent();
    const decision = evaluatePaidProSourceOfTruthEstablishment({ pipelineSessionAccepted: true });
    expect(decision.allowed).toBe(true);
    expect(hasCurrentSessionProEntitlement()).toBe(true);
    expect(decision.hasFreeStarterSession).toBe(false);
  });

  it("pro intent + entitlement allows SoT establishment gate (full freeze tested elsewhere)", () => {
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    expect(hasCurrentSessionProEntitlement()).toBe(true);
    const decision = evaluatePaidProSourceOfTruthEstablishment({ source: "server_full_draft" });
    expect(decision.allowed).toBe(true);
  });

  it("evaluate reports free starter latch when active", () => {
    markCurrentSessionFreeStarterIntent();
    const decision = evaluatePaidProSourceOfTruthEstablishment({ source: "server_full_draft" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("free_starter_session_without_pro_entitlement");
  });

  it("painted free dump still owes existing checkout until this session pays", () => {
    expect(paintedFreeDumpOpensExistingCheckout()).toBe(false);
    markCurrentSessionFreeStarterIntent();
    expect(paintedFreeDumpOpensExistingCheckout()).toBe(true);
    markCurrentSessionProIntent();
    expect(paintedFreeDumpOpensExistingCheckout()).toBe(false);
    markCurrentSessionFreeStarterIntent();
    markCurrentSessionProEntitlementComplete({ source: "settled_checkout" });
    expect(paintedFreeDumpOpensExistingCheckout()).toBe(false);
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
