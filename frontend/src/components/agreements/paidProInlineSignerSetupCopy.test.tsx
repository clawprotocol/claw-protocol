/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAID_PRO_INLINE_SIGNER_SECTION_BODY,
  PAID_PRO_INLINE_SIGNER_SECTION_TITLE,
} from "./paidProInlineSignerSetupCopy";

describe("paidProInlineSignerSetupCopy", () => {
  it("inline panel in AgreementBuilderIntake uses minimal signer section copy", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("data-testid=\"paid-pro-inline-signer-setup-panel\"");
    expect(intake).toContain(PAID_PRO_INLINE_SIGNER_SECTION_TITLE);
    expect(intake).toContain("PAID_PRO_INLINE_SIGNER_SECTION_BODY");
    expect(PAID_PRO_INLINE_SIGNER_SECTION_TITLE).toBe("Signer details");
    expect(PAID_PRO_INLINE_SIGNER_SECTION_BODY).toBe("Enter who will sign for each party.");
  });
});
