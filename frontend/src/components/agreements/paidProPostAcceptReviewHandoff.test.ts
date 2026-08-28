/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  POST_ACCEPT_CONTINUE_TO_SIGNATURE_LINKS_REASON,
  resolvePostAcceptReviewHandoffCta,
  shouldSkipReFinalizeBeforePostAcceptPrepare,
} from "./paidProPostAcceptReviewHandoff";
import { shouldHidePaidProReviewDecisionChromeForDashboardResume } from "./paidProReviewDecisionModel";
import { isDashboardSignerSetupResumeUiActive } from "../../launch/creatorDashboardReviewLinkRouting";
import { DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA } from "./signerSetupPartyIdentity";
import { resolvePaidProStickyCta } from "./paidProStickyCta";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

/**
 * Post-accept remount: accept 200 + frozen-signing-authority 200, then the review shell
 * drops Continue / Choose your next step. bind-user-org / access is not the Continue gate.
 */
describe("post-accept review remount handoff", () => {
  it("first failing predicate: mount-sticky resume stays true until finalize, then must end", () => {
    expect(
      isDashboardSignerSetupResumeUiActive({
        openSignerSetupOnResume: true,
        createFlowPhase: "draft_ready_for_review",
        paidProInlineSignerSetupLatched: false,
        signerMetadataFinalized: false,
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

  it("does not hide Choose your next step after accept remount unmounts the resume form", () => {
    expect(
      shouldHidePaidProReviewDecisionChromeForDashboardResume({
        dashboardSignerSetupResumeUiActive: true,
        inlineSignerSetupMounted: false,
        signerMetadataFinalized: true,
      }),
    ).toBe(false);
  });

  it("sticky review_decision is a dead badge unless on-card chrome or Continue is restored", () => {
    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(sticky.phase).toBe("review_decision");
    expect(sticky.showStickyBar).toBe(false);
    expect(sticky.label).toBe("");
    expect(sticky.disabled).toBe(true);

    const restored = resolvePostAcceptReviewHandoffCta({
      signerDetailsComplete: true,
      signerMetadataFinalized: true,
      signaturePreparationRequested: false,
      reviewDecisionChromeVisible: false,
      stickyPhase: sticky.phase,
    });
    expect(restored).toEqual({
      label: DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA,
      action: "guided_continue",
      disabled: false,
      reason: POST_ACCEPT_CONTINUE_TO_SIGNATURE_LINKS_REASON,
    });
    expect(restored?.label).toBe("Continue to signature links");
  });

  it("does not restore a second sticky Continue when on-card Prepare chrome is visible", () => {
    expect(
      resolvePostAcceptReviewHandoffCta({
        signerDetailsComplete: true,
        signerMetadataFinalized: true,
        signaturePreparationRequested: false,
        reviewDecisionChromeVisible: true,
        stickyPhase: "review_decision",
      }),
    ).toBeNull();
  });

  it("does not treat bind-user-org / access as the Continue predicate after accept", () => {
    expect(shouldSkipReFinalizeBeforePostAcceptPrepare({
      hasAuthoritativeSigningSnapshot: true,
      signerMetadataFinalizedLatch: false,
    })).toBe(true);
    expect(shouldSkipReFinalizeBeforePostAcceptPrepare({
      hasAuthoritativeSigningSnapshot: false,
      signerMetadataFinalizedLatch: true,
    })).toBe(true);
    expect(shouldSkipReFinalizeBeforePostAcceptPrepare({
      hasAuthoritativeSigningSnapshot: false,
      signerMetadataFinalizedLatch: false,
    })).toBe(false);
    expect(intakeSrc).not.toMatch(
      /dashboard_signer_setup_resume_complete[\s\S]{0,400}bind-user-org/,
    );
    expect(intakeSrc).not.toMatch(
      /resolvePostAcceptReviewHandoffCta\([\s\S]{0,300}canShowProCtas/,
    );
  });

  it("intake paints post-accept Continue / Prepare without a new draft POST or mail", () => {
    expect(intakeSrc).toContain("shouldHidePaidProReviewDecisionChromeForDashboardResume");
    expect(intakeSrc).toContain("resolvePostAcceptReviewHandoffCta");
    expect(intakeSrc).toContain("shouldSkipReFinalizeBeforePostAcceptPrepare");
    expect(intakeSrc).toContain("signerMetadataFinalized:");
    const continueBlock = intakeSrc.slice(
      intakeSrc.indexOf('if (cta.reason === "dashboard_signer_setup_resume_complete")'),
      intakeSrc.indexOf('if (cta.reason === "dashboard_signer_setup_resume_complete")') + 900,
    );
    expect(continueBlock).toContain("shouldSkipReFinalizeBeforePostAcceptPrepare");
    expect(continueBlock).toContain("handlePaidProPrepareSignaturesFromFirstReview()");
    expect(continueBlock).not.toMatch(/resend|sendEmail|send_mail/i);
    expect(continueBlock).not.toMatch(/stripe|checkout|premiumCompletion/i);
  });
});
