import { describe, expect, it } from "vitest";
import {
  buildIntakeContradictionWarning,
  detectIntakeContradictionHints,
} from "./intakeContradictionHints";

describe("intakeContradictionHints", () => {
  it("flags exclusive vs non-exclusive", () => {
    const hints = detectIntakeContradictionHints(
      "non-exclusive worldwide license but exclusive in North America",
    );
    expect(hints.some((h) => h.kind === "exclusive_scope")).toBe(true);
  });

  it("flags refund conflicts", () => {
    expect(
      buildIntakeContradictionWarning("no refunds ever except full refund anytime for any reason"),
    ).toMatch(/refund/i);
  });

  it("flags employee vs contractor", () => {
    const hints = detectIntakeContradictionHints("employee on W-2 but 1099 contractor side project");
    expect(hints.some((h) => h.kind === "worker_classification")).toBe(true);
  });

  it("returns null for clean short intake", () => {
    expect(buildIntakeContradictionWarning("NDA between Acme and Beta, 2 years, Texas")).toBeNull();
  });
});
