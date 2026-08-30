/**
 * Seed / leftover remount must write the certified Review display corpus,
 * not an older persist/draft blob (premium_full_document_text /
 * server_full_document_text) or a reconstruction projected from that blob.
 *
 * #145's sequential 10/11/12/13 picker fell back to a leftover that already
 * had that order (fused Notices / Misc) and treated it as current SoT.
 * When a certified Review exists, use only that corpus. Do not remint.
 */

import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

const NON_BINDING_TEMPLATE_BANNER_RE =
  /Draft Agreement\s*\(\s*non[- ]binding template\s*\)/i;

function isTemplateCorpus(text: string): boolean {
  return NON_BINDING_TEMPLATE_BANNER_RE.test(text);
}

export const FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE =
  "esign_seed_writes_non_certified_review_version" as const;

/**
 * #146 still seeded leftover when accepted/verified Review was empty on remount.
 * Do not fall back to premium/server/handoff leftover — keep resolving certified
 * Review, or fail closed.
 */
export const FIRST_FAILING_LEFTOVER_FUSED_FALLBACK_PREDICATE =
  "esign_seed_falls_back_to_leftover_fused_draft_when_certified_unresolved" as const;

/**
 * #147 fail-closed (or treating leftover hydrate/canonical as certified) left
 * leftover GET /content painted. Fail-closed-without-replace is not a pass
 * while leftover fused /content is on screen and Review-paint SoT exists.
 */
export const FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTED_PREDICATE =
  "esign_fail_closed_or_wrong_store_leaves_leftover_get_content_painted" as const;

/**
 * #148 kept resolving Review-paint session stores. Incognito remount emptied
 * those stores, leftover persist was rejected as uncertified, and leftover
 * fused GET /content stayed on screen even though persist Review GET already
 * existed. Empty Review-paint session is not a reason to leave leftover
 * painted when persist Review exists. Fail-closed only when persist Review
 * truly does not exist.
 */
export const FIRST_FAILING_LEFTOVER_GET_CONTENT_STILL_PAINTS_PREDICATE =
  "esign_leftover_get_content_still_paints_after_review_paint_sot_resolver" as const;

/**
 * #149 still painted leftover GET /content on remount: bind fail-closed or
 * leftover PDF extract was missed, then the wizard handed off leftover 200.
 * Persist Review GET 200 must replace leftover before paint. Leftover fused
 * is never a successful GET /content when persist Review exists.
 */
export const FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE =
  "esign_leftover_get_content_paints_before_persist_review_replace" as const;

/** @deprecated Closed #145 gate — do not reopen. Prefer {@link FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE}. */
export const FIRST_FAILING_STALE_REVIEW_SNAPSHOT_SEED_PREDICATE =
  FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE;

const FUSED_MISC_OPENING_RE =
  /This Agreement is the entire agreement\s+This Agreement is between/i;

/** Leftover stuffed Address is the Address *field*, not a later Term/Misc clause. */
const STUFFED_NOTICE_TERM_RE =
  /(?:30\s*-?\s*days?|Upon full execution by the parties unless otherwise specified)/i;
const ADDRESS_FIELD_CUT_RE =
  /(?:^\s*\d+\.\s+[A-Za-z]|\n\s*\d+\.\s+[A-Za-z]|\s+\d+\.\s+[A-Za-z]|If to\s+|This Agreement commences|Notices are effective)/i;
const ADDRESS_FIELD_WINDOW = 80;

function addressFieldIsStuffedLeftover(body: string): boolean {
  const re = /Address:/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const window = body.slice(m.index + m[0].length, m.index + m[0].length + ADDRESS_FIELD_WINDOW);
    const cutIdx = window.search(ADDRESS_FIELD_CUT_RE);
    const field = cutIdx >= 0 ? window.slice(0, cutIdx) : window;
    if (STUFFED_NOTICE_TERM_RE.test(field)) return true;
  }
  return false;
}

const TOP_LEVEL_HEADING_RE = /(?:^|\n)\s*(\d+)\.\s+[A-Za-z]/g;

export function topLevelSectionHeadingNumbers(text: string | null | undefined): number[] {
  const nums: number[] = [];
  const re = new RegExp(TOP_LEVEL_HEADING_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text ?? "")) !== null) {
    nums.push(Number(m[1]));
  }
  return nums;
}

/**
 * Older persist/draft snapshots still have 11 after 13, or 10 jumping to 12
 * (11 missing in sequence). Certified Review is sequential 10/11/12/13.
 */
export function reviewCorpusHasStaleTopLevelSectionOrder(text: string | null | undefined): boolean {
  const nums = topLevelSectionHeadingNumbers(text);
  if (nums.length < 2) return false;
  const i13 = nums.indexOf(13);
  const i11 = nums.indexOf(11);
  if (i13 >= 0 && i11 >= 0 && i11 > i13) return true;
  for (let i = 0; i < nums.length - 1; i += 1) {
    if (nums[i] === 10 && nums[i + 1] === 12) return true;
  }
  return nums.some((n, i) => i > 0 && n < nums[i - 1]!);
}

function longNonTemplateCorpus(text: string | null | undefined): string {
  const raw = (text ?? "").trim();
  if (raw.length < VS01_SIGNING_CORPUS_MIN_LEN) return "";
  if (isTemplateCorpus(raw)) return "";
  return raw;
}

function ifToHeadingEntities(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Own-line headings plus PDF /content extracts that glue the If-to onto
  // the following Attn/Address tokens on one line.
  const re = /If to\s+(.+?)\s*:/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const entity = (m[1] ?? "").trim();
    if (!entity) continue;
    const key = entity.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entity);
  }
  return out;
}

/**
 * Leftover fused Notices / Misc — never the seed body.
 * Generic: concatenated If-to headings, stuffed Address/term/execution, fused Misc.
 * Does not hard-code party or venue names.
 */
export function reviewCorpusLooksLikeLeftoverFusedNotices(
  text: string | null | undefined,
): boolean {
  const body = (text ?? "").replace(/\r\n/g, "\n");
  if (!body.trim()) return false;
  if (FUSED_MISC_OPENING_RE.test(body)) return true;
  if (addressFieldIsStuffedLeftover(body)) return true;
  const headings = ifToHeadingEntities(body);
  for (let i = 0; i < headings.length; i += 1) {
    for (let j = 0; j < headings.length; j += 1) {
      if (i === j) continue;
      const longer = headings[i]!;
      const shorter = headings[j]!;
      if (
        longer.length > shorter.length &&
        longer.toLowerCase().includes(shorter.toLowerCase())
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Certified Review only. Never project / reconstruct from a leftover blob.
 * Callers must pass the accepted snapshot, verified commercial display, or
 * Review-paint SoT. Leftover fused Notices is never certified.
 */
export function resolveCertifiedReviewCorpusForSigningSeed(
  certified: string | null | undefined,
): string {
  const picked = longNonTemplateCorpus(certified);
  if (!picked) return "";
  if (reviewCorpusLooksLikeLeftoverFusedNotices(picked)) return "";
  return picked;
}

/**
 * Persist Review GET (canonical-review-snapshot) is the Review-paint corpus.
 * Do not leftover-filter it into empty — leftover detector is for GET /content
 * packet bytes. Notices Address: plus later Term/Misc "30 days" / "Upon full
 * execution" is persist Review, not leftover. Leftover fused GET /content is
 * never this body.
 */
export function persistReviewGetPlainForSigningSeed(
  persistReviewGet: string | null | undefined,
): string {
  return longNonTemplateCorpus(persistReviewGet);
}

function looksUnreadablePacketExtract(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith("%PDF")) return true;
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  return t.length >= 64 && letters / t.length < 0.2;
}

/**
 * GET /content packet identity vs persist Review. Digest / collapsed-whitespace
 * containment only — do not leftover-text-classify packet bytes.
 */
export function packetPlainMatchesPersistReviewCorpus(
  packetPlain: string | null | undefined,
  persistReview: string | null | undefined,
): boolean {
  const persist = persistReviewGetPlainForSigningSeed(persistReview);
  const packet = (packetPlain ?? "").trim();
  if (!persist || !packet) return false;
  if (looksUnreadablePacketExtract(packet)) return false;
  const persistNorm = persist.replace(/\s+/g, " ").toLowerCase();
  const packetNorm = packet.replace(/\s+/g, " ").toLowerCase();
  if (persistNorm === packetNorm) return true;
  if (persistNorm.length >= 200 && packetNorm.includes(persistNorm)) return true;
  if (packetNorm.length >= VS01_SIGNING_CORPUS_MIN_LEN && persistNorm.includes(packetNorm)) {
    return true;
  }
  return false;
}

/**
 * First long non-template candidate, as-is. Does not fall back to a stale
 * blob and project 10/11/12/13 onto it. When a certified Review is present,
 * pass it as the only candidate.
 */
export function pickCurrentReviewSotForSigningSeed(
  candidates: readonly (string | null | undefined)[],
): string {
  for (const c of candidates) {
    const picked = longNonTemplateCorpus(c);
    if (picked) return picked;
  }
  return "";
}

/** Accepted Review snapshot on persist (camelCase or snake_case), never draft-field fallbacks. */
export function readAcceptedReviewCorpusFromDraftLike(draft: unknown): string {
  if (!draft || typeof draft !== "object") return "";
  const rec = draft as Record<string, unknown>;
  const denorm = rec.accepted_review_snapshot_v1;
  const fromDenorm = corpusPlainFromSnapshotRecord(denorm);
  if (fromDenorm) return fromDenorm;
  const registry = rec.canonical_review_snapshots_v1;
  if (!registry || typeof registry !== "object") return "";
  const reg = registry as Record<string, unknown>;
  const acceptedId = String(reg.acceptedSnapshotId ?? reg.accepted_snapshot_id ?? "").trim();
  const snaps = reg.snapshots;
  if (!acceptedId || !snaps || typeof snaps !== "object") return "";
  return corpusPlainFromSnapshotRecord((snaps as Record<string, unknown>)[acceptedId]);
}

function corpusPlainFromSnapshotRecord(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const rec = raw as Record<string, unknown>;
  const status = String(rec.status ?? "").trim().toLowerCase();
  if (status && status !== "accepted") return "";
  const plain = String(rec.corpusPlain ?? rec.corpus_plain ?? "").trim();
  return longNonTemplateCorpus(plain);
}
