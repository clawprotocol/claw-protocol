/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK } from "./portableReviewCopy";
import { classifyRecipientRevisedDraftUpload } from "./recipientRevisedDraftReviewerNotes";
import {
  extractRevisedDraftPlainText,
  pdfImportPlainAfterSanitize,
  PDF_IMPORT_MIN_AGREEMENT_BODY_CHARS,
  PDF_IMPORT_RAW_MEANINGFUL_MIN_CHARS,
  REVISED_DRAFT_FILE_INPUT_ACCEPT,
} from "./recipientRevisedDraftImportText";

describe("REVISED_DRAFT_FILE_INPUT_ACCEPT", () => {
  it("lists PDF and plain-text Markdown types for native file pickers", () => {
    expect(REVISED_DRAFT_FILE_INPUT_ACCEPT).toContain(".pdf");
    expect(REVISED_DRAFT_FILE_INPUT_ACCEPT).toContain("application/pdf");
    expect(REVISED_DRAFT_FILE_INPUT_ACCEPT).toContain(".txt");
    expect(REVISED_DRAFT_FILE_INPUT_ACCEPT).toContain("text/plain");
    expect(REVISED_DRAFT_FILE_INPUT_ACCEPT).toContain(".md");
    expect(REVISED_DRAFT_FILE_INPUT_ACCEPT).toContain("text/markdown");
    expect(REVISED_DRAFT_FILE_INPUT_ACCEPT).toContain("text/x-markdown");
    expect(REVISED_DRAFT_FILE_INPUT_ACCEPT.toLowerCase()).not.toContain("docx");
  });
});

describe("extractRevisedDraftPlainText (plain files)", () => {
  it("returns text for .txt", async () => {
    const file = new File(["hello"], "rev.txt", { type: "text/plain" });
    const r = await extractRevisedDraftPlainText(file);
    expect(r).toMatchObject({ ok: true, text: "hello" });
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

describe("pdfImportPlainAfterSanitize", () => {
  it("keeps sanitized body when long enough for full-agreement compare", () => {
    const body = "x".repeat(PDF_IMPORT_MIN_AGREEMENT_BODY_CHARS + 5);
    const r = pdfImportPlainAfterSanitize("ignored raw padding", { agreementText: body });
    expect(r).toEqual({ kind: "use_sanitized_body", text: body, pdfThinSanitizeUsedRaw: false });
  });

  it("rejects when raw text is too short (image-like / empty layer)", () => {
    const r = pdfImportPlainAfterSanitize("short", { agreementText: "" });
    expect(r).toEqual({ kind: "reject_low_raw" });
    expect("short".length).toBeLessThan(PDF_IMPORT_RAW_MEANINGFUL_MIN_CHARS);
  });

  it("uses raw for classification when sanitizer strips body but raw is meaningful", () => {
    const raw = "y".repeat(PDF_IMPORT_RAW_MEANINGFUL_MIN_CHARS + 40);
    const r = pdfImportPlainAfterSanitize(raw, { agreementText: "   " });
    expect(r).toEqual({
      kind: "use_raw_for_classification",
      text: raw,
      pdfThinSanitizeUsedRaw: true,
    });
  });

  it("raw fallback + classify routes clause_suggestions for memo-style bullets", () => {
    const orig = "y".repeat(2000);
    const raw = [
      "Please review the following adjustments before we sign.",
      "",
      "- Payment timing: Net 45 instead of Net 30 for cash flow",
      "- Scope boundaries: keep bug fixes separate from new product work",
      "- Delays: when the client causes delay, extend delivery milestones fairly",
    ].join("\n");
    const routed = pdfImportPlainAfterSanitize(raw, { agreementText: "" });
    expect(routed.kind).toBe("use_raw_for_classification");
    if (routed.kind !== "use_raw_for_classification") throw new Error("unexpected route");
    const c = classifyRecipientRevisedDraftUpload(orig, routed.text);
    expect(c.kind).toBe("clause_suggestions");
  });

  it("raw fallback + classify routes review_notes_only for commentary-first PDF text", () => {
    const orig = "y".repeat(2000);
    const raw = [
      "Recommendation",
      "",
      "We suggest changing payment to Net 45 for cash flow.",
      "We also recommend clarifying acceptance criteria for milestone two.",
      "Please confirm whether the indemnity cap should align with the master services template.",
    ].join("\n");
    const routed = pdfImportPlainAfterSanitize(raw, { agreementText: "" });
    expect(routed.kind).toBe("use_raw_for_classification");
    if (routed.kind !== "use_raw_for_classification") throw new Error("unexpected route");
    const c = classifyRecipientRevisedDraftUpload(orig, routed.text);
    expect(c.kind).toBe("review_notes_only");
  });

  it("raw fallback + classify still allows full revised agreement when structure is strong", () => {
    const orig = "y".repeat(2000);
    const raw = [
      "MASTER SERVICES AGREEMENT",
      "",
      "WHEREAS the parties wish to engage;",
      "",
      "1. Definitions",
      "Capitalized terms have the meanings set forth herein.",
      "",
      "2. Fees and Payment",
      "Invoices are payable Net 30. Late fees apply after fifteen days.",
      "",
      "3. Term",
      "This agreement runs for one year from the effective date.",
      "",
      "4. Scope of Services",
      "Developer will deliver the software described in Exhibit A.",
      "",
      "5. Intellectual Property",
      "Client receives a license to use deliverables upon full payment.",
      "",
      "6. Confidentiality",
      "Each party will protect the other's confidential information.",
      "",
      "7. Limitation of Liability",
      "Except for indemnities, liability is capped at fees paid in the prior twelve months.",
      "",
      "8. General",
      "This agreement is governed by California law.",
      "",
      "IN WITNESS WHEREOF the parties execute as of the date below.",
    ].join("\n");
    const routed = pdfImportPlainAfterSanitize(raw, { agreementText: "" });
    expect(routed.kind).toBe("use_raw_for_classification");
    if (routed.kind !== "use_raw_for_classification") throw new Error("unexpected route");
    const c = classifyRecipientRevisedDraftUpload(orig, routed.text);
    expect(c.kind).toBe("full_revised_agreement");
  });
});
