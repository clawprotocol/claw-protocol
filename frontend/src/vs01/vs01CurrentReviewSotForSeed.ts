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

/** @deprecated Closed #145 gate — do not reopen. Prefer {@link FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE}. */
export const FIRST_FAILING_STALE_REVIEW_SNAPSHOT_SEED_PREDICATE =
  FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE;

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

/**
 * Certified Review only. Never project / reconstruct from a leftover blob.
 * Callers must pass the accepted snapshot or verified commercial display.
 */
export function resolveCertifiedReviewCorpusForSigningSeed(
  certified: string | null | undefined,
): string {
  return longNonTemplateCorpus(certified);
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
