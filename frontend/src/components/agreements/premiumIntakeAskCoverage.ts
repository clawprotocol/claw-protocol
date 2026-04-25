/**
 * Universal premium substance helpers: extract commercial “asks” from raw intake
 * and score whether rendered premium text reflects them (family-agnostic).
 */

const STOP = new Set(
  [
    "between",
    "parties",
    "party",
    "agreement",
    "create",
    "draft",
    "please",
    "need",
    "want",
    "would",
    "should",
    "could",
    "writing",
    "something",
    "following",
    "including",
    "regarding",
    "related",
    "partnership",
    "business",
    "company",
    "services",
    "service",
    "client",
    "customer",
    "project",
    "thereof",
    "herein",
    "hereby",
    "whereas",
    "pursuant",
  ].map((s) => s.toLowerCase()),
);

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

/** Tokens, amounts, and % anchors that usually carry commercial intent. */
export function extractPremiumAskTargets(rawIntake: string): string[] {
  const raw = (rawIntake || "").replace(/\r\n/g, "\n");
  const low = raw.toLowerCase();
  const out: string[] = [];
  for (const m of low.matchAll(/\$\d[\d,\.]*/g)) out.push(m[0]);
  for (const m of low.matchAll(/\b\d{1,3}\s*%\b/g)) out.push(m[0].replace(/\s+/g, ""));
  for (const w of low.split(/[^a-z0-9%]+/)) {
    if (w.length >= 6 && !STOP.has(w)) out.push(w);
  }
  return [...new Set(out)].slice(0, 40);
}

export type PremiumAskCoverage = {
  ratio: number;
  total: number;
  covered: number;
  uncovered: string[];
};

export function scorePremiumAskCoverage(rawIntake: string, corpus: string): PremiumAskCoverage {
  const c = corpus.toLowerCase();
  const targets = extractPremiumAskTargets(rawIntake).filter(
    (t) => t.length >= 5 || t.includes("$") || t.includes("%"),
  );
  if (targets.length < 4) return { ratio: 1, total: 0, covered: 0, uncovered: [] };
  let covered = 0;
  const uncovered: string[] = [];
  for (const t of targets) {
    const tl = t.toLowerCase();
    if (c.includes(tl)) {
      covered++;
      continue;
    }
    if (tl.length > 10 && c.includes(tl.slice(0, 9))) {
      covered++;
      continue;
    }
    uncovered.push(t);
  }
  return { ratio: covered / targets.length, total: targets.length, covered, uncovered };
}

/** Token Jaccard overlap (same shape as premium pipeline lexical similarity). */
export function tokenJaccardSimilarity(a: string, b: string): number {
  const ta = (a || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const tb = (b || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union ? inter / union : 0;
}

export type UniversalPremiumMaterialityResult = {
  ok: boolean;
  reasons: string[];
  metrics: {
    similarity: number;
    lengthRatio: number;
    askCoverage: number;
    askTotal: number;
  };
};

/**
 * Universal “premium must beat free” gate: lexical distance, length uplift, and
 * intake ask coverage when the user wrote enough detail to score.
 */
export function evaluateUniversalPremiumMateriality(
  freeBaseline: string,
  premiumBody: string,
  rawIntake: string,
): UniversalPremiumMaterialityResult {
  const rawLen = nz(rawIntake).length;
  const cov = scorePremiumAskCoverage(rawIntake, premiumBody);
  const sim = tokenJaccardSimilarity(freeBaseline, premiumBody);
  const lenR = premiumBody.length / Math.max(1, freeBaseline.length);
  const reasons: string[] = [];

  if (rawLen >= 140) {
    if (sim > 0.76) reasons.push("lexical_too_close_to_free");
    if (rawLen > 220 && lenR < 1.12) reasons.push("premium_not_longer_than_free");
    if (cov.total >= 6 && cov.ratio < 0.38) reasons.push("ask_under_covered");
    if (/\buse the numbered operative points\b/i.test(premiumBody) && lenR < 1.35) {
      reasons.push("generic_scope_rail");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    metrics: { similarity: sim, lengthRatio: lenR, askCoverage: cov.ratio, askTotal: cov.total },
  };
}

/**
 * Pull concrete sentences from intake whose substance is missing from the premium corpus.
 * Universal carry-forward (not a clause family pack).
 */
export function buildIntakeCarryForwardBlock(rawIntake: string, corpus: string): string | null {
  const c = corpus.toLowerCase();
  const raw = (rawIntake || "").replace(/\r\n/g, "\n").trim();
  if (raw.length < 120) return null;
  const targets = extractPremiumAskTargets(rawIntake).filter((t) => t.length >= 5 || t.includes("$") || t.includes("%"));
  if (targets.length < 4) return null;

  const parts = raw.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 55 && s.length <= 360);
  const picked: string[] = [];
  for (const sentence of parts) {
    const sl = sentence.toLowerCase();
    const hits = targets.filter((t) => {
      const tl = t.toLowerCase();
      return sl.includes(tl) && !c.includes(tl);
    });
    if (hits.length && picked.length < 6) picked.push(sentence);
  }
  if (!picked.length) return null;
  const block = [
    "Commercial detail carried forward from user notes (edit freely before send):",
    "",
    ...picked.map((p, i) => `${i + 1}. ${p}`),
  ].join("\n");
  return block;
}

export function intakeHasDenseAskTargets(rawIntake: string): boolean {
  return extractPremiumAskTargets(rawIntake).length >= 5;
}
