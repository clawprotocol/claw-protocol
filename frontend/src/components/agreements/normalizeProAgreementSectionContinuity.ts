/**
 * Repair numbered section continuity after canonical dedupe — no gaps (1, 2.1, 5.1 without 2–4).
 */

const TOP_LEVEL_RE = /^(\d+)\.\s+(?!\d)(.+)$/;
const SUB_LEVEL_RE = /^(\d+)\.(\d+)\.?\s+(.+)$/;
const BARE_SUB_RE = /^(\d+)\.(\d+)\.?\s*$/;
const ALL_CAPS_HEADING_RE = /^[A-Z][A-Z0-9\s/&-]{4,}$/;

export type SectionContinuityResult = {
  text: string;
  repairs: string[];
};

type ParsedBlock = {
  lines: string[];
  topNum: number | null;
  subNum: number | null;
  heading: string;
  headingKey: string;
};

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function headingKey(heading: string): string {
  const topic = cleanLine(heading)
    .split(/[.;]/)[0]
    ?.replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
  const first = topic.match(/^([a-z][a-z\s-]{0,40})/)?.[1]?.trim() ?? topic;
  return first.replace(/\s+/g, " ").trim();
}

function isWitnessOrExecutionLine(line: string): boolean {
  return /\b(?:IN WITNESS WHEREOF|EXECUTION\s*[—-]\s*SIGNATURES?|^\s*SIGNATURES?\s*:?\s*$)/i.test(line);
}

function parseBlocks(body: string): { preamble: string[]; blocks: ParsedBlock[] } {
  const lines = body.split("\n");
  const preamble: string[] = [];
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock | null = null;

  const flush = () => {
    if (current && current.lines.length > 0) blocks.push(current);
    current = null;
  };

  for (const raw of lines) {
    const t = cleanLine(raw);
    if (!t) {
      if (current) current.lines.push(raw);
      else preamble.push(raw);
      continue;
    }
    if (isWitnessOrExecutionLine(t)) {
      flush();
      blocks.push({
        lines: [raw],
        topNum: null,
        subNum: null,
        heading: t,
        headingKey: "__execution__",
      });
      continue;
    }

    const bareSub = t.match(BARE_SUB_RE);
    if (bareSub) {
      flush();
      current = {
        lines: [raw],
        topNum: Number(bareSub[1]),
        subNum: Number(bareSub[2]),
        heading: "",
        headingKey: "",
      };
      continue;
    }

    const sub = t.match(SUB_LEVEL_RE);
    if (sub) {
      flush();
      current = {
        lines: [raw],
        topNum: Number(sub[1]),
        subNum: Number(sub[2]),
        heading: sub[3]!.trim(),
        headingKey: headingKey(sub[3]!),
      };
      continue;
    }

    const top = t.match(TOP_LEVEL_RE);
    if (top) {
      flush();
      current = {
        lines: [raw],
        topNum: Number(top[1]),
        subNum: null,
        heading: top[2]!.trim(),
        headingKey: headingKey(top[2]!),
      };
      continue;
    }

    if (ALL_CAPS_HEADING_RE.test(t) && t.length < 80) {
      flush();
      current = {
        lines: [raw],
        topNum: null,
        subNum: null,
        heading: t,
        headingKey: headingKey(t),
      };
      continue;
    }

    if (current) current.lines.push(raw);
    else preamble.push(raw);
  }
  flush();
  return { preamble, blocks };
}

function dedupeBlocks(blocks: ParsedBlock[], repairs: string[]): ParsedBlock[] {
  const out: ParsedBlock[] = [];
  const seen = new Map<string, number>();

  for (const block of blocks) {
    if (block.headingKey === "__execution__") {
      const existingIdx = out.findIndex((b) => b.headingKey === "__execution__");
      if (existingIdx >= 0) {
        const prev = out[existingIdx]!;
        const mergedLines = [...prev.lines];
        if (block.lines.length > 0) {
          if (mergedLines.length > 0) mergedLines.push("");
          mergedLines.push(...block.lines);
        }
        out[existingIdx] = { ...prev, lines: mergedLines };
        repairs.push("section_dedupe_execution_merged");
        continue;
      }
      out.push(block);
      continue;
    }
    const key = block.subNum != null ? `${block.headingKey}::sub` : `${block.headingKey}::top`;
    const prevIdx = seen.get(key);
    if (prevIdx == null) {
      seen.set(key, out.length);
      out.push(block);
      continue;
    }
    const prev = out[prevIdx]!;
    const prevBody = prev.lines.join("\n").length;
    const nextBody = block.lines.join("\n").length;
    if (nextBody > prevBody) {
      repairs.push(`section_dedupe:${key}`);
      out[prevIdx] = block;
    } else {
      repairs.push(`section_dedupe_removed:${key}`);
    }
  }
  return out;
}

function inferTopHeading(block: ParsedBlock): string {
  const h = block.heading.trim();
  const bodySample = block.lines.slice(1).join(" ").toLowerCase();
  const probe = `${block.headingKey} ${bodySample}`;
  if (h.length >= 3 && !/^\d+\.\d+/.test(h)) return h;
  if (/confidential/i.test(probe)) return "Confidentiality";
  if (/payment|fee|compensation|consideration|\$[\d,]+/i.test(probe)) return "Payment Terms";
  if (/terminat/i.test(probe)) return "Term and Termination";
  if (/govern|law|jurisdiction|texas|delaware/i.test(probe)) return "Governing Law";
  if (/scope|service|deliverable|workflow/i.test(probe)) return "Scope of Services";
  if (/notice/i.test(probe)) return "Notices";
  if (/indemn/i.test(probe)) return "Indemnification";
  if (/liabilit/i.test(probe)) return "Limitation of Liability";
  if (/dispute|arbitrat/i.test(probe)) return "Disputes";
  if (/entire|miscellaneous|electronic\s+sign/i.test(probe)) return "Miscellaneous";
  return "General Terms";
}

function pushBodyLines(outLines: string[], bodyLines: readonly string[]): void {
  for (const line of bodyLines) {
    const t = cleanLine(line);
    if (!t || TOP_LEVEL_RE.test(t) || SUB_LEVEL_RE.test(t)) continue;
    outLines.push(line);
  }
}

function renumberBlocks(blocks: ParsedBlock[], repairs: string[]): string[] {
  const outLines: string[] = [];
  let topCounter = 0;
  let subCounter = 0;
  let lastSubGroupTop: number | null = null;

  for (const block of blocks) {
    if (block.headingKey === "__execution__") {
      outLines.push(...block.lines);
      continue;
    }

    const title = (block.heading || inferTopHeading(block)).replace(/\.+$/, "").trim();

    if (block.subNum != null) {
      const groupTop = block.topNum ?? topCounter + 1;
      if (lastSubGroupTop !== groupTop) {
        topCounter += 1;
        subCounter = 0;
        lastSubGroupTop = groupTop;
        const parentTitle = inferTopHeading(block);
        outLines.push(`${topCounter}. ${parentTitle}`);
        repairs.push("section_renumber:parent_heading_for_sub_group");
      }
      subCounter += 1;
      const subTitle = title.length >= 2 ? title : inferTopHeading(block);
      outLines.push(`${topCounter}.${subCounter} ${subTitle}`);
      pushBodyLines(outLines, block.lines.slice(1));
      continue;
    }

    topCounter += 1;
    subCounter = 0;
    lastSubGroupTop = null;
    outLines.push(`${topCounter}. ${title}`);
    pushBodyLines(outLines, block.lines.slice(1));
  }

  if (topCounter > 0) repairs.push(`section_renumber:tops=${topCounter}`);
  return outLines;
}

/**
 * Normalize section numbering after dedupe/canonicalization.
 * - Deduplicates repeated top-level sections with the same heading key
 * - Renumbers top-level sections 1..N sequentially
 * - Renumbers subsections N.1, N.2 under their parent
 * - Attaches orphan subsections to the nearest parent or creates a parent heading
 */
export function normalizeProAgreementSectionContinuity(text: string): SectionContinuityResult {
  const repairs: string[] = [];
  const raw = (text || "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return { text: raw, repairs };

  const witnessIdx = raw.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? raw.slice(0, witnessIdx) : raw;
  const tail = witnessIdx >= 0 ? raw.slice(witnessIdx) : "";

  const { preamble, blocks } = parseBlocks(head);
  if (blocks.length === 0) return { text: raw, repairs };

  const deduped = dedupeBlocks(blocks, repairs);
  const bodyLines = renumberBlocks(deduped, repairs);
  const merged = [...preamble, ...bodyLines].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const out = tail ? `${merged}\n\n${tail.trim()}` : merged;
  return { text: out.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}
