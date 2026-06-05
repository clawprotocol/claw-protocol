import { describe, expect, it } from "vitest";
import { buildReviewFirstTextDiffSummary } from "./reviewFirstTextDiff";
import {
  resolveReviewFirstSubmitAuthority,
  REVIEW_FIRST_SUBMIT_MISSING_TOKEN_MESSAGE,
  REVIEW_FIRST_SUBMIT_PERSONAL_LINK_MESSAGE,
} from "./reviewFirstSubmitAuthority";

const diff = buildReviewFirstTextDiffSummary(
  "Payment within thirty (30) days after receipt.",
  "Payment within fifteen (15) days after receipt.",
);

describe("resolveReviewFirstSubmitAuthority", () => {
  it("allows submit with valid token, participant, preview, and material changes", () => {
    const auth = resolveReviewFirstSubmitAuthority({
      diff,
      needsPersonalizedLink: false,
      participantPid: "party-1",
      partiesHaveIds: true,
      recipientAccessToken: "tok_personal",
      recipientPreview: true,
      signingLockActive: false,
    });
    expect(auth.canSubmit).toBe(true);
    expect(auth.reason).toBe("ready");
  });

  it("blocks submit without personal access token when parties have ids", () => {
    const auth = resolveReviewFirstSubmitAuthority({
      diff,
      needsPersonalizedLink: false,
      participantPid: "party-1",
      partiesHaveIds: true,
      recipientAccessToken: "",
      recipientPreview: true,
      signingLockActive: false,
    });
    expect(auth.canSubmit).toBe(false);
    expect(auth.reason).toBe("missing_access_token");
    expect(auth.userMessage).toBe(REVIEW_FIRST_SUBMIT_MISSING_TOKEN_MESSAGE);
  });

  it("blocks submit on non-personalized preview links", () => {
    const auth = resolveReviewFirstSubmitAuthority({
      diff,
      needsPersonalizedLink: true,
      participantPid: "",
      partiesHaveIds: true,
      recipientAccessToken: "",
      recipientPreview: true,
      signingLockActive: false,
    });
    expect(auth.canSubmit).toBe(false);
    expect(auth.reason).toBe("personal_link_required");
    expect(auth.userMessage).toBe(REVIEW_FIRST_SUBMIT_PERSONAL_LINK_MESSAGE);
  });
});
