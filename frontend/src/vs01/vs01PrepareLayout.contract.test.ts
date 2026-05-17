import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("VS01 prepare layout contracts", () => {
  const intake = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
  const css = readFileSync(join(__dirname, "vs01.css"), "utf8");

  it("prepare workspace uses dedicated grid modifier when bridge placement copy is on", () => {
    expect(intake).toContain("vs01-sign-workspace--prepare");
    expect(intake).toContain("agreementBridgePlacementCopy ? \" vs01-sign-workspace--prepare\"");
  });

  it("CSS defines sticky aligned rail and laptop breakpoints", () => {
    expect(css).toContain(".vs01-sign-workspace--prepare");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(280px, 22rem)");
    expect(css).toContain("position: sticky");
    expect(css).toMatch(/max-width:\s*1440px/);
    expect(css).toContain(".vs01-sign-workspace--prepare .vs01-sign-rail");
  });
});
