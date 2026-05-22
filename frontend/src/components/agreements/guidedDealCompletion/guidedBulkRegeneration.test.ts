import { describe, expect, it } from "vitest";
import {
  validateGuidedBulkRegeneration,
  validateGuidedBulkRegenerationStrictPlacement,
} from "./guidedBulkRegeneration";

const BASE = "SERVICES AGREEMENT\n" + "Section 1\n".repeat(80) + "\n2. FEES\nTotal fee.\n";

describe("validateGuidedBulkRegeneration", () => {
  it("accepts bulk rewrite with orphan fragment that strict placement rejects", () => {
    const bad = BASE.replace("2. FEES", "build and\n\n2. FEES");
    const lenient = validateGuidedBulkRegeneration(BASE, bad);
    const strict = validateGuidedBulkRegenerationStrictPlacement(BASE, bad);
    expect(lenient.ok).toBe(true);
    expect(strict.ok).toBe(false);
  });

  it("rejects severely shrunk output", () => {
    const r = validateGuidedBulkRegeneration(BASE, "short");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("output_too_short");
  });
});
