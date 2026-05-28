import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  authoritativeDocumentForSurface,
  logIllegalPostAcceptanceMutationAttempt,
} from "../../components/agreements/authoritativeAgreementDocument";

export type ReviewFirstDisplayCorpusSource =
  | "review_first_final_corpus"
  | "server_full_document_text"
  | "premium_server_full_document_text"
  | "premium_full_document_text"
  | "document_text"
  | "rendered_document_text"
  | "authoritative_agreement_document"
  | "none";

export type ReviewFirstDisplayCorpus = {
  text: string;
  source: ReviewFirstDisplayCorpusSource;
  hash: string;
};

function corpusHash(text: string): string {
  const body = text.trim();
  let h = 2166136261;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${body.length}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function stringField(draft: AgreementDraft, key: keyof AgreementDraft): string {
  const v = draft[key];
  return typeof v === "string" ? v.trim() : "";
}

function reviewRouteHashInvariant(args: {
  text: string;
  hash: string;
  authoritativeHash: string;
  userEdited?: boolean;
}): void {
  if (args.userEdited) return;
  if (args.hash === args.authoritativeHash) return;
  logIllegalPostAcceptanceMutationAttempt({
    surface: "review_route",
    mutation: "review_route_hash_mismatch",
    attemptedHash: args.hash,
    authoritativeHash: args.authoritativeHash,
    attemptedLen: args.text.length,
  });
  const isTest = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
  const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
  const isBrowser = typeof window !== "undefined";
  if ((isTest || isDev) && !isBrowser) {
    throw new Error("[review-route-authoritative-hash-mismatch]");
  }
}

export function resolveReviewFirstDisplayCorpus(draft: AgreementDraft | null): ReviewFirstDisplayCorpus | null {
  if (!draft) return null;
  const authoritative = authoritativeDocumentForSurface("review_route");
  if (authoritative?.fullCorpusText) {
    reviewRouteHashInvariant({
      text: authoritative.fullCorpusText,
      hash: authoritative.authoritativeHash,
      authoritativeHash: authoritative.authoritativeHash,
      userEdited: authoritative.explicitUserEditState.edited,
    });
    return {
      text: authoritative.fullCorpusText,
      source: "authoritative_agreement_document",
      hash: authoritative.authoritativeHash,
    };
  }
  const pr = draft.pro_redline_v1;
  const rf =
    pr && typeof pr === "object" && !Array.isArray(pr)
      ? (pr as Record<string, unknown>).review_first_final_corpus
      : null;
  if (rf && typeof rf === "object" && !Array.isArray(rf)) {
    const text = String((rf as Record<string, unknown>).text ?? "").trim();
    if (text) return { text, source: "review_first_final_corpus", hash: corpusHash(text) };
  }

  if (draft.premium_render_source !== "review_first_final_corpus") return null;

  for (const source of [
    "server_full_document_text",
    "premium_server_full_document_text",
    "premium_full_document_text",
    "document_text",
    "rendered_document_text",
  ] as const) {
    const text = stringField(draft, source).trim();
    if (text) return { text, source, hash: corpusHash(text) };
  }
  return null;
}

export function logReviewFirstDisplayCorpusSelected(args: {
  agreementId: string;
  corpus: ReviewFirstDisplayCorpus | null;
  surface: "owner_done" | "reviewer";
  fallbackPreview?: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const id = args.agreementId.trim();
  const payload = {
    source: args.corpus?.source ?? "none",
    len: args.corpus?.text.length ?? 0,
    hash: args.corpus?.hash ?? null,
    agreementIdShort: id.length <= 12 ? id : id.slice(0, 8),
  };
  if (args.surface === "reviewer") {
    // eslint-disable-next-line no-console
    console.info("[review-first-reviewer-corpus-selected]", payload);
  } else {
    // eslint-disable-next-line no-console
    console.info("[review-first-display-corpus-selected]", payload);
  }
  if (args.fallbackPreview) {
    // eslint-disable-next-line no-console
    console.warn("[review-first-display-corpus-selected-fallback-preview]", payload);
  }
}
