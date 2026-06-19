import { describe, expect, it } from "vitest";
import { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "./agreementPreviewConstants";
import { applyDocumentQualityFloor } from "./documentQualityFloor";

describe("documentQualityFloor", () => {
  it("repairs malformed period-semicolon punctuation", () => {
    const out = applyDocumentQualityFloor("Either party may terminate this agreement.; Notice required.");
    expect(out.text).not.toMatch(/\.\s*;/);
    expect(out.text).toMatch(/terminate this agreement\./);
  });

  it("separates e-sign notice from termination section body", () => {
    const raw = [
      "5. Termination",
      "",
      `Either party may terminate with notice. ${AGREEMENT_PREVIEW_ESIGN_NOTICE}`,
    ].join("\n");
    const out = applyDocumentQualityFloor(raw);
    expect(out.text).toMatch(/Termination/i);
    expect(out.text).toMatch(new RegExp(AGREEMENT_PREVIEW_ESIGN_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("splits glued payment heading from amount line", () => {
    const raw = "2. Payment Terms $4,000, monthly payment";
    const out = applyDocumentQualityFloor(raw);
    expect(out.text).toMatch(/2\.\s+Payment Terms/);
    expect(out.text).toMatch(/\$4,000/);
    expect(out.text).toMatch(/\n\n/);
  });
});
