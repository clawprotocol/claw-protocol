/**
 * Seed / leftover remount must write the CURRENT Review SoT, not an older
 * persist draft blob (premium_full_document_text / server_full_document_text)
 * from before sequential 10/11/12/13 restore.
 *
 * Matching current Review GET /content is not rewritten. Same persist.
 * Prefer the same vs01 document id. Do not remint the agreement.
 */

import { restoreSequentialTopLevelSectionOrder } from "../components/agreements/paidProOrphanSectionNumberRepair";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

const NON_BINDING_TEMPLATE_BANNER_RE =
  /Draft Agreement\s*\(\s*non[- ]binding template\s*\)/i;

function isTemplateCorpus(text: string): boolean {
  return NON_BINDING_TEMPLATE_BANNER_RE.test(text);
}

export const FIRST_FAILING_STALE_REVIEW_SNAPSHOT_SEED_PREDICATE =
  "esign_seed_writes_stale_review_snapshot_not_current_sot" as const;

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
 * (11 missing in sequence). Current Review SoT is sequential 10/11/12/13.
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

/** Same last-good sequential restore Review paint already applies. */
export function projectCurrentReviewSotCorpus(text: string | null | undefined): string {
  const raw = (text ?? "").trim();
  if (raw.length < VS01_SIGNING_CORPUS_MIN_LEN) return raw;
  const restored = restoreSequentialTopLevelSectionOrder(raw);
  return restored.repairs.length > 0 ? restored.text.trim() : raw;
}

export function pickCurrentReviewSotForSigningSeed(
  candidates: readonly (string | null | undefined)[],
): string {
  const long = candidates
    .map((c) => (c ?? "").trim())
    .filter((c) => c.length >= VS01_SIGNING_CORPUS_MIN_LEN);
  const review = long.filter((c) => !isTemplateCorpus(c));
  const sequential = review.find((c) => !reviewCorpusHasStaleTopLevelSectionOrder(c));
  const picked = sequential ?? review[0] ?? long[0] ?? "";
  return picked ? projectCurrentReviewSotCorpus(picked) : "";
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
  const acceptedId = String(reg.acceptedSnapshotId ?? "").trim();
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
  return plain.length >= VS01_SIGNING_CORPUS_MIN_LEN ? plain : "";
}
