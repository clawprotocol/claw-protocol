import { SHARED_ACCEPTED_PAID_BODY } from "../components/agreements/paidProSharedFixtureSystem";
import { describe, expect, it } from "vitest";
import { safeVersionInstructionSummary } from "./agreementVersionStore";

describe("safeVersionInstructionSummary", () => {
  it("returns empty string for undefined/null instruction (stale bundle row)", () => {
    expect(safeVersionInstructionSummary(undefined)).toBe("");
    expect(safeVersionInstructionSummary(null)).toBe("");
  });

  it("truncates long instructions", () => {
    const s = SHARED_ACCEPTED_PAID_BODY;
    expect(safeVersionInstructionSummary(s).length).toBeLessThanOrEqual(73);
    expect(safeVersionInstructionSummary(s).endsWith("…")).toBe(true);
  });

  it("preserves short instructions", () => {
    expect(safeVersionInstructionSummary("Short note")).toBe("Short note");
  });
});
