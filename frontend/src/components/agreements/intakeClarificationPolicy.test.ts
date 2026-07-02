import { describe, expect, it } from "vitest";
import type { IntakePaymentField } from "./intakeCurrencyParse";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  computeBlockingIntakeGaps,
  extractDraftIntentAgreementTitle,
  prepareParsedDraftForIntakeGeneration,
} from "./intakeClarificationPolicy";

const RED_MESA_INTAKE = `Draft a Professional Services Agreement between Red Mesa Logistics LLC (Client) and Harbor Peak Automation LLC (Service Provider). Harbor Peak will evaluate Red Mesa's warehouse operations, optimize inventory workflows, automate reporting, and implement dashboard integrations. Total fee: $96,000, payable as: $24,000 on execution, $24,000 after assessment, $24,000 after implementation, $24,000 after final acceptance. Term: 12 months. Include confidentiality, intellectual property, limitation of liability, termination for cause or convenience, governing law (Delaware), notice provisions, and standard signature blocks.`;

function emptyParsed(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: {} as IntakePaymentField,
  };
}

describe("extractDraftIntentAgreementTitle", () => {
  it("extracts Professional Services Agreement from draft-intent intake", () => {
    expect(extractDraftIntentAgreementTitle(RED_MESA_INTAKE)).toBe("Professional Services Agreement");
  });

  it("extracts NDA from draft-intent intake", () => {
    expect(extractDraftIntentAgreementTitle("Create a Mutual Non-Disclosure Agreement between Acme and Beta.")).toBe(
      "Mutual Non-Disclosure Agreement",
    );
  });
});

describe("prepareParsedDraftForIntakeGeneration", () => {
  it("does not block on title for professional services draft-intent intake", () => {
    const { draft, blockingGaps } = prepareParsedDraftForIntakeGeneration(emptyParsed(), RED_MESA_INTAKE);
    expect(draft.title).toBe("Professional Services Agreement");
    expect(blockingGaps).not.toContain("title");
    expect((draft.parties || []).length).toBeGreaterThanOrEqual(2);
    expect(draft.jurisdiction).toMatch(/delaware/i);
  });

  it("still blocks when contracting parties cannot be inferred", () => {
    const intake = "We need a consulting agreement for ongoing advisory work. Payment is $5,000 per month.";
    const { blockingGaps } = prepareParsedDraftForIntakeGeneration(emptyParsed(), intake);
    expect(blockingGaps).toContain("parties");
  });

  it("does not block on governing law when Delaware is stated in intake", () => {
    const { blockingGaps } = prepareParsedDraftForIntakeGeneration(emptyParsed(), RED_MESA_INTAKE);
    expect(blockingGaps).not.toContain("jurisdiction");
  });

  it("does not block on payment when fee is stated in intake", () => {
    const { blockingGaps } = prepareParsedDraftForIntakeGeneration(emptyParsed(), RED_MESA_INTAKE);
    expect(blockingGaps).not.toContain("payment_terms");
  });
});

describe("computeBlockingIntakeGaps", () => {
  it("does not block on title when agreement type is inferable from intake", () => {
    const parsed: ParsedDraftShape = {
      ...emptyParsed(),
      title: "",
      parties: [
        { name: "Acme LLC", role: "client" },
        { name: "Beta LLC", role: "vendor" },
      ],
      purpose: "Software integration work.",
      payment_terms: "$10,000 flat",
      jurisdiction: "Delaware",
      duration: "12 months",
      effective_date: "Upon signing",
    };
    const gaps = computeBlockingIntakeGaps(parsed, "Two companies need a short services deal.");
    expect(gaps).not.toContain("title");
  });

  it("fills tier-2 family title instead of blocking when intake has no explicit title", () => {
    const { draft, blockingGaps } = prepareParsedDraftForIntakeGeneration(emptyParsed(), " ");
    expect((draft.title || "").trim().length).toBeGreaterThan(0);
    expect(blockingGaps).not.toContain("title");
  });
});
