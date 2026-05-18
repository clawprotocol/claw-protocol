/**
 * Universal deterministic placeholder / template-token repair + validation for user-visible
 * agreement prose (all families). Does not invent party facts — only safe lexical repairs.
 */

import { substitutePartyPlaceholdersInUserFacingText } from "../../agreement/partyPlaceholderDisplay";

const LOG_PREFIX_SCAN = "[placeholder-scan]";
const LOG_PREFIX_REPAIR = "[placeholder-repair]";
const LOG_PREFIX_REJECT = "[placeholder-reject]";

type PhLogKind = typeof LOG_PREFIX_SCAN | typeof LOG_PREFIX_REPAIR | typeof LOG_PREFIX_REJECT;

function phLog(kind: PhLogKind, payload: Record<string, unknown>): void {
  if (import.meta.env.MODE === "test") return;
  const line = { ...payload, kind };
  if (kind === LOG_PREFIX_REJECT) {
    // eslint-disable-next-line no-console
    console.warn(kind, line);
  } else if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info(kind, line);
  }
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
};

const ALLOWED_BRACKET = /^\[not yet specified\]$/i;

/**
 * Internal slot tokens with underscore and/or digit — excludes signature-line stubs like [NAME], [TITLE], [DATE].
 */
const BRACKET_INTERNAL_SLOT_RE = /\[(?:[A-Z][A-Z0-9]*_\d+|[A-Z]{2,}_[A-Z0-9_]+)\]/g;

/** Signature-block drafting stubs (repaired when real parties are present in the corpus). */
const SIGNATURE_LINE_BRACKET_RE =
  /\[\s*(?:NAME|TITLE|DATE|EMAIL|SIGNATURE|PRINTED\s*NAME|COMPANY\s*NAME|SIGNATORY(?:\s*NAME)?)\s*\]/gi;
const INSERT_BRACKET_RE = /\[[^\]\n]{0,200}\binsert[^\]\n]{0,200}\]/gi;
const MUSTACHE_RE = /\{\{[\s\S]*?\}\}/g;
const SINGLE_BRACE_TOKEN_RE = /\{[a-z][a-z0-9_]*\}/gi;
const ANGLE_INSERT_RE = /<\s*insert\b[^>]{0,200}>/gi;
const TRIPLE_UNDERSCORE_RE = /___[A-Z][A-Z0-9_]*___/g;
const DRAFTING_STUB_PHRASE_RE =
  /\b(?:fill\s+in\s+later|to\s+be\s+completed|insert\s+here|fill\s+in\s+with\s+counsel)\b/gi;
const SCHEDULE_STUB_RE = /\bschedule\s+a\b[^.\n]{0,120}\b(?:tbd|placeholder|to\s+be\s+completed|\[)\b/gi;
/** Angle-bracket drafting stubs (HTML tags stripped before scan in some pipelines). */
const ANGLE_LEGAL_STUB_RE =
  /<\s*[^>\n]{0,200}(?:customer|legal\s*name|tbd|placeholder|to\s+be\s+(?:completed|filled)|insert\s+here)[^>\n]{0,200}\s*>/gi;

/** Strip minimal HTML to plain text for placeholder scanning (mirrors backend). */
export function stripHtmlAgreementScanText(html: string): string {
  const t = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return t;
}

function normPartyNames(ctx: PlaceholderSafetyContext): string[] {
  return (ctx.partyNames || [])
    .map((n) => String(n ?? "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length > 0);
}

function intakeAllowsToken(intakeRaw: string | null | undefined, token: string): boolean {
  const i = (intakeRaw || "").trim();
  if (!i || !token.trim()) return false;
  return i.includes(token);
}

function corpusHasResolvedPartyAnchors(text: string, partyNames: string[]): boolean {
  const t = text || "";
  if (partyNames.some((n) => n.length >= 3 && t.includes(n))) return true;
  return /\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|LP)\b/.test(t) && t.length >= 5_000;
}

/** Replace signature-line bracket stubs when the body already names real parties. */
function repairSignatureLinePlaceholders(
  text: string,
  partyNames: string[],
): { text: string; repaired: string[] } {
  const names = (partyNames || [])
    .map((n) => String(n ?? "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length > 0);
  if (!corpusHasResolvedPartyAnchors(text, names)) {
    return { text, repaired: [] };
  }
  const repaired: string[] = [];
  const out = text.replace(SIGNATURE_LINE_BRACKET_RE, (match) => {
    repaired.push(`sig_line:${match.trim()}`);
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
  let out = text || "";
  const repaired: string[] = [];
  const partyLine = [String(ctx.intakeRaw || ""), ...normPartyNames(ctx as PlaceholderSafetyContext)].join("\n");

  if (/\[CASE_ID_\d+\]/i.test(out)) {
    out = out.replace(/\[\s*CASE_ID_\d+\s*\]/gi, "any Party");
    repaired.push("CASE_ID→any Party");
  }

  out = substitutePartyPlaceholdersInUserFacingText(out, partyLine, ctx.partyNames ?? null);

  const sigRepair = repairSignatureLinePlaceholders(out, normPartyNames(ctx as PlaceholderSafetyContext));
  out = sigRepair.text;
  repaired.push(...sigRepair.repaired);

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
    const names = normPartyNames(ctx as PlaceholderSafetyContext);
    const rep = names.length === 1 ? names[0] : "the applicable Party";
    out = out.replace(companyRe, rep);
    repaired.push(`[COMPANY_NAME]→${rep === "the applicable Party" ? rep : "resolved party"}`);
  }

  return { text: out, repaired };
}

/**
 * Returns human-readable forbidden fragments still present (deduped).
 */
export function collectForbiddenTemplateFragments(
  text: string,
  intakeRaw: string | null | undefined,
): string[] {
  const t = text || "";
  const found: string[] = [];
  const push = (s: string) => {
    const x = s.trim();
    if (x.length < 2 || x.length > 220) return;
    if (intakeAllowsToken(intakeRaw, x)) return;
    if (!found.includes(x)) found.push(x);
  };

  for (const m of t.matchAll(BRACKET_INTERNAL_SLOT_RE)) {
    const raw = m[0];
    if (ALLOWED_BRACKET.test(raw.trim())) continue;
    push(raw);
  }
  for (const m of t.matchAll(INSERT_BRACKET_RE)) push(m[0]);
  for (const m of t.matchAll(MUSTACHE_RE)) push(m[0]);
  for (const m of t.matchAll(SINGLE_BRACE_TOKEN_RE)) push(m[0]);
  for (const m of t.matchAll(ANGLE_INSERT_RE)) push(m[0]);
  for (const m of t.matchAll(ANGLE_LEGAL_STUB_RE)) push(m[0]);
  for (const m of t.matchAll(TRIPLE_UNDERSCORE_RE)) push(m[0]);

  for (const line of t.split(/\n/)) {
    if (/^\s*(TODO|FIXME)\s*:/i.test(line)) push(line.trim().slice(0, 120));
  }

  if (DRAFTING_STUB_PHRASE_RE.test(t)) {
    DRAFTING_STUB_PHRASE_RE.lastIndex = 0;
    for (const m2 of t.matchAll(DRAFTING_STUB_PHRASE_RE)) push(m2[0]);
  }
  if (SCHEDULE_STUB_RE.test(t)) {
    SCHEDULE_STUB_RE.lastIndex = 0;
    for (const m2 of t.matchAll(SCHEDULE_STUB_RE)) push(m2[0].trim().slice(0, 160));
  }

  return found.slice(0, 40);
}

export function finalizeUserVisibleAgreementPlainText(
  text: string,
  ctx: PlaceholderSafetyContext,
): PlaceholderSafetyOutcome {
  const { text: repairedText, repaired } = repairAgreementTemplatePlaceholders(text, ctx);
  const remaining = collectForbiddenTemplateFragments(repairedText, ctx.intakeRaw);
  const ok = remaining.length === 0;

  phLog(LOG_PREFIX_SCAN, {
    surface: ctx.surface,
    family: ctx.agreementFamily ?? "",
    token_count: remaining.length,
    token_types: remaining.slice(0, 12),
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
    phLog(LOG_PREFIX_REJECT, {
      surface: ctx.surface,
      family: ctx.agreementFamily ?? "",
      remaining: remaining.slice(0, 12),
      remaining_detail: remaining.slice(0, 12),
      repaired,
      ok: false,
    });
  }
  return { ok, text: repairedText, repaired, remaining };
}

export const PLACEHOLDER_SAFETY_PREVIEW_BLOCKED =
  "LawDog blocked this preview because unresolved drafting placeholders remain in the agreement text. Edit the draft, resolve bracketed fields, or run generation again before sending or exporting.";
