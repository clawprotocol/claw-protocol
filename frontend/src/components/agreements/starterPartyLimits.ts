/**
 * Universal party-count limits for the starter / free LawDog flow.
 *
 * Policy (mirrors product spec):
 *   1. 1–6 real parties → no warning, no block. Normal starter flow.
 *   2. 7–12 real parties → caution notice. All parties preserved. No block. The user may
 *      still continue to free starter review and may still upgrade via the normal Pro path.
 *   3. 13+ real parties → Pro is required before send. All parties preserved (never silently
 *      truncated). Free continuation is replaced by the existing LawDog Pro upgrade /
 *      checkout entry point — we do NOT introduce a new payment route.
 *
 * Notes:
 *   - This module is intentionally small and dependency-free so the same utility can be used
 *     from intake helpers, render helpers, and tests without pulling React or routing in.
 *   - Customer-facing copy MUST avoid internal-process words (parser, fallback, shell,
 *     internal, hard cut, algorithm). The constants below are the only public copy.
 *   - This module never mutates / truncates the party list — counting is read-only.
 */

/**
 * Soft upper bound for "normal" starter parties. 1–{@link STARTER_NORMAL_PARTY_LIMIT} parties
 * render with no notice. Above this, {@link getStarterPartyCountStatus} returns `caution`.
 */
export const STARTER_NORMAL_PARTY_LIMIT = 6;

/**
 * Threshold at which Pro is required before sending. ≥{@link STARTER_PRO_REVIEW_PARTY_THRESHOLD}
 * real parties yields `requires_pro` and routes the primary CTA to the existing Pro upgrade /
 * checkout entry point.
 */
export const STARTER_PRO_REVIEW_PARTY_THRESHOLD = 13;

/**
 * Customer-facing notice shown for 7–12 parties. Public phrasing only — must not reference
 * internal pipeline language.
 */
export const STARTER_PARTY_CAUTION_NOTICE =
  "This agreement includes several parties. Please review each party and signer carefully before sending.";

/**
 * Title for the Pro-required notice (≥13 real parties). Single canonical headline used
 * by the inline starter notice and the sticky-bar fallback.
 */
export const STARTER_PARTY_PRO_REQUIRED_TITLE = "Large multi-party signing requires LawDog Pro";

/**
 * Body copy for the Pro-required notice. Public phrasing only — must not reference
 * internal pipeline language. Pairs with {@link STARTER_PARTY_PRO_REQUIRED_TITLE}.
 */
export const STARTER_PARTY_PRO_REQUIRED_NOTICE =
  "This draft was created successfully, but agreements with 13 or more parties require LawDog Pro before sending and signature collection.";

/**
 * Primary CTA label override for the Pro-required tier. Keeps starter / caution CTAs unchanged.
 */
export const STARTER_PARTY_PRO_REQUIRED_CTA_LABEL = "Continue to LawDog Pro";

export type StarterPartyCountStatus = "normal" | "caution" | "requires_pro";

/**
 * Maps a real-party count to its starter status.
 *
 *   count <= STARTER_NORMAL_PARTY_LIMIT          → "normal"
 *   count >= STARTER_PRO_REVIEW_PARTY_THRESHOLD  → "requires_pro"
 *   otherwise                                     → "caution"
 */
export function getStarterPartyCountStatus(count: number): StarterPartyCountStatus {
  if (!Number.isFinite(count) || count <= STARTER_NORMAL_PARTY_LIMIT) return "normal";
  if (count >= STARTER_PRO_REVIEW_PARTY_THRESHOLD) return "requires_pro";
  return "caution";
}

/**
 * Public copy for the resolved status. Returns null for "normal" (no notice). The strings
 * are stable for reuse in tests and rendering — never refer to internal pipeline names.
 */
export function getStarterPartyCountNotice(status: StarterPartyCountStatus): string | null {
  if (status === "caution") return STARTER_PARTY_CAUTION_NOTICE;
  if (status === "requires_pro") return STARTER_PARTY_PRO_REQUIRED_NOTICE;
  return null;
}

/**
 * Common placeholder phrasings that must NOT count toward the real-party total. These are
 * placeholder rows used when the parser couldn't identify a party — the customer hasn't
 * actually named that many parties yet, so the limits should not trip on placeholder rows.
 *
 * Kept narrow on purpose: anything specific the user typed (e.g. "Acme LLC", "John Doe")
 * counts as a real party.
 */
const PLACEHOLDER_PARTY_PATTERNS: RegExp[] = [
  /^\s*$/,
  /^party\s*[a-z]?\s*$/i,
  /^party[_\s-]?[ab]\d*$/i,
  /^party\s+\d+\s*$/i,
  /^(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\.?$/i,
  /^signer\s*\d*\s*$/i,
  /^recipient\s*\d*\s*$/i,
  /^\[?\s*not\s+yet\s+specified\s*\]?$/i,
  /^\[?\s*to\s+be\s+(?:filled|specified|named|provided)\s*\]?$/i,
  /^\[?\s*tbd\s*\]?$/i,
  /^placeholder\s*\d*\s*$/i,
  /^party\s+name\s*$/i,
  /^name\s+goes\s+here\s*$/i,
  /^the\s+parties\s*$/i,
  /^members\s+of\s+the\s+llc\s*$/i,
];

/**
 * Returns true when the party name is a clear placeholder rather than a real customer-supplied
 * name. Used by {@link countRealParties} so placeholder rows don't trigger limits.
 */
export function isPlaceholderPartyName(name: string | null | undefined): boolean {
  const t = (name || "").trim();
  if (!t) return true;
  return PLACEHOLDER_PARTY_PATTERNS.some((re) => re.test(t));
}

export type PartyLike = { name?: string | null };

/**
 * Real-party count: filters out placeholder rows, then returns the cardinality.
 * READ-ONLY — does not mutate or truncate the input array.
 */
export function countRealParties(parties: ReadonlyArray<PartyLike> | null | undefined): number {
  if (!parties || parties.length === 0) return 0;
  let n = 0;
  for (const p of parties) {
    if (!isPlaceholderPartyName(p?.name)) n += 1;
  }
  return n;
}

export type StarterPartyCountGuard = {
  /** Total parties in the draft (including placeholders). */
  totalCount: number;
  /** Real (non-placeholder) party count used for limit decisions. */
  realCount: number;
  status: StarterPartyCountStatus;
  /** Public notice copy or null when no notice should render. */
  notice: string | null;
  /** True when the free starter "send" continuation must route to the Pro upgrade flow. */
  requiresProUpgrade: boolean;
  /** True when 7–12 real parties — show caution but do not block. */
  showCaution: boolean;
};

/**
 * One-shot resolver: takes a party array (post-canonicalization) and returns the full
 * UX guard payload. Callers typically render `notice` near the review/send area and use
 * `requiresProUpgrade` to flip the primary CTA into the Pro upgrade path.
 */
export function resolveStarterPartyCountGuard(
  parties: ReadonlyArray<PartyLike> | null | undefined,
): StarterPartyCountGuard {
  const totalCount = parties?.length ?? 0;
  const realCount = countRealParties(parties);
  const status = getStarterPartyCountStatus(realCount);
  return {
    totalCount,
    realCount,
    status,
    notice: getStarterPartyCountNotice(status),
    requiresProUpgrade: status === "requires_pro",
    showCaution: status === "caution",
  };
}
