/**
 * Bounded observation for Core Paid Journey C4.
 * Distinguishes request payload, response payload, canonical GET, and visible document.
 * Never converts a parse/HTTP failure into an empty JSON object.
 */

export function canonicalSnapshotCreatePath(agreementId: string): string {
  return `/api/agreements/${String(agreementId || "").trim()}/canonical-review-snapshot`;
}

export function isCanonicalSnapshotCreateUrl(url: string, agreementId: string): boolean {
  const expected = canonicalSnapshotCreatePath(agreementId);
  if (!expected.endsWith("/canonical-review-snapshot") || !agreementId.trim()) return false;
  let pathname = "";
  try {
    pathname = new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
  return pathname === expected;
}

export function isCanonicalSnapshotCreatePost(args: {
  url: string;
  method: string;
  agreementId: string;
}): boolean {
  return String(args.method || "").toUpperCase() === "POST" && isCanonicalSnapshotCreateUrl(args.url, args.agreementId);
}

export type ObservedJsonFailure = {
  kind: "parse_failed" | "http_failed" | "empty_body";
  endpoint: string;
  method: string;
  status: number;
  stage: string;
  elapsedMs?: number;
  message: string;
};

export function formatObservedJsonFailure(error: ObservedJsonFailure): string {
  return [
    error.kind,
    `status=${error.status}`,
    `method=${error.method}`,
    `url=${error.endpoint}`,
    `stage=${error.stage}`,
    error.elapsedMs != null ? `elapsedMs=${error.elapsedMs}` : "",
    error.message,
  ]
    .filter(Boolean)
    .join(" ");
}

export function parseObservedJsonPayload(args: {
  raw: string;
  endpoint: string;
  method: string;
  status: number;
  stage: string;
  elapsedMs?: number;
}): { ok: true; value: unknown } | { ok: false; error: ObservedJsonFailure } {
  const raw = String(args.raw ?? "");
  if (!raw.trim()) {
    return {
      ok: false,
      error: {
        kind: "empty_body",
        endpoint: args.endpoint,
        method: args.method,
        status: args.status,
        stage: args.stage,
        elapsedMs: args.elapsedMs,
        message: "response body was empty",
      },
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "parse_failed",
        endpoint: args.endpoint,
        method: args.method,
        status: args.status,
        stage: args.stage,
        elapsedMs: args.elapsedMs,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export function snapshotFieldsFromObservedPayload(value: unknown): {
  agreementId: string;
  snapshotId: string;
  digest: string;
  corpus: string;
  length: number;
} {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const nested = root.snapshot && typeof root.snapshot === "object" ? (root.snapshot as Record<string, unknown>) : {};
  const agreementId = String(nested.agreement_id || root.agreement_id || "").trim();
  const snapshotId = String(nested.snapshot_id || root.snapshot_id || "").trim();
  const digest = String(nested.corpus_sha256 || root.corpus_sha256 || "")
    .trim()
    .toLowerCase();
  const corpus = String(nested.corpus_plain || root.corpus_plain || "").trim();
  const length = Number(nested.corpus_length || root.corpus_length || corpus.length) || corpus.length;
  return { agreementId, snapshotId, digest, corpus, length };
}

/** Alert absence is a success path. Do not wait on a missing node. */
export function readOptionalAlertFromCount(count: number, text: string | null | undefined): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return String(text || "").trim();
}
