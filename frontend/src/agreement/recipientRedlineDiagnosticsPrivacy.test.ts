import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("recipient redline diagnostic logging privacy", () => {
  it("logs metadata instead of recipient instructions, added lines, or agreement snippets", () => {
    const src = readFileSync(join(__dirname, "AgreementRecipientReview.tsx"), "utf8");

    expect(src).toContain("instructionLen");
    expect(src).toContain("addedLineCount");
    expect(src).not.toContain("instruction: recipientPreview.revisionText");
    expect(src).not.toContain("addedLines: c.redlineView.addedLines");
    expect(src).not.toContain("baselineSnippet: snippetAroundPaymentTerms");
    expect(src).not.toContain("proposedSnippet: snippetAroundPaymentTerms");
  });
});
