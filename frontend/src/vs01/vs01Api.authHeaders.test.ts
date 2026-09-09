import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("vs01Api document content auth", () => {
  it("fetchDocumentContent uses the canonical owner API boundary", () => {
    const src = readFileSync(join(__dirname, "vs01Api.ts"), "utf8");
    expect(src).toContain('from "../lib/ownerApiClient"');
    const fnStart = src.indexOf("export async function fetchDocumentContent");
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = src.slice(fnStart, fnStart + 900);
    expect(fnBody).toContain("ownerApiFetch");
    expect(fnBody).toMatch(/method:\s*["']GET["']/);
  });
});
