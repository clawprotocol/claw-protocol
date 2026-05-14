import {
  classifyPremiumRefineRevisionIntent,
  isAdvisoryNoteOrCommentIntent,
} from "./premiumRefineAcceptance";

export type DeterministicSurgicalRevisionFallbackResult = {
  text: string;
  applied: boolean;
  reason: string;
  changedSections: string[];
};

/** Narrow instruction gate: operative termination-for-convenience notice period change. */
export function looksLikeTerminationConvenienceNoticeDaysInstruction(instr: string): boolean {
  const t = (instr || "").trim();
  if (t.length < 40) return false;
  if (!/\bterminat/i.test(t)) return false;
  if (!/\b(?:for\s+convenience|without\s+cause|termination\s+for\s+convenience|convenience\s+termination)\b/i.test(t)) {
    return false;
  }
  if (!/\b(?:forty[-\s]?five|\(\s*45\s*\)|\b45\b)/i.test(t)) return false;
  if (!/\bday/i.test(t)) return false;
  if (!/\b(?:revise|change|replace|require|update|modify|instead\s+of|from\s+(?:thirty|\(30\)|30)|to\s+(?:forty|45|\(45\)))\b/i.test(t)) {
    return false;
  }
  if (/^(?:is|are|does|do|can|should|would|could)\b.+\?$/is.test(t)) return false;
  if (/\bis\s+this\b.+\bfair\b.*\?/i.test(t)) return false;
  if (/\bmake\s+termination\s+better\b/i.test(t)) return false;
  return true;
}

function parseTargetNoticePhrase(instr: string): string | null {
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

const NOTICE_OLD_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bthirty\s*\(\s*30\s*\)\s*days?['']?s?\s+prior\s+written\s+notice\b/i, label: "thirty (30) canonical" },
  { re: /\bthirty\s+days?['']?s?\s+prior\s+written\s+notice\b/i, label: "thirty days words" },
  { re: /\b30\s+days?['']?s?\s+prior\s+written\s+notice\b/i, label: "30 days numeric" },
];

function sentenceHasConvenienceTermination(s: string): boolean {
  return (
    /\bfor\s+convenience\b/i.test(s) ||
    /\bwithout\s+cause\b/i.test(s) ||
    /\btermination\s+for\s+convenience\b/i.test(s) ||
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
function replaceNoticeInConvenienceSentence(sentence: string, targetPhrase: string): { next: string; hit: boolean } {
  if (!sentenceHasConvenienceTermination(sentence) || sentenceIsCauseCureOnly(sentence)) {
    return { next: sentence, hit: false };
  }
  let next = sentence;
  let hit = false;
  for (const { re } of NOTICE_OLD_PATTERNS) {
    if (re.test(sentence)) {
      next = sentence.replace(re, targetPhrase);
      hit = next !== sentence;
      break;
    }
  }
  return { next, hit };
}

function applyTerminationConvenienceNoticeToBlock(block: string, targetPhrase: string): { text: string; hit: boolean } {
  const parts = block.split(/(?<=[.!?]["']?)\s+/);
  let any = false;
  const out = parts.map((p) => {
    const r = replaceNoticeInConvenienceSentence(p, targetPhrase);
    if (r.hit) any = true;
    return r.next;
  });
  return { text: out.join(" "), hit: any };
}

function tryTerminationConvenienceNoticeFallback(
  doc: string,
  instr: string,
): { text: string; changedSections: string[] } | null {
  const targetPhrase = parseTargetNoticePhrase(instr);
  if (!targetPhrase) return null;
  if (!/(?:thirty\s*\(\s*30\s*\)|\bthirty\s+days|\b30\s+days)/i.test(doc)) return null;

  const paras = doc.split(/\n\n+/);
  for (let i = 0; i < paras.length; i++) {
    const sliceEnd = Math.min(paras.length, i + 4);
    const windowText = paras.slice(i, sliceEnd).join("\n\n");
    if (!/for\s+convenience|without\s+cause|termination\s+for\s+convenience|terminate\s+(?:its\s+)?participation/i.test(
      windowText,
    )) {
      continue;
    }
    if (
      !/(?:thirty\s*\(\s*30\s*\)|\bthirty\s+days|\b30\s+days).{0,240}prior\s+written\s+notice|prior\s+written\s+notice.{0,240}(?:thirty\s*\(\s*30\s*\)|\bthirty\s+days|\b30\s+days)/is.test(
        windowText,
      )
    ) {
      continue;
    }
    const rebuilt = [...paras];
    let changed = false;
    for (let j = i; j < sliceEnd; j++) {
      const { text, hit } = applyTerminationConvenienceNoticeToBlock(rebuilt[j]!, targetPhrase);
      if (hit) {
        rebuilt[j] = text;
        changed = true;
        break;
      }
    }
    if (!changed) continue;
    const merged = rebuilt.join("\n\n");
    if (merged === doc) continue;
    return { text: merged, changedSections: ["termination_for_convenience_notice"] };
  }
  return null;
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
  const base: DeterministicSurgicalRevisionFallbackResult = {
    text: doc,
    applied: false,
    reason: "none",
    changedSections: [],
  };
  if (!doc.trim() || !instr) return base;

  if (classifyPremiumRefineRevisionIntent(instr) !== "surgical_revision") return base;
  if (isAdvisoryNoteOrCommentIntent(instr)) return base;

  if (looksLikeTerminationConvenienceNoticeDaysInstruction(instr)) {
    const hit = tryTerminationConvenienceNoticeFallback(doc, instr);
    if (hit && hit.text !== doc) {
      return {
        text: hit.text,
        applied: true,
        reason: "termination_notice_period",
        changedSections: hit.changedSections,
      };
    }
  }

  return base;
}
