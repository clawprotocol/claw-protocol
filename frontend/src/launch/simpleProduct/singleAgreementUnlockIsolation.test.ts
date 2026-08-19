/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("single-agreement unlock isolation", () => {
  it("refuses Stripe subscription mode and demo Pro sync for $9 intent", () => {
    const src = readFileSync(new URL("./SimpleCheckoutPage.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/isSingleAgreementCheckout/);
    expect(src).toMatch(/One-time unlock uses a separate payment path/);
    expect(src).toMatch(/if \(!isSingleAgreementCheckout\)/);
    expect(src).toMatch(/syncDemoSubscriptionEntitlementIfApplicable/);
    // Guard must wrap demo sync — not call it unconditionally after unlock.
    const syncIdx = src.indexOf("await syncDemoSubscriptionEntitlementIfApplicable");
    const guardIdx = src.lastIndexOf("if (!isSingleAgreementCheckout)", syncIdx);
    expect(guardIdx).toBeGreaterThan(0);
    expect(guardIdx).toBeLessThan(syncIdx);
  });
});
