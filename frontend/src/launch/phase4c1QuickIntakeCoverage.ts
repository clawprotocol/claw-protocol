/**
 * Phase 4C.1 Quick intake contracts — behavioral, not source-window inspection.
 */
import { buildAgreementIntakeClarification } from "../components/agreements/agreementIntakeClarification";
import {
  isAllowlistedInternalPath,
  isApprovedServerQuickPdfReturn,
  resolveAuthCallbackDestination,
  resolveSafeRedirectPath,
  resolveServerAuthDestination,
} from "../auth/safeRedirectResolver";
import { parseEsignDocumentPath } from "./esignDocumentAccess";
import { canonicalizeEsignNewAliasPath } from "./quickAliasCanonicalize";
import { QUICK_PDF_RETURN_PATH, QUICK_PDF_SIGN_IN_PATH } from "./quickPdfReturnAuthority";
import { matchAppRoute } from "./routes";

export const PHASE4C1_SPARSE_SAAS = "Need a SaaS subscription agreement";
export const PHASE4C1_COMPLETE_SAAS = [
  "Draft a 12-month SaaS subscription agreement between Orion Harbor LLC and Northwind Retail Inc.",
  "Orion Harbor LLC will provide hosted platform access and standard onboarding.",
  "Northwind Retail Inc pays $48,000 annual subscription, net 30.",
  "Governing law is New York. Scope is the hosted platform only — no professional services.",
].join(" ");

export function assertPhase4c1QuickIntakeContracts(): void {
  if (matchAppRoute("/app/quick")?.routeId !== "quick-send") {
    throw new Error("/app/quick lost its public Quick entry route");
  }
  if (matchAppRoute("/app/quick")?.access !== "guest_workflow") {
    throw new Error("/app/quick must remain a guest_workflow entry");
  }
  if (matchAppRoute("/app/esign")?.routeId !== "esign-new") {
    throw new Error("/app/esign lost its compatibility alias route");
  }
  if (matchAppRoute("/app/esign/new")?.routeId !== "esign-new") {
    throw new Error("/app/esign/new lost its compatibility alias route");
  }
  if (parseEsignDocumentPath("/app/esign/new") !== null) {
    throw new Error("/app/esign/new must not parse as a document surface");
  }
  if (parseEsignDocumentPath("/app/esign/doc-phase4c1")?.documentId !== "doc-phase4c1") {
    throw new Error("/app/esign/:documentId must remain the dual-mode document surface");
  }

  const alias = canonicalizeEsignNewAliasPath(
    "/app/esign/new",
    "?t=secret&agreement_bridge=1&vs01_recipient_sign=1&documentId=doc_x&start=type&src=csn",
  );
  if (alias !== "/app/quick?start=pdf&src=csn") {
    throw new Error(`legacy alias leaked unsafe query: ${alias}`);
  }

  if (isAllowlistedInternalPath("/app/quick") || isAllowlistedInternalPath(QUICK_PDF_RETURN_PATH)) {
    throw new Error("caller next gained permission to redirect into Quick");
  }
  if (resolveSafeRedirectPath(QUICK_PDF_RETURN_PATH, "/app") !== "/app") {
    throw new Error("browser fallback accepted Quick PDF return");
  }
  if (!isApprovedServerQuickPdfReturn(QUICK_PDF_RETURN_PATH)) {
    throw new Error("server Quick PDF return was rejected");
  }
  if (resolveServerAuthDestination(QUICK_PDF_RETURN_PATH, "/app") !== QUICK_PDF_RETURN_PATH) {
    throw new Error("server dest lost Quick PDF return");
  }
  if (
    resolveAuthCallbackDestination({
      serverDestination: QUICK_PDF_RETURN_PATH,
      usedContinuation: true,
      callerNext: "/app.evil",
    }) !== QUICK_PDF_RETURN_PATH
  ) {
    throw new Error("caller next beat a server Quick PDF continuation");
  }
  if (
    resolveAuthCallbackDestination({
      serverDestination: "",
      usedContinuation: false,
      callerNext: QUICK_PDF_RETURN_PATH,
    }) !== "/app"
  ) {
    throw new Error("caller next=/app/quick?start=pdf was honored as a fallback");
  }
  if (QUICK_PDF_SIGN_IN_PATH.includes("next=")) {
    throw new Error("Quick PDF sign-in used caller next instead of intent");
  }

  const sparse = buildAgreementIntakeClarification(PHASE4C1_SPARSE_SAAS);
  if (!sparse || (sparse.kind !== "too_sparse" && sparse.kind !== "missing_named_parties")) {
    throw new Error(`sparse SaaS intake must still enter clarification, got ${sparse?.kind ?? "null"}`);
  }
  const complete = buildAgreementIntakeClarification(PHASE4C1_COMPLETE_SAAS);
  if (complete) {
    throw new Error(`complete SaaS intake was unnecessarily re-asked as ${complete.kind}`);
  }
}
