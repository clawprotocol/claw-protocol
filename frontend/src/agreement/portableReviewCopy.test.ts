import { describe, expect, it } from "vitest";
import {
  PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE,
  RECIPIENT_BTN_REVIEW_CHANGES,
  RECIPIENT_CARD_BIGGER_REWRITE_TITLE,
  RECIPIENT_COPY_EXPORT_PREVIEW_LINE,
  RECIPIENT_COPY_EXPORT_SECTION_HELPER,
  RECIPIENT_COPY_EXPORT_SECTION_TITLE,
  RECIPIENT_UPLOAD_REVISED_PRIMARY_LABEL,
  RECIPIENT_WANT_COPY_HEADING,
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

describe("recipient request-changes copy / export disclosure", () => {
  const banned = ["CLAW", "social", "tweet", "post", "twitter", "facebook", "linkedin"] as const;

  it("uses agreement-focused copy without share-network wording", () => {
    const block = [
      RECIPIENT_COPY_EXPORT_SECTION_TITLE,
      RECIPIENT_COPY_EXPORT_SECTION_HELPER,
      RECIPIENT_COPY_EXPORT_PREVIEW_LINE,
    ].join("\n");
    const u = block.toUpperCase();
    for (const b of banned) {
      expect(u.includes(b.toUpperCase()), `unexpected “${b}” in disclosure`).toBe(false);
    }
    expect(RECIPIENT_COPY_EXPORT_SECTION_TITLE).toBe("Save or review elsewhere");
  });
});

describe("recipient portable review CTA labels", () => {
  it("uses revised-draft and compare wording without manual compare in primary CTAs", () => {
    expect(RECIPIENT_CARD_BIGGER_REWRITE_TITLE).toBe("Revised draft");
    expect(RECIPIENT_BTN_REVIEW_CHANGES).toBe("Compare drafts");
    expect(RECIPIENT_UPLOAD_REVISED_PRIMARY_LABEL).toBe("Upload revised draft");
    expect(RECIPIENT_WANT_COPY_HEADING).toBe("Review somewhere else?");
  });
});
