import { describe, expect, it } from "vitest";
import { createHybridSettlementQuote } from "./clawCheckoutSettlement";

describe("createHybridSettlementQuote", () => {
  it("split portions sum to invoice", () => {
    const q = createHybridSettlementQuote({
      agreementId: "a",
      tierId: "pro",
      cadence: "annual",
      invoiceUsd: 10_000,
      mode: "split",
      stablecoinSharePct: 40,
    });
    expect(q.stablecoinTreasuryUsd + q.fiatOnrampUsd).toBe(10_000);
  });

  it("crypto_first assigns full invoice to treasury leg quote", () => {
    const q = createHybridSettlementQuote({
      agreementId: "a",
      tierId: "starter",
      cadence: "monthly",
      invoiceUsd: 1000,
      mode: "crypto_first",
      stablecoinSharePct: 50,
    });
    expect(q.stablecoinTreasuryUsd).toBe(1000);
    expect(q.fiatOnrampUsd).toBe(0);
  });
});
