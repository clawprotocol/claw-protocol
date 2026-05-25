import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE } from "../../agreement/recipientAccessMintPayload";
import {
  REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY,
  REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE,
  resolveReviewFirstMintFailureUserMessage,
} from "./reviewFirstSendSurface";

describe("reviewFirstSendSurface", () => {
  it("maps signing_token_secret_not_configured to review-first env copy", () => {
    expect(
      resolveReviewFirstMintFailureUserMessage({
        lastMintErrorCode: SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE,
        firstErrorStatus: 422,
      }),
    ).toBe(REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE);
    expect(REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE).toContain("signing token secret");
  });

  it("SimpleSendPage hides AgreementReview for paid Pro review-first", () => {
    const page = readFileSync(join(__dirname, "SimpleSendPage.tsx"), "utf8");
    expect(page).toContain("paidProReviewFirstRoute");
    expect(page).toContain("ReviewFirstMintErrorPanel");
    expect(page).not.toMatch(
      /paidProReviewFirstRoute\s*\?\s*\([\s\S]*?<AgreementReview[\s\S]*?\)\s*:\s*\([\s\S]*?<AgreementReview/,
    );
    const guardIdx = page.indexOf("{paidProReviewFirstRoute ? (");
    const reviewIdx = page.indexOf("<AgreementReview", guardIdx);
    const elseIdx = page.indexOf(") : (", guardIdx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(elseIdx).toBeGreaterThan(guardIdx);
    expect(reviewIdx).toBeGreaterThan(elseIdx);
  });

  it("SimpleSendPage blocks Pro upsell modal on paid Pro review-first route", () => {
    const page = readFileSync(join(__dirname, "SimpleSendPage.tsx"), "utf8");
    expect(page).toContain("open={paywallOpen && !sendAuthoritative && !paidProReviewFirstRoute}");
    expect(page).toContain("if (paidProReviewFirstRoute) return");
  });

  it("forbidden generic send copy is documented for regression tests", () => {
    expect(REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY).toContain("Review before sending");
    expect(REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY).toContain("Send this as a professional agreement");
  });
});
