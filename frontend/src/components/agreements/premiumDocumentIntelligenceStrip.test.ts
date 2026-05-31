import { describe, expect, it } from "vitest";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { computePremiumDocumentRenderHints } from "./premiumDocumentRenderHints";
import {
  premiumRenderHintsWithoutDocumentCallouts,
  stripPremiumIntelligenceCalloutsFromCorpus,
} from "./premiumDocumentIntelligenceStrip";

describe("premiumDocumentIntelligenceStrip", () => {
  it("strips situation intelligence lines from plain corpus", () => {
    const body = [
      "CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      "Professional services shape — scope, acceptance, and how payment ties to deliverables or milestones.",
      "Employee and contractor signals both appeared — confirm the relationship before relying on this draft.",
      "",
      "1. Scope. Services.",
    ].join("\n");
    const stripped = stripPremiumIntelligenceCalloutsFromCorpus(body);
    expect(stripped).not.toMatch(/Professional services shape/i);
    expect(stripped).not.toMatch(/Employee and contractor signals/i);
    expect(stripped).toMatch(/1\. Scope/i);
  });

  it("suppressDocumentIntelligenceCallouts omits executive and contradiction HTML callouts", () => {
    const hints = computePremiumDocumentRenderHints(
      null,
      "",
      "consulting services for a client with contractor help",
    );
    expect(hints.executiveFramingLine).toBeTruthy();
    const html = buildPremiumAgreementReadonlyHtml(
      "CONSULTING AGREEMENT\n\nBetween parties.",
      {
        signatureSectionMode: "collaboration",
        partyNames: ["A LLC", "B Inc"],
        renderHints: hints,
        suppressDocumentIntelligenceCallouts: true,
      },
    );
    expect(html).not.toContain("premium-doc-callout");
    expect(html).not.toMatch(/Professional services shape/i);
    expect(premiumRenderHintsWithoutDocumentCallouts(hints)?.executiveFramingLine).toBeNull();
  });
});
