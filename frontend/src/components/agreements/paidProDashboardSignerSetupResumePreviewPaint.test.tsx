/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { armCreatorDashboardSignerSetupResume } from "../../launch/creatorDashboardReviewLinkRouting";
import {
  markPaidProPipelineAcceptedCorpusHash,
  clearPaidProPipelineAcceptedCorpusHashForTests,
} from "./paidProPipelineAcceptedCorpus";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  PaidProDocumentBodyForcedRoute,
  resolvePaidProDocumentBodyRouter,
  resetPaidProDocumentBodyRouterLogsForTests,
} from "./paidProDocumentBodyRouter";
import {
  resetPaidProVisibleDocumentShellLogsForTests,
  resolvePaidProVisibleShellRenderBranch,
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
} from "./paidProVisibleDocumentShell";
import { clearPaidProSourceOfTruth, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { readAcceptedPipelineReviewCorpusPlain } from "./paidProAcceptedPipelineReviewCorpus";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

const AGREEMENT_ID = "9d6d1be0-55dd-415a-bf61-fee9db743674";

function buildAcceptedServerDraft(len = 2200): string {
  const body = Array.from({ length: 40 }, (_, i) => `Section ${i + 1}. Accepted server full draft clause.`).join(
    "\n\n",
  );
  const head =
    "SERVICES AGREEMENT\n\nThis Agreement is between Acme Test Co and LawDog Demo LLC.\n\n";
  return (head + body).padEnd(len, " ");
}

describe("dashboard signer-setup resume paints accepted server_full_draft preview", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPaidProSourceOfTruth();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    resetPaidProVisibleDocumentShellLogsForTests();
    resetPaidProDocumentBodyRouterLogsForTests();
    vi.restoreAllMocks();
  });

  it("VisibleShell paints pipeline-accepted corpus when hasSoT is still false", () => {
    const corpus = buildAcceptedServerDraft(2400);
    markPaidProPipelineValidationPassed({ text: corpus, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(corpus);
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(readAcceptedPipelineReviewCorpusPlain().length).toBeGreaterThanOrEqual(
      PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
    );

    const router = resolvePaidProDocumentBodyRouter();
    expect(router.forced).toBe(true);
    expect(router.sotLen).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

    const { container, unmount } = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        displayContext={{
          paidProActive: true,
          premiumPaidDocumentSurface: true,
          premiumCheckoutCompleted: true,
        }}
      />,
    );
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(container.querySelector('[data-testid="paid-pro-visible-document-shell-empty"]')).toBeNull();
    expect(shell?.textContent || "").toMatch(/Acme Test Co/);
    expect(shell?.textContent || "").not.toMatch(/could not confirm the server-locked agreement/i);
    unmount();
  });

  it("resume shell prefers locked preview over ForcedRoute empty gate", () => {
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    expect(intakeSrc).toContain("Resume preview must win over ForcedRoute");
    expect(intakeSrc).toContain("commitCanonicalPaidProReviewSessionMarkers");
    expect(intakeSrc).toContain('data-testid="dashboard-signer-setup-agreement-preview"');
    const resumePreviewIdx = intakeSrc.indexOf(
      ") : dashboardSignerSetupResumeUiActive ? (\n                                          // Resume preview must win over ForcedRoute",
    );
    const forcedAfterResumeIdx = intakeSrc.indexOf(
      ") : paidProForcedFirstReviewActive ? (\n                                          <PaidProDocumentBodyForcedRoute",
    );
    expect(resumePreviewIdx).toBeGreaterThan(0);
    expect(forcedAfterResumeIdx).toBeGreaterThan(resumePreviewIdx);
  });

  it("branch resolver accepts pipeline authority length without frozen SoT flag", () => {
    const len = 2400;
    expect(
      resolvePaidProVisibleShellRenderBranch({
        hasSoT: true, // displayAuthorityReady treats pipeline as ready
        sotLen: len,
        htmlLen: 0,
        canonicalPlainLen: len,
        canonicalPlainSource: "pipeline_accepted_corpus",
        paidProFirstReviewActive: true,
      }),
    ).toEqual({
      branch: "canonical_plain_forced",
      reason: "paid_pro_first_review_display_authority",
    });
  });
});
