/**
 * Universal deterministic placeholder / template-token repair + validation for user-visible
 * agreement prose (all families). Does not invent party facts — only safe lexical repairs.
 */

import {
  extractAgreementEntityCandidates,
  substitutePartyPlaceholdersInUserFacingText,
} from "../../agreement/partyPlaceholderDisplay";

const LOG_PREFIX_SCAN = "[placeholder-scan]";
const LOG_PREFIX_REPAIR = "[placeholder-repair]";
const LOG_PREFIX_REJECT = "[placeholder-reject]";

type PhLogKind = typeof LOG_PREFIX_SCAN | typeof LOG_PREFIX_REPAIR | typeof LOG_PREFIX_REJECT;

export type PlaceholderTokenCategory =
  | "internal_slot"
  | "insert_stub"
  | "mustache"
  | "signature_line_stub"
  | "signature_region_slot"
  | "soft_field_label"
  | "drafting_phrase"
  | "schedule_stub"
  | "angle_stub"
  | "other";

export type PlaceholderTokenDecision = {
  token: string;
  category: PlaceholderTokenCategory;
  fatal: boolean;
  contextSnippet: string;
  lineKind?: "signature" | "operative" | "preamble";
  sectionKind?: "signature" | "execution" | "operative";
};

function phLog(kind: PhLogKind, payload: Record<string, unknown>): void {
  const line = { ...payload, kind };
  if (kind === LOG_PREFIX_REJECT) {
    // eslint-disable-next-line no-console
    console.warn(kind, line);
  } else if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    // eslint-disable-next-line no-console
    console.info(kind, line);
  }
}

export function logPlaceholderScanResult(payload: {
  surface: string;
  scannedCount: number;
  fatalCount: number;
  nonfatalCount: number;
  repairedCount: number;
  bodyLen: number;
  partyCount: number;
  ok: boolean;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[placeholder-scan-result]", payload);
}

export function logPlaceholderRejectDetail(
  decisions: PlaceholderTokenDecision[],
  surface: string,
): void {
  if (import.meta.env.MODE === "test") return;
  const fatal = decisions.filter((d) => d.fatal);
  if (!fatal.length) return;
  // eslint-disable-next-line no-console
  console.warn(
    "[placeholder-reject-detail]",
    fatal.slice(0, 12).map((d) => ({
      token: d.token,
      category: d.category,
      fatal: d.fatal,
      contextSnippet: d.contextSnippet,
      lineKind: d.lineKind,
      sectionKind: d.sectionKind,
      surface,
    })),
  );
}

export type PlaceholderSafetyContext = {
  /** Raw user intake — tokens literally present here are allowed to remain. */
  intakeRaw?: string | null;
  partyNames?: readonly (string | null | undefined)[] | null;
  agreementFamily?: string | null;
  /** Where the text is shown or exported (metrics / logs). */
  surface: string;
};

export type PlaceholderSafetyOutcome = {
  ok: boolean;
  text: string;
  repaired: string[];
  remaining: string[];
  /** Fatal tokens only (used for accept/reject). */
  remainingFatal: string[];
  remainingDetail: PlaceholderTokenDecision[];
};

const ALLOWED_BRACKET = /^\[not yet specified\]$/i;

/**
 * Internal slot tokens with underscore and/or digit — excludes signature-line stubs like [NAME], [TITLE], [DATE].
 */
const BRACKET_INTERNAL_SLOT_RE = /\[(?:[A-Z][A-Z0-9]*_\d+|[A-Z]{2,}_[A-Z0-9_]+)\]/g;

/** Signature-block drafting stubs (repaired or ignored when real parties are present). */
const SIGNATURE_LINE_BRACKET_RE =
  /\[\s*(?:NAME|TITLE|DATE|EMAIL|SIGNATURE|INITIALS?|PRINTED\s*NAME|COMPANY\s*NAME|SIGNATORY(?:\s*NAME)?|ADDRESS|PHONE|FAX|CITY|STATE|ZIP(?:\s*CODE)?|POSTAL(?:\s*CODE)?|WITNESS(?:\s*NAME)?)\s*\]/gi;

/** Party/signer metadata stubs in signature blocks — not operative [PARTY_1] slots. */
const SIGNATURE_PARTY_LABEL_BRACKET_RE =
  /\[\s*(?:(?:PARTY|CLIENT|COMPANY|COUNTERPARTY|ORGANIZATION|ORG)(?:\s*NAME)?(?:_\d+)?)\s*\]/gi;

/** Uppercase bracket field labels not caught by narrower patterns. */
const GENERIC_UPPER_BRACKET_RE = /\[[A-Z][A-Z0-9\s/&.'\-]{1,55}\]/g;

const INSERT_BRACKET_RE = /\[[^\]\n]{0,200}\b(?:insert|describe|tbd|to\s+be\s+(?:determined|completed|filled))[^\]\n]{0,200}\]/gi;
const MUSTACHE_RE = /\{\{[\s\S]*?\}\}/g;
const SINGLE_BRACE_TOKEN_RE = /\{[a-z][a-z0-9_]*\}/gi;
const ANGLE_INSERT_RE = /<\s*insert\b[^>]{0,200}>/gi;
const TRIPLE_UNDERSCORE_RE = /___[A-Z][A-Z0-9_]*___/g;
const DRAFTING_STUB_PHRASE_RE =
  /\b(?:fill\s+in\s+later|to\s+be\s+completed|insert\s+here|fill\s+in\s+with\s+counsel)\b/gi;
const SCHEDULE_STUB_RE = /\bschedule\s+a\b[^.\n]{0,120}\b(?:tbd|placeholder|to\s+be\s+completed|\[)\b/gi;
const ANGLE_LEGAL_STUB_RE =
  /<\s*[^>\n]{0,200}(?:customer|client|legal\s*name|party\s*name|tbd|placeholder|to\s+be\s+(?:completed|filled)|insert\s+here)[^>\n]{0,200}\s*>/gi;

const SIGNATURE_REGION_MARKERS =
  /\b(in witness whereof|signatures?|execution|counterparts?|authorized signatory|by:\s*$)\b/gi;

const SOFT_SIGNATURE_LABEL_RE =
  /^(?:NAME|TITLE|DATE|EMAIL|SIGNATURE|INITIALS?|ADDRESS|PHONE|FAX|CITY|STATE|ZIP(?:\s*CODE)?|POSTAL(?:\s*CODE)?|PRINTED\s*NAME|COMPANY\s*NAME|SIGNATORY(?:\s*NAME)?|PARTY\s*NAME|LEGAL\s*NAME|COUNTERPARTY(?:\s*NAME)?|WITNESS(?:\s*NAME)?)$/i;

const SOFT_PREAMBLE_LABEL_RE = /^(?:DATE\s+OF\s+AGREEMENT|EFFECTIVE\s+DATE|AGREEMENT\s+DATE)$/i;

const FATAL_OPERATIVE_BRACKET_RE =
  /\b(?:PARTY_\d+|ORG_\d+|INSERT|DESCRIBE|TBD|TO\s+BE\s+DETERMINED|AMOUNT|FEE|SCHEDULE)\b/i;

/** Strip minimal HTML to plain text for placeholder scanning (mirrors backend). */
export function stripHtmlAgreementScanText(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ");
}

function looksLikeHtmlDocument(text: string): boolean {
  return /<(html|body|div|p|span|br|h[1-6]|table|ul|ol|li|section|article)\b/i.test(text);
}

/** Normalize agreement text before placeholder scan/repair (strip HTML when present). */
export function prepareAgreementTextForPlaceholderScan(text: string): string {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  if (looksLikeHtmlDocument(raw)) {
    return stripHtmlAgreementScanText(raw).replace(/\u00a0/g, " ");
  }
  return raw.replace(/\u00a0/g, " ");
}

function normPartyNames(ctx: Pick<PlaceholderSafetyContext, "partyNames">): string[] {
  return (ctx.partyNames || [])
    .map((n) => String(n ?? "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length > 0);
}

/** Merge structured party list with intake-derived entity candidates for repair/anchors. */
export function resolvePlaceholderPartyNames(
  ctx: Pick<PlaceholderSafetyContext, "intakeRaw" | "partyNames">,
): string[] {
  const fromOpts = normPartyNames(ctx);
  const fromIntake = extractAgreementEntityCandidates(String(ctx.intakeRaw || ""));
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const n of [...fromOpts, ...fromIntake]) {
    const low = n.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    merged.push(n);
  }
  return merged;
}

function intakeAllowsToken(intakeRaw: string | null | undefined, token: string): boolean {
  const i = (intakeRaw || "").trim();
  if (!i || !token.trim()) return false;
  return i.includes(token);
}

function resolvedPartyAnchorCount(text: string, partyNames: string[], intakeRaw?: string | null): number {
  const t = text || "";
  let n = partyNames.filter((p) => p.length >= 3 && t.includes(p)).length;
  if (n >= 2) return n;
  const fromIntake = extractAgreementEntityCandidates(String(intakeRaw || t));
  n = Math.max(n, fromIntake.filter((p) => t.includes(p)).length);
  return n;
}

export function corpusHasResolvedPartyAnchors(
  text: string,
  partyNames: string[],
  intakeRaw?: string | null,
): boolean {
  const t = text || "";
  if (resolvedPartyAnchorCount(t, partyNames, intakeRaw) >= 2) return true;
  return /\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|LP)\b/.test(t) && t.length >= 3_000;
}

/** True when index lies in the tail signature / execution block of a long agreement. */
export function isInSignatureRegion(text: string, index: number): boolean {
  const head = (text || "").slice(0, Math.max(0, index));
  let lastMarker = -1;
  for (const m of head.matchAll(SIGNATURE_REGION_MARKERS)) {
    if (m.index != null) lastMarker = Math.max(lastMarker, m.index);
  }
  if (lastMarker < 0) {
    const witness = head.lastIndexOf("IN WITNESS");
    if (witness >= 0) lastMarker = witness;
  }
  if (lastMarker < 0) return false;
  const tailLen = (text || "").length - lastMarker;
  return index >= lastMarker && tailLen <= 12_000;
}

function bracketInner(token: string): string {
  return token.replace(/^\[|\]$/g, "").trim();
}

function contextSnippet(text: string, index: number, radius = 48): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function sectionKindForIndex(text: string, index: number): PlaceholderTokenDecision["sectionKind"] {
  if (isInSignatureRegion(text, index)) return "signature";
  if (index < Math.min(2_500, text.length * 0.12)) return "operative";
  return "operative";
}

function lineKindForIndex(text: string, index: number): PlaceholderTokenDecision["lineKind"] {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  if (/\b(by|signature|name|title|date|email|initials?)\s*:/i.test(line)) return "signature";
  if (isInSignatureRegion(text, index)) return "signature";
  if (index < 2_500) return "preamble";
  return "operative";
}

function isSignatureLineBracketToken(token: string): boolean {
  SIGNATURE_LINE_BRACKET_RE.lastIndex = 0;
  if (SIGNATURE_LINE_BRACKET_RE.test(token)) return true;
  SIGNATURE_PARTY_LABEL_BRACKET_RE.lastIndex = 0;
  if (SIGNATURE_PARTY_LABEL_BRACKET_RE.test(token)) return true;
  const inner = bracketInner(token);
  return SOFT_SIGNATURE_LABEL_RE.test(inner) || SOFT_PREAMBLE_LABEL_RE.test(inner);
}

function isSoftFieldBracketToken(
  token: string,
  text: string,
  index: number,
  anchorsOk: boolean,
): boolean {
  if (!anchorsOk) return false;
  const inner = bracketInner(token);
  if (SOFT_SIGNATURE_LABEL_RE.test(inner)) return true;
  if (SOFT_PREAMBLE_LABEL_RE.test(inner) && index < 3_500) return true;
  const inSig = isInSignatureRegion(text, index);
  if (inSig && /^(?:PARTY|CLIENT|COMPANY|COUNTERPARTY|ORG)(?:\s*NAME)?(?:_\d+)?$/i.test(inner)) {
    return true;
  }
  if (inSig && /^(?:ADDRESS|CITY|STATE|ZIP)$/i.test(inner)) return true;
  const ctx = contextSnippet(text, index, 32).toLowerCase();
  if (
    inSig &&
    /\b(?:by|signature|name|title|date|email|initials?)\s*:/.test(ctx) &&
    SOFT_SIGNATURE_LABEL_RE.test(inner)
  ) {
    return true;
  }
  return false;
}

function isInternalPartySlotToken(token: string): boolean {
  return /\b(?:PARTY|ORG|CLIENT|COMPANY|COUNTERPARTY)_\d+\b/i.test(token);
}

/**
 * Classify a matched fragment for logging and fatal vs nonfatal gating.
 */
export function classifyTemplateFragment(
  token: string,
  text: string,
  index: number,
  opts?: { partyNames?: string[]; intakeRaw?: string | null },
): PlaceholderTokenDecision {
  const partyNames = opts?.partyNames ?? [];
  const intakeRaw = opts?.intakeRaw ?? null;
  const inSig = isInSignatureRegion(text, index);
  const anchorsOk = corpusHasResolvedPartyAnchors(text, partyNames, intakeRaw);
  const snippet = contextSnippet(text, index);
  const lineKind = lineKindForIndex(text, index);
  const sectionKind = sectionKindForIndex(text, index);

  const base = {
    token,
    contextSnippet: snippet,
    lineKind,
    sectionKind,
  };

  if (isSignatureLineBracketToken(token) || isSoftFieldBracketToken(token, text, index, anchorsOk)) {
    return {
      ...base,
      category: isSignatureLineBracketToken(token) ? "signature_line_stub" : "soft_field_label",
      fatal: false,
    };
  }
  if (BRACKET_INTERNAL_SLOT_RE.test(token)) {
    BRACKET_INTERNAL_SLOT_RE.lastIndex = 0;
    const partySlot = isInternalPartySlotToken(token);
    const nameStyleSlot = /\b(?:PARTY|CLIENT|COMPANY|COUNTERPARTY|ORG)(?:_NAME|_LEGAL_NAME)\b/i.test(token);
    if (anchorsOk && (inSig || lineKind === "signature") && (partySlot || nameStyleSlot)) {
      return {
        ...base,
        category: "signature_region_slot",
        fatal: false,
      };
    }
    if (anchorsOk && nameStyleSlot && !FATAL_OPERATIVE_BRACKET_RE.test(bracketInner(token))) {
      return {
        ...base,
        category: "soft_field_label",
        fatal: false,
      };
    }
    return {
      ...base,
      category: "internal_slot",
      fatal: true,
    };
  }
  if (INSERT_BRACKET_RE.test(token)) {
    INSERT_BRACKET_RE.lastIndex = 0;
    return { ...base, category: "insert_stub", fatal: true };
  }
  if (MUSTACHE_RE.test(token) || SINGLE_BRACE_TOKEN_RE.test(token)) {
    MUSTACHE_RE.lastIndex = 0;
    SINGLE_BRACE_TOKEN_RE.lastIndex = 0;
    return { ...base, category: "mustache", fatal: true };
  }
  if (DRAFTING_STUB_PHRASE_RE.test(token)) {
    DRAFTING_STUB_PHRASE_RE.lastIndex = 0;
    return { ...base, category: "drafting_phrase", fatal: !inSig };
  }
  if (SCHEDULE_STUB_RE.test(token)) {
    SCHEDULE_STUB_RE.lastIndex = 0;
    return { ...base, category: "schedule_stub", fatal: true };
  }
  if (ANGLE_LEGAL_STUB_RE.test(token) || ANGLE_INSERT_RE.test(token)) {
    ANGLE_LEGAL_STUB_RE.lastIndex = 0;
    ANGLE_INSERT_RE.lastIndex = 0;
    return { ...base, category: "angle_stub", fatal: true };
  }
  const inner = bracketInner(token);
  if (token.startsWith("[") && token.endsWith("]")) {
    if (isSoftFieldBracketToken(token, text, index, anchorsOk)) {
      return { ...base, category: "soft_field_label", fatal: false };
    }
    if (FATAL_OPERATIVE_BRACKET_RE.test(inner) && !inSig) {
      return { ...base, category: "other", fatal: true };
    }
    if (inSig && anchorsOk && SOFT_SIGNATURE_LABEL_RE.test(inner)) {
      return { ...base, category: "signature_line_stub", fatal: false };
    }
  }
  return { ...base, category: "other", fatal: true };
}

/** Replace signature-line bracket stubs when the body already names real parties. */
function repairSignatureLinePlaceholders(
  text: string,
  partyNames: string[],
  intakeRaw?: string | null,
): { text: string; repaired: string[] } {
  if (!corpusHasResolvedPartyAnchors(text, partyNames, intakeRaw)) {
    return { text, repaired: [] };
  }
  const repaired: string[] = [];
  let out = text.replace(SIGNATURE_LINE_BRACKET_RE, (match) => {
    repaired.push(`sig_line:${match.trim()}`);
    return "_________________________";
  });
  out = out.replace(SIGNATURE_PARTY_LABEL_BRACKET_RE, (match) => {
    repaired.push(`sig_party_label:${match.trim()}`);
    return "_________________________";
  });
  return { text: out, repaired };
}

/** Repair soft uppercase bracket labels in signature / preamble when parties are resolved. */
function repairSoftFieldBracketPlaceholders(
  text: string,
  partyNames: string[],
  intakeRaw?: string | null,
): { text: string; repaired: string[] } {
  if (!corpusHasResolvedPartyAnchors(text, partyNames, intakeRaw)) {
    return { text, repaired: [] };
  }
  const repaired: string[] = [];
  const out = text.replace(GENERIC_UPPER_BRACKET_RE, (match, offset) => {
    const idx = typeof offset === "number" ? offset : text.indexOf(match);
    if (!isSoftFieldBracketToken(match, text, idx, true)) return match;
    repaired.push(`soft_field:${match.trim()}`);
    return "_________________________";
  });
  return { text: out, repaired };
}

/**
 * Deterministic repairs only. Caller runs {@link collectForbiddenTemplateFragments} after.
 */
export function repairAgreementTemplatePlaceholders(
  text: string,
  ctx: Pick<PlaceholderSafetyContext, "intakeRaw" | "partyNames">,
): { text: string; repaired: string[] } {
  let out = prepareAgreementTextForPlaceholderScan(text);
  const repaired: string[] = [];
  const names = resolvePlaceholderPartyNames(ctx);
  const partyLine = [String(ctx.intakeRaw || ""), ...names].join("\n");

  if (/\[CASE_ID_\d+\]/i.test(out)) {
    out = out.replace(/\[\s*CASE_ID_\d+\s*\]/gi, "any Party");
    repaired.push("CASE_ID→any Party");
  }

  out = substitutePartyPlaceholdersInUserFacingText(out, partyLine, names.length ? names : null);

  const sigRepair = repairSignatureLinePlaceholders(out, names, ctx.intakeRaw);
  out = sigRepair.text;
  repaired.push(...sigRepair.repaired);

  const softRepair = repairSoftFieldBracketPlaceholders(out, names, ctx.intakeRaw);
  out = softRepair.text;
  repaired.push(...softRepair.repaired);

  const clientRe = /\[\s*CLIENT\s*\]/gi;
  if (clientRe.test(out)) {
    out = out.replace(clientRe, "the receiving Party");
    repaired.push("[CLIENT]→the receiving Party");
  }
  const provRe = /\[\s*PROVIDER\s*\]/gi;
  if (provRe.test(out)) {
    out = out.replace(provRe, "the providing Party");
    repaired.push("[PROVIDER]→the providing Party");
  }

  const companyRe = /\[\s*COMPANY_NAME\s*\]/gi;
  if (companyRe.test(out)) {
    const rep = names.length === 1 ? names[0] : "the applicable Party";
    out = out.replace(companyRe, rep);
    repaired.push(`[COMPANY_NAME]→${rep === "the applicable Party" ? rep : "resolved party"}`);
  }

  return { text: out, repaired };
}

type ScanMatch = { token: string; index: number };

function pushScanMatch(matches: ScanMatch[], seen: Set<string>, token: string, index: number) {
  const x = token.trim();
  if (x.length < 2 || x.length > 220) return;
  const key = `${x}@${index}`;
  if (seen.has(key)) return;
  seen.add(key);
  matches.push({ token: x, index });
}

function isInsideMustache(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 1), index);
  const after = text.slice(index, index + 1);
  return before === "{" || after === "}";
}

/**
 * Scan all candidate fragments with positions (before fatal filtering).
 */
export function scanTemplatePlaceholderMatches(
  text: string,
  intakeRaw: string | null | undefined,
): ScanMatch[] {
  const t = text || "";
  const matches: ScanMatch[] = [];
  const seen = new Set<string>();

  const scanRe = (re: RegExp, opts?: { skipMustacheInner?: boolean }) => {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      if (m.index == null) continue;
      const raw = m[0];
      if (ALLOWED_BRACKET.test(raw.trim())) continue;
      if (intakeAllowsToken(intakeRaw, raw)) continue;
      if (opts?.skipMustacheInner && isInsideMustache(t, m.index)) continue;
      pushScanMatch(matches, seen, raw, m.index);
    }
  };

  scanRe(BRACKET_INTERNAL_SLOT_RE);
  scanRe(SIGNATURE_LINE_BRACKET_RE);
  scanRe(SIGNATURE_PARTY_LABEL_BRACKET_RE);
  scanRe(INSERT_BRACKET_RE);
  scanRe(MUSTACHE_RE);
  scanRe(SINGLE_BRACE_TOKEN_RE, { skipMustacheInner: true });
  scanRe(ANGLE_INSERT_RE);
  scanRe(ANGLE_LEGAL_STUB_RE);
  scanRe(TRIPLE_UNDERSCORE_RE);
  scanRe(GENERIC_UPPER_BRACKET_RE);

  for (const line of t.split(/\n/)) {
    if (/^\s*(TODO|FIXME)\s*:/i.test(line)) {
      const idx = t.indexOf(line);
      if (idx >= 0) pushScanMatch(matches, seen, line.trim().slice(0, 120), idx);
    }
  }

  if (DRAFTING_STUB_PHRASE_RE.test(t)) {
    DRAFTING_STUB_PHRASE_RE.lastIndex = 0;
    for (const m2 of t.matchAll(DRAFTING_STUB_PHRASE_RE)) {
      if (m2.index != null) pushScanMatch(matches, seen, m2[0], m2.index);
    }
  }
  if (SCHEDULE_STUB_RE.test(t)) {
    SCHEDULE_STUB_RE.lastIndex = 0;
    for (const m2 of t.matchAll(SCHEDULE_STUB_RE)) {
      if (m2.index != null) pushScanMatch(matches, seen, m2[0].trim().slice(0, 160), m2.index);
    }
  }

  return matches;
}

/**
 * Returns human-readable forbidden fragments still present (deduped) — fatal only.
 */
export function collectForbiddenTemplateFragments(
  text: string,
  intakeRaw: string | null | undefined,
  opts?: { partyNames?: string[] },
): string[] {
  const prepared = prepareAgreementTextForPlaceholderScan(text);
  const partyNames = resolvePlaceholderPartyNames({
    intakeRaw,
    partyNames: opts?.partyNames ?? null,
  });
  const decisions = scanTemplatePlaceholderMatches(prepared, intakeRaw).map(({ token, index }) =>
    classifyTemplateFragment(token, prepared, index, { partyNames, intakeRaw }),
  );
  const fatal = decisions.filter((d) => d.fatal);
  const found: string[] = [];
  for (const d of fatal) {
    if (!found.includes(d.token)) found.push(d.token);
  }
  return found.slice(0, 40);
}

export function analyzeTemplatePlaceholderFragments(
  text: string,
  ctx: Pick<PlaceholderSafetyContext, "intakeRaw" | "partyNames">,
): PlaceholderTokenDecision[] {
  const prepared = prepareAgreementTextForPlaceholderScan(text);
  const partyNames = resolvePlaceholderPartyNames(ctx);
  return scanTemplatePlaceholderMatches(prepared, ctx.intakeRaw).map(({ token, index }) =>
    classifyTemplateFragment(token, prepared, index, { partyNames, intakeRaw: ctx.intakeRaw }),
  );
}

export function finalizeUserVisibleAgreementPlainText(
  text: string,
  ctx: PlaceholderSafetyContext,
): PlaceholderSafetyOutcome {
  const { text: repairedText, repaired } = repairAgreementTemplatePlaceholders(text, ctx);
  const scanCtx = {
    intakeRaw: ctx.intakeRaw,
    partyNames: resolvePlaceholderPartyNames(ctx),
  };
  const remainingDetail = analyzeTemplatePlaceholderFragments(repairedText, scanCtx);
  const remainingFatal = remainingDetail.filter((d) => d.fatal).map((d) => d.token);
  const remaining = [...new Set(remainingDetail.map((d) => d.token))].slice(0, 40);
  const ok = remainingFatal.length === 0;
  const partyCount = scanCtx.partyNames.length;

  logPlaceholderScanResult({
    surface: ctx.surface,
    scannedCount: remainingDetail.length,
    fatalCount: remainingFatal.length,
    nonfatalCount: remainingDetail.length - remainingFatal.length,
    repairedCount: repaired.length,
    bodyLen: repairedText.length,
    partyCount,
    ok,
  });

  phLog(LOG_PREFIX_SCAN, {
    surface: ctx.surface,
    family: ctx.agreementFamily ?? "",
    token_count: remainingFatal.length,
    token_types: remainingFatal.slice(0, 12),
    repaired_count: repaired.length,
    ok,
  });
  if (repaired.length) {
    phLog(LOG_PREFIX_REPAIR, {
      surface: ctx.surface,
      family: ctx.agreementFamily ?? "",
      repaired,
      repaired_vs_rejected: "repaired",
    });
  }
  if (!ok) {
    logPlaceholderRejectDetail(remainingDetail, ctx.surface);
    phLog(LOG_PREFIX_REJECT, {
      surface: ctx.surface,
      family: ctx.agreementFamily ?? "",
      remaining: remainingFatal.slice(0, 12),
      remaining_detail: remainingDetail
        .filter((d) => d.fatal)
        .slice(0, 12)
        .map((d) => ({
          token: d.token,
          category: d.category,
          fatal: d.fatal,
          contextSnippet: d.contextSnippet,
          lineKind: d.lineKind,
          sectionKind: d.sectionKind,
        })),
      repaired,
      ok: false,
    });
  }
  return {
    ok,
    text: repairedText,
    repaired,
    remaining,
    remainingFatal,
    remainingDetail,
  };
}

export const PLACEHOLDER_SAFETY_PREVIEW_BLOCKED =
  "LawDog blocked this preview because unresolved drafting placeholders remain in the agreement text. Edit the draft, resolve bracketed fields, or run generation again before sending or exporting.";
