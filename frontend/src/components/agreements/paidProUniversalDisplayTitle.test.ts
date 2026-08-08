import { describe, expect, it } from "vitest";
import { summarizePaidProDocumentBlockClassifications } from "./paidProDocumentBlockClassifier";
import {
  ensurePaidProVisibleDocumentTitleOpening,
  projectPaidProVisibleTitleDisplayPlain,
} from "./paidProDocumentTitleOpeningRepair";
import { resolvePaidProUniversalDisplayTitle } from "./paidProUniversalDisplayTitle";
import { explicitIntentCanonicalTitle } from "./canonicalAgreementTitle";

function sectionOneCorpus(sectionTitle: string): string {
  return [
    `1. ${sectionTitle}`,
    "The parties agree to the terms set forth in this document for the engagement described herein and related obligations.",
    "",
    "2. Fees and Payment",
    "Fees and payment timing are as agreed by the parties in writing for the work described above.",
  ].join("\n\n");
}

describe("resolvePaidProUniversalDisplayTitle", () => {
  it("maps employment / consulting / IP / NDA / services prompts to best titles", () => {
    expect(
      resolvePaidProUniversalDisplayTitle({
        intakeText: "Create an employment agreement between Acme Inc and Jane Doe. Salary $120k. California.",
      }).title,
    ).toBe("Employment Agreement");

    expect(
      resolvePaidProUniversalDisplayTitle({
        intakeText:
          "Consulting agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for strategic business consulting. $5,000. Texas.",
      }).title,
    ).toMatch(/Consulting/i);

    expect(
      resolvePaidProUniversalDisplayTitle({
        intakeText:
          "Intellectual property assignment agreement between Inventor LLC and Acme Corp for software inventions.",
      }).title,
    ).toBe("Intellectual Property Assignment Agreement");

    expect(
      resolvePaidProUniversalDisplayTitle({
        intakeText: "Mutual non-disclosure agreement between Alpha LLC and Beta LLC covering product discussions.",
      }).title,
    ).toMatch(/Non-Disclosure Agreement/i);

    expect(
      resolvePaidProUniversalDisplayTitle({
        intakeText:
          "Services agreement between Designer Co and Client LLC for mobile app UI design. $12,000. Six weeks.",
      }).title,
    ).toBe("Services Agreement");
  });

  it("prefers substantive draft title when intake has no explicit intent phrase", () => {
    const r = resolvePaidProUniversalDisplayTitle({
      draftTitle: "Master Services Agreement",
      intakeText: "Designer will provide product design for Client over six weeks for $12,000.",
    });
    expect(r.title).toBe("Master Services Agreement");
    expect(r.source).toBe("draft");
  });

  it("infers from section-1 when metadata is empty", () => {
    expect(
      resolvePaidProUniversalDisplayTitle({
        corpusPlain: sectionOneCorpus("Employment Term and Duties"),
      }).title,
    ).toBe("Employment Agreement");
    expect(
      resolvePaidProUniversalDisplayTitle({
        corpusPlain: sectionOneCorpus("Services and Project Term"),
      }).title,
    ).toBe("Services Agreement");
  });
});

describe("ensurePaidProVisibleDocumentTitleOpening — universal prompt types", () => {
  it.each([
    {
      name: "employment",
      intake: "Employment agreement between Acme Inc and Pat Lee. Full-time role. NY law.",
      expectTitle: /^EMPLOYMENT AGREEMENT$/,
    },
    {
      name: "consulting",
      intake:
        "Consulting services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC. Strategic consulting. $5,000.",
      expectTitle: /CONSULTING/,
    },
    {
      name: "intellectual property",
      intake: "Intellectual property agreement between Inventor LLC and Buyer Inc covering patents and know-how.",
      expectTitle: /^INTELLECTUAL PROPERTY AGREEMENT$/,
    },
    {
      name: "services",
      intake: "Services agreement for product design between Designer Co and Client LLC. $12,000.",
      expectTitle: /^SERVICES AGREEMENT$/,
    },
  ])("injects $name title when corpus opens at section 1", ({ intake, expectTitle }) => {
    const body = sectionOneCorpus("Parties and Term");
    expect(summarizePaidProDocumentBlockClassifications(body).titleCount).toBe(0);
    const ensured = ensurePaidProVisibleDocumentTitleOpening(body, { intakeText: intake });
    expect(ensured.repairs).toContain("display:ensure_missing_document_title");
    expect(ensured.text.split("\n")[0]).toMatch(expectTitle);
    expect(summarizePaidProDocumentBlockClassifications(ensured.text).titleCount).toBe(1);
  });

  it("projectPaidProVisibleTitleDisplayPlain uses intake for untitled section-1 corpus", () => {
    const projected = projectPaidProVisibleTitleDisplayPlain(sectionOneCorpus("Services and Project Term"), {
      intakeText: "Create an employment agreement for a senior engineer role at Acme Inc.",
    });
    expect(projected).toMatch(/^EMPLOYMENT AGREEMENT\n\n1\. Services and Project Term/m);
  });
});

describe("explicitIntentCanonicalTitle expansions", () => {
  it("recognizes employee / IP assignment phrasing", () => {
    expect(explicitIntentCanonicalTitle("employee agreement between Acme and Sam")).toBe(
      "Employment Agreement",
    );
    expect(
      explicitIntentCanonicalTitle("IP assignment agreement for software inventions between A and B"),
    ).toBe("Intellectual Property Assignment Agreement");
  });
});
