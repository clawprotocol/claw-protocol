import { describe, expect, it } from "vitest";
import {
  PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE,
  buildRecipientRevisionText,
} from "./portableReviewCopy";

describe("buildRecipientRevisionText", () => {
  it("merges instruction and external paste with preamble when paste is non-empty", () => {
    const { text, hasExternal } = buildRecipientRevisionText("Shorten the term.", "New paragraph text.");
    expect(hasExternal).toBe(true);
    expect(text).toContain("Shorten the term.");
    expect(text).toContain(PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE);
    expect(text).toContain("New paragraph text.");
  });

  it("omits external block and hasExternal when paste is empty", () => {
    const { text, hasExternal } = buildRecipientRevisionText("Only instruction", "   ");
    expect(hasExternal).toBe(false);
    expect(text).toBe("Only instruction");
    expect(text).not.toContain(PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE);
  });

  it("treats only paste as hasExternal and includes preamble", () => {
    const { text, hasExternal } = buildRecipientRevisionText("", "Paste only");
    expect(hasExternal).toBe(true);
    expect(text).toBe([PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE, "Paste only"].join("\n\n"));
  });
});
