import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Regression: VS01 PDF preview footer band avoids draft watermark clash with body/signature area. */
describe("VS01 PDF footer-safe overlay", () => {
  it("uses footer-safe surface + watermark shim on signing placement pages", () => {
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(css).toContain(".vs01-pdf-footer-watermark-shim");
    expect(css).toContain("z-index: 1");
    for (const f of ["StepPrepareSignature.tsx", "StepCompleteAndSend.tsx", "RecipientSigningView.tsx"]) {
      const s = readFileSync(join(__dirname, f), "utf8");
      expect(s).toContain("vs01-sign-page-surface--footer-safe");
      expect(s).toContain("vs01-pdf-footer-watermark-shim");
    }
  });
});
