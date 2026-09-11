import { describe, expect, it } from "vitest";
import { isAuthenticatedDashboardSurface, isPublicTokenAgreementSurface } from "../account/currentUser";
import { parseAgreementSignPath } from "../agreement/agreementRecipientSigningPaths";
import {
  PHASE4B4_COVERAGE_DOCUMENT_ID,
  PHASE4B4_COVERAGE_TOKEN,
  assertPhase4b4EsignDualModeRoutes,
  phase4b4OwnerBridgePath,
  phase4b4RecipientSignPath,
} from "./phase4b4EsignDualModeCoverage";

describe("Phase 4B.4 esign dual-mode route coverage", () => {
  it("fails closed if query-sensitive /app/esign access classification is lost", () => {
    expect(() => assertPhase4b4EsignDualModeRoutes()).not.toThrow();

    const id = PHASE4B4_COVERAGE_DOCUMENT_ID;
    expect(phase4b4OwnerBridgePath(id)).toBe(`/app/esign/${id}?agreement_bridge=1`);
    expect(isPublicTokenAgreementSurface(`/app/esign/${id}`, "?agreement_bridge=1")).toBe(false);
    expect(isAuthenticatedDashboardSurface(`/app/esign/${id}`, "?agreement_bridge=1")).toBe(true);
    expect(isPublicTokenAgreementSurface(`/app/esign/${id}`, "?vs01_recipient_sign=1")).toBe(true);
    expect(isAuthenticatedDashboardSurface(`/app/esign/${id}`, "?vs01_recipient_sign=1")).toBe(false);
    expect(isPublicTokenAgreementSurface(`/app/esign/${id}`)).toBe(false);
    expect(isAuthenticatedDashboardSurface(`/app/esign/${id}`)).toBe(false);
    expect(phase4b4RecipientSignPath(id, PHASE4B4_COVERAGE_TOKEN)).toContain("vs01_recipient_sign=1");
    expect(parseAgreementSignPath(`/app/esign/${id}`, `?t=${PHASE4B4_COVERAGE_TOKEN}`)).toBeNull();
  });
});
