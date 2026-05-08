import { describe, expect, it } from "vitest";
import {
  PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE,
  RECIPIENT_BTN_REVIEW_CHANGES,
  RECIPIENT_CARD_BIGGER_REWRITE_TITLE,
  RECIPIENT_COPY_EXPORT_PREVIEW_LINE,
  RECIPIENT_COPY_EXPORT_SECTION_HELPER,
  RECIPIENT_COPY_EXPORT_SECTION_TITLE,
  RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK,
  RECIPIENT_PREVIEW_SUMMARY_HEADLINE,
  RECIPIENT_PREVIEW_COMPARE_TRUST_SUBCOPY,
  RECIPIENT_INTENT_NOT_AUTOMATICALLY_INSERTED,
  RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE,
  RECIPIENT_UPLOAD_REVISED_PRIMARY_LABEL,
  RECIPIENT_WANT_COPY_BODY,
  RECIPIENT_REVISED_WORKSPACE_NOTES_HINT,
  RECIPIENT_WANT_COPY_DROPZONE_PRIMARY,
  RECIPIENT_WANT_COPY_DROPZONE_SECONDARY,
  RECIPIENT_WANT_COPY_HEADING,
  RECIPIENT_WANT_COPY_UPLOAD_TIP,
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

describe("recipient want-a-copy portable copy", () => {
  it("uses outside-review loopback strings aligned with trust posture", () => {
    expect(RECIPIENT_WANT_COPY_BODY).toBe(
      "Download the draft, edit it with your lawyer or AI tool, then upload the revised version back here.",
    );
    expect(RECIPIENT_WANT_COPY_UPLOAD_TIP).toBe(
      'Tip: you can add a short "Why I changed this" note at the bottom of your revised draft. LawDog will compare the draft before anything is sent.',
    );
    expect(RECIPIENT_WANT_COPY_DROPZONE_PRIMARY).toBe("Drag your revised draft here");
    expect(RECIPIENT_WANT_COPY_DROPZONE_SECONDARY).toBe("PDF, TXT, or Markdown");
    expect(RECIPIENT_REVISED_WORKSPACE_NOTES_HINT).toBe(
      "Add notes at the bottom if you want to explain your changes.",
    );
    expect(RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK).toBe(
      "We couldn't extract readable text from this file. Try a selectable-text PDF, TXT, or Markdown file.",
    );
    expect(RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK.toLowerCase()).not.toContain("docx");
  });
});

describe("recipient compare / notes copy (signer-facing)", () => {
  const banned = ["corpus", "route", "detected", "sections changed", "not reflected", "diagnostic"] as const;

  it("avoids jargon in key compare and notes strings", () => {
    const block = [
      RECIPIENT_PREVIEW_SUMMARY_HEADLINE,
      RECIPIENT_PREVIEW_COMPARE_TRUST_SUBCOPY,
      RECIPIENT_INTENT_NOT_AUTOMATICALLY_INSERTED,
      RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE,
    ].join("\n");
    const u = block.toLowerCase();
    for (const b of banned) {
      expect(u.includes(b), `unexpected “${b}” in signer copy`).toBe(false);
    }
  });
});
