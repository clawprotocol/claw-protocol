import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_INVITATIONS_SENT_BODY,
  REVIEW_INVITATIONS_SENT_TITLE,
  ownerPostReviewSendUsesDashboard,
  resolveOwnerPostReviewSendPath,
} from "./reviewDeliveryOwnerRouting";

describe("reviewDeliveryOwnerRouting", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes owner to dashboard when email delivery mode is active", () => {
    expect(ownerPostReviewSendUsesDashboard("manual_and_email")).toBe(true);
    expect(resolveOwnerPostReviewSendPath("ag_email_1", "manual_and_email")).toBe("/app");
    expect(resolveOwnerPostReviewSendPath("ag_email_1", "email")).toBe("/app");
  });

  it("routes owner to review link ready page in manual mode", () => {
    expect(ownerPostReviewSendUsesDashboard("manual")).toBe(false);
    expect(resolveOwnerPostReviewSendPath("ag_manual_1", "manual")).toBe("/app/done/ag_manual_1");
  });

  it("exports email-mode owner status copy", () => {
    expect(REVIEW_INVITATIONS_SENT_TITLE).toBe("Review invitations sent");
    expect(REVIEW_INVITATIONS_SENT_BODY).toContain("Track review status from your dashboard");
  });
});
