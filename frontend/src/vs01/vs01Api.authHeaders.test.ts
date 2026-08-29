import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("vs01Api document content auth", () => {
  it("fetchDocumentContent sends clawAgreementHeaders for commercial owner bind", () => {
    const src = readFileSync(join(__dirname, "vs01Api.ts"), "utf8");
    expect(src).toContain('from "../agreement/agreementOrgHeaders"');
    expect(src).toContain("clawAgreementHeaders");
    const fnStart = src.indexOf("export async function fetchDocumentContent");
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = src.slice(fnStart, fnStart + 900);
    expect(fnBody).toContain("clawAgreementHeaders");
    expect(fnBody).toContain("refreshCachedAccessToken");
    expect(fnBody).toMatch(/method:\s*["']GET["']/);
  });

  it("fetchVs01DocumentMeta sends clawAgreementHeaders so leftover remount can read agreement_id", () => {
    const src = readFileSync(join(__dirname, "vs01Api.ts"), "utf8");
    const fnStart = src.indexOf("export async function fetchVs01DocumentMeta");
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = src.slice(fnStart, fnStart + 900);
    expect(fnBody).toContain("clawAgreementHeaders");
    expect(fnBody).toContain("refreshCachedAccessToken");
    expect(fnBody).toContain("/v1/documents/");
  });
});
