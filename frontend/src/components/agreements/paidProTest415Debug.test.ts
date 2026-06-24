import { describe, expect, it } from "vitest";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import { TEST415_PRODUCTION_INTAKE, test415Draft } from "./paidProTest415Fixtures";

describe("debug", () => {
  it("reasons", () => {
    const r = buildDeterministicQuadPartyMutualServicesProFallback({
      rawIntake: TEST415_PRODUCTION_INTAKE,
      draft: test415Draft(),
    });
    // eslint-disable-next-line no-console
    console.log("REASONS", r.reasons);
    expect(r.ok).toBe(true);
  });
});
