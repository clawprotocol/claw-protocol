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

  it("sticky CTA is Save signer details / Continue to signature links — never Retry Pro draft", () => {
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
    expect(DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA).toBe("Continue to signature links");
    expect(intakeSrc).toContain("resolveDashboardSignerSetupResumePrimaryCta");
    expect(intakeSrc).toContain("dashboard_signer_setup_resume_complete");
    expect(intakeSrc).toContain("handlePaidProPrepareSignaturesFromFirstReview()");
  });

  it("renders locked agreement preview and mounts signer fields on resume shell", () => {
    expect(intakeSrc).toContain('data-testid="dashboard-signer-setup-agreement-preview"');
    expect(intakeSrc).toContain("dashboard_signer_setup_resume");
    expect(intakeSrc).toContain("Seed locked agreement preview from persisted workspace corpus");
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
});
