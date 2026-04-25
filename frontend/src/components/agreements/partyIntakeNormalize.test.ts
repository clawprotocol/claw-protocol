import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { getRecipientHandoffNamesFromDraft, parsePartiesFromUserInput, sanitizePartiesInput } from "./partyIntakeNormalize";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function minimalDraft(parties: { name: string; role: string }[]): ParsedDraftShape {
  return {
    title: "Agreement",
    jurisdiction: "Delaware",
    parties,
    purpose: "Services.",
    payment_terms: "Monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: "January 1, 2026",
    payment: emptyPayment,
  };
}

describe("sanitizePartiesInput", () => {
  it("strips template party tokens from a concatenated line", () => {
    const raw =
      "John Smith and Mary Jane Party A (edit in review), Party B (edit in review)".replace(/\s+/g, " ");
    const out = sanitizePartiesInput(raw);
    expect(out).not.toMatch(/Party A|Party B|edit in review/i);
    expect(out).toMatch(/John Smith/i);
    expect(out).toMatch(/Mary Jane/i);
  });
});

describe("parsePartiesFromUserInput", () => {
  it("parses two real names after sanitizing placeholders", () => {
    const raw = "John Smith, Mary Jane Party A (edit in review), Party B (edit in review)";
    const parsed = parsePartiesFromUserInput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed![0].name).toMatch(/John Smith/i);
    expect(parsed![1].name).toMatch(/Mary Jane/i);
    expect(parsed![1].name).not.toMatch(/Party A|Party B|edit in review/i);
  });
});

describe("getRecipientHandoffNamesFromDraft", () => {
  it("uses two structured party rows", () => {
    const d = minimalDraft([
      { name: "Jane Smith", role: "party" },
      { name: "John Brown", role: "party" },
    ]);
    expect(getRecipientHandoffNamesFromDraft(d)).toEqual({ n1: "Jane Smith", n2: "John Brown" });
  });

  it("splits a single-cell comma line", () => {
    const d = minimalDraft([{ name: "Jane Smith, John Brown", role: "party" }]);
    expect(getRecipientHandoffNamesFromDraft(d)).toEqual({ n1: "Jane Smith", n2: "John Brown" });
  });

  it("splits on ampersand", () => {
    const d = minimalDraft([{ name: "Acme LLC & Beta Inc", role: "party" }]);
    const out = getRecipientHandoffNamesFromDraft(d);
    expect(out.n1).toMatch(/Acme/i);
    expect(out.n2).toMatch(/Beta/i);
  });
});
