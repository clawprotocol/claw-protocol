/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  AFFILIATE_FIRST_ANNUAL_COMMISSION_USD,
  AFFILIATE_FIRST_INVOICE_COMMISSION_USD,
  AFFILIATE_FIRST_PAYMENT_OFFER_COPY,
  AFFILIATE_MONTHLY_COMMISSION_USD,
  buildAffiliateReferralLink,
  resolveAffiliateDashboardSnapshot,
  slugifyAffiliateHandle,
} from "../account/affiliatePresentation";

describe("affiliatePresentation", () => {
  it("builds /r/{slug} referral links", () => {
    expect(buildAffiliateReferralLink("Jane Partner", "https://lawdog.test")).toBe(
      "https://lawdog.test/r/jane-partner",
    );
  });

  it("illustrates 30% first-payment commission for monthly and annual list prices", () => {
    expect(AFFILIATE_FIRST_INVOICE_COMMISSION_USD).toBe(14.7);
    expect(AFFILIATE_FIRST_ANNUAL_COMMISSION_USD).toBe(147);
    expect(AFFILIATE_MONTHLY_COMMISSION_USD).toBe(14.7);
    expect(AFFILIATE_FIRST_PAYMENT_OFFER_COPY).toMatch(/first eligible net/i);
    expect(AFFILIATE_FIRST_PAYMENT_OFFER_COPY).toMatch(/\$14\.70/);
    expect(AFFILIATE_FIRST_PAYMENT_OFFER_COPY).toMatch(/\$147\.00/);
    expect(AFFILIATE_FIRST_PAYMENT_OFFER_COPY).not.toMatch(/recurring/i);
  });

  it("slugifies affiliate handles safely", () => {
    expect(slugifyAffiliateHandle("  QA User #1 ")).toBe("qa-user-1");
  });

  it("returns MVP affiliate snapshot with referral link and KPI zeros", () => {
    const snap = resolveAffiliateDashboardSnapshot();
    expect(snap.referralLink).toMatch(/\/r\//);
    expect(snap.referrals).toBe(0);
    expect(snap.activeSubscribers).toBe(0);
    expect(snap.monthlyEarningsUsd).toBe(0);
    expect(snap.lifetimeEarningsUsd).toBe(0);
  });
});
