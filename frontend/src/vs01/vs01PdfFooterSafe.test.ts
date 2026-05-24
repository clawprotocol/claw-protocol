import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Regression: VS01 PDF preview footer band avoids draft watermark clash with body/signature area. */
describe("VS01 PDF footer-safe overlay", () => {
  it("uses footer-safe surface + watermark shim on signing placement pages", () => {
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(css).toContain(".vs01-pdf-footer-watermark-shim");
    expect(css).toContain("z-index: 1");
    expect(css).toContain(".vs01-sign-page-surface--footer-safe");
    expect(css).toContain("--vs01-initials-reserved-band: 96px");
    expect(css).toContain("box-shadow:");
    expect(css).toContain("var(--vs01-initials-reserved-band)");
    for (const f of ["StepPrepareSignature.tsx", "StepCompleteAndSend.tsx", "RecipientSigningView.tsx"]) {
      const s = readFileSync(join(__dirname, f), "utf8");
      expect(s).toContain("vs01-sign-page-surface--footer-safe");
      expect(s).toContain("vs01-pdf-footer-watermark-shim");
    }
  });

  it("lists every react-pdf Page host among the footer-safe signing surfaces", () => {
    const dir = __dirname;
    const pageFiles = ["StepPrepareSignature.tsx", "StepCompleteAndSend.tsx", "RecipientSigningView.tsx"];
    for (const f of pageFiles) {
      const s = readFileSync(join(dir, f), "utf8");
      expect(s).toContain("<Page");
      expect(s).toContain("vs01-sign-page-surface--footer-safe");
    }
  });
});
