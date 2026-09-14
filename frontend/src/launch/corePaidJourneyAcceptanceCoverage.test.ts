import { describe, expect, it } from "vitest";
import { assertCorePaidJourneyAcceptanceContracts } from "./corePaidJourneyAcceptanceCoverage";
import { CORE_PAID_JOURNEY_MATRIX } from "./corePaidJourneyAcceptanceMatrix";

describe("core paid journey acceptance coverage", () => {
  it("keeps the customer matrix and live-journey contracts closed", () => {
    const ids = CORE_PAID_JOURNEY_MATRIX.map((row) => row.id);
    expect(ids).toHaveLength(16);
    expect(ids).toContain("C3_fresh_context_editable_reopen");
    expect(ids).toContain("C4_resume_apply_after_dashboard_reset");
    expect(() => assertCorePaidJourneyAcceptanceContracts()).not.toThrow();
  });

  it("is not itself a customer-journey pass", () => {
    expect(CORE_PAID_JOURNEY_MATRIX.every((row) => row.proof !== "coverage")).toBe(true);
  });
});
