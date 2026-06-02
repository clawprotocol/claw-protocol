/**
 * Universal deterministic placeholder / template-token repair + validation for user-visible
 * agreement prose (all families). Does not invent party facts — only safe lexical repairs.
 */

import {
  extractAgreementEntityCandidates,
  substitutePartyPlaceholdersInUserFacingText,
} from "../../agreement/partyPlaceholderDisplay";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { resolveIntakeEmailForContactSlot } from "./paidProIntakeContactSubstitution";
import { buildPartyEntries, normalizeSignatureBlockHeadings } from "./paidProAgreementPolish";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";
import { isCanonicalCommittedText, stripCanonicalCommitMarker } from "./canonicalAgreementDocument";
import { isStarterDocumentSurface } from "./agreementDocumentSurfacePolicy";
import {
  logPlaceholderScanSkippedTransient,
  shouldSkipPlaceholderScanForTransientPreview,
  transientGateInputFromPlaceholderContext,
} from "./agreementPreviewPlaceholderTransientGate";
import {
  countIdentityPlaceholders,
  listUnresolvedIdentityPlaceholderTokens,
  logDraftingStubOriginsFromText,
  logOrgPlaceholderOriginsFromText,
  logPaidProPlaceholderContext,
  logPaidProPlaceholderRepair,
} from "./paidProPlaceholderAttributionLog";
import { formatStarterPreviewForDisplay } from "./starterPreviewFormatting";
import { repairMoneyCommaBracketPlaceholderCorruption } from "./agreementMoneyPlaceholderRepair";
import {
  isHarmlessEntityMetadataBracketToken,
  neutralizeHarmlessEntityMetadataPlaceholders,
} from "./harmlessEntityMetadataPlaceholders";
import { runCachedCorpusScan } from "./paidProCorpusScanCache";

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
  nearestHeading?: string;
  normalizedToken?: string;
  isTailSection?: boolean;
  isExecutionContext?: boolean;
};

/** Paid Pro bodies below this length do not get signature-only fatal demotion. */
export const PAID_PRO_SIGNATURE_ACCEPT_MIN_BODY_LEN = 18_000;

export type PlaceholderPartyResolution = {
  names: string[];
  partyCount: number;
  anchorsFound: boolean;
  sources: {
    mergedParties: number;
    intakeExtraction: number;
    corpusBetween: number;
    corpusAmong: number;
  };
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

export function logPlaceholderScanResult(
  payload: {
    surface: string;
    scannedCount: number;
    fatalCount: number;
    nonfatalCount: number;
    repairedCount: number;
    bodyLen: number;
    partyCount: number;
    ok: boolean;
  } & Partial<PlaceholderPartyResolution>,
): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[placeholder-scan-result]", payload);
}

export function logPlaceholderRejectDetail(
  decisions: PlaceholderTokenDecision[],
  surface: string,
  partyResolution?: PlaceholderPartyResolution,
): void {
  if (import.meta.env.MODE === "test") return;
  const fatal = decisions.filter((d) => d.fatal);
  if (!fatal.length) return;
  for (const d of fatal.slice(0, 12)) {
    // eslint-disable-next-line no-console
    console.warn("[placeholder-fatal-detail]", {
      surface,
      token: d.token,
      normalizedToken: d.normalizedToken ?? normalizePlaceholderToken(d.token),
      category: d.category,
      fatal: d.fatal,
      lineKind: d.lineKind,
      sectionKind: d.sectionKind,
      nearestHeading: d.nearestHeading ?? "",
      isTailSection: d.isTailSection ?? false,
      isExecutionContext: d.isExecutionContext ?? false,
      snippet: d.contextSnippet.slice(0, 120),
      partyAnchorsFound: partyResolution?.anchorsFound ?? null,
      partyCount: partyResolution?.partyCount ?? null,
    });
  }
  // eslint-disable-next-line no-console
  console.warn("[placeholder-reject-detail]", {
    surface,
    partyAnchorsFound: partyResolution?.anchorsFound ?? null,
    partyCount: partyResolution?.partyCount ?? null,
    partySources: partyResolution?.sources ?? null,
    fatalCount: fatal.length,
  });
}

export function logPaidProPlaceholderGateDecision(payload: {
  surface: string;
  docLen: number;
  scannedCount: number;
  fatalCount: number;
  nonfatalCount: number;
  repairedCount: number;
  partyAnchorsFound: boolean;
  partyCount: number;
  accepted: boolean;
  signatureOnlyDemotion?: boolean;
  demotedSignatureContactCount?: number;
  fatalTokens?: string[];
  executionContextFound?: boolean;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-placeholder-gate-decision]", payload);
}

export type PlaceholderSafetyContext = {
  intakeRaw?: string | null;
  partyNames?: readonly (string | null | undefined)[] | null;
  agreementFamily?: string | null;
  surface: string;
  /** When true, do not run fatal scan (generation / hydrate still in flight). */
  isGenerating?: boolean;
  /** When false, backend draft payload is not ready — skip fatal preview block. */
  hasDraftPayload?: boolean;
  /** Authoritative corpus source; `none` / `blocked_short_preview` skip fatal scan. */
  authoritativeSource?: string | null;
  /** Free starter create flow phase for transient / loading release. */
  createFlowPhase?: string;
  /** Free starter display phase for transient / loading release. */
  displayPhase?: string;
};

export type PlaceholderSafetyOutcome = {
  ok: boolean;
  text: string;
  repaired: string[];
  remaining: string[];
  remainingFatal: string[];
  remainingDetail: PlaceholderTokenDecision[];
  partyResolution: PlaceholderPartyResolution;
};

const ALLOWED_BRACKET = /^\[not yet specified\]$/i;

const BRACKET_INTERNAL_SLOT_RE = /\[(?:[A-Z][A-Z0-9]*_\d+|[A-Z]{2,}_[A-Z0-9_]+)\]/g;

/** Signature / contact line fields, including numbered slots: [EMAIL_1], [SIGNER_EMAIL_2], [NAME_3]. */
const SIGNATURE_LINE_BRACKET_RE =
  /\[\s*(?:(?:SIGNER|PARTY|CONTACT)_)?(?:NAME|TITLE|DATE|EMAIL|SIGNATURE|INITIALS?|PRINTED[\s_]*NAME|COMPANY[\s_]*NAME|LEGAL[\s_]*NAME|AUTHORIZED[\s_]*SIGNATORY|SIGNATORY(?:[\s_]*NAME)?|ADDRESS|PHONE|FAX|CITY|STATE|ZIP(?:[\s_]*CODE)?|POSTAL(?:[\s_]*CODE)?|WITNESS(?:[\s_]*NAME)?)(?:_\d+)?\s*\]/gi;

/** Numbered signer/contact bracket tokens — requires _N on bare fields; prefixed PARTY_EMAIL optional. */
const NUMBERED_SIGNATURE_CONTACT_BRACKET_RE =
  /\[\s*(?:(?:SIGNER|PARTY|CONTACT)_(?:EMAIL|NAME|TITLE|DATE|SIGNATURE|INITIALS?|ADDRESS|PHONE)(?:_\d+)?|(?:EMAIL|NAME|TITLE|DATE|SIGNATURE|INITIALS?|ADDRESS|PHONE)_\d+)\s*\]/gi;

/** Party/signer metadata stubs — [PARTY NAME], [PARTY_NAME], [CLIENT NAME], [CLIENT_NAME]. */
const SIGNATURE_PARTY_LABEL_BRACKET_RE =
  /\[\s*(?:(?:PARTY|CLIENT|COMPANY|COUNTERPARTY|ORGANIZATION|ORG)(?:[\s_]*NAME)?(?:_\d+)?|AUTHORIZED[\s_]*SIGNATORY|SIGNATORY(?:[\s_]*NAME)?)\s*\]/gi;

/** Normalized allowlist keys (uppercase, spaces → underscores). */
const SIGNATURE_TOKEN_ALLOWLIST = new Set([
  "NAME",
  "TITLE",
  "DATE",
  "EMAIL",
  "SIGNATURE",
  "INITIAL",
  "INITIALS",
  "PARTY_NAME",
  "CLIENT_NAME",
  "COMPANY_NAME",
  "COUNTERPARTY_NAME",
  "ORG_NAME",
  "ORGANIZATION_NAME",
  "AUTHORIZED_SIGNATORY",
  "SIGNATORY_NAME",
  "SIGNATORY",
  "DATE_OF_AGREEMENT",
  "EFFECTIVE_DATE",
  "AGREEMENT_DATE",
  "LEGAL_NAME",
  "PRINTED_NAME",
  "PRINT_NAME",
  "ADDRESS",
  "PHONE",
  "WITNESS_NAME",
  "WITNESS",
]);

const GENERIC_UPPER_BRACKET_RE = /\[[A-Z][A-Z0-9\s/&.'_\-]{1,55}\]/g;

/** Semantic party placeholders that must not survive into authoritative premium apply. */
const SEMANTIC_PARTY_PLACEHOLDER_PATTERNS: readonly { re: RegExp; label: string }[] = [
  { re: /\bparty[_\s-]?a\b/gi, label: "party_a" },
  { re: /\bparty[_\s-]?b\b/gi, label: "party_b" },
  { re: /\[your\s+company\s+name\]/gi, label: "[Your Company Name]" },
  { re: /\[service\s+provider\s+name\]/gi, label: "[Service Provider Name]" },
  { re: /\[client\s+legal\s+name\]/gi, label: "[Client Legal Name]" },
  { re: /\[counterparty\s+name\]/gi, label: "[Counterparty Name]" },
  { re: /\{\{\s*party[_\s-]?a\s*\}\}/gi, label: "{{party_a}}" },
  { re: /\{\{\s*party[_\s-]?b\s*\}\}/gi, label: "{{party_b}}" },
];

export function collectSemanticPartyPlaceholderFragments(text: string): string[] {
  const prepared = prepareAgreementTextForPlaceholderScan(text);
  const found: string[] = [];
  const seen = new Set<string>();
  for (const { re, label } of SEMANTIC_PARTY_PLACEHOLDER_PATTERNS) {
    re.lastIndex = 0;
    if (!re.test(prepared)) continue;
    re.lastIndex = 0;
    if (!seen.has(label)) {
      seen.add(label);
      found.push(label);
    }
  }
  return found;
}

const INSERT_BRACKET_RE = /\[[^\]\n]{0,200}\b(?:insert|describe|tbd|to\s+be\s+(?:determined|completed|filled))[^\]\n]{0,200}\]/gi;
const MUSTACHE_RE = /\{\{[\s\S]*?\}\}/g;
const SINGLE_BRACE_TOKEN_RE = /\{[a-z][a-z0-9_]*\}/gi;
const ANGLE_INSERT_RE = /<\s*insert\b[^>]{0,200}>/gi;
const TRIPLE_UNDERSCORE_RE = /___[A-Z][A-Z0-9_]*___/g;
const DRAFTING_STUB_PHRASE_RE =
  /\b(?:fill\s+in\s+later|to\s+be\s+completed|insert\s+here|fill\s+in\s+with\s+counsel)\b/gi;
const TO_BE_COMPLETED_EXACT_RE = /\bto\s+be\s+completed\b/gi;
const CONTEXTUAL_DRAFTING_STUB_POSITIVE_RE =
  /\b(?:schedule\s+a|statement\s+of\s+work|\bsow\b|milestones?|deliverables?|implementation\s+schedule|workstreams?)\b/i;
const CONTEXTUAL_DRAFTING_STUB_NEGATIVE_RE =
  /\b(?:notice\s+address|address\s+for\s+notice|email\s+for\s+notice|party\s+notice\s+details|effective\s+date|recitals?|in\s+witness\s+whereof)\b/i;
const CONTEXTUAL_DRAFTING_STUB_CONTEXT_RADIUS = 160;
const CONTEXTUAL_DRAFTING_STUB_REPLACEMENT = "as confirmed by the Parties in writing";
const SCHEDULE_STUB_RE = /\bschedule\s+a\b[^.\n]{0,120}\b(?:tbd|placeholder|to\s+be\s+completed|\[)\b/gi;
const ANGLE_LEGAL_STUB_RE =
  /<\s*[^>\n]{0,200}(?:customer|client|legal\s*name|party\s*name|tbd|placeholder|to\s+be\s+(?:completed|filled)|insert\s+here)[^>\n]{0,200}\s*>/gi;

const SIGNATURE_REGION_MARKERS =
  /\b(in witness whereof|signatures?|execution|counterparts?|authorized signatory|electronic signature|signed by)\b/gi;

const EXECUTION_CONTEXT_RE =
  /\b(in witness whereof|signatures?|execution|counterparts?|signed|signatory|authorized representative|electronic signature|witness|counterpart)\b/i;

/** Signature block field labels at line start (avoids operative prose like "Notice email:"). */
const EXECUTION_LINE_LABEL_RE = /^\s*(?:by|name|title|date|email|initials?|witness|signature)\s*:/i;

const OPERATIVE_SECTION_HEADING_RE =
  /\b(?:payment|fees?|compensation|scope|services|deliverables|confidential|indemnif|governing law|termination|liability|limitation of liability|intellectual property|notices?|dispute|warranty|representations)\b/i;

const SOFT_SIGNATURE_LABEL_RE =
  /^(?:(?:SIGNER|PARTY|CONTACT)_)?(?:NAME|TITLE|DATE|EMAIL|SIGNATURE|INITIALS?|ADDRESS|PHONE|FAX|CITY|STATE|ZIP(?:[\s_]*CODE)?|POSTAL(?:[\s_]*CODE)?|PRINTED[\s_]*NAME|PRINT[\s_]*NAME|COMPANY[\s_]*NAME|LEGAL[\s_]*NAME|AUTHORIZED[\s_]*SIGNATORY|SIGNATORY(?:[\s_]*NAME)?|SIGNATORY|PARTY[\s_]*NAME|CLIENT[\s_]*NAME|COUNTERPARTY(?:[\s_]*NAME)?|WITNESS(?:[\s_]*NAME)?|WITNESS)(?:_\d+)?$/i;

/** Normalized keys for numbered signature/contact fields (EMAIL_1, SIGNER_EMAIL_2, …). */
const NUMBERED_SIGNATURE_CONTACT_NORMALIZED_RE =
  /^(?:(?:SIGNER|PARTY|CONTACT)_(?:EMAIL|NAME|TITLE|SIGNATURE|DATE|INITIALS?|ADDRESS|PHONE)(?:_\d+)?|(?:EMAIL|NAME|TITLE|SIGNATURE|DATE|INITIALS?|ADDRESS|PHONE)_\d+)$/i;

const SOFT_PREAMBLE_LABEL_RE = /^(?:DATE[\s_]*OF[\s_]*AGREEMENT|EFFECTIVE[\s_]*DATE|AGREEMENT[\s_]*DATE)$/i;

const TAIL_EXECUTION_WINDOW_RE =
  /\b(?:in witness whereof|signatures?|execution|counterparts?|electronic signatures?|signed|signatory|authorized signatory|authorized representative|by\s*:|name\s*:|title\s*:|date\s*:|email\s*:|initials?\s*:)/i;

const CONTACT_SECTION_CONTEXT_RE =
  /\b(?:key contacts?|contact information|signatory information|authorized representatives?|notice contacts?|signature information)\b/i;

/** Operative misuse of a name-style token (not CLIENT LEGAL NAME — that stays fatal via separate rule). */
const OPERATIVE_CLIENT_LEGAL_NAME_RE = /\bCLIENT[\s_]*LEGAL[\s_]*NAME\b/i;

/** Strip minimal HTML to plain text for placeholder scanning (preserves line breaks). */
export function stripHtmlAgreementScanText(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>\s*/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]{2,}/g, " ");
}

function looksLikeHtmlDocument(text: string): boolean {
  return /<(html|body|div|p|span|br|h[1-6]|table|ul|ol|li|section|article)\b/i.test(text);
}

export function prepareAgreementTextForPlaceholderScan(text: string): string {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  if (looksLikeHtmlDocument(raw)) {
    return stripHtmlAgreementScanText(raw);
  }
  return raw.replace(/\u00a0/g, " ");
}

function normPartyNames(partyNames?: readonly (string | null | undefined)[] | null): string[] {
  return (partyNames || [])
    .map((n) => String(n ?? "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length > 0);
}

function pushUniqueParty(out: string[], seen: Set<string>, name: string) {
  const t = name.replace(/\s+/g, " ").trim();
  if (t.length < 2) return;
  const low = t.toLowerCase();
  if (seen.has(low)) return;
  seen.add(low);
  out.push(t);
}

function extractPartyNamesFromCorpusBetween(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const n of extractBetweenPartyNameList(text)) pushUniqueParty(names, seen, n);
  const amongRe =
    /\b(?:by and among|entered into by and among|among)\s+([^\n.]{12,900})/gi;
  for (const m of text.matchAll(amongRe)) {
    const clause = m[1] || "";
    const split = clause.split(/\s*,\s*|\s+and\s+/i);
    for (const part of split) pushUniqueParty(names, seen, part);
  }
  return names;
}

/** Unified party resolver — same sources for preview + reject paths. */
export function resolvePlaceholderPartyNames(
  ctx: Pick<PlaceholderSafetyContext, "intakeRaw" | "partyNames">,
  corpusText?: string | null,
): string[] {
  return resolvePlaceholderPartyNamesWithMeta(ctx, corpusText).names;
}

export function resolvePlaceholderPartyNamesWithMeta(
  ctx: Pick<PlaceholderSafetyContext, "intakeRaw" | "partyNames">,
  corpusText?: string | null,
): PlaceholderPartyResolution {
  const merged = normPartyNames(ctx.partyNames);
  const fromIntake = extractAgreementEntityCandidates(String(ctx.intakeRaw || ""));
  const fromBetween = corpusText ? extractPartyNamesFromCorpusBetween(corpusText) : [];
  const names: string[] = [];
  const seen = new Set<string>();
  let mergedParties = 0;
  let intakeExtraction = 0;
  let corpusBetween = 0;
  for (const n of merged) {
    const before = seen.size;
    pushUniqueParty(names, seen, n);
    if (seen.size > before) mergedParties += 1;
  }
  for (const n of fromIntake) {
    const before = seen.size;
    pushUniqueParty(names, seen, n);
    if (seen.size > before) intakeExtraction += 1;
  }
  for (const n of fromBetween) {
    const before = seen.size;
    pushUniqueParty(names, seen, n);
    if (seen.size > before) corpusBetween += 1;
  }
  const corpusAmong = 0;
  const anchorsFound = corpusHasResolvedPartyAnchors(corpusText || "", names, ctx.intakeRaw);
  return {
    names,
    partyCount: names.length,
    anchorsFound,
    sources: { mergedParties, intakeExtraction, corpusBetween, corpusAmong },
  };
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
  if (n >= 2) return n;
  n = Math.max(n, extractPartyNamesFromCorpusBetween(t).filter((p) => t.includes(p)).length);
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

export function isInSignatureRegion(text: string, index: number): boolean {
  const head = (text || "").slice(0, Math.max(0, index));
  let lastMarker = -1;
  for (const m of head.matchAll(SIGNATURE_REGION_MARKERS)) {
    if (m.index != null) lastMarker = Math.max(lastMarker, m.index);
  }
  if (lastMarker < 0) {
    const witness = head.search(/\bIN WITNESS\b/i);
    if (witness >= 0) lastMarker = witness;
  }
  if (lastMarker < 0) {
    const sigHeading = head.search(/\bSIGNATURES?\b/i);
    if (sigHeading >= 0 && (text.length - sigHeading) < 15_000) lastMarker = sigHeading;
  }
  if (lastMarker < 0) return false;
  if (index < lastMarker) return false;
  // Placeholders must sit within a reasonable window after the witness/signature heading
  // (paid bodies may append long operative padding after the signature block).
  return index - lastMarker <= 12_000;
}

function bracketInner(token: string): string {
  return token.replace(/^\[|\]$/g, "").replace(/_/g, " ").trim();
}

/** Normalize bracket token for allowlist matching: trim, collapse space/underscore, uppercase. */
export function normalizePlaceholderToken(token: string): string {
  return bracketInner(token).replace(/[\s./-]+/g, "_").replace(/_+/g, "_").toUpperCase();
}

/** True when normalized key is a numbered signature/contact field (not PARTY_1 / ORG_2 party slots). */
export function isNumberedSignatureContactNormalized(normalized: string): boolean {
  const n = (normalized || "").toUpperCase();
  if (/^(?:PARTY|ORG|CASE_ID)_\d+$/i.test(n)) return false;
  if (/^CLIENT(?:_LEGAL)?_NAME$/i.test(n)) return false;
  return NUMBERED_SIGNATURE_CONTACT_NORMALIZED_RE.test(n);
}

export function isNumberedSignatureContactToken(token: string): boolean {
  if (!token.startsWith("[") || !token.endsWith("]")) return false;
  return isNumberedSignatureContactNormalized(normalizePlaceholderToken(token));
}

/** 1-based slot from [EMAIL_3] / [SIGNER_EMAIL_2]; null when unnumbered. */
export function parseSignatureContactSlot(token: string): number | null {
  const n = normalizePlaceholderToken(token);
  const m = /_(\d+)$/.exec(n);
  if (!m) return null;
  const slot = parseInt(m[1], 10);
  return Number.isFinite(slot) && slot > 0 ? slot : null;
}

function resolveIntakeEmailForSlot(intakeRaw: string | null | undefined, slot: number | null): string | null {
  return resolveIntakeEmailForContactSlot(intakeRaw, slot);
}

export function isAllowlistedSignatureToken(token: string): boolean {
  const n = normalizePlaceholderToken(token);
  if (SIGNATURE_TOKEN_ALLOWLIST.has(n)) return true;
  if (isNumberedSignatureContactNormalized(n)) return true;
  const spaced = bracketInner(token).replace(/\s+/g, " ").toUpperCase();
  return SIGNATURE_TOKEN_ALLOWLIST.has(spaced.replace(/ /g, "_"));
}

/** True when every fatal token is a known signature/execution field label. */
export function isSignatureOnlyFatalToken(token: string): boolean {
  if (!token.startsWith("[") || !token.endsWith("]")) return false;
  const inner = bracketInner(token);
  if (/^CLIENT[\s_]*LEGAL[\s_]*NAME$/i.test(inner)) return false;
  if (/^CLIENT[\s_]*NAME$/i.test(inner)) return false;
  if (isNumberedSignatureContactToken(token)) return true;
  if (isAllowlistedSignatureToken(token)) return true;
  if (isSignatureLineBracketToken(token)) return true;
  return isSignatureFieldLabel(inner) || SOFT_PREAMBLE_LABEL_RE.test(inner.replace(/_/g, " "));
}

function isSignatureOrContactContext(text: string, index: number): boolean {
  const window = text.slice(Math.max(0, index - 700), Math.min(text.length, index + 500));
  return CONTACT_SECTION_CONTEXT_RE.test(window);
}

export function isOperativeSignatureContactMisuse(token: string, text: string, index: number): boolean {
  if (!isNumberedSignatureContactToken(token)) return false;
  const n = normalizePlaceholderToken(token);
  if (!/^(?:(?:SIGNER|PARTY|CONTACT)_EMAIL(?:_\d+)?|EMAIL_\d+)$/i.test(n)) return false;
  if (isSignatureOrContactContext(text, index)) return false;
  if (isTailSignatureSection(text, index)) return false;
  if (isExecutionSignatureContext(text, index) && isInSignatureRegion(text, index)) {
    return false;
  }
  if (isNearOperativeSectionHeading(text, index)) return true;
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).toLowerCase();
  if (/notice\s+email|payment[^.\n]{0,40}email|email[^.\n]{0,24}correspondence/i.test(line)) {
    return true;
  }
  return false;
}

/** Last ~25% of long documents with execution/signature markers nearby. */
export function isTailSignatureSection(text: string, index: number): boolean {
  const len = (text || "").length;
  if (len < 6_000) return false;
  const tailStart = Math.floor(len * 0.75);
  if (index < tailStart) return false;
  const window = text.slice(Math.max(tailStart - 300, index - 500), Math.min(len, index + 500));
  return TAIL_EXECUTION_WINDOW_RE.test(window);
}

/**
 * Paid Pro safety net: if a long corpus only has signature-allowlist fatals and anchors exist, accept.
 */
export function demotePaidProSignatureOnlyFatals(
  decisions: PlaceholderTokenDecision[],
  bodyLen: number,
  partyResolution: PlaceholderPartyResolution,
): { decisions: PlaceholderTokenDecision[]; demoted: boolean; demotedCount: number } {
  if (bodyLen < PAID_PRO_SIGNATURE_ACCEPT_MIN_BODY_LEN) {
    return { decisions, demoted: false, demotedCount: 0 };
  }
  const fatals = decisions.filter((d) => d.fatal);
  if (fatals.length === 0 || fatals.length > 24) {
    return { decisions, demoted: false, demotedCount: 0 };
  }
  if (!fatals.every((d) => isSignatureOnlyFatalToken(d.token))) {
    return { decisions, demoted: false, demotedCount: 0 };
  }
  if (!partyResolution.anchorsFound) {
    return { decisions, demoted: false, demotedCount: 0 };
  }
  let demotedCount = 0;
  const next: PlaceholderTokenDecision[] = decisions.map((d) => {
    if (!d.fatal || !isSignatureOnlyFatalToken(d.token)) return d;
    demotedCount += 1;
    return {
      ...d,
      fatal: false,
      category: "signature_line_stub" as const,
      sectionKind: "signature" as const,
      lineKind: "signature" as const,
    };
  });
  return { decisions: next, demoted: demotedCount > 0, demotedCount };
}

function contextSnippet(text: string, index: number, radius = 60): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function nearestSectionHeading(text: string, index: number): string {
  const head = text.slice(0, Math.max(0, index));
  const lines = head.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length < 3) continue;
    if (/^(?:\d+[\.)]\s+)?[A-Z][A-Z0-9\s/&\-]{2,60}$/.test(line)) return line.slice(0, 80);
    if (/^(?:ARTICLE|SECTION|SCHEDULE)\s+[IVX\d]+/i.test(line)) return line.slice(0, 80);
  }
  return "";
}

function lineKindForIndex(text: string, index: number): PlaceholderTokenDecision["lineKind"] {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  if (EXECUTION_LINE_LABEL_RE.test(line)) return "signature";
  if (isInSignatureRegion(text, index)) return "signature";
  if (index < 2_800) return "preamble";
  return "operative";
}

function sectionKindForIndex(text: string, index: number): PlaceholderTokenDecision["sectionKind"] {
  if (isInSignatureRegion(text, index) || isExecutionSignatureContext(text, index)) {
    return "signature";
  }
  return "operative";
}

/** Execution/signature block context — does not require party anchors. */
export function isExecutionSignatureContext(text: string, index: number): boolean {
  const len = (text || "").length;
  if (index < len * 0.5) {
    return isInSignatureRegion(text, index);
  }
  if (isInSignatureRegion(text, index)) return true;
  if (isTailSignatureSection(text, index)) return true;
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  if (EXECUTION_LINE_LABEL_RE.test(line)) return true;
  const window = text.slice(Math.max(0, index - 800), Math.min(text.length, index + 400));
  if (EXECUTION_CONTEXT_RE.test(window)) return true;
  const heading = nearestSectionHeading(text, index);
  if (heading && /\b(SIGNATURE|EXECUTION|WITNESS|COUNTERPART)\b/i.test(heading)) return true;
  const tailStart = Math.floor(text.length * 0.72);
  if (index >= tailStart && TAIL_EXECUTION_WINDOW_RE.test(window)) return true;
  return false;
}

function isNearOperativeSectionHeading(text: string, index: number): boolean {
  const heading = nearestSectionHeading(text, index);
  if (!heading) return false;
  return OPERATIVE_SECTION_HEADING_RE.test(heading);
}

function isSignatureFieldLabel(inner: string): boolean {
  const n = inner.replace(/_/g, " ").trim();
  return SOFT_SIGNATURE_LABEL_RE.test(n) || SOFT_PREAMBLE_LABEL_RE.test(n);
}

export function isSignatureLineBracketToken(token: string): boolean {
  SIGNATURE_LINE_BRACKET_RE.lastIndex = 0;
  if (SIGNATURE_LINE_BRACKET_RE.test(token)) return true;
  SIGNATURE_PARTY_LABEL_BRACKET_RE.lastIndex = 0;
  if (SIGNATURE_PARTY_LABEL_BRACKET_RE.test(token)) return true;
  const inner = bracketInner(token);
  return isSignatureFieldLabel(inner);
}

function isInternalPartySlotToken(token: string): boolean {
  return /\b(?:PARTY|ORG)_\d+\b/i.test(token);
}

function isOperativeMaterialPlaceholder(token: string, text: string, index: number): boolean {
  const inner = bracketInner(token);
  const normalized = normalizePlaceholderToken(token);
  if (OPERATIVE_CLIENT_LEGAL_NAME_RE.test(normalized) || OPERATIVE_CLIENT_LEGAL_NAME_RE.test(inner)) {
    return true;
  }
  if (INSERT_BRACKET_RE.test(token)) return true;
  if (MUSTACHE_RE.test(token) || SINGLE_BRACE_TOKEN_RE.test(token)) return true;
  if (ANGLE_LEGAL_STUB_RE.test(token) || ANGLE_INSERT_RE.test(token)) return true;
  if (isInternalPartySlotToken(token) && !isExecutionSignatureContext(text, index)) return true;
  if (/^CLIENT[\s_]*NAME$/i.test(inner) && index < text.length * 0.5 && !isExecutionSignatureContext(text, index)) {
    return true;
  }
  if (
    /\b(?:CLIENT|COMPANY|COUNTERPARTY)[\s_]*NAME\b/i.test(inner) &&
    !isExecutionSignatureContext(text, index) &&
    isNearOperativeSectionHeading(text, index)
  ) {
    return true;
  }
  if (/^EFFECTIVE[\s_]*DATE$/i.test(inner) && isNearOperativeSectionHeading(text, index)) return true;
  if (/\b(?:INSERT|DESCRIBE)\b/i.test(inner)) return true;
  if (isAllowlistedSignatureToken(token) && isNearOperativeSectionHeading(text, index)) {
    return true;
  }
  if (isOperativeSignatureContactMisuse(token, text, index)) return true;
  return false;
}

function decisionBase(
  token: string,
  text: string,
  index: number,
  inExec: boolean,
  isTail: boolean,
): Pick<
  PlaceholderTokenDecision,
  "token" | "contextSnippet" | "lineKind" | "sectionKind" | "nearestHeading" | "normalizedToken" | "isTailSection" | "isExecutionContext"
> {
  return {
    token,
    normalizedToken: normalizePlaceholderToken(token),
    contextSnippet: contextSnippet(text, index),
    lineKind: lineKindForIndex(text, index),
    sectionKind: sectionKindForIndex(text, index),
    nearestHeading: nearestSectionHeading(text, index),
    isTailSection: isTail,
    isExecutionContext: inExec,
  };
}

export function classifyTemplateFragment(
  token: string,
  text: string,
  index: number,
  opts?: { partyNames?: string[]; intakeRaw?: string | null },
): PlaceholderTokenDecision {
  const partyNames = opts?.partyNames ?? [];
  const intakeRaw = opts?.intakeRaw ?? null;
  const inExec = isExecutionSignatureContext(text, index);
  const isTail = isTailSignatureSection(text, index);
  const anchorsOk = corpusHasResolvedPartyAnchors(text, partyNames, intakeRaw);
  const base = decisionBase(token, text, index, inExec, isTail);

  if (isNumberedSignatureContactToken(token)) {
    if (isOperativeSignatureContactMisuse(token, text, index)) {
      return { ...base, category: "internal_slot", fatal: true };
    }
    if (inExec || isTail) {
      return { ...base, category: "signature_line_stub", fatal: false };
    }
    const tailStart = Math.floor(text.length * 0.75);
    const tailMinLen =
      text.length >= PAID_PRO_SIGNATURE_ACCEPT_MIN_BODY_LEN
        ? PAID_PRO_SIGNATURE_ACCEPT_MIN_BODY_LEN
        : 6_000;
    if (text.length >= tailMinLen && index >= tailStart) {
      return { ...base, category: "signature_line_stub", fatal: false };
    }
    return { ...base, category: "internal_slot", fatal: true };
  }

  if (isAllowlistedSignatureToken(token)) {
    const innerLabel = bracketInner(token);
    if (
      /^CLIENT[\s_]*NAME$/i.test(innerLabel) &&
      !inExec &&
      !isTail &&
      (index < text.length * 0.5 || isNearOperativeSectionHeading(text, index))
    ) {
      return { ...base, category: "internal_slot", fatal: true };
    }
    if (isOperativeMaterialPlaceholder(token, text, index) && !inExec && !isTail) {
      return { ...base, category: "internal_slot", fatal: true };
    }
    if (inExec || isTail) {
      return { ...base, category: "signature_line_stub", fatal: false };
    }
    if (SOFT_PREAMBLE_LABEL_RE.test(bracketInner(token).replace(/_/g, " ")) && index < 5_000) {
      return { ...base, category: "soft_field_label", fatal: false };
    }
    const tailStart = Math.floor(text.length * 0.75);
    const tailMinLen =
      text.length >= PAID_PRO_SIGNATURE_ACCEPT_MIN_BODY_LEN
        ? PAID_PRO_SIGNATURE_ACCEPT_MIN_BODY_LEN
        : 6_000;
    if (text.length >= tailMinLen && index >= tailStart) {
      return { ...base, category: "signature_line_stub", fatal: false };
    }
  }

  if (isOperativeMaterialPlaceholder(token, text, index) && !inExec && !isTail) {
    if (INSERT_BRACKET_RE.test(token)) {
      return { ...base, category: "insert_stub", fatal: true };
    }
    if (MUSTACHE_RE.test(token) || SINGLE_BRACE_TOKEN_RE.test(token)) {
      return { ...base, category: "mustache", fatal: true };
    }
    if (ANGLE_LEGAL_STUB_RE.test(token) || ANGLE_INSERT_RE.test(token)) {
      return { ...base, category: "angle_stub", fatal: true };
    }
    return { ...base, category: "internal_slot", fatal: true };
  }

  if ((inExec || isTail) && (isSignatureLineBracketToken(token) || isSignatureFieldLabel(bracketInner(token)))) {
    return { ...base, category: "signature_line_stub", fatal: false };
  }

  if (BRACKET_INTERNAL_SLOT_RE.test(token)) {
    BRACKET_INTERNAL_SLOT_RE.lastIndex = 0;
    if (isNumberedSignatureContactToken(token)) {
      if (isOperativeSignatureContactMisuse(token, text, index)) {
        return { ...base, category: "internal_slot", fatal: true };
      }
      if (inExec || isTail || index >= Math.floor(text.length * 0.75)) {
        return { ...base, category: "signature_line_stub", fatal: false };
      }
      return { ...base, category: "internal_slot", fatal: true };
    }
    const partySlot = isInternalPartySlotToken(token);
    const nameStyleSlot = /\b(?:PARTY|CLIENT|COMPANY|COUNTERPARTY|ORG)(?:_NAME|_LEGAL_NAME)\b/i.test(token);
    if (inExec && (partySlot || nameStyleSlot || isSignatureFieldLabel(bracketInner(token)))) {
      return { ...base, category: "signature_region_slot", fatal: false };
    }
    if (
      isAllowlistedSignatureToken(token) &&
      (inExec || isTail || index >= Math.floor(text.length * 0.75))
    ) {
      return { ...base, category: "signature_region_slot", fatal: false };
    }
    if (anchorsOk && (inExec || base.lineKind === "signature") && (partySlot || nameStyleSlot)) {
      return { ...base, category: "signature_region_slot", fatal: false };
    }
    return { ...base, category: "internal_slot", fatal: true };
  }

  if (INSERT_BRACKET_RE.test(token)) {
    INSERT_BRACKET_RE.lastIndex = 0;
    return { ...base, category: "insert_stub", fatal: !inExec };
  }
  if (MUSTACHE_RE.test(token) || SINGLE_BRACE_TOKEN_RE.test(token)) {
    MUSTACHE_RE.lastIndex = 0;
    SINGLE_BRACE_TOKEN_RE.lastIndex = 0;
    return { ...base, category: "mustache", fatal: true };
  }
  if (DRAFTING_STUB_PHRASE_RE.test(token)) {
    DRAFTING_STUB_PHRASE_RE.lastIndex = 0;
    return { ...base, category: "drafting_phrase", fatal: !inExec };
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

  if (token.startsWith("[") && token.endsWith("]")) {
    const inner = bracketInner(token);
    if (isHarmlessEntityMetadataBracketToken(token)) {
      return { ...base, category: "soft_field_label", fatal: false };
    }
    if (inExec && isSignatureFieldLabel(inner)) {
      return { ...base, category: "soft_field_label", fatal: false };
    }
    if (SOFT_PREAMBLE_LABEL_RE.test(inner.replace(/_/g, " ")) && index < 4_000) {
      return { ...base, category: "soft_field_label", fatal: false };
    }
  }

  return { ...base, category: "other", fatal: !inExec };
}

function repairBracketInExecutionContext(
  text: string,
  re: RegExp,
  repairKey: string,
): { text: string; repaired: string[] } {
  const repaired: string[] = [];
  const out = text.replace(re, (match, offset) => {
    const idx = typeof offset === "number" ? offset : text.indexOf(match);
    if (idx < 0) return match;
    const inner = bracketInner(match);
    if (/^CLIENT[\s_]*NAME$/i.test(inner) && idx < text.length * 0.5) {
      return match;
    }
    if (isNumberedSignatureContactToken(match) && isOperativeSignatureContactMisuse(match, text, idx)) {
      return match;
    }
    if (!isExecutionSignatureContext(text, idx) && !SOFT_PREAMBLE_LABEL_RE.test(inner)) {
      return match;
    }
    repaired.push(`${repairKey}:${match.trim()}`);
    return "_________________________";
  });
  return { text: out, repaired };
}

function repairNumberedSignatureContactPlaceholders(
  text: string,
  intakeRaw: string | null | undefined,
): { text: string; repaired: string[] } {
  const repaired: string[] = [];
  const out = text.replace(NUMBERED_SIGNATURE_CONTACT_BRACKET_RE, (match, offset) => {
    const idx = typeof offset === "number" ? offset : text.indexOf(match);
    if (idx < 0) return match;
    if (isOperativeSignatureContactMisuse(match, text, idx)) return match;
    if (!isExecutionSignatureContext(text, idx) && !isTailSignatureSection(text, idx)) {
      return match;
    }
    const n = normalizePlaceholderToken(match);
    const slot = parseSignatureContactSlot(match);
    if (/^(?:(?:SIGNER|PARTY|CONTACT)_EMAIL(?:_\d+)?|EMAIL_\d+)$/i.test(n)) {
      const resolved = resolveIntakeEmailForSlot(intakeRaw, slot);
      if (resolved) {
        repaired.push(`sig_contact_email:${match.trim()}→${resolved}`);
        return resolved;
      }
    }
    repaired.push(`sig_contact:${match.trim()}`);
    return "_________________________";
  });
  return { text: out, repaired };
}

function repairSignatureLinePlaceholders(
  text: string,
  intakeRaw?: string | null,
): { text: string; repaired: string[] } {
  const numbered = repairNumberedSignatureContactPlaceholders(text, intakeRaw);
  const a = repairBracketInExecutionContext(numbered.text, SIGNATURE_LINE_BRACKET_RE, "sig_line");
  const b = repairBracketInExecutionContext(a.text, SIGNATURE_PARTY_LABEL_BRACKET_RE, "sig_party_label");
  return { text: b.text, repaired: [...numbered.repaired, ...a.repaired, ...b.repaired] };
}

function repairSoftFieldBracketPlaceholders(text: string): { text: string; repaired: string[] } {
  const repaired: string[] = [];
  const out = text.replace(GENERIC_UPPER_BRACKET_RE, (match, offset) => {
    const idx = typeof offset === "number" ? offset : text.indexOf(match);
    if (!isExecutionSignatureContext(text, idx) && !SOFT_PREAMBLE_LABEL_RE.test(bracketInner(match))) {
      return match;
    }
    if (!isSignatureFieldLabel(bracketInner(match)) && !SOFT_PREAMBLE_LABEL_RE.test(bracketInner(match))) {
      return match;
    }
    repaired.push(`soft_field:${match.trim()}`);
    return "_________________________";
  });
  return { text: out, repaired };
}

function isGenericTermsRemainToBeCompletedStub(text: string, matchIndex: number, matchLen: number): boolean {
  const start = Math.max(0, matchIndex - 96);
  const span = text.slice(start, matchIndex + matchLen);
  return /\b(?:terms|commercial\s+terms|additional\s+(?:commercial\s+)?terms)\s+remain\s+to\s+be\s+completed\b/i.test(
    span,
  );
}

function shouldRepairContextualToBeCompleted(text: string, matchIndex: number, matchLen: number): boolean {
  if (isGenericTermsRemainToBeCompletedStub(text, matchIndex, matchLen)) return false;
  if (isExecutionSignatureContext(text, matchIndex)) return false;
  const start = Math.max(0, matchIndex - CONTEXTUAL_DRAFTING_STUB_CONTEXT_RADIUS);
  const end = Math.min(text.length, matchIndex + matchLen + CONTEXTUAL_DRAFTING_STUB_CONTEXT_RADIUS);
  const window = text.slice(start, end);
  if (CONTEXTUAL_DRAFTING_STUB_NEGATIVE_RE.test(window)) return false;
  return CONTEXTUAL_DRAFTING_STUB_POSITIVE_RE.test(window);
}

/** Guarded Paid Pro repair for schedule/SOW/milestone "to be completed" stubs only. */
export function repairContextualDraftingStubPhrases(text: string): { text: string; repaired: string[] } {
  const src = String(text || "");
  const repaired: string[] = [];
  TO_BE_COMPLETED_EXACT_RE.lastIndex = 0;
  if (!TO_BE_COMPLETED_EXACT_RE.test(src)) {
    TO_BE_COMPLETED_EXACT_RE.lastIndex = 0;
    return { text: src, repaired };
  }
  TO_BE_COMPLETED_EXACT_RE.lastIndex = 0;
  const replacements: { index: number; length: number }[] = [];
  for (const m of src.matchAll(TO_BE_COMPLETED_EXACT_RE)) {
    if (m.index == null) continue;
    const original = m[0] || "";
    if (!original) continue;
    if (shouldRepairContextualToBeCompleted(src, m.index, original.length)) {
      replacements.push({ index: m.index, length: original.length });
    }
  }
  if (!replacements.length) return { text: src, repaired };
  let out = src;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { index, length } = replacements[i];
    out = out.slice(0, index) + CONTEXTUAL_DRAFTING_STUB_REPLACEMENT + out.slice(index + length);
    repaired.push(`drafting_stub:to be completed→${CONTEXTUAL_DRAFTING_STUB_REPLACEMENT}`);
  }
  return { text: out, repaired };
}

export function repairAgreementTemplatePlaceholders(
  text: string,
  ctx: Pick<PlaceholderSafetyContext, "intakeRaw" | "partyNames">,
): { text: string; repaired: string[] } {
  const surface = "placeholder_safety";
  return runCachedCorpusScan({
    surface,
    corpus: text,
    phase: "repair",
    scanType: "placeholder_scan",
    run: () => repairAgreementTemplatePlaceholdersUncached(text, ctx),
  });
}

function repairAgreementTemplatePlaceholdersUncached(
  text: string,
  ctx: Pick<PlaceholderSafetyContext, "intakeRaw" | "partyNames">,
): { text: string; repaired: string[] } {
  const prepared = prepareAgreementTextForPlaceholderScan(text);
  let out = prepared;
  const repaired: string[] = [];
  const beforeIdentityCount = countIdentityPlaceholders(prepared);
  logOrgPlaceholderOriginsFromText({
    text: prepared,
    sourceModule: "repairAgreementTemplatePlaceholders",
    canonicalPartyCount: normPartyNames(ctx.partyNames).length,
  });
  logDraftingStubOriginsFromText({ text: prepared, sourceModule: "repairAgreementTemplatePlaceholders" });
  const moneyRepair = repairMoneyCommaBracketPlaceholderCorruption(out);
  if (moneyRepair.repairs.length) {
    out = moneyRepair.text;
    repaired.push(...moneyRepair.repairs);
  }
  const entityNeutral = neutralizeHarmlessEntityMetadataPlaceholders(out);
  if (entityNeutral.repairs.length) {
    out = entityNeutral.text;
    repaired.push(...entityNeutral.repairs);
  }
  const resolution = resolvePlaceholderPartyNamesWithMeta(ctx, prepared);
  const names = resolution.names;
  const partyLine = [String(ctx.intakeRaw || ""), ...names].join("\n");

  if (/\[CASE_ID_\d+\]/i.test(out)) {
    out = out.replace(/\[\s*CASE_ID_\d+\s*\]/gi, "any Party");
    repaired.push("CASE_ID→any Party");
  }

  out = substitutePartyPlaceholdersInUserFacingText(out, partyLine, names.length ? names : null);

  const sigRepair = repairSignatureLinePlaceholders(out, ctx.intakeRaw);
  out = sigRepair.text;
  repaired.push(...sigRepair.repaired);

  const softRepair = repairSoftFieldBracketPlaceholders(out);
  out = softRepair.text;
  repaired.push(...softRepair.repaired);

  if (/\[\s*CLIENT\s*\]/gi.test(out)) {
    out = out.replace(/\[\s*CLIENT\s*\]/gi, "the receiving Party");
    repaired.push("[CLIENT]→the receiving Party");
  }
  if (/\[\s*PROVIDER\s*\]/gi.test(out)) {
    out = out.replace(/\[\s*PROVIDER\s*\]/gi, "the providing Party");
    repaired.push("[PROVIDER]→the providing Party");
  }

  const draftingStubRepair = repairContextualDraftingStubPhrases(out);
  if (draftingStubRepair.repaired.length) {
    out = draftingStubRepair.text;
    repaired.push(...draftingStubRepair.repaired);
  }

  const draftingStubs: string[] = [];
  DRAFTING_STUB_PHRASE_RE.lastIndex = 0;
  for (const m of out.matchAll(DRAFTING_STUB_PHRASE_RE)) {
    const phrase = (m[0] || "").trim().toLowerCase();
    if (phrase && !draftingStubs.includes(phrase)) draftingStubs.push(phrase);
  }
  const unresolved = [...listUnresolvedIdentityPlaceholderTokens(out), ...draftingStubs].slice(0, 24);
  logPaidProPlaceholderRepair({
    sourceModule: "repairAgreementTemplatePlaceholders",
    beforeCount: beforeIdentityCount,
    afterCount: countIdentityPlaceholders(out),
    unresolvedPlaceholders: unresolved,
    ...(draftingStubRepair.repaired.length
      ? { repairedDraftingStubPhrases: draftingStubRepair.repaired.slice(0, 16) }
      : {}),
  });

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
  scanRe(NUMBERED_SIGNATURE_CONTACT_BRACKET_RE);
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

export function collectForbiddenTemplateFragments(
  text: string,
  intakeRaw: string | null | undefined,
  opts?: { partyNames?: string[] },
): string[] {
  const prepared = prepareAgreementTextForPlaceholderScan(text);
  const partyNames = resolvePlaceholderPartyNames({ intakeRaw, partyNames: opts?.partyNames ?? null }, prepared);
  const decisions = scanTemplatePlaceholderMatches(prepared, intakeRaw).map(({ token, index }) =>
    classifyTemplateFragment(token, prepared, index, { partyNames, intakeRaw }),
  );
  const found: string[] = [];
  for (const d of decisions.filter((x) => x.fatal)) {
    if (!found.includes(d.token)) found.push(d.token);
  }
  for (const semantic of collectSemanticPartyPlaceholderFragments(prepared)) {
    if (!found.includes(semantic)) found.push(semantic);
  }
  return found.slice(0, 40);
}

export function analyzeTemplatePlaceholderFragments(
  text: string,
  ctx: Pick<PlaceholderSafetyContext, "intakeRaw" | "partyNames">,
): PlaceholderTokenDecision[] {
  const prepared = prepareAgreementTextForPlaceholderScan(text);
  const partyNames = resolvePlaceholderPartyNames(ctx, prepared);
  return scanTemplatePlaceholderMatches(prepared, ctx.intakeRaw).map(({ token, index }) =>
    classifyTemplateFragment(token, prepared, index, { partyNames, intakeRaw: ctx.intakeRaw }),
  );
}

/** Scan-only placeholder gate for starter/free surfaces — never mutates document text. */
export function inspectStarterUserVisibleAgreementPlainText(
  text: string,
  ctx: PlaceholderSafetyContext,
): PlaceholderSafetyOutcome {
  const intakeRaw = (ctx.intakeRaw ?? "").trim();
  const display = formatStarterPreviewForDisplay(stripCanonicalCommitMarker(text));
  const transient = transientGateInputFromPlaceholderContext(ctx, display);
  if (shouldSkipPlaceholderScanForTransientPreview(transient)) {
    logPlaceholderScanSkippedTransient({
      surface: ctx.surface,
      len: transient.len ?? display.length,
      isGenerating: ctx.isGenerating,
      hasDraftPayload: ctx.hasDraftPayload,
      authoritativeSource: ctx.authoritativeSource ?? null,
    });
    return {
      ok: true,
      text: display,
      repaired: [],
      remaining: [],
      remainingFatal: [],
      remainingDetail: [],
      partyResolution: resolvePlaceholderPartyNamesWithMeta({ ...ctx, intakeRaw }, display),
    };
  }
  const partyResolution = resolvePlaceholderPartyNamesWithMeta(
    { ...ctx, intakeRaw },
    display,
  );
  const scanCtx = { intakeRaw, partyNames: partyResolution.names };
  const remainingDetail = analyzeTemplatePlaceholderFragments(display, scanCtx);
  const remainingFatal = remainingDetail.filter((d) => d.fatal).map((d) => d.token);
  const remaining = [...new Set(remainingDetail.map((d) => d.token))].slice(0, 40);
  const ok = remainingFatal.length === 0;
  logPlaceholderScanResult({
    surface: ctx.surface,
    scannedCount: remainingDetail.length,
    fatalCount: remainingFatal.length,
    nonfatalCount: remainingDetail.length - remainingFatal.length,
    repairedCount: 0,
    bodyLen: display.length,
    partyCount: partyResolution.partyCount,
    ok,
    anchorsFound: partyResolution.anchorsFound,
    sources: partyResolution.sources,
  });
  return {
    ok,
    text: display,
    repaired: [],
    remaining,
    remainingFatal,
    remainingDetail,
    partyResolution,
  };
}

export function finalizeUserVisibleAgreementPlainText(
  text: string,
  ctx: PlaceholderSafetyContext,
): PlaceholderSafetyOutcome {
  const intakeRaw = (ctx.intakeRaw ?? "").trim();
  if (isStarterDocumentSurface({ surface: ctx.surface })) {
    return inspectStarterUserVisibleAgreementPlainText(text, ctx);
  }
  let prepared = prepareAgreementTextForPlaceholderScan(text);
  const partyResolution = resolvePlaceholderPartyNamesWithMeta(
    { ...ctx, intakeRaw },
    prepared,
  );
  if (isCanonicalCommittedText(prepared)) {
    prepared = stripCanonicalCommitMarker(prepared);
  } else if (
    ctx.surface === "premium_completion_pipeline" &&
    prepared.trim().length >= 1_500
  ) {
    // Accepted server_full_draft already ran applyAcceptedProCorpusSafeDisplay — avoid re-polish shrink.
  } else {
    const polish = applyPaidProRenderPolish(prepared, intakeRaw, partyResolution.names, {
      surface: ctx.surface,
      mode: ctx.surface.includes("reject") ? "validate_only" : "commit",
    });
    prepared = stripCanonicalCommitMarker(polish.text);
  }
  const scanCtx = { intakeRaw, partyNames: partyResolution.names };
  const { text: repairedText, repaired } = repairAgreementTemplatePlaceholders(prepared, scanCtx);
  const signatureFinal = normalizeSignatureBlockHeadings(
    repairedText,
    buildPartyEntries(partyResolution.names),
  );
  const postRepairText = signatureFinal.text;
  let remainingDetail = analyzeTemplatePlaceholderFragments(postRepairText, scanCtx);
  const demotion = demotePaidProSignatureOnlyFatals(
    remainingDetail,
    postRepairText.length,
    partyResolution,
  );
  remainingDetail = demotion.decisions;
  const remainingFatal = remainingDetail.filter((d) => d.fatal).map((d) => d.token);
  const remaining = [...new Set(remainingDetail.map((d) => d.token))].slice(0, 40);
  const ok = remainingFatal.length === 0;

  logPaidProPlaceholderGateDecision({
    surface: ctx.surface,
    docLen: postRepairText.length,
    scannedCount: remainingDetail.length,
    fatalCount: remainingFatal.length,
    nonfatalCount: remainingDetail.length - remainingFatal.length,
    repairedCount: repaired.length,
    partyAnchorsFound: partyResolution.anchorsFound,
    partyCount: partyResolution.partyCount,
    accepted: ok,
    signatureOnlyDemotion: demotion.demoted,
    demotedSignatureContactCount: demotion.demotedCount,
    fatalTokens: remainingFatal.slice(0, 16),
    executionContextFound: remainingDetail.some((d) => d.isExecutionContext),
  });

  logPlaceholderScanResult({
    surface: ctx.surface,
    scannedCount: remainingDetail.length,
    fatalCount: remainingFatal.length,
    nonfatalCount: remainingDetail.length - remainingFatal.length,
    repairedCount: repaired.length,
    bodyLen: postRepairText.length,
    partyCount: partyResolution.partyCount,
    ok,
    anchorsFound: partyResolution.anchorsFound,
    sources: partyResolution.sources,
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
    logPlaceholderRejectDetail(remainingDetail, ctx.surface, partyResolution);
    for (const d of remainingDetail.filter((x) => x.fatal).slice(0, 12)) {
      logPaidProPlaceholderContext({
        placeholder: d.token,
        surroundingText: d.contextSnippet.slice(0, 120),
      });
    }
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
          contextSnippet: d.contextSnippet.slice(0, 120),
          lineKind: d.lineKind,
          sectionKind: d.sectionKind,
          nearestHeading: d.nearestHeading,
        })),
      repaired,
      ok: false,
    });
  }
  return {
    ok,
    text: postRepairText,
    repaired,
    remaining,
    remainingFatal,
    remainingDetail,
    partyResolution,
  };
}

export const PLACEHOLDER_SAFETY_PREVIEW_BLOCKED =
  "LawDog blocked this preview because unresolved drafting placeholders remain in the agreement text. Edit the draft, resolve bracketed fields, or run generation again before sending or exporting.";
