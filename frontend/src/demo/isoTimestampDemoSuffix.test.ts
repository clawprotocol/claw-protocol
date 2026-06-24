import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isoTimestampDemoSuffix } from "./isoTimestampDemoSuffix";

describe("isoTimestampDemoSuffix", () => {
  it("returns the last six digits from an ISO timestamp", () => {
    expect(isoTimestampDemoSuffix("2026-06-22T11:49:37.123Z")).toBe("937123");
  });
});

describe("tailwind content scan safety", () => {
  it("getDemoInputs uses isoTimestampDemoSuffix instead of inline bracket regexes", () => {
    const appSrc = readFileSync(join(__dirname, "../App.tsx"), "utf8");
    const demoBlock = appSrc.slice(
      appSrc.indexOf("function getDemoInputs"),
      appSrc.indexOf("function resetDemoState"),
    );
    expect(demoBlock).toContain("isoTimestampDemoSuffix");
    expect(demoBlock).not.toMatch(/\.replace\(\/\[/);
  });
});
