import { describe, expect, it } from "vitest";
import { buildReviewFirstDocumentDisplayHtml } from "./reviewFirstDocumentDisplay";

const CORPUS = `MASTER SERVICES AGREEMENT

This Mutual Services Agreement (the "Agreement") is entered into as of the Effective Date by and between Client Co, a Delaware corporation ("Client"), and Provider LLC, a California limited liability company ("Service Provider").

${"Consulting services shall be performed in a professional manner. ".repeat(24)}`;

describe("reviewFirstDocumentDisplay", () => {
  it("includes signature region in display html when corpus has execution block", () => {
    const corpus = `MASTER SERVICES AGREEMENT

This Agreement is between parties.

${"Services shall be performed professionally. ".repeat(30)}

IN WITNESS WHEREOF

Blue Canyon Analytics LLC
Sarah Mitchell
CEO
Notice Email: legal@bluecanyon.example

Iron Vale Systems Inc.
Michael Torres
President`;
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>short</p>",
      corpusText: corpus,
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });
    expect(html).toMatch(/premium-doc-signature|Sarah Mitchell|Michael Torres/i);
  });

  it("routes long paid-pro corpus through premium readonly html builder", () => {
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>weak title</p>",
      corpusText: CORPUS,
      partyNames: ["Client Co", "Provider LLC"],
    });
    expect(html).not.toContain('class="premium-readonly-doc"');
    expect(html.toLowerCase()).toContain("master services agreement");
    expect(html).not.toContain("weak title");
  });

  it("wraps short server html with premium-readonly-doc class", () => {
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>Short draft</p>",
      corpusText: "tiny",
    });
    expect(html).toContain('class="premium-readonly-doc"');
    expect(html).toContain("Short draft");
  });
});
