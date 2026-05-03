import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AgreementPublicVerifyView pending payload handling", () => {
  it("handles record_status pending and empty agreement_hash without assuming non-empty hash", () => {
    const p = join(__dirname, "AgreementPublicVerifyView.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("recordPending");
    expect(s).toContain("record_status");
    expect(s).toContain("vfy.agreement_hash?.trim()");
    expect(s).toContain("versionHistory");
    expect(s).toContain("signatureEvents");
  });
});
