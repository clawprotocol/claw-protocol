/**
 * Phase 4B.5.1 callback success-landing coverage.
 * Fail closed if AuthCallback navigates from local org instead of server finalize,
 * or if anonymous bootstrap can clobber a user-* workspace.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PHASE4B51_AGREEMENT_ID = "ag-phase4b51-orion";
export const PHASE4B51_CREATE_AGREEMENT_ID = "ag-phase4b51-create";
export const PHASE4B51_CONTINUATION_ID = "cont-phase4b51-orion";
export const PHASE4B51_CREATE_CONTINUATION_ID = "cont-phase4b51-create";
export const PHASE4B51_AUTH_CODE = "sb-phase4b51-auth-code";
export const PHASE4B51_RECIPIENT_TOKEN = "tok-phase4b51-recipient-secret";
export const PHASE4B51_OTHER_TITLE = "OTHER-CUSTOMER-AGREEMENT-MUST-NOT-RENDER";
export const PHASE4B51_DONE_DEST = `/app/done/${PHASE4B51_AGREEMENT_ID}`;
export const PHASE4B51_CREATE_DEST = `/app/create?agreementId=${PHASE4B51_CREATE_AGREEMENT_ID}`;
export const PHASE4B51_TITLE = "PHASE4B51 PAID ORION SAAS AGREEMENT";

const HERE = dirname(fileURLToPath(import.meta.url));

export function assertPhase4b51SuccessLandingContracts(): void {
  const callback = readFileSync(join(HERE, "AuthCallbackPage.tsx"), "utf8");
  if (!callback.includes("result.orgId") || !callback.includes("setOrgId(serverOrg)")) {
    throw new Error("AuthCallbackPage no longer binds navigation to the server finalize org");
  }
  if (!callback.includes("keepContinuationId: true")) {
    throw new Error("AuthCallbackPage strips continuation_id before consume; remount cannot land on the server dest");
  }
  if (!callback.includes("writeCreateReviewAgreementResumeId")) {
    throw new Error("AuthCallbackPage no longer arms create resume from the server destination agreementId");
  }
  if (callback.includes("window.fetch") && callback.includes("finalize-auth")) {
    throw new Error("AuthCallbackPage replaced production finalize fetch");
  }
  const anon = readFileSync(join(HERE, "../auth/anonymousSessionApi.ts"), "utf8");
  if (!anon.includes("isUserWorkspaceOrgId(getOrgId())")) {
    throw new Error("anonymous session can clobber a server-authorized user workspace");
  }
  const fixtures = readFileSync(join(HERE, "../../e2e/phase4b51/phase4b51AuthSuccessLandingFixtures.ts"), "utf8");
  if (fixtures.includes("window.fetch =") || fixtures.includes("stubFinalizeAuthFetch")) {
    throw new Error("Phase 4B.5.1 fixtures replaced window.fetch instead of intercepting the ordinary request");
  }
  if (!fixtures.includes("server_full_document_text") || !fixtures.includes("corpus_plain")) {
    throw new Error("Phase 4B.5.1 fixtures no longer serve verified server paper for paid-resume");
  }
  const intake = readFileSync(join(HERE, "../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
  if (
    !intake.includes("productionResumeCorpus") ||
    !intake.includes("hydrateCommercialReviewFromServerSnapshot({ agreementId: hid })") ||
    !intake.includes("setAgreementDocumentText(resumeCorpus)")
  ) {
    throw new Error("create resume no longer paints verified server paper after GET hydrate");
  }
}
