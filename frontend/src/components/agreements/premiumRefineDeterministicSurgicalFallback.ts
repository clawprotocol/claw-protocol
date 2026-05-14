import {
  classifyPremiumRefineRevisionIntent,
  isAdvisoryNoteOrCommentIntent,
} from "./premiumRefineAcceptance";

/** QA / console payload for premium-refine deterministic surgical path. */
export type DeterministicSurgicalFallbackLog = {
  deterministicSurgicalFallbackAttempted: boolean;
  deterministicSurgicalFallbackMatchedClause: string | null;
  deterministicSurgicalFallbackApplied: boolean;
  /** Machine reason: `termination_notice_period`, `none`, or why matching/replace did not apply. */
  deterministicSurgicalFallbackReason: string;
};

export type DeterministicSurgicalRevisionFallbackResult = {
  text: string;
  applied: boolean;
  reason: string;
  changedSections: string[];
  log: DeterministicSurgicalFallbackLog;
};

function emptyLog(reason: string): DeterministicSurgicalFallbackLog {
  return {
    deterministicSurgicalFallbackAttempted: false,
    deterministicSurgicalFallbackMatchedClause: null,
    deterministicSurgicalFallbackApplied: false,
    deterministicSurgicalFallbackReason: reason,
  };
}

/** Narrow instruction gate: operative termination-for-convenience notice period change. */
export function looksLikeTerminationConvenienceNoticeDaysInstruction(instr: string): boolean {
  const t = (instr || "").trim();
  if (t.length < 40) return false;
  if (!/\bterminat/i.test(t)) return false;
  if (
    !/\b(?:for\s+convenience|without\s+cause|termination\s+for\s+convenience|convenience\s+termination)\b/i.test(t)
  ) {
    return false;
  }
  if (!/\b(?:forty[-\s]?five|\(\s*45\s*\)|\b45\b)/i.test(t)) return false;
  if (!/\bday/i.test(t)) return false;
  if (
    !/\b(?:revise|change|replace|require|update|modify|instead\s+of|from\s+(?:thirty|\(30\)|30|fifteen|\(15\)|15)|to\s+(?:forty|45|\(45\)))\b/i.test(
      t,
    )
  ) {
    return false;
  }
  if (/^(?:is|are|does|do|can|should|would|could)\b.+\?$/is.test(t)) return false;
  if (/\bis\s+this\b.+\bfair\b.*\?/i.test(t)) return false;
  if (/\bmake\s+termination\s+better\b/i.test(t)) return false;
  return true;
}

export function parseTargetNoticePhrase(instr: string): string | null {
  const t = instr;
  if (/\bforty[-\s]?five\s*\(\s*45\s*\)/i.test(t) || /\(\s*45\s*\)\s*days?/i.test(t)) {
    return "forty-five (45) days' prior written notice";
  }
  if (/\b45\s+days?\b/i.test(t) && !/\bforty/i.test(t)) {
    return "45 days' prior written notice";
  }
  if (/\bforty[-\s]?five\s+days?\b/i.test(t) && !/\(\s*45\s*\)/.test(t)) {
    return "forty-five (45) days' prior written notice";
  }
  return null;
}

/**
 * "upon (at least) fifteen (15) days' prior written notice" and word/numeric variants.
 * Optional "prior" supports "… days written notice". Curly apostrophe (U+2019) allowed.
 */
const UPON_DAYS_PRIOR_WRITTEN_NOTICE_RE =
  /\bupon\s+(?:at\s+least\s+)?(?:(?:[a-z]+(?:-[a-z]+)?(?:\s+[a-z]+(?:-[a-z]+)?)*)\s*\(\s*\d+\s*\)|\d+)\s*days?[''\u2019]?\s+(?:prior\s+)?written\s+notice\b/i;

function sentenceHasConvenienceTermination(s: string): boolean {
  return (
    /\bfor\s+convenience\b/i.test(s) ||
    /\bwithout\s+cause\b/i.test(s) ||
    /\btermination\s+for\s+convenience\b/i.test(s) ||
    /\bterminate\s+this\s+Agreement\s+for\s+convenience\b/i.test(s) ||
    (/\bterminate\b/i.test(s) && /\bparticipation\b/i.test(s) && /\bconvenience\b/i.test(s))
  );
}

function sentenceIsCauseCureOnly(s: string): boolean {
  const hasCause = /\bfor\s+cause\b/i.test(s) || /\bmaterial\s+breach\b/i.test(s) || /\bcure\s+period\b/i.test(s);
  const hasConv = sentenceHasConvenienceTermination(s);
  return hasCause && !hasConv && /\b(?:cure|days?)\b/i.test(s);
}

/**
 * Within a single sentence, replace termination-for-convenience notice period wording only.
 */
function replaceNoticeInConvenienceSentence(
  sentence: string,
  targetTail: string,
): { next: string; hit: boolean; matched: string | null } {
  if (!sentenceHasConvenienceTermination(sentence) || sentenceIsCauseCureOnly(sentence)) {
    return { next: sentence, hit: false, matched: null };
  }
  const m = sentence.match(UPON_DAYS_PRIOR_WRITTEN_NOTICE_RE);
  if (!m || m.index === undefined) {
    return { next: sentence, hit: false, matched: null };
  }
  const matched = m[0];
  const next = sentence.replace(UPON_DAYS_PRIOR_WRITTEN_NOTICE_RE, `upon ${targetTail}`);
  return { next, hit: next !== sentence, matched };
}

function applyTerminationConvenienceNoticeToBlock(
  block: string,
  targetTail: string,
): { text: string; hit: boolean; matched: string | null } {
  const parts = block.split(/(?<=[.!?]["']?)\s+/);
  let any = false;
  let matched: string | null = null;
  const out = parts.map((p) => {
    const r = replaceNoticeInConvenienceSentence(p, targetTail);
    if (r.hit) {
      any = true;
      matched = r.matched;
    }
    return r.next;
  });
  return { text: out.join(" "), hit: any, matched };
}

/**
 * Sentences that both (a) describe termination for convenience / without cause and
 * (b) contain an "upon … days' prior written notice" style operative notice period.
 * Used by deterministic patch and by acceptance postcondition checks.
 */
export function extractConvenienceTerminationPriorNoticeSentences(doc: string): string[] {
  const paras = doc.split(/\n\n+/);
  const collected: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < paras.length; i++) {
    const sliceEnd = Math.min(paras.length, i + 4);
    const windowText = paras.slice(i, sliceEnd).join("\n\n");
    const convTopic =
      /for\s+convenience|termination\s+for\s+convenience|without\s+cause|terminate\s+(?:its\s+)?participation|terminate\s+this\s+Agreement\s+for\s+convenience/i.test(
        windowText,
      );
    if (!convTopic) continue;
    if (!UPON_DAYS_PRIOR_WRITTEN_NOTICE_RE.test(windowText)) continue;
    for (let j = i; j < sliceEnd; j++) {
      const parts = paras[j]!.split(/(?<=[.!?]["']?)\s+/);
      for (const p of parts) {
        const s = p.trim();
        if (!s) continue;
        if (
          sentenceHasConvenienceTermination(s) &&
          UPON_DAYS_PRIOR_WRITTEN_NOTICE_RE.test(s) &&
          !sentenceIsCauseCureOnly(s)
        ) {
          const key = s.toLowerCase().replace(/\s+/g, " ");
          if (!seen.has(key)) {
            seen.add(key);
            collected.push(s);
          }
        }
      }
    }
  }
  return collected;
}

function tryTerminationConvenienceNoticeFallback(
  doc: string,
  targetTail: string,
): { text: string; changedSections: string[]; matchedClausePreview: string | null; changed: boolean } {
  const paras = doc.split(/\n\n+/);
  for (let i = 0; i < paras.length; i++) {
    const sliceEnd = Math.min(paras.length, i + 4);
    const windowText = paras.slice(i, sliceEnd).join("\n\n");
    const convTopic =
      /for\s+convenience|termination\s+for\s+convenience|without\s+cause|terminate\s+(?:its\s+)?participation|terminate\s+this\s+Agreement\s+for\s+convenience/i.test(
        windowText,
      );
    if (!convTopic) continue;
    if (!UPON_DAYS_PRIOR_WRITTEN_NOTICE_RE.test(windowText)) continue;

    const rebuilt = [...paras];
    let changed = false;
    let matchedClausePreview: string | null = null;
    for (let j = i; j < sliceEnd; j++) {
      const { text, hit, matched } = applyTerminationConvenienceNoticeToBlock(rebuilt[j]!, targetTail);
      if (hit) {
        rebuilt[j] = text;
        changed = true;
        matchedClausePreview = matched ? matched.slice(0, 160) : null;
        break;
      }
    }
    if (!changed) continue;
    const merged = rebuilt.join("\n\n");
    if (merged === doc) continue;
    return {
      text: merged,
      changedSections: ["termination_for_convenience_notice"],
      matchedClausePreview,
      changed: true,
    };
  }
  return { text: doc, changedSections: [], matchedClausePreview: null, changed: false };
}

/**
 * Deterministic, clause-local edits when the model returns an unchanged full document.
 * Only high-confidence patterns; otherwise returns applied:false.
 */
export function applyDeterministicSurgicalRevisionFallback(args: {
  currentDocumentText: string;
  userInstruction: string;
}): DeterministicSurgicalRevisionFallbackResult {
  const doc = args.currentDocumentText;
  const instr = args.userInstruction.trim();
  const baseFail = (reason: string): DeterministicSurgicalRevisionFallbackResult => ({
    text: doc,
    applied: false,
    reason,
    changedSections: [],
    log: emptyLog(reason),
  });

  if (!doc.trim() || !instr) return baseFail("empty_instruction_or_document");

  if (classifyPremiumRefineRevisionIntent(instr) !== "surgical_revision") {
    return baseFail("not_surgical_revision_intent");
  }
  if (isAdvisoryNoteOrCommentIntent(instr)) {
    return baseFail("advisory_intent");
  }

  if (!looksLikeTerminationConvenienceNoticeDaysInstruction(instr)) {
    return baseFail("instruction_not_termination_convenience_notice");
  }

  const targetTail = parseTargetNoticePhrase(instr);
  if (!targetTail) {
    return {
      text: doc,
      applied: false,
      reason: "target_notice_parse_failed",
      changedSections: [],
      log: {
        deterministicSurgicalFallbackAttempted: true,
        deterministicSurgicalFallbackMatchedClause: null,
        deterministicSurgicalFallbackApplied: false,
        deterministicSurgicalFallbackReason: "target_notice_parse_failed",
      },
    };
  }

  const hit = tryTerminationConvenienceNoticeFallback(doc, targetTail);
  if (hit.changed && hit.text !== doc) {
    return {
      text: hit.text,
      applied: true,
      reason: "termination_notice_period",
      changedSections: hit.changedSections,
      log: {
        deterministicSurgicalFallbackAttempted: true,
        deterministicSurgicalFallbackMatchedClause: hit.matchedClausePreview,
        deterministicSurgicalFallbackApplied: true,
        deterministicSurgicalFallbackReason: "termination_notice_period",
      },
    };
  }

  return {
    text: doc,
    applied: false,
    reason: "no_convenience_notice_span_matched",
    changedSections: [],
    log: {
      deterministicSurgicalFallbackAttempted: true,
      deterministicSurgicalFallbackMatchedClause: null,
      deterministicSurgicalFallbackApplied: false,
      deterministicSurgicalFallbackReason: "no_convenience_notice_span_matched",
    },
  };
}
