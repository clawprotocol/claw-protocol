/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { armCreatorDashboardSignerSetupResume } from "../../launch/creatorDashboardReviewLinkRouting";
import {
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
  clearDisplayReviewSnapshotAuthority,
} from "../../agreement/canonicalReviewSnapshotApi";
import { selectDashboardResumePaint } from "./paidProDashboardResumeAuthoritySelection";
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
  const body = [
    "1. Services and Project Term",
    "Designer will provide product design services for Client's new mobile app UI during the six-week period starting on the Effective Date.",
    "",
    "2. Fees and Payment",
    "Client shall pay Designer a fixed fee of $12,000 as set forth in Exhibit A.",
    "",
    ...Array.from({ length: 30 }, (_, i) => `Section ${i + 3}. Accepted server full draft clause.`),
  ].join("\n\n");
  const head =
    "SERVICES AGREEMENT\n\nThis Agreement is between Acme Test Co and LawDog Demo LLC.\n\n";
  const built = head + body;
  return built.length >= len ? built : `${built}\n${"Accepted server full draft clause. ".repeat(40)}`.slice(0, len);
}

describe("dashboard signer-setup resume paints accepted server_full_draft preview", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPaidProSourceOfTruth();
    clearDisplayReviewSnapshotAuthority();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    resetPaidProVisibleDocumentShellLogsForTests();
    resetPaidProDocumentBodyRouterLogsForTests();
    vi.restoreAllMocks();
  });

  it("pipeline-accepted corpus without verified GET cannot paint dashboard resume paper", () => {
    const corpus = buildAcceptedServerDraft(2400);
    markPaidProPipelineValidationPassed({ text: corpus, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(corpus);
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(readAcceptedPipelineReviewCorpusPlain().length).toBeGreaterThanOrEqual(
      PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
    );
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const resume = selectDashboardResumePaint({
      agreementId: AGREEMENT_ID,
      resumeActive: true,
      authenticatedOwner: true,
    });
    expect(resume.canPaintReview).toBe(false);
    expect(resume.kind).toBe("paid_retry");
    const router = resolvePaidProDocumentBodyRouter();
    const { container, unmount } = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        displayContext={{
          paidProActive: true,
          premiumPaidDocumentSurface: true,
          premiumCheckoutCompleted: true,
          agreementId: AGREEMENT_ID,
        }}
      />,
    );
    expect(container.textContent || "").not.toMatch(/Acme Test Co/);
    unmount();
  });

  it("resume shell paints ForcedRoute with acceptedCanonicalPlain (styled title + headings)", () => {
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    expect(intakeSrc).toContain('data-testid="dashboard-signer-setup-agreement-preview"');
    expect(intakeSrc).toContain("Resume preview must paint through ForcedRoute");
    expect(intakeSrc).toContain("acceptedCanonicalPlain:");
    // Must not regress to a raw <pre> dump of the resume plain (strips h1/h2 styling).
    expect(intakeSrc).not.toMatch(
      /dashboardSignerSetupResumePreviewPlain\.trim\(\)\.length >= 80 \? \(\s*<pre/,
    );
    const resumePreviewIdx = intakeSrc.indexOf(
      ") : dashboardSignerSetupResumeUiActive ? (",
    );
    const forcedInsideResumeIdx = intakeSrc.indexOf(
      "<PaidProDocumentBodyForcedRoute",
      resumePreviewIdx,
    );
    const forcedAfterResumeIdx = intakeSrc.indexOf(
      ") : paidProForcedFirstReviewActive || paidProReviewRecipientSetupActive ? (",
    );
    expect(resumePreviewIdx).toBeGreaterThan(0);
    expect(forcedInsideResumeIdx).toBeGreaterThan(resumePreviewIdx);
    expect(forcedAfterResumeIdx).toBeGreaterThan(forcedInsideResumeIdx);
  });

  it("ForcedRoute with resume plain paints document title h1 and bold section h2", async () => {
    const corpus = buildAcceptedServerDraft(2400);
    const sha = await sha256CorpusDigest(corpus);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_preview_title",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "pending",
      corpusPlain: corpus,
    });
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const router = resolvePaidProDocumentBodyRouter();
    const { container, unmount } = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        displayContext={{
          paidProActive: true,
          premiumPaidDocumentSurface: true,
          premiumCheckoutCompleted: true,
          agreementId: AGREEMENT_ID,
          acceptedCanonicalPlain: corpus,
        }}
        authoritativeSource="server_full_draft"
      />,
    );
    const title = container.querySelector("h1");
    expect(title?.textContent?.trim()).toMatch(/SERVICES AGREEMENT/i);
    const headings = Array.from(container.querySelectorAll("h2.premium-doc-section-heading")).map(
      (el) => el.textContent?.trim() || "",
    );
    expect(headings.some((h) => /1\.\s*Services and Project Term/i.test(h))).toBe(true);
    expect(headings.some((h) => /2\.\s*Fees and Payment/i.test(h))).toBe(true);
    unmount();
  });

  it("ForcedRoute injects display title when resume corpus opens at section 1", async () => {
    const body = [
      "1. Services and Project Term",
      "Designer will provide product design services for Client's new mobile app UI during the six-week period starting on the Effective Date.",
      "",
      "2. Fees and Payment",
      "Client shall pay Designer a fixed fee of $12,000 as set forth in Exhibit A.",
      "",
      ...Array.from({ length: 30 }, (_, i) => `Section ${i + 3}. Accepted server full draft clause.`),
    ].join("\n\n");
    const corpus = `${body}\n${"Accepted server full draft clause. ".repeat(40)}`.trim();
    const sha = await sha256CorpusDigest(corpus);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_preview_section1",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "pending",
      corpusPlain: corpus,
    });
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const router = resolvePaidProDocumentBodyRouter();
    const { container, unmount } = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        displayContext={{
          paidProActive: true,
          premiumPaidDocumentSurface: true,
          premiumCheckoutCompleted: true,
          agreementId: AGREEMENT_ID,
          acceptedCanonicalPlain: corpus,
          draft: { title: "Services Agreement" } as never,
          intakeText:
            "Services agreement between Designer Co and Client LLC for mobile app UI design. $12,000.",
        }}
        authoritativeSource="server_full_draft"
      />,
    );
    expect(container.querySelector("h1")?.textContent?.trim()).toMatch(/SERVICES AGREEMENT/i);
    const headings = Array.from(container.querySelectorAll("h2.premium-doc-section-heading")).map(
      (el) => el.textContent?.trim() || "",
    );
    expect(headings.some((h) => /1\.\s*Services and Project Term/i.test(h))).toBe(true);
    unmount();
  });

  it("ForcedRoute paints employment title from intake when corpus has no title line", async () => {
    const body = [
      "1. Position and Duties",
      "Employee will perform the duties of Senior Engineer for Employer during the employment term.",
      "",
      "2. Compensation",
      "Employer shall pay Employee an annual salary as set forth in Exhibit A.",
      "",
      ...Array.from({ length: 30 }, (_, i) => `Section ${i + 3}. Employment clause body text.`),
    ].join("\n\n");
    const corpus = `${body}\n${"Employment clause body text. ".repeat(40)}`.trim();
    const sha = await sha256CorpusDigest(corpus);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_preview_employment",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "pending",
      corpusPlain: corpus,
    });
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const router = resolvePaidProDocumentBodyRouter();
    const { container, unmount } = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        displayContext={{
          paidProActive: true,
          premiumPaidDocumentSurface: true,
          premiumCheckoutCompleted: true,
          agreementId: AGREEMENT_ID,
          acceptedCanonicalPlain: corpus,
          intakeText: "Employment agreement between Acme Inc and Pat Lee. Full-time. California law.",
        }}
        authoritativeSource="server_full_draft"
      />,
    );
    expect(container.querySelector("h1")?.textContent?.trim()).toMatch(/EMPLOYMENT AGREEMENT/i);
    unmount();
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
