/**
 * Prepare must write Review SoT onto the vs01 document the esign viewer paints.
 *
 * First failing predicate after #142: the viewer paints GET
 * `/v1/documents/{id}/content`, not the client canonical packet seed.
 * #142 refreshed localStorage/sessionStorage only; the server blob stayed
 * the non-binding template. Reuse the existing vs01-signing-seed POST
 * (signing_corpus_plain) to replace that content. Prefer the same vs01 id.
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { sha256Bytes } from "../utils/agreements/hash";
import { fetchDocumentContent } from "./vs01Api";
import {
  REFRESH_STALE_SEEDED_DOCUMENT_REASON,
  REUSE_MATCHING_SEEDED_DOCUMENT_REASON,
  isNonBindingDraftTemplateCorpus,
  resolveSeededDocumentReuseFromReviewCorpus,
  seededPacketMatchesReviewCorpus,
} from "./vs01ReviewCorpusSeedRefresh";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

export const FIRST_FAILING_SERVER_CONTENT_PREDICATE =
  "esign_paints_get_content_not_client_seed" as const;

export const REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON =
  "replace_stale_server_template_content_from_review_sot" as const;

export const REUSE_MATCHING_SERVER_CONTENT_REASON = "reuse_matching_server_review_content" as const;

const BINDING_KEY_PREFIX = "claw_vs01_review_server_content_bind_v1:";

export type ReviewServerContentBinding = {
  agreementId: string;
  documentId: string;
  corpusHash: string;
  contentSha256: string;
};

export type Vs01SigningSeedFn = (
  agreementId: string,
  draft?: AgreementDraft | null,
  signingCorpusPlain?: string | null,
  signingCorpusSource?: string | null,
  replaceDocumentId?: string | null,
) => Promise<
  | { ok: true; documentId: string; contentSha256: string | null }
  | { ok: false; reason: string; httpStatus?: number; detail?: unknown }
>;

export type ServerContentReplaceDecision = {
  replace: boolean;
  reason:
    | typeof REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON
    | typeof REUSE_MATCHING_SERVER_CONTENT_REASON
    | typeof REUSE_MATCHING_SEEDED_DOCUMENT_REASON;
  fetchedWasTemplate: boolean;
  matching: boolean;
};

function bindingKey(agreementId: string): string {
  return `${BINDING_KEY_PREFIX}${agreementId.trim()}`;
}

export function storeReviewServerContentBinding(binding: ReviewServerContentBinding): void {
  const agreementId = binding.agreementId.trim();
  const documentId = binding.documentId.trim();
  const corpusHash = binding.corpusHash.trim();
  const contentSha256 = binding.contentSha256.trim().toLowerCase();
  if (!agreementId || !documentId || !corpusHash || contentSha256.length < 32) return;
  const payload: ReviewServerContentBinding = {
    agreementId,
    documentId,
    corpusHash,
    contentSha256,
  };
  try {
    sessionStorage.setItem(bindingKey(agreementId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadReviewServerContentBinding(agreementId: string): ReviewServerContentBinding | null {
  const id = agreementId.trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(bindingKey(id));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ReviewServerContentBinding>;
    const documentId = String(o.documentId || "").trim();
    const corpusHash = String(o.corpusHash || "").trim();
    const contentSha256 = String(o.contentSha256 || "").trim().toLowerCase();
    if (!documentId || !corpusHash || contentSha256.length < 32) return null;
    if (String(o.agreementId || "").trim() !== id) return null;
    return { agreementId: id, documentId, corpusHash, contentSha256 };
  } catch {
    return null;
  }
}

export function clearReviewServerContentBinding(agreementId: string): void {
  try {
    sessionStorage.removeItem(bindingKey(agreementId));
  } catch {
    /* ignore */
  }
}

/** Decode GET /content bytes: plain test blobs, or PDF literal strings. */
export function extractPlainTextFromDocumentContent(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");
  if (!utf8.startsWith("%PDF")) return utf8;
  const strings: string[] = [];
  const re = /\(((?:\\.|[^\\)])*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(utf8)) !== null) {
    const raw = m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (raw.trim()) strings.push(raw);
  }
  return (strings.join("\n").trim() || utf8).trim();
}

/** Compressed / binary GET /content is not a Review identity. */
export function looksLikeUnreadableDocumentExtract(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  if (t.startsWith("%PDF")) return true;
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  return t.length >= 64 && letters / t.length < 0.2;
}

/**
 * Positive Review identity only. Shared deal tokens (party names, venue,
 * fee figures) are not a match. Unreadable PDF extract is not a match.
 */
export function fetchedPlainPositivelyMatchesReviewCorpus(
  fetchedPlain: string | null | undefined,
  reviewCorpus: string,
): boolean {
  const fetched = (fetchedPlain ?? "").trim();
  const review = reviewCorpus.trim();
  if (!fetched || review.length < VS01_SIGNING_CORPUS_MIN_LEN) return false;
  if (looksLikeUnreadableDocumentExtract(fetched)) return false;
  return seededPacketMatchesReviewCorpus(fetched, review);
}

export function resolveServerContentReplaceDecision(args: {
  fetchedPlain: string | null;
  reviewCorpus: string;
  fetchFailed?: boolean;
  recordedMatch?: boolean;
}): ServerContentReplaceDecision {
  const review = args.reviewCorpus.trim();
  const fetched = (args.fetchedPlain ?? "").trim();
  const fetchedWasTemplate = isNonBindingDraftTemplateCorpus(fetched);
  if (fetchedWasTemplate) {
    return {
      replace: true,
      reason: REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON,
      fetchedWasTemplate: true,
      matching: false,
    };
  }
  const matching = fetchedPlainPositivelyMatchesReviewCorpus(
    args.fetchFailed ? null : args.fetchedPlain,
    review,
  );
  if (args.recordedMatch && !fetchedWasTemplate) {
    return {
      replace: false,
      reason: REUSE_MATCHING_SERVER_CONTENT_REASON,
      fetchedWasTemplate: false,
      matching: true,
    };
  }
  if (args.fetchFailed || args.fetchedPlain == null) {
    return {
      replace: true,
      reason: REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON,
      fetchedWasTemplate: false,
      matching: false,
    };
  }
  if (matching) {
    return {
      replace: false,
      reason: REUSE_MATCHING_SERVER_CONTENT_REASON,
      fetchedWasTemplate: false,
      matching: true,
    };
  }
  if (review.length < VS01_SIGNING_CORPUS_MIN_LEN) {
    if (looksLikeUnreadableDocumentExtract(fetched)) {
      return {
        replace: true,
        reason: REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON,
        fetchedWasTemplate: false,
        matching: false,
      };
    }
    return {
      replace: false,
      reason: REUSE_MATCHING_SEEDED_DOCUMENT_REASON,
      fetchedWasTemplate: false,
      matching: false,
    };
  }
  return {
    replace: true,
    reason: REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON,
    fetchedWasTemplate,
    matching: false,
  };
}

export type FetchedDocumentContent = Blob | ArrayBuffer | Uint8Array | string;

async function bytesFromFetchedContent(content: FetchedDocumentContent): Promise<Uint8Array> {
  if (typeof content === "string") return new TextEncoder().encode(content);
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof content.arrayBuffer === "function") {
    const buf = await content.arrayBuffer();
    if (buf.byteLength > 0) return new Uint8Array(buf);
  }
  if (typeof content.text === "function") {
    return new TextEncoder().encode(await content.text());
  }
  throw new Error("blob_unreadable");
}

export async function inspectSeededDocumentServerContent(
  documentId: string,
  fetchContent: (id: string) => Promise<FetchedDocumentContent> = fetchDocumentContent,
): Promise<{
  ok: boolean;
  plain: string;
  contentSha256: string | null;
}> {
  const id = documentId.trim();
  if (!id || id.startsWith("local_doc_")) {
    return { ok: false, plain: "", contentSha256: null };
  }
  try {
    const fetched = await fetchContent(id);
    const bytes = await bytesFromFetchedContent(fetched);
    const plain = extractPlainTextFromDocumentContent(bytes);
    let contentSha256: string | null = null;
    try {
      const copy = new Uint8Array(bytes);
      contentSha256 = (await sha256Bytes(copy.buffer as ArrayBuffer)).toLowerCase();
    } catch {
      contentSha256 = null;
    }
    return { ok: true, plain, contentSha256 };
  } catch {
    return { ok: false, plain: "", contentSha256: null };
  }
}

export type BindReviewCorpusResult =
  | {
      ok: true;
      documentId: string;
      replaced: boolean;
      reason: string;
      fetchedWasTemplate: boolean;
      contentSha256: string | null;
    }
  | { ok: false; reason: string };

/**
 * Inspect GET /content for the seeded vs01 id. When it is not the Review
 * corpus, POST vs01-signing-seed with that corpus (prefer same document id).
 * #142 client seed refresh stays as a helper after the server write.
 */
export async function bindReviewCorpusOntoSeededVs01Document(args: {
  agreementId: string;
  existingDocumentId: string;
  reviewCorpus: string;
  existingBridgeCorpus?: string | null;
  seed: Vs01SigningSeedFn;
  draft?: AgreementDraft | null;
  signingCorpusSource?: string | null;
  fetchContent?: (id: string) => Promise<FetchedDocumentContent>;
}): Promise<BindReviewCorpusResult> {
  const agreementId = args.agreementId.trim();
  const existingDocumentId = args.existingDocumentId.trim();
  const reviewCorpus = args.reviewCorpus.trim();
  if (!agreementId || !existingDocumentId) {
    return { ok: false, reason: "missing_document_id" };
  }

  resolveSeededDocumentReuseFromReviewCorpus({
    agreementId,
    existingDocumentId,
    reviewCorpus,
    existingBridgeCorpus: args.existingBridgeCorpus,
  });

  if (existingDocumentId.startsWith("local_doc_")) {
    return {
      ok: true,
      documentId: existingDocumentId,
      replaced: false,
      reason: REUSE_MATCHING_SEEDED_DOCUMENT_REASON,
      fetchedWasTemplate: false,
      contentSha256: null,
    };
  }

  const inspect = await inspectSeededDocumentServerContent(
    existingDocumentId,
    args.fetchContent ?? fetchDocumentContent,
  );
  const recorded = loadReviewServerContentBinding(agreementId);
  const corpusHash = fingerprintAgreementBody(reviewCorpus);
  const recordedMatch = Boolean(
    inspect.ok &&
      recorded &&
      recorded.documentId === existingDocumentId &&
      recorded.corpusHash === corpusHash &&
      recorded.contentSha256 &&
      recorded.contentSha256 === inspect.contentSha256,
  );
  const decision = resolveServerContentReplaceDecision({
    fetchedPlain: inspect.ok ? inspect.plain : null,
    reviewCorpus,
    fetchFailed: !inspect.ok,
    recordedMatch,
  });

  if (!decision.replace) {
    if (
      inspect.ok &&
      inspect.contentSha256 &&
      reviewCorpus.length >= VS01_SIGNING_CORPUS_MIN_LEN &&
      fetchedPlainPositivelyMatchesReviewCorpus(inspect.plain, reviewCorpus)
    ) {
      storeReviewServerContentBinding({
        agreementId,
        documentId: existingDocumentId,
        corpusHash,
        contentSha256: inspect.contentSha256,
      });
    }
    return {
      ok: true,
      documentId: existingDocumentId,
      replaced: false,
      reason: decision.reason,
      fetchedWasTemplate: decision.fetchedWasTemplate,
      contentSha256: inspect.contentSha256,
    };
  }

  const replaceId = existingDocumentId.startsWith("doc_") ? existingDocumentId : null;
  const seedCorpus =
    reviewCorpus.length >= VS01_SIGNING_CORPUS_MIN_LEN && !isNonBindingDraftTemplateCorpus(reviewCorpus)
      ? reviewCorpus
      : null;
  const seeded = await args.seed(
    agreementId,
    args.draft ?? null,
    seedCorpus,
    args.signingCorpusSource ?? REFRESH_STALE_SEEDED_DOCUMENT_REASON,
    replaceId,
  );
  if (!seeded || !seeded.ok || !seeded.documentId.trim()) {
    return { ok: false, reason: !seeded ? "vs01_finalize_failed" : seeded.ok ? "missing_document_id" : seeded.reason };
  }

  const boundId = seeded.documentId.trim();
  if (seeded.contentSha256) {
    storeReviewServerContentBinding({
      agreementId,
      documentId: boundId,
      corpusHash,
      contentSha256: seeded.contentSha256.toLowerCase(),
    });
  }
  if (boundId !== existingDocumentId) {
    resolveSeededDocumentReuseFromReviewCorpus({
      agreementId,
      existingDocumentId: boundId,
      reviewCorpus,
      existingBridgeCorpus: args.existingBridgeCorpus,
    });
  }

  return {
    ok: true,
    documentId: boundId,
    replaced: true,
    reason: REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON,
    fetchedWasTemplate: decision.fetchedWasTemplate,
    contentSha256: seeded.contentSha256,
  };
}
