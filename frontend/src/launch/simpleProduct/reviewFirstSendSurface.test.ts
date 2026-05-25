import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE } from "../../agreement/recipientAccessMintPayload";
import {
  REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY,
  REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE,
  isReviewFirstPremiumSendIntentActive,
  resolveReviewFirstMintFailureUserMessage,
  shouldRenderPaidProReviewFirstSendSurface,
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

  it("detects review-first intent from handoff, state, or session marker", () => {
    expect(
      isReviewFirstPremiumSendIntentActive({
        handoffPremiumIntent: "review",
      }),
    ).toBe(true);
    expect(
      isReviewFirstPremiumSendIntentActive({
        handoffOpenFlowPhase: "review",
      }),
    ).toBe(true);
  });

  it("shouldRenderPaidProReviewFirstSendSurface trusts streamlined review handoff before hydration", () => {
    expect(
      shouldRenderPaidProReviewFirstSendSurface({
        agreementId: "ag_1",
        draft: null,
        handoffPremiumIntent: "review",
        streamlinedSimpleFlow: true,
        hasPrimedHandoffDraft: true,
      }),
    ).toBe(true);
  });

  it("shouldRenderPaidProReviewFirstSendSurface is false for signature intent", () => {
    const draft = {
      premium_render_source: "server_full_document_text",
      server_full_document_text: "x".repeat(700),
    } as AgreementDraft;
    expect(
      shouldRenderPaidProReviewFirstSendSurface({
        agreementId: "ag_sig",
        draft,
        handoffPremiumIntent: "signature",
        sendAuthoritative: true,
      }),
    ).toBe(false);
  });

  it("SimpleSendPage early-returns dedicated review-first surface (no AgreementReview mount)", () => {
    const page = readFileSync(join(__dirname, "SimpleSendPage.tsx"), "utf8");
    expect(page).toContain("if (paidProReviewFirstRoute) {");
    expect(page).toContain('data-testid="review-first-send-surface"');
    expect(page).toContain("ReviewFirstMintErrorPanel");
    expect(page).toContain("shouldRenderPaidProReviewFirstSendSurface");
    const earlyReturnIdx = page.indexOf("if (paidProReviewFirstRoute) {");
    const agreementReviewIdx = page.indexOf("<AgreementReview");
    expect(earlyReturnIdx).toBeGreaterThan(-1);
    expect(agreementReviewIdx).toBeGreaterThan(earlyReturnIdx);
  });

  it("SimpleSendPage blocks Pro upsell modal on paid Pro review-first route", () => {
    const page = readFileSync(join(__dirname, "SimpleSendPage.tsx"), "utf8");
    expect(page).toContain("open={paywallOpen && !sendAuthoritative && !paidProReviewFirstRoute}");
    expect(page).toContain("if (paidProReviewFirstRoute) return");
  });

  it("forbidden generic send copy is documented for regression tests", () => {
    expect(REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY).toContain("Review before sending");
    expect(REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY).toContain("Send this as a professional agreement");
    expect(REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY).toContain("Continue with draft version");
  });
});
