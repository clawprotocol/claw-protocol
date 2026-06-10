import { afterEach, describe, expect, it, vi } from "vitest";
import {
  creatorDashboardFocusAgreementPath,
  creatorDashboardReviewLinkReadyPath,
  creatorDashboardUsesManualReviewLinkPage,
} from "./creatorDashboardReviewLinkRouting";

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
  });
});
