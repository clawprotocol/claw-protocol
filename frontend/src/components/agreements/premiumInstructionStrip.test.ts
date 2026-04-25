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
});
