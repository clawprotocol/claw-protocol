/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolveLegalPartyAuthorityForIntake } from "./legalPartyAuthoritySession";
import { clearLegalPartyAuthoritySessionForTests } from "./legalPartyAuthoritySession";
import {
  bumpAgreementGenerationIdForFreshSession,
  clearCurrentSessionProEntitlementMarkers,
  hasCurrentSessionFreeStarterIntent,
  hasCurrentSessionProEntitlement,
  markCurrentSessionFreeStarterIntent,
  markCurrentSessionProEntitlementComplete,
} from "./paidProSessionEligibility";
import {
  clearStarterToPaidPartyHandoffForTests,
  readStarterToPaidPartyHandoff,
  writeStarterToPaidPartyHandoff,
} from "./starterToPaidPartyHandoff";
import {
  runStarterToPaidCheckoutBoundary,
  type StarterToPaidCheckoutBoundaryDependencies,
} from "./starterToPaidCheckoutBoundary";
import { clearPaidProSourceOfTruth, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  clearSignerExecutionAuthorityForTests,
  readSignerRecordCount,
} from "./signerExecutionAuthority";
import { readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

const INTAKES = [
  "Services agreement between Cedar Ridge Consulting LLC and Northwind Retail Group Inc.",
  "Agreement between Alpha Strategy LLC, Beacon Systems Inc., and Copper Ridge Analytics LLC.",
  "Agreement between Alpha Logistics LLC, Beta Transport Inc., Gamma Warehousing LLC, and Delta Distribution Corp.",
] as const;

function validDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    parties: [],
    purpose: "Provide services.",
    payment_terms: "$1,000",
    duration: "one year",
    due_date: null,
    effective_date: null,
    payment: { amount: 1000, cadence: null, valid: true },
  };
}

function productionDependencies(
  write: StarterToPaidCheckoutBoundaryDependencies["writeStarterToPaidPartyHandoff"] =
    writeStarterToPaidPartyHandoff,
): StarterToPaidCheckoutBoundaryDependencies {
  return {
    hasCurrentSessionFreeStarterIntent,
    hasCurrentSessionProEntitlement,
    resolveLegalPartyAuthority: resolveLegalPartyAuthorityForIntake,
    writeStarterToPaidPartyHandoff: write,
  };
}

function resetState() {
  resetPaidProPipelineTestIsolation();
  clearLegalPartyAuthoritySessionForTests();
  clearStarterToPaidPartyHandoffForTests();
  clearSignerExecutionAuthorityForTests();
  clearCurrentSessionProEntitlementMarkers();
  clearPaidProSourceOfTruth();
}

describe("Starter to Paid checkout boundary", () => {
  beforeEach(resetState);
  afterEach(resetState);

  it.each([
    [2, INTAKES[0]],
    [3, INTAKES[1]],
    [4, INTAKES[2]],
  ])("writes %i-party authority exactly once before checkout continuation", (partyCount, intake) => {
    markCurrentSessionFreeStarterIntent();
    const order: string[] = [];
    const write = vi.fn((raw: string, authority: Parameters<typeof writeStarterToPaidPartyHandoff>[1]) => {
      order.push("handoff");
      return writeStarterToPaidPartyHandoff(raw, authority);
    });

    const result = runStarterToPaidCheckoutBoundary(
      { rawIntake: intake, pendingDraft: validDraft() },
      productionDependencies(write),
      () => {
        order.push("checkout_persistence");
        order.push("navigation");
      },
    );

    expect(result).toBe("continued_with_handoff");
    expect(write).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["handoff", "checkout_persistence", "navigation"]);
    const authority = write.mock.calls[0][1];
    const handoff = readStarterToPaidPartyHandoff(intake);
    expect(handoff?.partyCount).toBe(partyCount);
    expect(handoff?.parties.map((party) => party.agreementPartyId)).toEqual(
      authority?.parties.map((party) => party.agreementPartyId),
    );
    expect(handoff?.parties.map((party) => party.legalEntityName)).toEqual(
      authority?.parties.map((party) => party.legalEntityName),
    );
    expect(
      handoff?.parties.map((party) => ({
        agreementRole: party.agreementRole,
        commercialRoles: party.commercialRoles,
      })),
    ).toEqual(
      authority?.parties.map((party) => ({
        agreementRole: party.agreementRole,
        commercialRoles: party.commercialRoles,
      })),
    );
    expect(handoff?.parties.map((party) => party.canonicalOrder)).toEqual(
      Array.from({ length: partyCount }, (_, index) => index),
    );
    expect(handoff?.intakeFingerprint).toBe(authority?.intakeFingerprint);
    expect(handoff?.agreementSessionId).toBeTruthy();
    expect(hasCurrentSessionProEntitlement()).toBe(false);
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(readFrozenCanonicalManifestPartyCount()).toBe(0);
    expect(readSignerRecordCount(intake)).toBe(0);
  });

  it("does not write for direct Paid Pro, stale Starter intent, or returning paid sessions", () => {
    const write = vi.fn(writeStarterToPaidPartyHandoff);
    const continueCheckout = vi.fn();

    runStarterToPaidCheckoutBoundary(
      { rawIntake: INTAKES[0], pendingDraft: validDraft() },
      productionDependencies(write),
      continueCheckout,
    );

    markCurrentSessionFreeStarterIntent();
    bumpAgreementGenerationIdForFreshSession();
    runStarterToPaidCheckoutBoundary(
      { rawIntake: INTAKES[0], pendingDraft: validDraft() },
      productionDependencies(write),
      continueCheckout,
    );

    markCurrentSessionFreeStarterIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    runStarterToPaidCheckoutBoundary(
      { rawIntake: INTAKES[0], pendingDraft: validDraft() },
      productionDependencies(write),
      continueCheckout,
    );

    expect(write).not.toHaveBeenCalled();
    expect(continueCheckout).toHaveBeenCalledTimes(3);
  });

  it("blocks missing intake and missing or malformed drafts", () => {
    const write = vi.fn(writeStarterToPaidPartyHandoff);
    const continueCheckout = vi.fn();
    const dependencies = productionDependencies(write);
    markCurrentSessionFreeStarterIntent();

    expect(
      runStarterToPaidCheckoutBoundary(
        { rawIntake: "", pendingDraft: validDraft() },
        dependencies,
        continueCheckout,
      ),
    ).toBe("blocked_invalid_input");
    expect(
      runStarterToPaidCheckoutBoundary(
        { rawIntake: INTAKES[0], pendingDraft: null },
        dependencies,
        continueCheckout,
      ),
    ).toBe("blocked_invalid_input");
    expect(
      runStarterToPaidCheckoutBoundary(
        { rawIntake: INTAKES[0], pendingDraft: {} as ParsedDraftShape },
        dependencies,
        continueCheckout,
      ),
    ).toBe("blocked_invalid_input");
    expect(write).not.toHaveBeenCalled();
    expect(continueCheckout).not.toHaveBeenCalled();
  });

  it("propagates writer failure and never continues checkout", () => {
    markCurrentSessionFreeStarterIntent();
    const continueCheckout = vi.fn();
    const write = vi.fn(() => {
      throw new Error("handoff write failed");
    });

    expect(() =>
      runStarterToPaidCheckoutBoundary(
        { rawIntake: INTAKES[0], pendingDraft: validDraft() },
        productionDependencies(write),
        continueCheckout,
      ),
    ).toThrow("handoff write failed");
    expect(write).toHaveBeenCalledTimes(1);
    expect(continueCheckout).not.toHaveBeenCalled();
  });
});
