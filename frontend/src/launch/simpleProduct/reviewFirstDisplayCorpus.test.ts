import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { SUE_LEE_QA_BAD_CORPUS } from "../../components/agreements/proCorpusSkeletonSafety";
import {
  clearAuthoritativeAgreementDocument,
  establishAuthoritativeAgreementDocument,
} from "../../components/agreements/authoritativeAgreementDocument";
import * as proAgreementCanonicalizer from "../../components/agreements/proAgreementCanonicalizer";
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
  afterEach(() => {
    clearAuthoritativeAgreementDocument();
    vi.restoreAllMocks();
  });

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

  it("renders review-first display corpus unchanged without structural canonicalization", () => {
    const spy = vi.spyOn(proAgreementCanonicalizer, "canonicalizeProAgreementText");
    const resolved = resolveReviewFirstDisplayCorpus(
      draft({
        parties: [
          { id: "p-client", name: "Sue Lee", role: "party" },
          { id: "p-provider", name: "Example Provider LLC", role: "owner" },
        ],
        premium_render_source: "review_first_final_corpus",
        server_full_document_text: SUE_LEE_QA_BAD_CORPUS,
        pro_redline_v1: {
          review_first_final_corpus: { text: SUE_LEE_QA_BAD_CORPUS },
        },
      }),
    );
    expect(resolved?.text).toBeTruthy();
    expect(resolved?.text).toBe(SUE_LEE_QA_BAD_CORPUS.trim());
    expect(spy).not.toHaveBeenCalled();
  });

  it("post-acceptance review route renders authoritative corpus unchanged", () => {
    const authoritative = "AUTHORITATIVE ACCEPTED PRO BODY. ".repeat(40);
    const record = establishAuthoritativeAgreementDocument({
      fullCorpusText: authoritative,
      canonicalPartyManifest: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
    });
    const spy = vi.spyOn(proAgreementCanonicalizer, "canonicalizeProAgreementText");
    const resolved = resolveReviewFirstDisplayCorpus(
      draft({
        premium_render_source: "review_first_final_corpus",
        server_full_document_text: "MUTATED SERVER FALLBACK",
        pro_redline_v1: {
          review_first_final_corpus: { text: "MUTATED REVIEW FALLBACK" },
        },
      }),
    );
    expect(resolved?.source).toBe("authoritative_agreement_document");
    expect(resolved?.text).toBe(record.fullCorpusText);
    expect(resolved?.hash).toBe(record.authoritativeHash);
    expect(spy).not.toHaveBeenCalled();
  });
});
