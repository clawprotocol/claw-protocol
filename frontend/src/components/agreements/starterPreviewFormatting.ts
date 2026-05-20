/**
 * Starter/free preview block layout — preserves semantic boundaries (no wall-of-text collapse).
 */

const NUMBERED_HEADING_LINE_RE = /^(\d+)\.\s+(.+)$/;
const MALFORMED_DOUBLE_NUM_RE = /^(\d+)\.\s+(\d+)\.\s+(.+)$/;
const BLANK_NUMBERED_LINE_RE = /^(\d+)\.\s*$/;
const ESIGN_LINE_RE = /executed electronically via lawdog/i;
const ALL_CAPS_TITLE_RE = /^[A-Z][A-Z0-9\s/&.,'-]{4,80}$/;
const INLINE_TITLE_PREAMBLE_RE = /^([A-Z][A-Z0-9\s/&.,'-]{4,72}?)\s+(This Agreement\b[\s\S]*)$/;
const INLINE_SECTION_RE = /([.!?])\s+(\d+\.\s+[A-Z])/g;

/**
 * Repair collapsed inline layout before block normalization (production blob cases).
 */
export function repairInlineCollapsedStarterLayout(text: string): string {
  let t = (text || "").replace(/\r\n/g, "\n");
  t = t.replace(INLINE_SECTION_RE, "$1\n\n$2");
  const lines = t.split("\n");
  if (lines.length > 0) {
    const m = lines[0].trim().match(INLINE_TITLE_PREAMBLE_RE);
    if (m) {
      lines.splice(0, 1, m[1].trim(), m[2].trim());
      t = lines.join("\n");
    }
  }
  return t;
}

/**
 * Repair lines like "4. 5. Termination" → "5. Termination" (drops empty leading number).
 */
export function repairMalformedSectionNumbering(text: string): { text: string; fixed: number } {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  let fixed = 0;
  const out = lines.map((line) => {
    const m = line.trim().match(MALFORMED_DOUBLE_NUM_RE);
    if (!m) return line;
    const second = parseInt(m[2], 10);
    const first = parseInt(m[1], 10);
    if (second > first && m[3].trim().length > 2) {
      fixed += 1;
      return line.replace(MALFORMED_DOUBLE_NUM_RE, `${second}. ${m[3]}`);
    }
    return line;
  });
  return { text: out.join("\n"), fixed };
}

/** Remove lines that are only "4." with no title/body following. */
export function removeDanglingNumberedHeadings(text: string): { text: string; fixed: number } {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let fixed = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (BLANK_NUMBERED_LINE_RE.test(trimmed)) {
      const next = (lines[i + 1] || "").trim();
      if (!next || NUMBERED_HEADING_LINE_RE.test(next) || BLANK_NUMBERED_LINE_RE.test(next)) {
        fixed += 1;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return { text: out.join("\n"), fixed };
}

/**
 * Ensure blank lines between title, preamble blocks, numbered headings, and e-sign footer.
 */
export function normalizeStarterPreviewBlockLayout(text: string): string {
  let t = (text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return t;

  const num = repairMalformedSectionNumbering(t);
  t = num.text;
  const dangling = removeDanglingNumberedHeadings(t);
  t = dangling.text;

  const lines = t.split("\n");
  const blocks: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    blocks.push(buf.join("\n").trim());
    buf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (ALL_CAPS_TITLE_RE.test(trimmed) && buf.length > 0) {
      flush();
    }
    const isHeading = NUMBERED_HEADING_LINE_RE.test(trimmed) && trimmed.length < 90;
    const isEsign = ESIGN_LINE_RE.test(trimmed);
    if (isHeading || isEsign) {
      flush();
      buf.push(line);
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();

  let merged = blocks.join("\n\n");
  merged = merged.replace(/\n{3,}/g, "\n\n");
  return merged.trimEnd();
}

/** Starter preview final pass: structure + numbering without collapsing intra-paragraph newlines. */
export function formatStarterPreviewForDisplay(text: string): string {
  return normalizeStarterPreviewBlockLayout(repairInlineCollapsedStarterLayout(text));
}

/** True when text has starter-style section breaks suitable for review UI. */
export function starterPreviewHasParagraphSectionBreaks(text: string): boolean {
  const t = (text || "").replace(/\r\n/g, "\n");
  return /\n\n\d+\.\s+/m.test(t) && !/\bSERVICES AGREEMENT This Agreement\b/i.test(t);
}
