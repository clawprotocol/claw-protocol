/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AFFILIATE_FIRST_PAYMENT_OFFER_COPY } from "../../account/affiliatePresentation";

describe("Genesis affiliate dashboard commercial copy", () => {
  it("does not promise recurring referral share", () => {
    const src = readFileSync(
      new URL("./GenesisAffiliateDashboardPage.tsx", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/recurring referral/i);
    expect(src).not.toMatch(/while referred Pro subscriptions remain active/i);
    expect(src).toMatch(/first eligible net/i);
    expect(src).toMatch(/\$14\.70/);
    expect(src).toMatch(/\$147\.00/);
    expect(AFFILIATE_FIRST_PAYMENT_OFFER_COPY).toMatch(/Renewals do not earn another commission/);
  });
});
