import { describe, expect, it } from "vitest";
import { assertPhase4c1QuickIntakeContracts } from "./phase4c1QuickIntakeCoverage";

describe("Phase 4C.1 Quick intake contracts", () => {
  it("fails closed if Quick entry, alias, or auth-return authority is lost", () => {
    expect(() => assertPhase4c1QuickIntakeContracts()).not.toThrow();
  });
});
