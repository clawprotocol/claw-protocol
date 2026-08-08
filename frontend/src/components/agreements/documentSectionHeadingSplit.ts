/**
 * Split glued numbered section / subsection headings from body text on one line.
 * Shared by free starter preview and paid Pro display normalization.
 */

import { splitGluedNumberedSectionLine } from "./paidProNumberedSectionHeadingBodySplit";

const MAIN_PLUS_NAMED_SUBSECTION_GLUE_RE =
  /^(\d+\.\s+(?!\d+\.\d)(?:[^\n.]{3,90}?))\s+((?:[A-Z][a-zA-Z]+(?:\s+(?:and|of|for|the|to|on|in|or|by|at|from|upon|with)\s+)*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\.)\s+((?:Either|The|Upon|If|When|Each|Any|Neither|One|Both|Client|Service\s+Provider|Unless|Notwithstanding|During|Within|After|Before).+)/;

/** Body sentence starters that follow a glued heading title (not part of the title). */
const GLUED_BODY_SENTENCE_START =
  "(?:To\\s+the|During\\s+the\\s+Term|AI|The|This|Each|Either|Upon|Unless|If\\s|When|Where|As\\s|An\\s|A\\s|In\\s|For\\s|Client|Provider|Service\\s+Provider|Consultant|Except|Taxes|Fixed|Termination|Both|All|Any|Neither|Notwithstanding|During|Within|After|Before|Red\\s|Mile|Harbor|Process|Not\\s|No\\s|One\\s|Party\\s|Neither\\s+party)";

const MAIN_SECTION_GLUE_RE = new RegExp(
  `^(\\d+\\.\\s+(?!\\d+\\.\\d).+?)\\s+(${GLUED_BODY_SENTENCE_START}\\b.+)`,
  "s",
);

/** Main section heading immediately followed by subsection on same line (test337/test345). */
const MAIN_THEN_SUBSECTION_GLUE_RE = /^(\d+\.\s+(?!\d+\.\d).+?)\s+(\d+\.\d+\s+.+)$/s;
/** e.g. `9. General Terms9.1` — main heading glued to subsection with no whitespace. */
const MAIN_THEN_SUBSECTION_NO_SPACE_GLUE_RE =
  /^(\d+\.\s+(?!\d+\.\d).+[A-Za-z])(\d+\.\d+(?:\.\d+)*(?:\s+\S.*)?)$/;

/** Explicit body cues after a glued main heading title (test345 short titles). */
const MAIN_HEADING_BODY_CUE_RE =
  /^(\d+\.\s+(?!\d+\.\d)(?:[A-Z][a-zA-Z]*(?:\s+(?:and|of|for|the|to|on|in|or|by|at|from|upon|with)\s+)*[A-Za-z][a-zA-Z]+)+)\s+((?:To the extent|The term(?:\s+of)?|Either party|Neither party|During the Term|Client will|Service Provider will|Upon full|If the|Where the|As used|For purposes).+)$/s;

const MIN_MAIN_HEADING_LEN = 6;

const SUBSECTION_PERIOD_GLUE_RE = /^(\d+\.\d+(?:\.\d+)*\s+[^.\n]{3,120}?)\.\s+(.+)$/s;
const SUBSECTION_SPACE_GLUE_RE =
  /^(\d+\.\d+(?:\.\d+)*\s+[A-Z][^.\n]{2,90}?)\s+((?:Either|The|Upon|If|When|Each|Any|Neither|One|Both|Client|Service\s+Provider|Consultant|Unless|Notwithstanding|During|Within|After|Before|Party|Neither\s+party|In\s+the|No\s+party|This|All|Some|Such|Where|As\s+a|A\s+party|Except).+)$/s;
const MAIN_PERIOD_GLUE_RE = /^(\d+\.\s+(?!\d+\.\d)[^.\n]{3,120}?)\.\s+([A-Z].+)$/s;

const INLINE_LETTERED_ENUM_TAIL_RE = /\([a-z]\)/i;

/** Split inline lower-alpha enumerations `(a)… (b)… (c)…` onto separate lines/blocks. */
export function splitInlineLetteredEnumerationsInLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || !INLINE_LETTERED_ENUM_TAIL_RE.test(trimmed)) return line;
  const markers = trimmed.match(/\([a-z]\)/gi) ?? [];
  if (markers.length < 2) return line;

  let out = trimmed
    .replace(/:\s+\(([a-z])\)\s+/gi, ":\n\n($1) ")
    .replace(/;\s+and\s+\(([a-z])\)\s+/gi, ";\nand ($1) ")
    .replace(/;\s+\(([b-z])\)\s+/gi, ";\n\n($1) ")
    .replace(/([.?!])\s+\(([b-z])\)\s+/gi, "$1\n\n($2) ")
    .replace(/\s+\(([b-z])\)\s+(?=[A-Z"(])/gi, "\n\n($1) ");
  return out;
}

/** Repair inline `(a)/(b)/(c)` lists in operative text (never in witness / signature tail). */
export function repairInlineLetteredEnumerationsInText(text: string): string {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";

  const expanded: string[] = [];
  for (const line of head.split("\n")) {
    const split = splitInlineLetteredEnumerationsInLine(line);
    expanded.push(...split.split("\n"));
  }
  const merged = expanded.join("\n").replace(/\n{3,}/g, "\n\n");
  return tail ? `${merged}${merged.endsWith("\n") ? "" : "\n\n"}${tail}` : merged;
}

const INLINE_SUBSECTION_MARKER_GLUE_RE = /^(.+?[.!?])\s+(\d+\.\d+(?:\.\d+)*\s+.+)$/s;
const INLINE_MAIN_SECTION_MARKER_GLUE_RE = /^(.+?[.!?])\s+(\d+\.\s+(?!\d+\.\d).+)$/s;

/** Split inline subsection/main-section markers glued after a completed sentence mid-line. */
export function splitInlineNumberedSectionMarkerFromLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 16 || /^\d+\./.test(trimmed)) return line;

  const subsection = trimmed.match(INLINE_SUBSECTION_MARKER_GLUE_RE);
  if (subsection?.[1] && subsection[2]?.trim()) {
    const prefix = subsection[1].trim();
    const marker = subsection[2].trim();
    if (prefix.length >= 8 && marker.length >= 6) {
      return `${prefix}\n${marker}`;
    }
  }

  const mainSection = trimmed.match(INLINE_MAIN_SECTION_MARKER_GLUE_RE);
  if (mainSection?.[1] && mainSection[2]?.trim()) {
    const prefix = mainSection[1].trim();
    const marker = mainSection[2].trim();
    if (prefix.length >= 8 && marker.length >= 6) {
      return `${prefix}\n${marker}`;
    }
  }

  return line;
}

/** Split one line when a numbered heading and body sentence are glued together. */
export function splitGluedSectionHeadingFromLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 24 || !/^\d+\./.test(trimmed)) return line;

  const starterKnownSlashHeadingRe =
    /^\d+\.\s+(?:Scope of Services\s*\/\s*Purpose|Services Term and Effective Date|Term and Effective Date)\s*$/i;
  if (starterKnownSlashHeadingRe.test(trimmed)) return line;

  const starterScopeBodyGlue = trimmed.match(/^(\d+\.\s+Scope of Services\s*\/\s*Purpose)\s+(.+)$/i);
  if (starterScopeBodyGlue?.[1] && starterScopeBodyGlue[2]?.trim()) {
    return `${starterScopeBodyGlue[1].trim()}\n${starterScopeBodyGlue[2].trim()}`;
  }
  const starterTermBodyGlue = trimmed.match(
    /^(\d+\.\s+(?:Services Term and Effective Date|Term and Effective Date))\s+(Term:.+)$/i,
  );
  if (starterTermBodyGlue?.[1] && starterTermBodyGlue[2]?.trim()) {
    return `${starterTermBodyGlue[1].trim()}\n${starterTermBodyGlue[2].trim()}`;
  }

  const structural = splitGluedNumberedSectionLine(trimmed);
  if (structural) {
    return `${structural.heading}\n${structural.body}`;
  }

  const subPeriod = trimmed.match(SUBSECTION_PERIOD_GLUE_RE);
  if (subPeriod?.[1] && subPeriod[2]?.trim()) {
    return `${subPeriod[1]}.\n${subPeriod[2].trim()}`;
  }

  const subSpace = trimmed.match(SUBSECTION_SPACE_GLUE_RE);
  if (subSpace?.[1] && subSpace[2]?.trim()) {
    const heading = subSpace[1].trim();
    const body = subSpace[2].trim();
    if (heading.length >= MIN_MAIN_HEADING_LEN && heading.length <= 110 && body.length >= 8) {
      return `${heading}\n${body}`;
    }
  }

  const mainThenSubNoSpace = trimmed.match(MAIN_THEN_SUBSECTION_NO_SPACE_GLUE_RE);
  if (mainThenSubNoSpace?.[1] && mainThenSubNoSpace[2]?.trim()) {
    const heading = mainThenSubNoSpace[1].trim();
    const subsection = mainThenSubNoSpace[2].trim();
    if (heading.length >= MIN_MAIN_HEADING_LEN && heading.length <= 110 && subsection.length >= 3) {
      return `${heading}\n${subsection}`;
    }
  }

  const mainThenSub = trimmed.match(MAIN_THEN_SUBSECTION_GLUE_RE);
  if (mainThenSub?.[1] && mainThenSub[2]?.trim()) {
    const heading = mainThenSub[1].trim();
    const subsection = mainThenSub[2].trim();
    if (heading.length >= MIN_MAIN_HEADING_LEN && heading.length <= 110 && subsection.length >= 8) {
      return `${heading}\n${subsection}`;
    }
  }

  const bodyCue = trimmed.match(MAIN_HEADING_BODY_CUE_RE);
  if (bodyCue?.[1] && bodyCue[2]?.trim()) {
    const heading = bodyCue[1].trim();
    const body = bodyCue[2].trim();
    if (heading.length >= MIN_MAIN_HEADING_LEN && heading.length <= 110 && body.length >= 8) {
      return `${heading}\n${body}`;
    }
  }

  const namedSub = trimmed.match(MAIN_PLUS_NAMED_SUBSECTION_GLUE_RE);
  if (namedSub?.[1] && namedSub[2] && namedSub[3]?.trim()) {
    return `${namedSub[1]}\n${namedSub[2]}\n${namedSub[3].trim()}`;
  }

  const mainPeriod = trimmed.match(MAIN_PERIOD_GLUE_RE);
  if (mainPeriod?.[1] && mainPeriod[2]?.trim() && !/^\d+\.\d/.test(mainPeriod[2])) {
    return `${mainPeriod[1]}.\n${mainPeriod[2].trim()}`;
  }

  const glued = trimmed.match(MAIN_SECTION_GLUE_RE);
  if (glued?.[1] && glued[2]?.trim()) {
    const heading = glued[1].trim();
    const body = glued[2].trim();
    if (/\b(?:and|or|of|for|the|to|with|upon|under)\s*$/i.test(heading)) {
      return line;
    }
    if (heading.length >= MIN_MAIN_HEADING_LEN && heading.length <= 110 && body.length >= 8) {
      return `${heading}\n${body}`;
    }
  }

  const slashPurpose = trimmed.match(/^(\d+\.\s+(?:[^\n]{3,88}\/\s*Purpose))\s+([A-Z][a-z].+)$/);
  if (slashPurpose?.[1] && slashPurpose[2]?.trim()) {
    return `${slashPurpose[1]}\n${slashPurpose[2].trim()}`;
  }

  return line;
}

/** Repair inline glue between sections and within long numbered lines. */
export function repairGluedSectionHeadingsInText(text: string): string {
  let t = (text || "").replace(/\r\n/g, "\n");

  t = t.replace(/([.!?])\s+(\d+\.\s+[A-Z])/g, "$1\n\n$2");
  t = t.replace(/([.!?])\s+(\d+\.\d+\s+)/g, "$1\n\n$2");
  t = t.replace(/([^\n])\s+(\d+\.\s+(?!\d+\.\d)[A-Z])/g, "$1\n\n$2");
  t = t.replace(/([a-z])(\d{1,2}\.\s+(?!\d+\.\d)[A-Z])/g, "$1\n\n$2");
  // Any title letter glued to any subsection marker: `Terms9.1`, `Liability14.2 Cap`, `Terms9.1Notices`.
  t = t.replace(
    /([A-Za-z])(\d{1,2}\.\d+(?:\.\d+)*)(?:(\s+[A-Z][A-Za-z ,&/-]+)|([A-Z][a-zA-Z][A-Za-z ,&/-]*)|(?=\s*$))/gm,
    (_m, letter: string, marker: string, spacedTitle?: string, gluedTitle?: string) => {
      if (spacedTitle) return `${letter}\n\n${marker}${spacedTitle}`;
      if (gluedTitle) return `${letter}\n\n${marker} ${gluedTitle}`;
      return `${letter}\n\n${marker}`;
    },
  );
  t = t.replace(/([A-Za-z]{2,})\.(\d+\.\d+\s+)/g, "$1\n\n$2");
  t = t.replace(/([A-Za-z]{2,})\.(\d+\.\s+(?!\d+\.\d))/g, "$1\n\n$2");
  t = t.replace(/([A-Za-z]+)\."(\d+\.\s+)/g, "$1.\"\n\n$2");
  t = t.replace(/([a-z])\.\s*(\d+\.\s+(?!\d+\.\d)[A-Z])/g, "$1.\n\n$2");

  const expandedLines: string[] = [];
  for (const line of t.split("\n")) {
    const inlineExpanded = line.replace(/([^\n])\s+(\d+\.\s+(?!\d+\.\d))/g, "$1\n$2");
    for (const part of inlineExpanded.split("\n")) {
      const split = splitGluedSectionHeadingFromLine(part);
      expandedLines.push(...split.split("\n"));
    }
  }
  t = expandedLines.join("\n");

  t = t.replace(/([.!?])\s+(\d+\.\s+[A-Z])/g, "$1\n\n$2");
  t = t.replace(/(\d+\.\s+(?!\d+\.\d)[^\n]{3,110}?)\s+(\d+\.\d+\s+)/g, "$1\n\n$2");
  t = t.replace(/(\d+\.\d+\s+[^.\n]{4,120}?\.?)\s+(\d+\.\d+\s+)/g, "$1\n\n$2");
  t = t.replace(/(\d+\.\d+\s+[^.\n]{4,120}?\.?)\s+(\d+\.\s+(?!\d+\.\d))/g, "$1\n\n$2");

  t = repairInlineLetteredEnumerationsInText(t);

  return t.replace(/\n{3,}/g, "\n\n");
}
