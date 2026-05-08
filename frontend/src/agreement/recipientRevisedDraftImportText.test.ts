/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK } from "./portableReviewCopy";
import { extractRevisedDraftPlainText } from "./recipientRevisedDraftImportText";

describe("extractRevisedDraftPlainText (plain files)", () => {
  it("returns text for .txt", async () => {
    const file = new File(["hello"], "rev.txt", { type: "text/plain" });
    const r = await extractRevisedDraftPlainText(file);
    expect(r).toEqual({ ok: true, text: "hello" });
  });

  it("returns text for .md", async () => {
    const file = new File(["# Title\n\nbody"], "rev.md", { type: "text/markdown" });
    const r = await extractRevisedDraftPlainText(file);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("body");
  });

  it("returns parse fallback for .docx (extraction not wired)", async () => {
    const file = new File([new Uint8Array([0x50, 0x4b])], "rev.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const r = await extractRevisedDraftPlainText(file);
    expect(r).toEqual({ ok: false, error: RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK });
  });
});
