import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("premium refine logging privacy", () => {
  it("does not log user instruction previews or prompt text slices", () => {
    const src = readFileSync(join(__dirname, "premiumRefineLateFeeFallback.ts"), "utf8");

    expect(src).toContain("promptLen");
    expect(src).not.toContain("promptPreview");
    expect(src).not.toContain("userInstruction.slice");
  });
});
