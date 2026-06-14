import { afterEach, describe, expect, it, vi } from "vitest";
import {
  creatorDashboardFocusAgreementPath,
  creatorDashboardPrepareSignatureLinksPath,
  creatorDashboardReviewLinkReadyPath,
  creatorDashboardUsesManualReviewLinkPage,
  shouldRedirectLegacyDoneToPrepareSignatureLinks,
} from "./creatorDashboardReviewLinkRouting";
import type { AgreementDraft } from "../agreement/agreementTypes";

describe("creatorDashboardReviewLinkRouting", () => {
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

  it("builds dashboard focus and done paths", () => {
    expect(creatorDashboardReviewLinkReadyPath("ag_1")).toBe("/app/done/ag_1");
    expect(creatorDashboardFocusAgreementPath("ag_1")).toBe("/app?focus=ag_1");
    expect(creatorDashboardPrepareSignatureLinksPath("ag_1")).toBe(
      "/app?prepare_signature_links=ag_1",
    );
  });

  it("redirects legacy done bookmarks when email delivery and all reviews approved", () => {
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
        confirmedSend: false,
      }),
    ).toBe(true);
    expect(
      shouldRedirectLegacyDoneToPrepareSignatureLinks({
        signed: false,
        draft,
        confirmedSend: true,
      }),
    ).toBe(false);

    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual");
    expect(
      shouldRedirectLegacyDoneToPrepareSignatureLinks({
        signed: false,
        draft,
        confirmedSend: false,
      }),
    ).toBe(false);
  });
});
