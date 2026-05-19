import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";

const IRONCLAD_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.`;

const IRONCLAD_FULL = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;

const SHORT_PARTIES = ["Ironclad", "Harborline", "Northwind", "Silver Mesa", "VertexGrid"] as const;

function ironcladDraft(shortNames: boolean): ParsedDraftShape {
  const names = shortNames ? SHORT_PARTIES : IRONCLAD_FULL;
  return {
    title: "Joint AI Rollout Agreement",
    jurisdiction: "Delaware",
    purpose: "Joint AI software and infrastructure rollout.",
    payment_terms: "Milestone payments as agreed.",
    duration: "12 months",
    due_date: null,
    effective_date: "",
    payment: { amount: null, cadence: null, valid: true },
    parties: names.map((name) => ({ name, role: "party" })),
    agreement_family: "generic_business_agreement",
  };
}

describe("enrichStarterPreviewPartiesFromIntake", () => {
  it("maps short party labels to full legal entities from intake", () => {
    const enriched = enrichStarterPreviewPartiesFromIntake(ironcladDraft(true), IRONCLAD_INTAKE);
    expect(enriched.parties?.map((p) => p.name)).toEqual([...IRONCLAD_FULL]);
  });
});

describe("buildAgreementPreviewText starter opening (Ironclad five-party)", () => {
  it("opening recital lists full legal entity names when intake has them", () => {
    const preview = buildAgreementPreviewText(ironcladDraft(true), {
      starterPreview: true,
      intakeText: IRONCLAD_INTAKE,
    });
    const opening = preview.slice(0, 1200);
    for (const party of IRONCLAD_FULL) {
      expect(opening).toContain(party);
    }
    expect(opening).not.toMatch(/among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid/i);
    expect(preview).not.toMatch(/@Ironclad Systems Group LLC/i);
  });
});
