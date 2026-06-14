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

  it("routes owner to dashboard when email delivery mode is active and invites sent", () => {
    expect(ownerPostReviewSendUsesDashboard("manual_and_email")).toBe(true);
    expect(
      resolveOwnerPostReviewSendPath("ag_email_1", {
        mode: "manual_and_email",
        reviewEmailDeliveryAttempted: true,
        reviewInviteEmailsSent: true,
      }),
    ).toBe("/app");
    expect(
      resolveOwnerPostReviewSendRoute("ag_email_1", {
        mode: "email",
        reviewEmailDeliveryAttempted: true,
        reviewInviteEmailsSent: true,
      }).reason,
    ).toBe("delivery_mode_email");
  });

  it("routes to dashboard focus when email mode delivery was not attempted", () => {
    const route = resolveOwnerPostReviewSendRoute("ag_email_skip", {
      mode: "email",
      reviewEmailDeliveryAttempted: false,
      reviewInviteEmailsSent: false,
    });
    expect(route.path).toBe("/app?focus=ag_email_skip");
    expect(route.destination).toBe("dashboard");
    expect(route.reason).toBe("review_sent_failed_fallback");
  });

  it("routes to dashboard focus when email mode delivery attempted but no invite marker", () => {
    const route = resolveOwnerPostReviewSendRoute("ag_email_incomplete", {
      mode: "email",
      reviewEmailDeliveryAttempted: true,
      reviewInviteEmailsSent: false,
    });
    expect(route.path).toBe("/app?focus=ag_email_incomplete");
    expect(route.reason).toBe("review_email_delivery_incomplete");
  });

  it("routes owner to dashboard when manual mode sends review successfully", () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual");
    expect(ownerPostReviewSendUsesDashboard("manual")).toBe(true);
    expect(
      resolveOwnerPostReviewSendPath("ag_manual_1", {
        mode: "manual",
        reviewEmailDeliveryAttempted: true,
        reviewInviteEmailsSent: true,
        reviewSentOk: true,
      }),
    ).toBe("/app");
    expect(
      resolveOwnerPostReviewSendRoute("ag_manual_1", {
        reviewEmailDeliveryAttempted: true,
        reviewInviteEmailsSent: true,
        reviewSentOk: true,
      }).reason,
    ).toBe("review_sent_ok");
  });

  it("routes manual mode without delivery markers to dashboard focus, not done", () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual");
    expect(
      resolveOwnerPostReviewSendPath("ag_manual_pending", {
        mode: "manual",
        reviewEmailDeliveryAttempted: false,
      }),
    ).toBe("/app?focus=ag_manual_pending");
  });

  it("routes to dashboard when review-sent ok and delivery env is unset", () => {
    vi.unstubAllEnvs();
    const route = resolveOwnerPostReviewSendRoute("ag_runtime_1", {
      reviewSentOk: true,
      reviewEmailDeliveryAttempted: true,
      reviewInviteEmailsSent: true,
    });
    expect(route.path).toBe("/app");
    expect(route.destination).toBe("dashboard");
    expect(route.reason).toBe("review_sent_ok");
  });

  it("missing VITE_REVIEW_DELIVERY_MODE with review-sent ok routes to dashboard", () => {
    vi.unstubAllEnvs();
    expect(
      resolveOwnerPostReviewSendPath("ag_missing_env", {
        reviewSentOk: true,
        reviewEmailDeliveryAttempted: true,
        reviewInviteEmailsSent: true,
      }),
    ).toBe("/app");
  });

  it("falls back to dashboard focus when review-sent failed and env is unset", () => {
    vi.unstubAllEnvs();
    const route = resolveOwnerPostReviewSendRoute("ag_fail_1", { reviewSentOk: false });
    expect(route.path).toBe("/app?focus=ag_fail_1");
    expect(route.destination).toBe("dashboard");
    expect(route.reason).toBe("review_sent_failed_fallback");
  });

  it("exports email-mode owner status copy", () => {
    expect(REVIEW_INVITATIONS_SENT_TITLE).toBe("Review invitations sent");
    expect(REVIEW_INVITATIONS_SENT_BODY).toContain("Track review status from your dashboard");
  });
});
