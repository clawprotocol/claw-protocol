import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("recipient token gate safety", () => {
  it("review/sign gates strip token query params after validation and do not use legacy session fallback", () => {
    const app = readFileSync(join(__dirname, "../ClawProductApp.tsx"), "utf8");

    expect(app).toContain("stripRecipientAccessTokenQueryFromLocation");
    expect(app).not.toContain("sessionLegacy");
  });
});
