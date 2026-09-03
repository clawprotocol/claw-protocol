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

const QUOTED_INSERT_CUE_RE =
  /\badd\s+this\s+exact\s+sentence\b|\badd\s+the\s+exact\s+sentence\b|\badd\s+this\s+exact\b|\badd\s+the\s+following\s+sentence\b|\badd\s+this\s+sentence\s+as\b/i;
const QUOTED_SPAN_RE = /["“”]([\s\S]{16,800}?)["“”]/;
const SECTION_IN_RE = /\bin\s+the\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)\s+section\b/i;

export function parseQuotedSentenceInsertInstruction(
  instr: string,
): { sentence: string; section: string | null } | null {
  const raw = instr || "";
  if (!QUOTED_INSERT_CUE_RE.test(raw)) return null;
  const qm = raw.match(QUOTED_SPAN_RE);
  if (!qm) return null;
  const sentence = (qm[1] || "").replace(/\s+/g, " ").trim();
  if (sentence.length < 16) return null;
  const sm = raw.match(SECTION_IN_RE);
  const section = sm?.[1] ? sm[1].replace(/\s+/g, " ").trim() : null;
  return { sentence, section: section && section.length <= 48 ? section : null };
}

const WITNESS_LINE_RE = /^(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b/im;
/** Next top-level heading only — subsections like 10.1 must stay inside the current section. */
const TOP_LEVEL_SECTION_HEADING_RE = /^(?:#{1,4}\s+)?\d{1,2}\.\s+(?!\d)[A-Z].+$/m;
const MARKDOWN_SECTION_HEADING_RE = /^#{1,4}\s+(?!\d)[A-Z].+$/m;

function nextSectionCut(tail: string): number | null {
  const nxt = tail.match(TOP_LEVEL_SECTION_HEADING_RE);
  const md = tail.match(MARKDOWN_SECTION_HEADING_RE);
  const wit = tail.match(/^\s*(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b/im);
  const cuts = [nxt, md, wit]
    .map((m) => (m && m.index !== undefined ? m.index : null))
    .filter((n): n is number => n !== null);
  return cuts.length ? Math.min(...cuts) : null;
}

function findNamedSectionHeading(doc: string, section: string): { index: number; length: number } | null {
  const sec = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    // "10. Notices" / "## 12. NOTICES" / "8. Notices and Communications"
    new RegExp(`^(?:#{1,4}\\s+)?(?:\\d+\\.)+\\s+${sec}\\b[^\\n]*$`, "im"),
    new RegExp(`^#{1,4}\\s+${sec}\\b[^\\n]*$`, "im"),
    new RegExp(`^(?:#{1,4}\\s+)?(?:\\d+\\.)+\\s+[A-Z][^\\n]{0,60}\\b${sec}\\b[^\\n]*$`, "im"),
    // Fused persist: "...Agreement12. NOTICES"
    new RegExp(`(?<=[a-z.])((?:\\d+\\.)+\\s+${sec}\\b[^\\n]*)$`, "im"),
  ];
  if (/^notices$/i.test(section)) {
    patterns.push(/^(?:#{1,4}\s+)?(?:\d+\.)+\s+Notice\b(?!\s+shall)[^\n]*$/im);
  }
  for (const heading of patterns) {
    const hm = heading.exec(doc);
    if (hm && hm.index !== undefined) {
      return { index: hm.index, length: hm[0].length };
    }
  }
  return null;
}

function lastTopLevelSectionBodyEnd(doc: string): number | null {
  const re = /^(?:#{1,4}\s+)?\d{1,2}\.\s+(?!\d)[A-Z].+$/gm;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) last = m;
  if (!last || last.index === undefined) return null;
  const after = last.index + last[0].length;
  const cut = nextSectionCut(doc.slice(after));
  return after + (cut !== null ? cut : doc.slice(after).trimEnd().length);
}

export function tryQuotedSentenceSurgicalInsert(
  doc: string,
  instr: string,
): { text: string; section: string | null; changedSections: string[] } | null {
  const parsed = parseQuotedSentenceInsertInstruction(instr);
  if (!parsed || !doc.trim()) return null;
  if (doc.includes(parsed.sentence)) return null;
  const block = `\n\n${parsed.sentence}\n\n`;
  const applyAt = (insertAt: number, sectionName: string | null) => {
    const text = `${doc.slice(0, insertAt).replace(/\s+$/, "")}${block}${doc.slice(insertAt).replace(/^\n+/, "")}`;
    return {
      text,
      section: sectionName,
      changedSections: sectionName ? [sectionName.toLowerCase()] : ["end"],
    };
  };
  if (parsed.section) {
    const hm = findNamedSectionHeading(doc, parsed.section);
    if (hm) {
      const after = hm.index + hm.length;
      const cut = nextSectionCut(doc.slice(after));
      const insertAt = after + (cut !== null ? cut : doc.slice(after).trimEnd().length);
      return applyAt(insertAt, parsed.section);
    }
    // Keep Notices-targeted inserts inside a rendered section body, not after the last heading.
    const lastBodyEnd = lastTopLevelSectionBodyEnd(doc);
    if (lastBodyEnd !== null) {
      return applyAt(lastBodyEnd, parsed.section);
    }
  }
  const wit = WITNESS_LINE_RE.exec(doc);
  if (wit && wit.index !== undefined) {
    return applyAt(wit.index, parsed.section);
  }
  return applyAt(doc.replace(/\s+$/, "").length, parsed.section);
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

  const quoted = tryQuotedSentenceSurgicalInsert(doc, instr);
  if (quoted) {
    return {
      text: quoted.text,
      applied: true,
      reason: "quoted_sentence_insert",
      changedSections: quoted.changedSections,
      log: {
        deterministicSurgicalFallbackAttempted: true,
        deterministicSurgicalFallbackMatchedClause: quoted.section,
        deterministicSurgicalFallbackApplied: true,
        deterministicSurgicalFallbackReason: "quoted_sentence_insert",
      },
    };
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
