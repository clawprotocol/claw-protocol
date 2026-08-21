import { describe, expect, it } from "vitest";
import { stripPremiumInstructionNoiseForDocument } from "./premiumInstructionStrip";

/**
 * Canonical Harbor dump fixture for leak regression tests.
 * From user query: "I run Harbor Pool & Patio LLC, a pool company in Mesa / Phoenix.
 * Mesa Realty Group LLC said they'll send us buyer and listing leads if we pay them
 * 7% after the customer puts down a deposit. Don't count our house accounts or anyone
 * we already did a job for last year. If the job falls through in 45 days they have
 * to give the money back. 12 month deal, exclusive in the Phoenix metro as long as
 * they send a decent number of leads, and they can't poach our customers or call them
 * direct. Arizona law. My dog is named Biscuit and the trucks are teal."
 */
const HARBOR_LEAK_FIXTURE_LINES = [
  `11. Mesa Realty Group LLC / said they'll send us buyer and listing leads if we pay them 7% after the customer puts down a deposit.`,
  `12. Don't / count / our house accounts or anyone we already did a job for last year.`,
  `13. 12 month deal, exclusive in the Phoenix metro as long as they send a decent number of leads, and they can't poach our customers or call them direct.`,
  `Commercial detail carried forward from user notes (edit freely before send):`,
];

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

  it("strips Commercial detail carried forward meta line (Harbor leak #27 regression)", () => {
    const raw = `9. CONFIDENTIALITY\n\nAll proprietary information shall remain confidential.\n\nCommercial detail carried forward from user notes (edit freely before send):\n\n1. We need fast turnaround.\n\n10. NOTICES`;
    const out = stripPremiumInstructionNoiseForDocument(raw);
    expect(out).not.toMatch(/Commercial detail carried forward/i);
    expect(out).toContain("9. CONFIDENTIALITY");
    expect(out).toContain("10. NOTICES");
  });

  it("removes all Harbor canonical leak lines from fixture", () => {
    // Build a corpus with leaked lines embedded
    const corpus = `SERVICES AGREEMENT

This Agreement is entered into by and between Harbor Pool & Patio LLC ("Client") and Mesa Realty Group LLC ("Service Provider").

1. SERVICES
The Service Provider shall provide lead generation services.

2. COMPENSATION
Client shall pay Service Provider 7% of the deposit amount.

10. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement.

${HARBOR_LEAK_FIXTURE_LINES[0]}

${HARBOR_LEAK_FIXTURE_LINES[1]}

${HARBOR_LEAK_FIXTURE_LINES[2]}

${HARBOR_LEAK_FIXTURE_LINES[3]}

14. NOTICES
All notices shall be sent to the addresses listed below.

13. GOVERNING LAW
This Agreement shall be governed by Arizona law.`;

    const out = stripPremiumInstructionNoiseForDocument(corpus);

    // MUST NOT appear in output (leaked dump lines)
    expect(out).not.toMatch(/11\.\s*Mesa Realty Group LLC.*said/i);
    expect(out).not.toMatch(/12\.\s*Don't.*count.*house accounts/i);
    expect(out).not.toMatch(/13\.\s*12 month deal/i);
    expect(out).not.toMatch(/Commercial detail carried forward from user notes/i);

    // MUST still appear (legitimate agreement content)
    expect(out).toContain("SERVICES AGREEMENT");
    expect(out).toContain("Harbor Pool & Patio LLC");
    expect(out).toContain("Mesa Realty Group LLC");
    expect(out).toContain("7%");
    expect(out).toContain("Arizona law");
    expect(out).toContain("1. SERVICES");
    expect(out).toContain("2. COMPENSATION");
    expect(out).toContain("10. ENTIRE AGREEMENT");
    expect(out).toContain("14. NOTICES");
    expect(out).toContain("13. GOVERNING LAW");

    // No Biscuit or teal leakage (user personal details from dump)
    expect(out).not.toMatch(/\bBiscuit\b/i);
    expect(out).not.toMatch(/\bteal\b/i);
  });

  it("preserves legitimate high-numbered sections with formal headings", () => {
    const raw = `11. INDEMNIFICATION\n\nEach party shall indemnify the other.\n\n12. LIMITATION OF LIABILITY\n\nNeither party shall be liable for consequential damages.`;
    const out = stripPremiumInstructionNoiseForDocument(raw);
    expect(out).toContain("11. INDEMNIFICATION");
    expect(out).toContain("12. LIMITATION OF LIABILITY");
    expect(out).toContain("indemnify");
    expect(out).toContain("liable");
  });

  it("strips exact Harbor leak lines from first Pro screen (source inspection fixture)", () => {
    // These are the exact lines from the task that must not appear
    const exactLeakLines = [
      `11. Mesa Realty Group LLC / said they'll send us buyer and listing leads if we pay them 7% after the customer puts down a deposit.`,
      `12. Don't / count / our house accounts or anyone we already did a job for last year.`,
      `13. 12 month deal, exclusive in the Phoenix metro as long as they send a decent number of leads, and they can't poach our customers or call them direct.`,
      `Commercial detail carried forward from user notes (edit freely before send):`,
    ];

    for (const line of exactLeakLines) {
      const corpus = `10. ENTIRE AGREEMENT\n\nThis Agreement constitutes the entire agreement.\n\n${line}\n\n14. NOTICES`;
      const out = stripPremiumInstructionNoiseForDocument(corpus);
      expect(out).not.toContain(line.replace(/\s+\/\s+/g, " "));
      expect(out).toContain("10. ENTIRE AGREEMENT");
      expect(out).toContain("14. NOTICES");
    }
  });
});
