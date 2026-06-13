/**
 * Split glued numbered section / subsection headings from body text on one line.
 * Shared by free starter preview and paid Pro display normalization.
 */

const MAIN_PLUS_NAMED_SUBSECTION_GLUE_RE =
  /^(\d+\.\s+(?!\d+\.\d)(?:[^\n.]{3,90}?))\s+((?:[A-Z][a-zA-Z]+(?:\s+(?:and|of|for|the|to|on|in|or|by|at|from|upon|with)\s+)*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\.)\s+((?:Either|The|Upon|If|When|Each|Any|Neither|One|Both|Client|Service\s+Provider|Unless|Notwithstanding|During|Within|After|Before).+)/;

/** Body sentence starters that follow a glued heading title (not part of the title). */
const GLUED_BODY_SENTENCE_START =
  "(?:AI|The|This|Each|Either|Upon|Unless|If\\s|When|Where|As\\s|An\\s|A\\s|In\\s|For\\s|Client|Provider|Service\\s+Provider|Fixed|Payment|Termination|Both|All|Any|Neither|Notwithstanding|During|Within|After|Before|Red\\s|Mile|Harbor|Process|Not\\s|No\\s|One\\s|Party\\s|Neither\\s+party)";

const MAIN_SECTION_GLUE_RE = new RegExp(
  `^(\\d+\\.\\s+(?!\\d+\\.\\d).+?)\\s+(${GLUED_BODY_SENTENCE_START}\\b.+)`,
  "s",
);

const SUBSECTION_PERIOD_GLUE_RE = /^(\d+\.\d+(?:\.\d+)*\s+[^.\n]{3,120}?)\.\s+(.+)$/s;
const MAIN_PERIOD_GLUE_RE = /^(\d+\.\s+(?!\d+\.\d)[^.\n]{3,120}?)\.\s+([A-Z].+)$/s;

/** Split one line when a numbered heading and body sentence are glued together. */
export function splitGluedSectionHeadingFromLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 24 || !/^\d+\./.test(trimmed)) return line;

  const subPeriod = trimmed.match(SUBSECTION_PERIOD_GLUE_RE);
  if (subPeriod?.[1] && subPeriod[2]?.trim()) {
    return `${subPeriod[1]}.\n${subPeriod[2].trim()}`;
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
    if (heading.length >= 8 && heading.length <= 110 && body.length >= 8) {
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

  return t.replace(/\n{3,}/g, "\n\n");
}
