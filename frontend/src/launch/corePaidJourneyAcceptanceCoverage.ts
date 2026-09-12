/**
 * Fail-closed contracts for Core Paid Journey acceptance.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_PAID_JOURNEY_MATRIX } from "./corePaidJourneyAcceptanceMatrix";

const here = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

export function assertCorePaidJourneyAcceptanceContracts(): void {
  if (CORE_PAID_JOURNEY_MATRIX.length < 14) {
    throw new Error("core paid journey matrix lost required customer rows");
  }
  const ids = CORE_PAID_JOURNEY_MATRIX.map((row) => row.id);
  for (const required of [
    "I1_sparse_asks_targeted_questions",
    "Q1_article_matches_expected_facts",
    "A1_review_recipient_reads_correct_version",
    "B1_direct_sign_skips_mandatory_review",
    "C1_refresh_preserves_paper_version_path",
  ]) {
    if (!ids.includes(required as (typeof ids)[number])) {
      throw new Error(`core paid journey matrix missing ${required}`);
    }
  }

  const stub = src("../../../backend/llm_acceptance_stub.py");
  if (!stub.includes("acceptance_stub_enabled") || !stub.includes("Harbor Peak Analytics LLC")) {
    throw new Error("acceptance stub no longer binds to the declared Harbor/Ironvale facts");
  }
  const jwks = src("../../../backend/jwt_acceptance_jwks.py");
  if (!jwks.includes("install_acceptance_jwks_fetch_if_configured") || !jwks.includes("ES256")) {
    throw new Error("acceptance JWKS stub no longer mocks the external identity boundary");
  }
  const router = src("../../../backend/llm_router.py");
  if (!router.includes("acceptance_stub_enabled") || !router.includes("stub_legal_llm_completion")) {
    throw new Error("call_legal_llm no longer honors the test-only acceptance stub");
  }

  const spec = src("../../e2e/core-paid-journey-live/corePaidJourneyAcceptance.live.spec.ts");
  if (spec.includes("PHASE4A_FROZEN_BODY") || spec.includes("seedDraftedCeremony")) {
    throw new Error("core paid journey live spec injects a ready draft or frozen snapshot");
  }
  if (
    !spec.includes("simple-pro-final-review-document") ||
    !spec.includes("paid-pro-visible-document-shell") ||
    !spec.includes("agreement-intake-clarification")
  ) {
    throw new Error("core paid journey live spec no longer inspects the interview and document article");
  }
  if (!spec.includes("simple-pro-send-for-review") || !spec.includes("simple-pro-send-for-signature")) {
    throw new Error("core paid journey live spec no longer exercises both owner choices");
  }
}
