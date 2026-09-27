/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  armCreatorDashboardSignerSetupResume,
  isDashboardSignerSetupResumeUiActive,
  prepareCreatorDashboardSignerSetupNavigation,
} from "../../launch/creatorDashboardReviewLinkRouting";
import { resolveStarterTwoPartyCommercialAuthority } from "./canonicalPartyRoleAuthority";
import { logReviewRefreshRestore, shouldRestoreStoredCreateReviewDraftSnapshot } from "./createReviewRefreshRestore";
import { resolvePaidProInlineSignerSetupMounted } from "./signerSetupPartyIdentity";
import { writeCreateReviewAgreementResumeId } from "./agreementIntakeStorage";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");
const createPageSrc = readFileSync(
  join(here, "../../launch/simpleProduct/SimpleCreatePage.tsx"),
  "utf8",
);

const AGREEMENT_ID = "9d6d1be0-55dd-415a-bf61-fee9db743674";

describe("dashboard signer-setup resume render authority", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("Complete signer details path marks dashboard_signer_setup_resume UI active", () => {
    const path = prepareCreatorDashboardSignerSetupNavigation(AGREEMENT_ID);
    expect(path).toContain(`resume_signer_setup=${encodeURIComponent(AGREEMENT_ID)}`);
    expect(
      isDashboardSignerSetupResumeUiActive({
        openSignerSetupOnResume: true,
        createFlowPhase: "draft_ready_for_review",
        paidProInlineSignerSetupLatched: false,
      }),
    ).toBe(true);
    expect(
      isDashboardSignerSetupResumeUiActive({
        openSignerSetupOnResume: false,
        createFlowPhase: "signer_setup_required",
        paidProInlineSignerSetupLatched: true,
      }),
    ).toBe(true);
    expect(
      isDashboardSignerSetupResumeUiActive({
        openSignerSetupOnResume: true,
        createFlowPhase: "draft_ready_for_review",
        paidProInlineSignerSetupLatched: false,
        signerMetadataFinalized: true,
      }),
    ).toBe(false);
  });

  it("review-refresh-restore is skipped (not restored:true) on signer-setup resume", () => {
    writeCreateReviewAgreementResumeId(AGREEMENT_ID);
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    sessionStorage.setItem("claw_agreement_create_review_draft_ready_v1", "1");
    expect(shouldRestoreStoredCreateReviewDraftSnapshot()).toBe(false);

    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logReviewRefreshRestore({
      hasStoredDraft: true,
      agreementIdShort: AGREEMENT_ID.slice(0, 8),
      restored: false,
      skipped: "dashboard_signer_setup_resume",
    });
    expect(spy).toHaveBeenCalledWith("[review-refresh-restore]", {
      hasStoredDraft: true,
      agreementIdShort: AGREEMENT_ID.slice(0, 8),
      restored: false,
      skipped: "dashboard_signer_setup_resume",
    });
    expect(intakeSrc).toContain('skipped: "dashboard_signer_setup_resume"');
    expect(intakeSrc).toContain("restored: false");
  });

  it("forces inline signer setup mount without paid review authority / subscription", () => {
    expect(
      resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: false,
        hasProfessionallyValidatedReviewCorpus: false,
        premiumPaidDocumentSurface: false,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: true,
        signaturePreparationRequested: false,
        forceDashboardSignerSetupResume: true,
      }),
    ).toBe(true);
  });

  it("does not derive free-starter party authority from section headings while resume armed", () => {
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const bodyAsIntake = [
      "SERVICES AGREEMENT",
      "3.1 Subscription Fee.",
      "3.4 Disputed Amounts.",
      "Client shall pay Provider monthly.",
    ].join("\n");
    expect(resolveStarterTwoPartyCommercialAuthority(bodyAsIntake)).toBeNull();
  });

  it("intake suppresses Retry Pro draft recovery while resume UI is active", () => {
    expect(intakeSrc).toContain("!dashboardSignerSetupResumeUiActive");
    expect(intakeSrc).toContain("forceDashboardSignerSetupResume: dashboardSignerSetupResumeUiActive");
    expect(intakeSrc).toContain("paidProForcedFirstReviewActive ||");
    expect(intakeSrc).toContain("paidProCanonicalReviewSignerSetupActive");
    expect(intakeSrc).toContain("Keep session arm until signer metadata is complete");
  });

  it("create page keeps sticky resume id across URL strip", () => {
    expect(createPageSrc).toContain("Sticky for this create-page mount");
    expect(createPageSrc).toMatch(/const \[resumeSignerSetupAgreementId\] = useState/);
  });
});
