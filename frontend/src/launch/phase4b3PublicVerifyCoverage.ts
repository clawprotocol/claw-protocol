/**
 * Phase 4B.3 public-verify coverage — derived from existing route
 * builders/parsers. Fail closed if /verify/:id or /app/verify/:id lose
 * public treatment, or if owner /app/verification/:id is reclassified.
 */
import { isAuthenticatedDashboardSurface, isPublicTokenAgreementSurface } from "../account/currentUser";
import { agreementPublicVerifyPath, parseAgreementVerifyPath } from "../agreement/agreementPublicVerify";

export const PHASE4B3_COVERAGE_AGREEMENT_ID = "ag-phase4b3-orion";

export function phase4b3CanonicalVerifyPath(agreementId: string): string {
  return agreementPublicVerifyPath(agreementId);
}

export function phase4b3LegacyVerifyPath(agreementId: string): string {
  return `/app/verify/${encodeURIComponent(agreementId)}`;
}

export function assertPhase4b3PublicVerifyRoutes(): void {
  const agreementId = PHASE4B3_COVERAGE_AGREEMENT_ID;
  const canonical = phase4b3CanonicalVerifyPath(agreementId);
  if (canonical !== `/verify/${agreementId}`) {
    throw new Error(`agreementPublicVerifyPath lost the canonical verify form: ${canonical}`);
  }
  const parsedCanonical = parseAgreementVerifyPath(canonical);
  if (!parsedCanonical || parsedCanonical.agreementId !== agreementId) {
    throw new Error("parseAgreementVerifyPath lost canonical /verify/:id");
  }
  const legacy = phase4b3LegacyVerifyPath(agreementId);
  const parsedLegacy = parseAgreementVerifyPath(legacy);
  if (!parsedLegacy || parsedLegacy.agreementId !== agreementId) {
    throw new Error("parseAgreementVerifyPath lost legacy /app/verify/:id");
  }
  if (parseAgreementVerifyPath(`/app/verification/${agreementId}`) !== null) {
    throw new Error("owner /app/verification/:id must not parse as public verify");
  }
  if (parseAgreementVerifyPath(`/agreements/${agreementId}/sign`) !== null) {
    throw new Error("sign path must not parse as public verify");
  }
  if (!isPublicTokenAgreementSurface(canonical)) {
    throw new Error("/verify/:id lost public treatment");
  }
  if (!isPublicTokenAgreementSurface(legacy)) {
    throw new Error("/app/verify/:id lost public treatment");
  }
  if (isAuthenticatedDashboardSurface(canonical) || isAuthenticatedDashboardSurface(legacy)) {
    throw new Error("public verify routes must not require an authenticated session");
  }
  if (!isAuthenticatedDashboardSurface(`/app/verification/${agreementId}`)) {
    throw new Error("owner /app/verification/:id must remain an authenticated surface");
  }
  if (isPublicTokenAgreementSurface(`/app/verification/${agreementId}`)) {
    throw new Error("owner /app/verification/:id must not be treated as a public token surface");
  }
}
