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

export type PremiumWireServerFullPromotion = {
  wire: PremiumFullDraftResult & Record<string, unknown>;
  body: string;
  promoted: boolean;
  sourceField: string | null;
};

/** Apply canonical server-full aliases so downstream freeze/validation read one corpus. */
export function applyPremiumWireAuthoritativeServerFullAliases(
  wire: Partial<PremiumFullDraftResult> & Record<string, unknown>,
  authoritativeBody: string,
): PremiumFullDraftResult & Record<string, unknown> {
  const body = String(authoritativeBody || "").trim();
  const base = (wire ?? {}) as PremiumFullDraftResult & Record<string, unknown>;
  if (body.length < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return base;
  return {
    ...base,
    document_text: body,
    server_full_document_text: body,
    serverFullDocumentText: body,
    full_document_text: body,
    fullDocumentText: body,
    authoritative_draft: body,
    authoritativeDraft: body,
  };
}

function readSubstantiveDegradedJsonParseDocumentText(
  base: Record<string, unknown>,
): { text: string; sourceField: string } | null {
  if (!isDegradedNonfatalJsonParseWire(base)) return null;
  for (const keys of [
    ["document_text", "documentText"],
    ["server_full_document_text", "serverFullDocumentText"],
    ["full_document_text", "fullDocumentText"],
    ["text"],
    ["body"],
  ] as const) {
    const candidate = readWireStringField(base, keys);
    if (!candidate) continue;
    if (!substantiveDegradedJsonParseWireBodyUsable(candidate, base)) continue;
    // Prefer unwrapped operative prose so callers keep json_envelope.* provenance.
    if (looksLikePremiumResponseJsonWrapper(candidate)) {
      const unwrapped = tryUnwrapPremiumJsonEnvelopeDocument(candidate);
      if (unwrapped?.text) return unwrapped;
    }
    return { text: candidate, sourceField: keys[0] ?? "document_text" };
  }
  return null;
}

export function promoteSubstantiveDegradedJsonParseWireToServerFull(
  raw: Partial<PremiumFullDraftResult> & Record<string, unknown> | null | undefined,
): PremiumWireServerFullPromotion {
  const base = (raw ?? {}) as PremiumFullDraftResult & Record<string, unknown>;
  const resolved = resolvePremiumFullDraftAuthoritativeBody(base);
  let body = resolved.text;
  let sourceField = resolved.sourceField;
  if (body.length < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) {
    const coerced = readSubstantiveDegradedJsonParseDocumentText(base);
    if (coerced && coerced.text.length > body.length) {
      body = coerced.text;
      sourceField = coerced.sourceField;
    }
  }
  const existingServerFull = readWireStringField(base, [
    "server_full_document_text",
    "serverFullDocumentText",
  ]);
  const promoted =
    body.length >= PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN &&
    existingServerFull.length < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN;
  const wire = promoted
    ? applyPremiumWireAuthoritativeServerFullAliases(base, body)
    : applyPremiumWireAuthoritativeServerFullAliases(
        base,
        existingServerFull.length >= body.length ? existingServerFull : body,
      );
  return { wire, body, promoted, sourceField };
}

export function premiumWireServerFullPromotionInvariantViolated(
  raw: Partial<PremiumFullDraftResult> & Record<string, unknown> | null | undefined,
): boolean {
  const base = (raw ?? {}) as Record<string, unknown>;
  const coerced = readSubstantiveDegradedJsonParseDocumentText(base);
  if (!coerced) return false;
  const serverFullLen = readWireStringField(base, [
    "server_full_document_text",
    "serverFullDocumentText",
  ]).length;
  const resolved = resolvePremiumFullDraftAuthoritativeBody(base);
  return (
    serverFullLen < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN ||
    !resolved.hasAuthoritativeServerDocument
  );
}

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
  // Intelligence validation may fail on json_parse while document_text remains operative prose.
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
  // Resolve provenance against the raw wire BEFORE alias promotion copies the body into
  // server_full_document_text (which would otherwise steal sourceField).
  const prePromotionResolved = resolvePremiumFullDraftAuthoritativeBody(base);
  const promotion = promoteSubstantiveDegradedJsonParseWireToServerFull(base);
  const resolved = resolvePremiumFullDraftAuthoritativeBody(promotion.wire);
  let authoritativeText = resolved.text;
  let sourceField =
    prePromotionResolved.sourceField ?? promotion.sourceField ?? resolved.sourceField;
  if (authoritativeText.length < promotion.body.length) {
    authoritativeText = promotion.body;
    sourceField =
      prePromotionResolved.sourceField ??
      promotion.sourceField ??
      sourceField ??
      "document_text";
  }
  if (
    !sourceField &&
    prePromotionResolved.text &&
    prePromotionResolved.text === authoritativeText
  ) {
    sourceField = prePromotionResolved.sourceField;
  }
  const rawServerFull = readWireStringField(base, [
    "server_full_document_text",
    "serverFullDocumentText",
  ]);
  let mergedServerFullDocumentText: string;
  if (rawServerFull.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    mergedServerFullDocumentText = rawServerFull;
  } else if (authoritativeText.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    mergedServerFullDocumentText = authoritativeText;
  } else {
    mergedServerFullDocumentText = rawServerFull || authoritativeText;
  }
  const wire = applyPremiumWireAuthoritativeServerFullAliases(
    {
      ...base,
      document_text: authoritativeText || String(base.document_text ?? "").trim(),
      authoritative_draft: authoritativeText || String(base.authoritative_draft ?? "").trim(),
      server_full_document_text: mergedServerFullDocumentText,
    },
    mergedServerFullDocumentText.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN
      ? mergedServerFullDocumentText
      : authoritativeText,
  ) as PremiumFullDraftResult;
  if (
    import.meta.env.DEV &&
    premiumWireServerFullPromotionInvariantViolated({
      ...base,
      document_text: String(base.document_text ?? wire.document_text ?? ""),
      server_full_document_text: wire.server_full_document_text,
      generation_outcome: base.generation_outcome ?? wire.generation_outcome,
      server_generation_failure_code:
        base.server_generation_failure_code ?? wire.server_generation_failure_code,
    })
  ) {
    // eslint-disable-next-line no-console
    console.warn("[premium-full-draft] server_full promotion invariant violated after normalize", {
      documentLen: String(wire.document_text ?? "").trim().length,
      serverFullLen: String(wire.server_full_document_text ?? "").trim().length,
      generationOutcome: wire.generation_outcome,
      failureCode: wire.server_generation_failure_code,
    });
  }
  return {
    wire,
    authoritativeText,
    sourceField,
    rejectedCandidates: resolved.rejectedCandidates,
  };
}
