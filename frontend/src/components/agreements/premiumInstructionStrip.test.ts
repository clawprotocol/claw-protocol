import { describe, expect, it } from "vitest";
import { stripPremiumInstructionNoiseForDocument } from "./premiumInstructionStrip";

describe("stripPremiumInstructionNoiseForDocument", () => {
  it("removes standalone instruction lines", () => {
    const raw = `1. SCOPE\n\nWe need this rewritten so it reflects our deal.\n\nParty A shall perform services.`;
    const out = stripPremiumInstructionNoiseForDocument(raw);
    expect(out).not.toMatch(/we need this rewritten/i);
    expect(out).toContain("Party A shall perform");
  });

  it("removes this is not generic consulting meta line", () => {
    const raw = `Payment terms.\n\nThis is not generic consulting — we sell pools.\n\nNet 30.`;
    const out = stripPremiumInstructionNoiseForDocument(raw);
    expect(out).not.toMatch(/not generic consulting/i);
    expect(out).toContain("Net 30");
  });

  it("strips Harbor-style leaked prompt with slash-separated tokens (#23 regression)", () => {
    // Live leak from Harbor retest 2026-08-21:
    // "11. Mesa Realty Group LLC / said they'll send us…"
    const raw = `10. ENTIRE AGREEMENT\n\nThis Agreement constitutes the entire agreement.\n\n11. Mesa Realty Group LLC / said they'll send us buyer and listing leads if we pay them 7%.\n\n12. Don't / count / our house accounts or anyone we already did a job for.\n\n13. 12 month deal, exclusive in the Phoenix metro.`;
    const out = stripPremiumInstructionNoiseForDocument(raw);
    // Legitimate section stays
    expect(out).toContain("10. ENTIRE AGREEMENT");
    expect(out).toContain("entire agreement");
    // Leaked prompt prose must be stripped
    expect(out).not.toMatch(/Mesa Realty Group LLC.*said/i);
    expect(out).not.toMatch(/Don't.*count.*house accounts/i);
    expect(out).not.toMatch(/12 month deal/i);
  });

  it("normalizes slash-separated tokens to spaces for pattern matching", () => {
    const raw = `11. Mesa Realty Group LLC / said they'll send leads.`;
    const out = stripPremiumInstructionNoiseForDocument(raw);
    // After normalization: "11. Mesa Realty Group LLC said they'll send leads."
    // Should match the leaked prompt pattern and be stripped
    expect(out).not.toContain("Mesa Realty Group LLC");
  });

  it("preserves legitimate and/or constructs", () => {
    const raw = `The Client and/or its affiliates shall maintain insurance.`;
    const out = stripPremiumInstructionNoiseForDocument(raw);
    // "and/or" should NOT be collapsed (no space around slash)
    expect(out).toContain("and/or");
  });
});
