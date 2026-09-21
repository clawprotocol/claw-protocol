import { describe, expect, it } from "vitest";
import { isAuthenticatedDashboardSurface, isPublicTokenAgreementSurface } from "../account/currentUser";
import { agreementPublicVerifyPath, parseAgreementVerifyPath } from "../agreement/agreementPublicVerify";
import {
  PHASE4B3_COVERAGE_AGREEMENT_ID,
  assertPhase4b3PublicVerifyRoutes,
  phase4b3CanonicalVerifyPath,
  phase4b3LegacyVerifyPath,
} from "./phase4b3PublicVerifyCoverage";

describe("Phase 4B.3 public-verify route coverage", () => {
  it("fails closed if /verify/:id or /app/verify/:id lose public treatment", () => {
    expect(() => assertPhase4b3PublicVerifyRoutes()).not.toThrow();

    const id = PHASE4B3_COVERAGE_AGREEMENT_ID;
    expect(phase4b3CanonicalVerifyPath(id)).toBe(agreementPublicVerifyPath(id));
    expect(phase4b3CanonicalVerifyPath(id)).toBe(`/verify/${id}`);
    expect(parseAgreementVerifyPath(`/verify/${id}`)).toEqual({ agreementId: id });
    expect(parseAgreementVerifyPath(phase4b3LegacyVerifyPath(id))).toEqual({ agreementId: id });
    expect(parseAgreementVerifyPath(`/app/verification/${id}`)).toBeNull();
    expect(isPublicTokenAgreementSurface(`/verify/${id}`)).toBe(true);
    expect(isPublicTokenAgreementSurface(`/app/verify/${id}`)).toBe(true);
    expect(isAuthenticatedDashboardSurface(`/app/verification/${id}`)).toBe(true);
  });
});
