/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  armCreatorDashboardSignerSetupResume,
  prepareCreatorDashboardSignerSetupNavigation,
} from "../../launch/creatorDashboardReviewLinkRouting";
import {
  SIMPLE_CREATE_SIGNER_SETUP_RESUME_SUBTITLE,
  SIMPLE_CREATE_SIGNER_SETUP_RESUME_TITLE,
} from "../../launch/simpleProduct/simpleCreatePaidProReviewShell";
import {
  DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA,
  DASHBOARD_SIGNER_SETUP_RESUME_INCOMPLETE_CTA,
  resolveDashboardSignerSetupResumePrimaryCta,
} from "./signerSetupPartyIdentity";
import { assertPaidProFreezeCandidateManifestCountAgreement } from "./paidProFreezeCandidate";
import { assertPaidProReviewedDocumentIntegrity } from "./paidProReviewedDocumentIntegrity";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");
const createPageSrc = readFileSync(
  join(here, "../../launch/simpleProduct/SimpleCreatePage.tsx"),
  "utf8",
);

const AGREEMENT_ID = "9d6d1be0-55dd-415a-bf61-fee9db743674";

describe("dashboard signer-setup resume dedicated shell", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("Complete signer details navigation arms resume into dedicated shell copy", () => {
    const path = prepareCreatorDashboardSignerSetupNavigation(AGREEMENT_ID);
    expect(path).toContain("resume_signer_setup=");
    expect(SIMPLE_CREATE_SIGNER_SETUP_RESUME_TITLE).toBe("Complete signer details");
    expect(SIMPLE_CREATE_SIGNER_SETUP_RESUME_SUBTITLE).toMatch(/locked/i);
    expect(createPageSrc).toContain("SIMPLE_CREATE_SIGNER_SETUP_RESUME_TITLE");
    expect(createPageSrc).toContain("dashboardSignerSetupResumeShell");
  });

  it("sticky CTA is Save signer details / Continue — never Retry Pro draft", () => {
    expect(resolveDashboardSignerSetupResumePrimaryCta({ signerDetailsComplete: false })).toEqual({
      label: DASHBOARD_SIGNER_SETUP_RESUME_INCOMPLETE_CTA,
      action: "complete_recipient_details",
      reason: "dashboard_signer_setup_resume_incomplete",
    });
    expect(resolveDashboardSignerSetupResumePrimaryCta({ signerDetailsComplete: true })).toEqual({
      label: DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA,
      action: "guided_continue",
      reason: "dashboard_signer_setup_resume_complete",
    });
    expect(DASHBOARD_SIGNER_SETUP_RESUME_INCOMPLETE_CTA).toBe("Save signer details");
    expect(DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA).toBe("Continue");
    expect(intakeSrc).toContain("resolveDashboardSignerSetupResumePrimaryCta");
    expect(intakeSrc).toContain("dashboard_signer_setup_resume_complete");
    const completeIdx = intakeSrc.indexOf('cta.reason === "dashboard_signer_setup_resume_complete"');
    expect(completeIdx).toBeGreaterThan(-1);
    const completeBlock = intakeSrc.slice(completeIdx, completeIdx + 700);
    expect(completeBlock).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(completeBlock).not.toContain("handlePaidProPrepareSignaturesFromFirstReview");
    expect(completeBlock).not.toContain("/app/esign");
  });

  it("renders locked agreement preview and mounts signer fields on resume shell", () => {
    expect(intakeSrc).toContain('data-testid="dashboard-signer-setup-agreement-preview"');
    expect(intakeSrc).toContain("dashboard_signer_setup_resume");
    expect(intakeSrc).toContain("Seed locked agreement preview + display authority from accepted server corpus");
    expect(intakeSrc).toContain("PaidProSignerFieldsMountShell");
    expect(intakeSrc).toContain("forceDashboardSignerSetupResume");
  });

  it("suppresses empty_top_level_heading freeze integrity while resume is armed", () => {
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    // Manifest count gate is a no-op on resume.
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(
        {
          text: "x",
          hash: "h",
          parties: [{ name: "Acme Test Co" }, { name: "LawDog Demo LLC" }],
          reviewParties: [],
        } as never,
        { text: "x", intakeText: "1. 2. 3. 4. 5. 6. 7. 8. 9. 10." },
      ),
    ).not.toThrow();

    // Source invariants: integrity asserts are gated on resume in freeze candidate.
    const freezeSrc = readFileSync(join(here, "paidProFreezeCandidate.ts"), "utf8");
    expect(freezeSrc).toMatch(
      /if \(!isCreatorDashboardSignerSetupResumeActive\(\)\) \{\s*assertPaidProReviewedDocumentIntegrity/,
    );
    void assertPaidProReviewedDocumentIntegrity;
  });

  it("does not expose Retry Pro draft as primary resume CTA path", () => {
    expect(intakeSrc).toContain(
      "Dashboard signer-setup resume owns the sticky CTA — never Retry Pro draft",
    );
    expect(intakeSrc).toContain("!dashboardSignerSetupResumeUiActive");
  });

  it("demo session post-POS uses 'Continue' CTA, not dashboard resume labels (#23 regression)", () => {
    // The unified CTA resolver must check for demo session BEFORE dashboard resume
    expect(intakeSrc).toContain("Demo session user post-POS: use");
    expect(intakeSrc).toContain("demo_session_signer_details_complete");
    expect(intakeSrc).toContain("demo_session_signer_details_incomplete");
    // The demo check must appear BEFORE the dashboard resume check
    const demoCheckIdx = intakeSrc.indexOf("Demo session user post-POS: use");
    const dashboardResumeIdx = intakeSrc.indexOf(
      "Dashboard signer-setup resume owns the sticky CTA",
    );
    expect(demoCheckIdx).toBeGreaterThan(-1);
    expect(dashboardResumeIdx).toBeGreaterThan(-1);
    expect(demoCheckIdx).toBeLessThan(dashboardResumeIdx);
  });

  it("demo session CTA routes to SimpleProFinalReviewScreen without prepare signatures (#23 regression)", () => {
    const demoCtaIdx = intakeSrc.indexOf('cta.reason === "demo_session_signer_details_complete"');
    const dashboardCtaIdx = intakeSrc.indexOf('cta.reason === "dashboard_signer_setup_resume_complete"');
    expect(demoCtaIdx).toBeGreaterThan(-1);
    expect(dashboardCtaIdx).toBeGreaterThan(-1);
    const continueStart = intakeSrc.indexOf("Continue after complete signers opens SimpleProFinalReviewScreen");
    const continueBlock = intakeSrc.slice(
      continueStart,
      intakeSrc.indexOf("isPaidProReviewDecisionScrollReason", continueStart),
    );
    expect(continueBlock).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(continueBlock).not.toContain("handlePaidProPrepareSignaturesFromFirstReview");
    expect(continueBlock).not.toContain("/app/esign");
    expect(continueBlock).toContain("demo_session_signer_details_complete");
    expect(continueBlock).toContain("dashboard_signer_setup_resume_complete");
  });
});
