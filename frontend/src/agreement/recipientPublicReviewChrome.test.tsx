/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccessProvider } from "../access/AccessContext";
import {
  RECIPIENT_APPROVED_LAWDOG_PROMO_LINE,
  RECIPIENT_REVIEW_ACCOUNT_HEADER_ASIDE,
  resolveRecipientReviewHeaderAside,
} from "./recipientPublicReviewChrome";

describe("recipientPublicReviewChrome", () => {
  it("shows account aside before approval and hides it after approval", () => {
    expect(resolveRecipientReviewHeaderAside(false)).toBe(RECIPIENT_REVIEW_ACCOUNT_HEADER_ASIDE);
    expect(resolveRecipientReviewHeaderAside(true)).toBeNull();
  });

  it("account aside renders Account and Current plan copy when visible", () => {
    render(<AccessProvider>{RECIPIENT_REVIEW_ACCOUNT_HEADER_ASIDE}</AccessProvider>);
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText(/Current plan:/)).toBeTruthy();
  });

  it("promo line avoids account or billing language", () => {
    expect(RECIPIENT_APPROVED_LAWDOG_PROMO_LINE).toMatch(/Reviewed with LawDog/i);
    expect(RECIPIENT_APPROVED_LAWDOG_PROMO_LINE).not.toMatch(/account|billing|plan/i);
  });
});
