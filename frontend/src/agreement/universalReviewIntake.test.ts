import { describe, expect, it } from "vitest";
import { cloneDraftForRecipientPreview } from "./recipientPreviewBaseline";
import {
  BANNED_HOSTILE_REVIEW_TOKENS,
  BRING_BACK_SUGGESTED_EDITS_TITLE,
  MODE_PASTE_REVISED_DRAFT,
  MODE_SUGGEST_PLAIN_ENGLISH,
  MODE_UPLOAD_FILE,
  NOTHING_CHANGES_UNTIL_OWNER_ACCEPTS_LINE,
  UNIVERSAL_REVIEW_INTRO,
  UPLOAD_FILE_COMPARISON_COMING_SOON,
  allReviewIntakeQaStringScanSet,
} from "./universalReviewIntakeCopy";

function tokenBannedInString(text: string, token: string): boolean {
  if (!token) return false;
  const t = text.toLowerCase();
  if (token.includes(" ")) {
    return t.includes(token);
  }
  return new RegExp(
    `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  ).test(text);
}

describe("universal review intake copy", () => {
  it("exposes the intended section title and three review paths", () => {
    expect(BRING_BACK_SUGGESTED_EDITS_TITLE).toBe("Suggest changes");
    expect(UNIVERSAL_REVIEW_INTRO).toContain("LawDog will help organize the differences.");
    expect(NOTHING_CHANGES_UNTIL_OWNER_ACCEPTS_LINE).toBe(
      "Nothing changes the owner's draft until they accept it.",
    );
    expect(MODE_SUGGEST_PLAIN_ENGLISH).toBe("Write suggestions");
    expect(MODE_PASTE_REVISED_DRAFT).toBe("Paste revised draft");
    expect(MODE_UPLOAD_FILE).toBe("Upload file");
    expect(UPLOAD_FILE_COMPARISON_COMING_SOON).toBe("Upload comparison coming soon.");
  });

  it("does not include banned phrases in the QA scan set (guards calm collaborative language)", () => {
    for (const s of allReviewIntakeQaStringScanSet()) {
      for (const b of BANNED_HOSTILE_REVIEW_TOKENS) {
        expect(tokenBannedInString(s, b), `banned “${b}” in: ${s.slice(0, 80)}…`).toBe(false);
      }
    }
  });
});

describe("cloneDraftForRecipientPreview", () => {
  it("preserves a separate snapshot so the live draft is not mutated during paste preview (baseline before proposal)", () => {
    type T = { title: string; parties: { name: string; role: string }[]; purpose: string };
    const o: T = { title: "A", parties: [{ name: "P", role: "r" }], purpose: "x" };
    const c = cloneDraftForRecipientPreview(o);
    c.parties[0]!.name = "Q";
    expect(o.parties[0]!.name).toBe("P");
  });
});
