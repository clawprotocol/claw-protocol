import { describe, expect, it } from "vitest";
import {
  finalizePartyDisplayNameForUserFacing,
  normalizeLegalEntitySuffixCasing,
  restorePartyNameCasingFromIntakeText,
} from "./partyNameDisplayCasing";

const INTAKE =
  "Create a software integration agreement between FoundryCo Inc., Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners LP.";

describe("partyNameDisplayCasing", () => {
  it("restores FoundryCo from intake after canonical Foundryco", () => {
    expect(restorePartyNameCasingFromIntakeText("Foundryco Inc.", INTAKE)).toBe("FoundryCo Inc.");
    expect(finalizePartyDisplayNameForUserFacing("Foundryco Inc.", INTAKE)).toBe("FoundryCo Inc.");
  });

  it("normalizes Lp to LP when intake does not contribute", () => {
    expect(normalizeLegalEntitySuffixCasing("Coastal Reserve Partners Lp")).toBe("Coastal Reserve Partners LP");
    expect(finalizePartyDisplayNameForUserFacing("Coastal Reserve Partners Lp", null)).toBe(
      "Coastal Reserve Partners LP",
    );
  });

  it("does not append a spurious period to internal Co (FoundryCo)", () => {
    expect(normalizeLegalEntitySuffixCasing("FoundryCo Inc.")).toBe("FoundryCo Inc.");
    expect(finalizePartyDisplayNameForUserFacing("Foundryco Inc.", INTAKE)).toBe("FoundryCo Inc.");
  });
});
