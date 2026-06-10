import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_INVITATIONS_SENT_BODY,
  REVIEW_INVITATIONS_SENT_TITLE,
  ownerPostReviewSendUsesDashboard,
  resolveOwnerPostReviewSendPath,
  resolveOwnerPostReviewSendRoute,
} from "./reviewDeliveryOwnerRouting";

describe("reviewDeliveryOwnerRouting", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes owner to dashboard when email delivery mode is active", () => {
    expect(ownerPostReviewSendUsesDashboard("manual_and_email")).toBe(true);
    expect(resolveOwnerPostReviewSendPath("ag_email_1", "manual_and_email")).toBe("/app");
    expect(resolveOwnerPostReviewSendPath("ag_email_1", "email")).toBe("/app");
    expect(resolveOwnerPostReviewSendRoute("ag_email_1", { mode: "email", reviewSentOk: false }).reason).toBe(
      "delivery_mode_email",
    );
  });

  it("routes owner to review link ready page when manual mode is explicit", () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual");
    expect(ownerPostReviewSendUsesDashboard("manual")).toBe(false);
    expect(resolveOwnerPostReviewSendPath("ag_manual_1", "manual")).toBe("/app/done/ag_manual_1");
    expect(
      resolveOwnerPostReviewSendRoute("ag_manual_1", { reviewSentOk: true }).reason,
    ).toBe("explicit_manual_mode");
  });

  it("routes to dashboard when review-sent ok and delivery env is unset", () => {
    vi.unstubAllEnvs();
    const route = resolveOwnerPostReviewSendRoute("ag_runtime_1", { reviewSentOk: true });
    expect(route.path).toBe("/app");
    expect(route.destination).toBe("dashboard");
    expect(route.reason).toBe("review_sent_ok");
  });

  it("missing VITE_REVIEW_DELIVERY_MODE with review-sent ok does not route to done", () => {
    vi.unstubAllEnvs();
    expect(resolveOwnerPostReviewSendPath("ag_missing_env", { reviewSentOk: true })).toBe("/app");
  });

  it("falls back to done when review-sent failed and env is unset", () => {
    vi.unstubAllEnvs();
    const route = resolveOwnerPostReviewSendRoute("ag_fail_1", { reviewSentOk: false });
    expect(route.path).toBe("/app/done/ag_fail_1");
    expect(route.destination).toBe("done");
    expect(route.reason).toBe("review_sent_failed_fallback");
  });

  it("exports email-mode owner status copy", () => {
    expect(REVIEW_INVITATIONS_SENT_TITLE).toBe("Review invitations sent");
    expect(REVIEW_INVITATIONS_SENT_BODY).toContain("Track review status from your dashboard");
  });
});
