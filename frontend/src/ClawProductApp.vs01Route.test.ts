import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ClawProductApp VS01 e-sign route", () => {
  it("mounts Vs01Wizard for /app/esign/:seedDocumentId (not SimpleSendPage)", () => {
    const p = join(__dirname, "ClawProductApp.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toMatch(/case\s+["']esign["']/);
    expect(s).toContain("<Vs01Wizard");
    expect(s).toContain("seedDocumentId={seed}");
    expect(s).toContain("agreement_bridge=1");
    expect(s).toContain("resolveVs01EsignShellCopy");
    expect(s).toContain("AppEsignDocumentShell");
  });
});
