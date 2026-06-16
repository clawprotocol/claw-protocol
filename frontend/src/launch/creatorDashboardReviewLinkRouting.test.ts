/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  creatorDashboardCompletedProofPath,
  creatorDashboardFocusAgreementPath,
  creatorDashboardPrepareSignatureLinksPath,
  creatorDashboardReviewLinkReadyPath,
  creatorDashboardSignedAgreementViewPath,
  creatorDashboardUsesManualReviewLinkPage,
  isAppDashboardPathname,
  shouldRedirectLegacyDoneToPrepareSignatureLinks,
  stripPrepareSignatureLinksQueryFromDashboardUrl,
} from "./creatorDashboardReviewLinkRouting";
import type { AgreementDraft } from "../agreement/agreementTypes";

import { creatorDashboardSigningStatusPath } from "./creatorDashboardReviewLinkRouting";

describe("creatorDashboardReviewLinkRouting", () => {
  it("builds signing status path away from legacy send route", () => {
    expect(creatorDashboardSigningStatusPath("ag_1")).toBe("/app/signing-status/ag_1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats only explicit manual env as manual review-link page mode", () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual");
    expect(creatorDashboardUsesManualReviewLinkPage()).toBe(true);

    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "email");
    expect(creatorDashboardUsesManualReviewLinkPage()).toBe(false);

    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual_and_email");
    expect(creatorDashboardUsesManualReviewLinkPage()).toBe(false);

    vi.unstubAllEnvs();
    expect(creatorDashboardUsesManualReviewLinkPage()).toBe(false);
  });

  it("builds dashboard focus, prepare, completed proof, and signed view paths", () => {
    expect(creatorDashboardCompletedProofPath("ag_1")).toBe("/app/done/ag_1");
    expect(creatorDashboardSignedAgreementViewPath("ag_1")).toBe("/app/agreements/ag_1/view-signed");
    expect(creatorDashboardReviewLinkReadyPath("ag_1")).toBe("/app/done/ag_1");
    expect(creatorDashboardFocusAgreementPath("ag_1")).toBe("/app?focus=ag_1");
    expect(creatorDashboardPrepareSignatureLinksPath("ag_1")).toBe(
      "/app?prepare_signature_links=ag_1",
    );
  });

  it("redirects legacy done bookmarks when all reviews approved and unsigned", () => {
    const draft = {
      parties: [
        { id: "p1", name: "Owner", role: "owner", email: "o@example.com" },
        { id: "p2", name: "Reviewer", role: "reviewer", email: "r@example.com" },
      ],
      audit_log: [{ event_type: "participant_approved", value: { participant_id: "p2" } }],
    } as AgreementDraft;

    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "email");
    expect(
      shouldRedirectLegacyDoneToPrepareSignatureLinks({
        signed: false,
        draft,
      }),
    ).toBe(true);

    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual");
    expect(
      shouldRedirectLegacyDoneToPrepareSignatureLinks({
        signed: false,
        draft,
      }),
    ).toBe(true);

    expect(
      shouldRedirectLegacyDoneToPrepareSignatureLinks({
        signed: true,
        draft,
      }),
    ).toBe(false);
  });

  it("strips prepare_signature_links query only on /app dashboard pathname", () => {
    window.history.replaceState(null, "", "/app?prepare_signature_links=ag_1&focus=ag_1");
    const replaceState = vi.spyOn(window.history, "replaceState");

    expect(stripPrepareSignatureLinksQueryFromDashboardUrl()).toBe("/app?focus=ag_1");
    expect(replaceState).toHaveBeenCalledWith(window.history.state, "", "/app?focus=ag_1");

    replaceState.mockClear();
    window.history.replaceState(null, "", "/app/esign/doc_1?agreement_bridge=1");
    replaceState.mockClear();
    expect(stripPrepareSignatureLinksQueryFromDashboardUrl()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();

    replaceState.mockRestore();
  });

  it("detects dashboard pathname", () => {
    expect(isAppDashboardPathname("/app")).toBe(true);
    expect(isAppDashboardPathname("/app/")).toBe(true);
    expect(isAppDashboardPathname("/app/esign/doc_1")).toBe(false);
  });
});
