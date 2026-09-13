import { describe, expect, it } from "vitest";
import { assertCorePaidJourneyAcceptanceContracts } from "./corePaidJourneyAcceptanceCoverage";
import { CORE_PAID_JOURNEY_MATRIX } from "./corePaidJourneyAcceptanceMatrix";

describe("core paid journey acceptance coverage", () => {
  it("keeps the customer matrix and live-journey contracts closed", () => {
    expect(CORE_PAID_JOURNEY_MATRIX.map((row) => row.id)).toHaveLength(14);
    expect(() => assertCorePaidJourneyAcceptanceContracts()).not.toThrow();
  });

  it("is not itself a customer-journey pass", () => {
    expect(CORE_PAID_JOURNEY_MATRIX.every((row) => row.proof !== "coverage")).toBe(true);
  });
});
