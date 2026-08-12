import { describe, expect, it } from "vitest";
import { buildWeCapturedSummaryBullets, buildWhatWeUnderstoodBullets } from "./intakeWhatWeUnderstood";
import type { LivePreviewModel } from "./liveDraftHeuristics";

const base: LivePreviewModel = {
  docTitle: "Agreement",
  partiesLine: null,
  scopeLine: null,
  servicesLine: null,
  termLine: null,
  obligationsLine: null,
  compensationLine: null,
  scheduleLine: null,
  signerPlaceholdersLine: null,
  hasStructuredSignal: false,
  payment: { amount: null, cadence: null, valid: true },
};

describe("buildWhatWeUnderstoodBullets", () => {
  it("returns at most four bullets in priority order (term dropped when full)", () => {
    const model: LivePreviewModel = {
      ...base,
      docTitle: "Consulting agreement",
      partiesStructured: { party_1: "Peaceful Journey LLC", party_2: "Anthem Blanchard" },
      scheduleLine: "Monthly retainer",
      scopeLine: "SaaS admin work",
      termLine: "12 months",
      payment: { amount: null, cadence: "monthly", valid: true },
    };
    const bullets = buildWhatWeUnderstoodBullets(model);
    expect(bullets).toHaveLength(4);
    expect(bullets.map((b) => b.kind)).toEqual(["parties", "type", "payment", "scope"]);
    expect(bullets.find((b) => b.kind === "term")).toBeUndefined();
  });

  it("skips default doc title Agreement for Type", () => {
    const model: LivePreviewModel = {
      ...base,
      docTitle: "Agreement",
      partiesStructured: { party_1: "A", party_2: "B" },
      scheduleLine: "Paid monthly",
    };
    const bullets = buildWhatWeUnderstoodBullets(model);
    expect(bullets.some((b) => b.kind === "type")).toBe(false);
  });
});

describe("buildWeCapturedSummaryBullets", () => {
  it("always includes canonical agreement type from guided flow routing", () => {
    const raw =
      "Consulting agreement between Peaceful Journey LLC and Anthem Blanchard. $5k monthly. Delaware law. 12 months.";
    const model: LivePreviewModel = {
      ...base,
      docTitle: "Employment Agreement",
      partiesStructured: { party_1: "Peaceful Journey LLC", party_2: "Anthem Blanchard" },
      scopeLine: "Advisory",
      termLine: "12 months",
      compensationLine: "$5k monthly",
    };
    const bullets = buildWeCapturedSummaryBullets(raw, model);
    const type = bullets.find((b) => b.kind === "type");
    expect(type?.displayValue).toContain("Consulting");
    expect(type?.displayValue).not.toMatch(/^Suggested type:/i);
    expect(type?.needsConfirmation).toBe(false);
    expect(bullets.map((b) => b.kind)).toEqual(["type", "parties", "scope", "payment", "term", "special"]);
  });

  it("keeps suggested type when agreement category is only inferred, not plainly stated", () => {
    const raw = "Between Peaceful Journey LLC and Anthem for advisory work and a monthly retainer.";
    const model: LivePreviewModel = {
      ...base,
      docTitle: "Employment Agreement",
      partiesStructured: { party_1: "Peaceful Journey LLC", party_2: "Anthem Blanchard" },
      scopeLine: "Advisory",
      termLine: "12 months",
      compensationLine: "$5k monthly",
    };
    const bullets = buildWeCapturedSummaryBullets(raw, model);
    const type = bullets.find((b) => b.kind === "type");
    expect(type?.needsConfirmation).toBe(true);
    expect(type?.displayValue).toMatch(/Suggested type:/i);
  });

  it("clears needsConfirmation for term when quick-check term is confirmed", () => {
    const raw = "A and B. 12 months start Jan 1.";
    const model: LivePreviewModel = {
      ...base,
      docTitle: "Consulting agreement",
      partiesStructured: { party_1: "A", party_2: "B" },
      termLine: "12 months",
      extraction: {
        termInferred: true,
        termConfidence: 0.5,
        scopeInferred: false,
        scopeConfidence: 1,
        scopeSignalPresent: false,
        termSignalPresent: true,
      },
    };
    const before = buildWeCapturedSummaryBullets(raw, model);
    const termBefore = before.find((b) => b.kind === "term");
    expect(termBefore?.needsConfirmation).toBe(true);

    const after = buildWeCapturedSummaryBullets(raw, model, { term: true });
    const termAfter = after.find((b) => b.kind === "term");
    expect(termAfter?.needsConfirmation).toBe(false);
  });
});
