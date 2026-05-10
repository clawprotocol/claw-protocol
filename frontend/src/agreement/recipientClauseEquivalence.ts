/**
 * Clause normalization + semantic equivalence for recipient redline (prefer false positives over false negatives).
 */

const NUMBERING_PREFIX_RE =
  /^(?:(?:article|section)\s+)?(?:\(?[a-z]\)|\(?[ivxlcdm]+\)|\d+(?:\.\d+)*\.?)\s+/i;
const LEADING_ENUM_RE = /^(?:\(?[a-z]\)|\(?[ivxlcdm]+\)|\d+(?:\.\d+)*\.?)\s+/i;
const MARKDOWNISH_RE = /[#*_`>\[\]\(\)]+/g;

/** Very high bar: at or above → treat as unchanged (prefer false negatives). */
export const CLAUSE_EQUIVALENCE_JACCARD_HIGH = 0.92;
export const CLAUSE_EQUIVALENCE_JACCARD_SOFT = 0.88;
const LENGTH_RATIO_SOFT = 0.88;

const MATERIAL_NEW_OBLIGATION_RE =
  /\b(net\s*\d+|payment\s+schedule|invoice|payable|upon\s+receipt|subcontract|third[\s-]?party|vendor|assignab|work\s+for\s+hire|intellectual\s+property|pause\s+work|suspend|nonpayment|acceptance|warranty\s+period|limitation\s+of\s+liability|indemnif)\b/i;

function stripRepeatedHeadingPrefix(norm: string): string {
  const parts = norm.split(/\s+/).filter(Boolean);
  if (parts.length < 6) return norm;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of parts) {
    const key = w.length > 2 ? w : "";
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(w);
  }
  return out.join(" ");
}

/**
 * Normalize clause text for identity / equivalence (legal wording preserved; noise stripped).
 */
export function normalizeClauseForEquivalence(raw: string): string {
  let t = String(raw ?? "")
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(MARKDOWNISH_RE, " ")
    .toLowerCase();

  t = t.replace(/[^a-z0-9\s'-]/gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(NUMBERING_PREFIX_RE, "").trim();
  t = t.replace(LEADING_ENUM_RE, "").trim();
  t = t.replace(/\s+/g, " ");
  t = stripRepeatedHeadingPrefix(t);
  return t.trim();
}

function tokenSetJaccard(a: string, b: string): number {
  const tokenize = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2);
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) {
    if (B.has(w)) inter++;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function lengthSimilarity(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 1;
  const m = Math.max(la, lb);
  if (m === 0) return 1;
  return Math.min(la, lb) / m;
}

/**
 * True when revised text appears to add material commercial / legal obligations vs baseline.
 * Used to break equivalence when wording is "close" but obligation-bearing terms appear.
 */
export function materialObligationExpansionLikely(baseline: string, revised: string): boolean {
  const nb = normalizeClauseForEquivalence(baseline);
  const nr = normalizeClauseForEquivalence(revised);
  if (nr.length > nb.length + 24 && MATERIAL_NEW_OBLIGATION_RE.test(nr) && !MATERIAL_NEW_OBLIGATION_RE.test(nb)) {
    return true;
  }
  const ins = nr.replace(nb, " ").trim();
  if (ins.length > 12 && MATERIAL_NEW_OBLIGATION_RE.test(ins)) return true;
  return false;
}

/**
 * Whether two clause bodies are semantically the same for redline purposes (formatting / numbering / OCR noise).
 */
export function areClausesSemanticallyEquivalent(a: string, b: string): boolean {
  const na = normalizeClauseForEquivalence(a);
  const nb = normalizeClauseForEquivalence(b);
  if (na === nb) return true;
  if (!na && !nb) return true;
  if (materialObligationExpansionLikely(a, b)) return false;

  const lenSim = lengthSimilarity(na, nb);
  if (lenSim < LENGTH_RATIO_SOFT && na.length > 40 && nb.length > 40) return false;

  const jac = tokenSetJaccard(na, nb);
  if (jac >= CLAUSE_EQUIVALENCE_JACCARD_HIGH) return true;
  if (jac >= CLAUSE_EQUIVALENCE_JACCARD_SOFT && lenSim >= 0.9) return true;
  return false;
}
