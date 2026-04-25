/**
 * Deterministic plain-text redline (word / line / paragraph LCS). No AI.
 */

export type RedlineSegment = {
  type: "same" | "insert" | "delete";
  text: string;
};

export type RedlineResult = {
  segments: RedlineSegment[];
  hasChanges: boolean;
};

/** Cap for n×m dynamic programming table — keeps compare responsive in the browser. */
const MAX_LCS_PRODUCT = 900_000;

function normalizeSpaces(s: string): string {
  return s.replace(/\r/g, "\n").replace(/\s+/g, " ").trim();
}

function splitWords(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  return t.split(" ");
}

function splitLines(text: string): string[] {
  return text.replace(/\r/g, "").split("\n");
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function mergeAdjacent(segs: RedlineSegment[]): RedlineSegment[] {
  if (segs.length === 0) return [];
  const out: RedlineSegment[] = [{ ...segs[0]! }];
  for (let k = 1; k < segs.length; k++) {
    const s = segs[k]!;
    const prev = out[out.length - 1]!;
    if (prev.type === s.type) {
      prev.text += s.text;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/**
 * Longest-common-subsequence backtrack on token arrays.
 * Each emitted token is followed by a delimiter in `text` (space or newline).
 */
function lcsDiffTokens(a: string[], b: string[], delimiter: string): RedlineSegment[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i]![j]! = 1 + dp[i + 1]![j + 1]!;
      else dp[i]![j]! = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const raw: RedlineSegment[] = [];
  let i = 0;
  let j = 0;
  const d = delimiter;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      raw.push({ type: "same", text: a[i]! + d });
      i++;
      j++;
    } else if (j >= m || (i < n && dp[i + 1]![j]! >= dp[i]![j + 1]!)) {
      raw.push({ type: "delete", text: a[i]! + d });
      i++;
    } else {
      raw.push({ type: "insert", text: b[j]! + d });
      j++;
    }
  }
  return raw;
}

function diffAtGranularity(
  current: string,
  proposed: string
): { segments: RedlineSegment[]; hasChanges: boolean } {
  const aw = splitWords(current);
  const bw = splitWords(proposed);
  if (aw.length * bw.length <= MAX_LCS_PRODUCT) {
    const segments = mergeAdjacent(lcsDiffTokens(aw, bw, " "));
    const hasChanges = segments.some((s) => s.type !== "same");
    return { segments, hasChanges };
  }

  const la = splitLines(current);
  const lb = splitLines(proposed);
  if (la.length * lb.length <= MAX_LCS_PRODUCT) {
    const segments = mergeAdjacent(lcsDiffTokens(la, lb, "\n"));
    const hasChanges = segments.some((s) => s.type !== "same");
    return { segments, hasChanges };
  }

  const pa = splitParagraphs(current);
  const pb = splitParagraphs(proposed);
  if (pa.length > 0 && pb.length > 0 && pa.length * pb.length <= MAX_LCS_PRODUCT) {
    const segments = mergeAdjacent(lcsDiffTokens(pa, pb, "\n\n"));
    const hasChanges = segments.some((s) => s.type !== "same");
    return { segments, hasChanges };
  }

  const segments: RedlineSegment[] = [
    { type: "delete", text: current },
    { type: "insert", text: proposed },
  ];
  return { segments, hasChanges: true };
}

/**
 * Build inline redline segments from rendered-draft plain text (e.g. after htmlToPlainText).
 */
export function buildAgreementRedline(currentPlain: string, proposedPlain: string): RedlineResult {
  const cur = String(currentPlain ?? "");
  const prop = String(proposedPlain ?? "");
  if (normalizeSpaces(cur) === normalizeSpaces(prop)) {
    const t = cur.replace(/\s+/g, " ").trim();
    return {
      segments: t ? [{ type: "same", text: t }] : [{ type: "same", text: "" }],
      hasChanges: false,
    };
  }
  const { segments, hasChanges } = diffAtGranularity(cur, prop);
  return {
    segments: mergeAdjacent(segments),
    hasChanges,
  };
}
