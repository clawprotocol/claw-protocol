import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { resolveReviewFirstDisplayCorpus } from "./reviewFirstDisplayCorpus";

function draft(overrides: Partial<AgreementDraft>): AgreementDraft {
  return {
    id: "ag_display",
    title: "Agreement",
    jurisdiction: "CA",
    parties: [],
    purpose: "starter",
    payment_terms: "premium",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [],
    audit_log: [],
    ...overrides,
  };
}

describe("reviewFirstDisplayCorpus", () => {
  it("prefers stored review-first final corpus over rebuilt draft fields", () => {
    const resolved = resolveReviewFirstDisplayCorpus(
      draft({
        purpose: "STARTER_BODY_SHOULD_NOT_DISPLAY",
        server_full_document_text: "PREMIUM_BODY_SHOULD_NOT_DISPLAY",
        pro_redline_v1: {
          review_first_final_corpus: {
            text: "FINAL_GUIDED_REVIEW_CORPUS_MARKER",
          },
        },
      }),
    );
    expect(resolved?.source).toBe("review_first_final_corpus");
    expect(resolved?.text).toContain("FINAL_GUIDED_REVIEW_CORPUS_MARKER");
    expect(resolved?.text).not.toContain("STARTER_BODY_SHOULD_NOT_DISPLAY");
    expect(resolved?.text).not.toContain("PREMIUM_BODY_SHOULD_NOT_DISPLAY");
  });

  it("falls back through paid Pro document fields before generic purpose", () => {
    expect(
      resolveReviewFirstDisplayCorpus(
        draft({
          purpose: "starter",
        premium_render_source: "review_first_final_corpus",
          server_full_document_text: "FINAL_GUIDED_REVIEW_CORPUS_MARKER",
        }),
      )?.source,
    ).toBe("server_full_document_text");
  });
});
