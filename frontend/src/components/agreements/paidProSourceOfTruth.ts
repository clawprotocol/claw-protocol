/**
 * Paid Pro source of truth.
 *
 * Once a paid Pro server_full_draft is accepted, this is the only agreement body
 * the frontend may display, copy, finalize, or send to signing unless the user
 * explicitly creates a revision.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  applyAcceptedProCorpusSafeDisplay,
} from "./acceptedProCorpusSafeDisplay";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
  readCanonicalAgreementCorpusForSurface,
  type CanonicalAgreementSnapshotParty,
} from "./canonicalAgreementSnapshot";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

export type PaidProSourceOfTruth = {
  text: string;
  hash: string;
  accepted_at: number;
  source: "server_full_draft";
  reviewSessionId?: string;
  signerManifestHash?: string;
};

export type PaidProDocumentSurface =
  | "display"
  | "copy"
  | "review"
  | "finalized"
  | "signer_setup"
  | "vs01";

export type PaidProDocumentForSurface = {
  text: string;
  hash: string;
  source: "paidProSourceOfTruth";
  surface: PaidProDocumentSurface;
  executionBlockAppended: boolean;
};

export type PaidProCorpusInvariant = {
  accepted_len: number;
  displayed_len: number;
  copied_len: number;
  review_len: number;
  finalized_len: number;
  vs01_len: number;
  accepted_hash: string;
  displayed_hash: string;
  copied_hash: string;
  review_hash: string;
  finalized_hash: string;
  vs01_hash: string;
  displayed_matches: boolean;
  copied_matches: boolean;
  review_matches: boolean;
  finalized_matches: boolean;
  vs01_matches_or_execution_only: boolean;
};

let paidProSourceOfTruth: PaidProSourceOfTruth | null = null;

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function hashPaidProCorpus(text: string): string {
  return fingerprintAgreementBody(text || "");
}

export function clearPaidProSourceOfTruth(): void {
  paidProSourceOfTruth = null;
  clearFrozenCanonicalAgreementCorpus();
}

export function getPaidProSourceOfTruth(): PaidProSourceOfTruth | null {
  return paidProSourceOfTruth;
}

export function getPaidProSourceOfTruthText(): string {
  return paidProSourceOfTruth?.text ?? "";
}

export function hasPaidProSourceOfTruth(): boolean {
  return Boolean(paidProSourceOfTruth?.text && paidProSourceOfTruth.text.length >= 500);
}

export function establishPaidProSourceOfTruth(args: {
  text: string;
  source?: "server_full_draft";
  accepted_at?: number;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  reviewSessionId?: string | null;
}): PaidProSourceOfTruth {
  const safe = applyAcceptedProCorpusSafeDisplay(args.text, {
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  }).text;
  const parties: CanonicalAgreementSnapshotParty[] = (args.draft?.parties ?? [])
    .map((p) => ({
      name: String(p?.name ?? "").trim(),
      role: p?.role ? String(p.role).trim() : null,
      email: p?.email ? String(p.email).trim() : null,
      partyAddress: (p as { partyAddress?: string | null })?.partyAddress
        ? String((p as { partyAddress?: string | null }).partyAddress).trim()
        : null,
    }))
    .filter((p) => p.name);
  const snapshot = buildCanonicalAgreementSnapshot({
    surface: "paid_pro_source_of_truth_establish",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text: safe }],
    intakeText: args.intakeText ?? null,
    parties,
    signerState: { complete: false, signerCount: Math.max(2, parties.length) },
    minLen: 500,
    reviewSessionId: args.reviewSessionId,
  });
  const frozen = freezeCanonicalAgreementSnapshot(snapshot, "server_full_document_text");
  const record: PaidProSourceOfTruth = {
    text: frozen?.canonicalText ?? safe,
    hash: frozen?.hash ?? hashPaidProCorpus(safe),
    accepted_at: args.accepted_at ?? Date.now(),
    source: args.source ?? "server_full_draft",
    reviewSessionId: frozen?.reviewSessionId,
    signerManifestHash: frozen?.signerManifestHash,
  };
  paidProSourceOfTruth = record;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-source-of-truth]", {
      phase: "established",
      accepted_len: record.text.length,
      hash: record.hash,
      source: record.source,
    });
  }
  return record;
}

export function hydratePaidProSourceOfTruth(args: {
  text?: string | null;
  hash?: string | null;
  accepted_at?: number | null;
  source?: string | null;
  reviewSessionId?: string | null;
}): PaidProSourceOfTruth | null {
  const text = trim(args.text);
  if (text.length < 500) return null;
  if ((args.source || "server_full_draft") !== "server_full_draft") return null;
  const snapshot = buildCanonicalAgreementSnapshot({
    surface: "paid_pro_source_of_truth_hydrate",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text }],
    minLen: 500,
    reviewSessionId: args.reviewSessionId ?? null,
  });
  const frozen = freezeCanonicalAgreementSnapshot(snapshot, "server_full_document_text");
  const record: PaidProSourceOfTruth = {
    text: frozen?.canonicalText ?? text,
    hash: frozen?.hash ?? (trim(args.hash) || hashPaidProCorpus(text)),
    accepted_at: args.accepted_at ?? Date.now(),
    source: "server_full_draft",
    reviewSessionId: frozen?.reviewSessionId,
    signerManifestHash: frozen?.signerManifestHash,
  };
  paidProSourceOfTruth = record;
  return record;
}

export function getPaidProDisplayText(): string {
  return getPaidProSourceOfTruthText();
}

export function getPaidProVs01Text(opts?: {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): string {
  void opts;
  return getPaidProSourceOfTruthText();
}

export function getPaidProDocumentForSurface(
  surface: PaidProDocumentSurface,
  _opts?: { draft?: ParsedDraftShape | null; intakeText?: string | null },
): PaidProDocumentForSurface | null {
  const source = getPaidProSourceOfTruth();
  if (!source) return null;
  const canonical = readCanonicalAgreementCorpusForSurface(surface === "signer_setup" ? "handoff" : surface, {
    required: true,
  });
  const text = canonical?.canonicalText ?? source.text;
  const hash = canonical?.hash ?? hashPaidProCorpus(text);
  const executionBlockAppended = false;
  assertPaidProSurfaceCorpus({
    surface,
    text,
    actualSource: "paidProSourceOfTruth",
    allowExecutionAppend: surface === "vs01",
  });
  logPaidProSurface({
    surface,
    len: text.length,
    hash,
    source: "paidProSourceOfTruth",
  });
  return {
    text,
    hash,
    source: "paidProSourceOfTruth",
    surface,
    executionBlockAppended,
  };
}

function logPaidProSurface(payload: {
  surface: PaidProDocumentSurface;
  len: number;
  hash: string;
  source: "paidProSourceOfTruth";
}): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-surface]", payload);
}

export function assertPaidProSurfaceCorpus(args: {
  surface: PaidProDocumentSurface | string;
  text: string;
  actualSource: string;
  allowExecutionAppend?: boolean;
}): void {
  const source = getPaidProSourceOfTruth();
  if (!source) return;
  const actualText = trim(args.text);
  const actualHash = hashPaidProCorpus(actualText);
  const exact = actualHash === source.hash;
  const allowedExecutionAppend = Boolean(args.allowExecutionAppend) && differsOnlyByExecutionAppend(source.text, actualText);
  if (exact || allowedExecutionAppend) return;
  const payload = {
    surface: args.surface,
    expectedHash: source.hash,
    actualHash,
    actualSource: args.actualSource,
    expectedLen: source.text.length,
    actualLen: actualText.length,
  };
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error("[FATAL_PAID_PRO_CORPUS_DRIFT]", payload);
  }
}

function differsOnlyByExecutionAppend(base: string, candidate: string): boolean {
  const a = trim(base);
  const b = trim(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!b.startsWith(a)) return false;
  const tail = b.slice(a.length).trim();
  return /\b(IN WITNESS WHEREOF|SIGNATURE|EXECUTION)\b/i.test(tail);
}

export function logPaidProCorpusInvariant(args: {
  displayed?: string | null;
  copied?: string | null;
  review?: string | null;
  finalized?: string | null;
  vs01?: string | null;
}): PaidProCorpusInvariant | null {
  const source = getPaidProSourceOfTruth();
  if (!source) return null;
  const displayed = trim(args.displayed ?? source.text);
  const copied = trim(args.copied ?? displayed);
  const review = trim(args.review ?? displayed);
  const finalized = trim(args.finalized ?? review);
  const vs01 = trim(args.vs01 ?? source.text);
  const invariant: PaidProCorpusInvariant = {
    accepted_len: source.text.length,
    displayed_len: displayed.length,
    copied_len: copied.length,
    review_len: review.length,
    finalized_len: finalized.length,
    vs01_len: vs01.length,
    accepted_hash: source.hash,
    displayed_hash: hashPaidProCorpus(displayed),
    copied_hash: hashPaidProCorpus(copied),
    review_hash: hashPaidProCorpus(review),
    finalized_hash: hashPaidProCorpus(finalized),
    vs01_hash: hashPaidProCorpus(vs01),
    displayed_matches: hashPaidProCorpus(displayed) === source.hash,
    copied_matches: hashPaidProCorpus(copied) === source.hash,
    review_matches: hashPaidProCorpus(review) === source.hash,
    finalized_matches: hashPaidProCorpus(finalized) === source.hash,
    vs01_matches_or_execution_only:
      hashPaidProCorpus(vs01) === source.hash || differsOnlyByExecutionAppend(source.text, vs01),
  };
  const ok =
    invariant.displayed_matches &&
    invariant.copied_matches &&
    invariant.review_matches &&
    invariant.finalized_matches &&
    invariant.vs01_matches_or_execution_only;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    (ok ? console.info : console.error)(
      ok ? "[paid-pro-corpus-invariant]" : "[paid-pro-corpus-invariant-violation]",
      invariant,
    );
  }
  return invariant;
}
