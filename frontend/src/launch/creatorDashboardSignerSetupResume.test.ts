/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { writeCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { shouldRestoreStoredCreateReviewDraftSnapshot } from "../components/agreements/createReviewRefreshRestore";
import {
  armCreatorDashboardSignerSetupResume,
  clearCreatorDashboardSignerSetupResume,
  consumeCreatorDashboardSignerSetupResume,
  creatorDashboardSignerSetupPath,
  DASHBOARD_SIGNER_SETUP_RESUME_SOURCE,
  isCreatorDashboardSignerSetupResumeActive,
  isDashboardSignerSetupResumeUiActive,
  parseResumeSignerSetupAgreementIdFromPath,
  parseResumeSignerSetupAgreementIdFromSearch,
  peekCreatorDashboardSignerSetupResume,
  prepareCreatorDashboardSignerSetupNavigation,
} from "./creatorDashboardReviewLinkRouting";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";
import {
  isDashboardPaidCreateRouteActive,
  markPaidDashboardCreateContext,
  normalizeDashboardPaidCreateSource,
} from "./paidDashboardCreateContext";
import { setOrgId } from "./orgContext";

const AGREEMENT_ID = "9d6d1be0-55dd-415a-bf61-fee9db743674";

describe("dashboard Complete signer details → create resume", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("prepare keeps resume_signer_setup query and arms session + resume id", () => {
    const path = prepareCreatorDashboardSignerSetupNavigation(AGREEMENT_ID);
    expect(path).toBe(creatorDashboardSignerSetupPath(AGREEMENT_ID));
    expect(path).toContain(`resume_signer_setup=${encodeURIComponent(AGREEMENT_ID)}`);
    expect(parseResumeSignerSetupAgreementIdFromPath(path)).toBe(AGREEMENT_ID);
    expect(isCreatorDashboardSignerSetupResumeActive(`?resume_signer_setup=${AGREEMENT_ID}`)).toBe(
      true,
    );
    expect(consumeCreatorDashboardSignerSetupResume()).toBe(AGREEMENT_ID);
  });

  it("blocks local review-refresh snapshot restore while signer-setup resume is armed", () => {
    writeCreateReviewAgreementResumeId(AGREEMENT_ID);
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    sessionStorage.setItem("claw_agreement_create_review_draft_ready_v1", "1");
    expect(shouldRestoreStoredCreateReviewDraftSnapshot()).toBe(false);
  });

  it("does not treat signer-setup resume as fresh dashboard_paid_create", () => {
    setOrgId("org-signer-setup-resume");
    expect(normalizeDashboardPaidCreateSource(DASHBOARD_SIGNER_SETUP_RESUME_SOURCE)).toBe(
      DASHBOARD_SIGNER_SETUP_RESUME_SOURCE,
    );
    markPaidDashboardCreateContext(DASHBOARD_SIGNER_SETUP_RESUME_SOURCE);
    expect(isDashboardPaidCreateRouteActive()).toBe(false);
  });

  it("parses resume id from search without collapsing to bare /app/create", () => {
    expect(
      parseResumeSignerSetupAgreementIdFromSearch(
        `?resume_signer_setup=${encodeURIComponent(AGREEMENT_ID)}`,
      ),
    ).toBe(AGREEMENT_ID);
    expect(parseResumeSignerSetupAgreementIdFromSearch("")).toBe("");
  });

  it("resume UI stays active via signer_setup_required latch after session arm", () => {
    expect(
      isDashboardSignerSetupResumeUiActive({
        openSignerSetupOnResume: false,
        createFlowPhase: "signer_setup_required",
        paidProInlineSignerSetupLatched: true,
      }),
    ).toBe(true);
  });

  it("Create new agreement clears leftover signer-setup arm so create cannot auto-resume", () => {
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    writeCreateReviewAgreementResumeId(AGREEMENT_ID);
    expect(peekCreatorDashboardSignerSetupResume()).toBe(AGREEMENT_ID);
    initializeNewAgreementSession();
    expect(peekCreatorDashboardSignerSetupResume()).toBeNull();
    expect(isCreatorDashboardSignerSetupResumeActive("")).toBe(false);
    clearCreatorDashboardSignerSetupResume();
    expect(peekCreatorDashboardSignerSetupResume()).toBeNull();
  });
});
