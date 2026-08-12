/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
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

  it("uses 30% commission on $49/month plan", () => {
    expect(AFFILIATE_MONTHLY_COMMISSION_USD).toBe(14.7);
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
