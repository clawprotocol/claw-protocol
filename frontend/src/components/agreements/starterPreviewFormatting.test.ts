import { describe, expect, it } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  formatStarterPreviewForDisplay,
  repairMalformedSectionNumbering,
} from "./starterPreviewFormatting";

function ironcladDraft(): ParsedDraftShape {
  return enrichStarterPreviewPartiesFromIntake(
    {
      title: "Joint AI Rollout",
      jurisdiction: "Texas",
      purpose: "Joint AI software rollout.",
      payment_terms: "$187,500 paid over six milestone payments.",
      duration: "24 months",
      due_date: "",
      effective_date: "Upon full execution",
      payment: { amount: 187_500, cadence: null, valid: true },
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      agreement_family: "generic_business_agreement",
    },
    IRONCLAD_JOINT_ROLLOUT_INTAKE,
  );
}

describe("starterPreviewFormatting", () => {
  it("repairs malformed double section numbers", () => {
    const { text } = repairMalformedSectionNumbering("4. 5. Termination\nBody here.");
    expect(text).toMatch(/^5\. Termination/m);
    expect(text).not.toMatch(/4\. 5\./);
  });

  it("Ironclad free starter has paragraph breaks and no 4. 5. numbering", () => {
    const preview = buildStarterAgreementPreviewForReview(ironcladDraft(), {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    expect(preview).not.toMatch(/4\.\s+5\./);
    expect(preview.split("\n\n").length).toBeGreaterThan(4);
    expect(preview).toMatch(/\n\n1\. /);
    expect(preview).toMatch(/\n\n2\. /);
    for (const party of IRONCLAD_PARTIES) {
      expect(preview).toContain(party);
    }
  });

  it("formatStarterPreviewForDisplay preserves blank lines between blocks", () => {
    const raw = ["TITLE", "", "Preamble line.", "", "1. Scope", "Scope body.", "", "2. Pay", "Pay body."].join("\n");
    const out = formatStarterPreviewForDisplay(raw);
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(4);
  });
});
