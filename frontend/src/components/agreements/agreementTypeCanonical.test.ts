import { describe, expect, it } from "vitest";
import type { LivePreviewModel } from "./liveDraftHeuristics";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { agreementTypeExplicitlyMatchesFlow, getCanonicalAgreementTypeForCreate } from "./agreementTypeCanonical";

const baseLive: LivePreviewModel = {
  docTitle: "Employment Agreement",
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

describe("agreementTypeExplicitlyMatchesFlow", () => {
  it("detects directive phrasing for consulting", () => {
    expect(
      agreementTypeExplicitlyMatchesFlow(
        "Please make the type of agreement a consulting agreement between A and B.",
        "consulting",
      ),
    ).toBe(true);
  });

  it("detects type of agreement is consulting", () => {
    expect(agreementTypeExplicitlyMatchesFlow("We want the type of agreement is consulting.", "consulting")).toBe(true);
  });
});

describe("getCanonicalAgreementTypeForCreate", () => {
  it("does not mark consulting as suggested when raw states consulting agreement explicitly", () => {
    const raw =
      "Consulting agreement between Peaceful Journey LLC and Anthem Blanchard. $5k monthly. Delaware law. 12 months.";
    const canon = getCanonicalAgreementTypeForCreate(raw, baseLive);
    expect(canon.headline).toBe("Consulting Agreement");
    expect(canon.isSuggested).toBe(false);
  });

  it("uses live preview aligned with intake for consulting + LLC (not confidentiality)", () => {
    const raw = "consulting agreement between Anthem Blanchard and Peaceful Journey LLC";
    const live = buildLiveDraftPreview(raw);
    const canon = getCanonicalAgreementTypeForCreate(raw, live);
    expect(canon.headline).toBe("Consulting Agreement");
    expect(canon.flowId).toBe("consulting");
  });
});
