/**
 * Normalize premium-full-draft HTTP wire payloads to a single authoritative document text.
 * Test235: server may return the real Pro body under alternate fields while document_text
 * carries degraded/json wrapper copy — pick the best allowed field and reject filler/meta text.
 */

import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { SEND_HANDOFF_AUTHORITATIVE_MIN_LEN } from "./paidProAuthorityConstants";
import {
  rejectPremiumDegradedFiller,
  rejectPremiumHardDegradedFallbackArtifacts,
} from "./premiumFullDraftClientAcceptance";
import {
  isNonfatalGenerationFailureCode,
  PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";

const WIRE_DOCUMENT_FIELD_GROUPS: readonly (readonly string[])[] = [
  ["server_full_document_text", "serverFullDocumentText"],
  ["full_document_text", "fullDocumentText"],
  ["authoritative_draft", "authoritativeDraft"],
  ["document_text", "documentText"],
  ["document"],
  ["agreement_text", "agreementText"],
  ["text"],
  ["body"],
] as const;

const ALL_WIRE_BODY_FIELD_GROUPS: readonly (readonly string[])[] = WIRE_DOCUMENT_FIELD_GROUPS;

export type PremiumWireDocumentRejection = {
  field: string;
  reasons: string[];
};

export type NormalizedPremiumFullDraftPayload = {
  wire: PremiumFullDraftResult;
  authoritativeText: string;
  sourceField: string | null;
  rejectedCandidates: PremiumWireDocumentRejection[];
};

export type PremiumAuthoritativeBodyResolution = {
  text: string;
  sourceField: string | null;
  hasAuthoritativeServerDocument: boolean;
  rejectedCandidates: PremiumWireDocumentRejection[];
};

function readWireStringField(
  raw: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string {
  if (!raw) return "";
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** True when text looks like a premium API JSON envelope, not operative agreement prose. */
export function looksLikePremiumResponseJsonWrapper(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (t.startsWith("```")) {
    const inner = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (inner !== t) return looksLikePremiumResponseJsonWrapper(inner);
  }
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(t) as Record<string, unknown> | unknown[] | null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return (
        "document_text" in parsed ||
        "server_full_document_text" in parsed ||
        "generation_outcome" in parsed ||
        "agreement_family" in parsed
      );
    }
  } catch {
    /* fall through to heuristic */
  }
  return (
    /\{\s*"title"\s*:/.test(t) &&
    /\b(?:document_text|generation_outcome|server_full_document_text|agreement_family)\b/.test(t)
  );
}

export function rejectPremiumWireDocumentCandidate(text: string): PremiumWireDocumentRejection | null {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { field: "", reasons: ["empty"] };
  if (looksLikePremiumResponseJsonWrapper(trimmed)) {
    return { field: "", reasons: ["json_wrapper"] };
  }
  const filler = rejectPremiumDegradedFiller(trimmed);
  if (!filler.ok) {
    return { field: "", reasons: filler.reasons };
  }
  if (trimmed.length < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    return { field: "", reasons: [`too_short:${trimmed.length}`] };
  }
  return null;
}

function pickAuthoritativePremiumWireDocumentFields(
  raw: Record<string, unknown>,
): { text: string; sourceField: string | null; rejectedCandidates: PremiumWireDocumentRejection[] } {
  const rejectedCandidates: PremiumWireDocumentRejection[] = [];
  for (const keys of WIRE_DOCUMENT_FIELD_GROUPS) {
    const candidate = readWireStringField(raw, keys);
    if (!candidate) continue;
    const fieldLabel = keys[0] ?? "unknown";
    const rejection = rejectPremiumWireDocumentCandidate(candidate);
    if (rejection) {
      rejectedCandidates.push({ field: fieldLabel, reasons: rejection.reasons });
      continue;
    }
    return { text: candidate, sourceField: fieldLabel, rejectedCandidates };
  }
  return { text: "", sourceField: null, rejectedCandidates };
}

function pickAuthoritativePremiumWireDocument(
  raw: Record<string, unknown>,
): { text: string; sourceField: string | null; rejectedCandidates: PremiumWireDocumentRejection[] } {
  const picked = pickAuthoritativePremiumWireDocumentFields(raw);
  if (picked.text) return picked;
  const jsonEnvelopeSource = readWireStringField(raw, ["document_text", "documentText"]);
  if (jsonEnvelopeSource && looksLikePremiumResponseJsonWrapper(jsonEnvelopeSource)) {
    const unwrapped = tryUnwrapPremiumJsonEnvelopeDocument(jsonEnvelopeSource);
    if (unwrapped) {
      return {
        text: unwrapped.text,
        sourceField: unwrapped.sourceField,
        rejectedCandidates: picked.rejectedCandidates,
      };
    }
  }
  return picked;
}

/** When the wire puts the full API JSON envelope in document_text, extract nested operative prose. */
export function tryUnwrapPremiumJsonEnvelopeDocument(
  text: string,
): { text: string; sourceField: string } | null {
  const trimmed = String(text || "").trim();
  if (!looksLikePremiumResponseJsonWrapper(trimmed)) return null;
  let raw = trimmed;
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  if (!raw.startsWith("{")) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  if (!parsed) return null;
  const nested = pickAuthoritativePremiumWireDocumentFields(parsed);
  if (!nested.text || !nested.sourceField) return null;
  return {
    text: nested.text,
    sourceField: `json_envelope.${nested.sourceField}`,
  };
}

function isDegradedNonfatalJsonParseWire(base: Record<string, unknown>): boolean {
  return (
    String(base.generation_outcome || "").trim().toLowerCase() === "degraded" &&
    isNonfatalGenerationFailureCode(String(base.server_generation_failure_code || ""))
  );
}

/** Substantive degraded/json_parse wire bodies skip repeated-clause filler heuristics. */
function substantiveDegradedJsonParseWireBodyUsable(
  text: string,
  base: Record<string, unknown>,
): boolean {
  const trimmed = String(text || "").trim();
  if (!isDegradedNonfatalJsonParseWire(base)) return false;
  if (trimmed.length < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) return false;
  if (looksLikePremiumResponseJsonWrapper(trimmed)) {
    const unwrapped = tryUnwrapPremiumJsonEnvelopeDocument(trimmed);
    return Boolean(
      unwrapped?.text && substantiveDegradedJsonParseWireBodyUsable(unwrapped.text, base),
    );
  }
  if (!rejectPremiumHardDegradedFallbackArtifacts(trimmed).ok) return false;
  const validation = base.agreement_validation as { passed?: boolean } | null | undefined;
  if (validation?.passed === false) return false;
  return true;
}

function substantiveWireBodyUsable(text: string, base: Record<string, unknown>): boolean {
  const trimmed = String(text || "").trim();
  if (trimmed.length < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return false;
  if (looksLikePremiumResponseJsonWrapper(trimmed)) {
    const unwrapped = tryUnwrapPremiumJsonEnvelopeDocument(trimmed);
    return Boolean(unwrapped?.text && substantiveWireBodyUsable(unwrapped.text, base));
  }
  if (substantiveDegradedJsonParseWireBodyUsable(trimmed, base)) return true;
  if (!rejectPremiumWireDocumentCandidate(trimmed)) return true;
  return false;
}

function pickRelaxedSubstantiveWireBody(raw: Record<string, unknown>): {
  text: string;
  sourceField: string | null;
} {
  let bestText = "";
  let bestSource: string | null = null;
  for (const keys of ALL_WIRE_BODY_FIELD_GROUPS) {
    const candidate = readWireStringField(raw, keys);
    if (!candidate) continue;
    if (looksLikePremiumResponseJsonWrapper(candidate)) {
      const unwrapped = tryUnwrapPremiumJsonEnvelopeDocument(candidate);
      if (
        unwrapped?.text &&
        substantiveWireBodyUsable(unwrapped.text, raw) &&
        unwrapped.text.length > bestText.length
      ) {
        bestText = unwrapped.text;
        bestSource = unwrapped.sourceField;
      }
      continue;
    }
    if (substantiveWireBodyUsable(candidate, raw) && candidate.length > bestText.length) {
      bestText = candidate;
      bestSource = keys[0] ?? null;
    }
  }
  return { text: bestText, sourceField: bestSource };
}

/**
 * Canonical resolver for premium-full-draft HTTP bodies. Checks every allowed wire alias
 * (server_full_document_text, document_text, text, body, etc.) and returns one authoritative corpus.
 */
export function resolvePremiumFullDraftAuthoritativeBody(
  raw: Partial<PremiumFullDraftResult> & Record<string, unknown> | null | undefined,
): PremiumAuthoritativeBodyResolution {
  const base = (raw ?? {}) as PremiumFullDraftResult & Record<string, unknown>;
  const picked = pickAuthoritativePremiumWireDocument(base);
  let text = picked.text;
  let sourceField = picked.sourceField;
  const relaxed = pickRelaxedSubstantiveWireBody(base);
  if (relaxed.text.length > text.length) {
    text = relaxed.text;
    sourceField = relaxed.sourceField;
  }
  return {
    text,
    sourceField,
    hasAuthoritativeServerDocument: text.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
    rejectedCandidates: picked.rejectedCandidates,
  };
}

/**
 * Extract the best authoritative document from allowed wire fields; merge onto the wire object
 * so validation, gates, SoT, and logging share one corpus.
 */
export function normalizePremiumFullDraftResponsePayload(
  raw: Partial<PremiumFullDraftResult> & Record<string, unknown> | null | undefined,
): NormalizedPremiumFullDraftPayload {
  const base = (raw ?? {}) as PremiumFullDraftResult & Record<string, unknown>;
  const resolved = resolvePremiumFullDraftAuthoritativeBody(base);
  const authoritativeText = resolved.text;
  const rawServerFull = String(base.server_full_document_text ?? "").trim();
  let mergedServerFullDocumentText: string;
  if (rawServerFull.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    mergedServerFullDocumentText = rawServerFull;
  } else if (authoritativeText.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    mergedServerFullDocumentText = authoritativeText;
  } else {
    mergedServerFullDocumentText = rawServerFull || authoritativeText;
  }
  const wire: PremiumFullDraftResult = {
    ...base,
    document_text: authoritativeText || String(base.document_text ?? "").trim(),
    authoritative_draft: authoritativeText || String(base.authoritative_draft ?? "").trim(),
    server_full_document_text: mergedServerFullDocumentText,
  };
  return {
    wire,
    authoritativeText,
    sourceField: resolved.sourceField,
    rejectedCandidates: resolved.rejectedCandidates,
  };
}
