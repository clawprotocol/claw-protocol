/**
 * Demote empty/orphan top-level parent shells into a coherent hierarchy.
 *
 * Generation often emits category parents with no body, then sibling top-level
 * children (`4. Fees and Payment` → `5. Subscription Fee` / `5.1…`). This pass
 * folds those children under the empty parent and renumbers subsequent sections.
 */

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;
const TOP_RE = /^(\d{1,2})\.\s+(?!\d)(.+)$/;
const SUB_RE = /^(\d{1,2})\.(\d+)\s+(.+)$/;
const EXECUTION_LINE_RE =
  /^(?:IN WITNESS WHEREOF|CLIENT\s*:|SERVICE\s+PROVIDER\s*:|\bSIGNATURES\b)/i;

export type RepairPaidProEmptyParentSectionHierarchyResult = {
  text: string;
  repairs: string[];
};

type HeadingBlock =
  | {
      kind: "top";
      num: number;
      title: string;
      headingLine: string;
      bodyLines: string[];
      children: Array<{ title: string; headingLine: string; bodyLines: string[] }>;
    }
  | { kind: "other"; lines: string[] };

const PARENT_CHILD_AFFINITY: Array<{ parent: RegExp; child: RegExp }> = [
  {
    parent: /\bservices?\b|\baccess\b/i,
    child: /\bsubscription\b|\bservices?\b|\baccess\b|\bdeliver/i,
  },
  {
    parent: /\bfees?\b|\bpayment\b|\bcompensation\b|\bconsideration\b/i,
    child: /\bsubscription\b|\binvoic|\btax|\bdisputed\b|\bfee\b|\bpayment\b/i,
  },
  {
    parent: /\bterm\b|\bcancell|\bterminat/i,
    child: /\bterm\b|\bcancell|\bterminat|\beffect of|\bcure\b|\bconvenien|\bmaterial breach/i,
  },
  {
    parent: /\bintellectual\s+property\b|\bownership\b|\bdata\b/i,
    child: /\bownership\b|\bprovider\s+ownership\b|\bintellectual\b|\blicen|\bdata\b/i,
  },
  {
    parent: /\brepresentations?\b|\bwarrant/i,
    child: /\bmutual\s+authority\b|\bauthority\b|\brepresent|\bwarrant|\bcompliance\b/i,
  },
  {
    parent: /\bsuspension\b|\bterminat|\bbreach\b/i,
    child: /\bmaterial\s+breach\b|\bsuspension\b|\bterminat|\bcure\b/i,
  },
  {
    parent: /\bgeneral\s+(?:terms|provisions?)\b|\bmiscellaneous\b/i,
    child:
      /\bindependent\b|\bassignment\b|\bforce\s+majeure\b|\bnotices?\b|\bseverab|\bentire\b|\bcounterpart/i,
  },
  {
    parent: /\bliabilit|\bindemn/i,
    child: /\bindemn|\bliabilit|\bcap\b|\bexclusion|\bthird-?party|\bdamages\b/i,
  },
];

function clean(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function titlesAffinity(parentTitle: string, childTitle: string): boolean {
  for (const rule of PARENT_CHILD_AFFINITY) {
    if (rule.parent.test(parentTitle) && rule.child.test(childTitle)) return true;
  }
  // Child title contained in parent topic, or shares a significant stem.
  const parentKey = parentTitle.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const childKey = childTitle.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  if (childKey.includes(parentKey.split(/\s+/)[0] ?? "") && parentKey.length >= 4) {
    if (/\b(fee|payment|terminat|liabilit|indemn|general|independent)\b/i.test(childTitle)) {
      return true;
    }
  }
  return false;
}

function parseBlocks(head: string): HeadingBlock[] {
  const lines = head.replace(/\r\n/g, "\n").split("\n");
  const blocks: HeadingBlock[] = [];
  let current: Extract<HeadingBlock, { kind: "top" }> | null = null;
  let other: string[] = [];

  const flushOther = () => {
    if (other.length) {
      blocks.push({ kind: "other", lines: other });
      other = [];
    }
  };
  const flushTop = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (const raw of lines) {
    const t = clean(raw);
    if (!t) {
      if (current) current.bodyLines.push(raw);
      else other.push(raw);
      continue;
    }
    if (EXECUTION_LINE_RE.test(t)) {
      flushOther();
      flushTop();
      other.push(raw);
      continue;
    }
    const top = t.match(TOP_RE);
    if (top) {
      flushOther();
      flushTop();
      current = {
        kind: "top",
        num: Number(top[1]),
        title: top[2]!.trim(),
        headingLine: raw,
        bodyLines: [],
        children: [],
      };
      continue;
    }
    const sub = t.match(SUB_RE);
    if (sub && current && Number(sub[1]) === current.num) {
      current.children.push({
        title: sub[3]!.trim(),
        headingLine: raw,
        bodyLines: [],
      });
      continue;
    }
    if (sub && current && Number(sub[1]) !== current.num) {
      // Subsection of a different major while still in this top block — treat as body.
      if (current.children.length > 0) {
        current.children[current.children.length - 1]!.bodyLines.push(raw);
      } else {
        current.bodyLines.push(raw);
      }
      continue;
    }
    if (current) {
      if (current.children.length > 0) {
        current.children[current.children.length - 1]!.bodyLines.push(raw);
      } else {
        current.bodyLines.push(raw);
      }
    } else {
      other.push(raw);
    }
  }
  flushOther();
  flushTop();
  return blocks;
}

function topBlockHasBody(block: Extract<HeadingBlock, { kind: "top" }>): boolean {
  if (block.children.length > 0) return true;
  return block.bodyLines.some((l) => clean(l).length > 0);
}

/** Short category shells ("Services", "Liability") that still splice a sibling child heading. */
function isIncompleteCategoryParentTitle(title: string): boolean {
  const words = clean(title).split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 2) return false;
  return /\b(services?|fees?|payment|term|liabilit|indemn|ownership|data|representations|suspension|breach|access)\b/i.test(
    title,
  );
}

function shouldAttemptParentChildFold(
  parent: Extract<HeadingBlock, { kind: "top" }>,
  child: Extract<HeadingBlock, { kind: "top" }>,
): boolean {
  if (!titlesAffinity(parent.title, child.title)) return false;
  if (!topBlockHasBody(parent)) return true;
  // Parent already has body but remains an incomplete category title with a spliced sibling.
  return isIncompleteCategoryParentTitle(parent.title);
}

function demoteChildIntoParent(
  parent: Extract<HeadingBlock, { kind: "top" }>,
  child: Extract<HeadingBlock, { kind: "top" }>,
): void {
  if (child.children.length === 0) {
    parent.children.push({
      title: child.title,
      headingLine: child.headingLine,
      bodyLines: [...child.bodyLines],
    });
    return;
  }

  const firstDup =
    clean(child.children[0]!.title).toLowerCase() === clean(child.title).toLowerCase();

  if (!firstDup) {
    parent.children.push({
      title: child.title,
      headingLine: child.headingLine,
      bodyLines: child.bodyLines.filter((l) => clean(l).length > 0),
    });
  } else if (child.bodyLines.some((l) => clean(l).length > 0)) {
    child.children[0] = {
      ...child.children[0]!,
      bodyLines: [
        ...child.bodyLines.filter((l) => clean(l).length > 0),
        ...child.children[0]!.bodyLines,
      ],
    };
  }

  for (const sub of child.children) {
    parent.children.push(sub);
  }
}

function renderBlocks(blocks: HeadingBlock[]): string {
  const out: string[] = [];
  let topCounter = 0;
  for (const block of blocks) {
    if (block.kind === "other") {
      out.push(...block.lines);
      continue;
    }
    topCounter += 1;
    out.push(`${topCounter}. ${block.title}`);
    for (const body of block.bodyLines) {
      if (clean(body)) out.push(body);
      else if (out[out.length - 1] !== "") out.push("");
    }
    let sub = 0;
    for (const child of block.children) {
      sub += 1;
      out.push(`${topCounter}.${sub} ${child.title}`);
      for (const body of child.bodyLines) {
        if (clean(body)) out.push(body);
        else if (out[out.length - 1] !== "") out.push("");
      }
    }
    if (out[out.length - 1] !== "") out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function repairPaidProEmptyParentSectionHierarchy(
  text: string,
): RepairPaidProEmptyParentSectionHierarchyResult {
  const repairs: string[] = [];
  const raw = (text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) return { text: raw, repairs };

  const witnessIdx = raw.search(WITNESS_RE);
  const head = witnessIdx >= 0 ? raw.slice(0, witnessIdx) : raw;
  const tail = witnessIdx >= 0 ? raw.slice(witnessIdx) : "";

  const blocks = parseBlocks(head);
  const tops = blocks.filter((b): b is Extract<HeadingBlock, { kind: "top" }> => b.kind === "top");
  if (tops.length < 2) return { text: raw, repairs };

  const next: HeadingBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i]!;
    if (block.kind !== "top") {
      next.push(block);
      i += 1;
      continue;
    }
    // Empty parents, or incomplete category shells with a spliced affinity sibling.
    const parent = {
      ...block,
      children: [...block.children],
      bodyLines: [...block.bodyLines],
    };
    let j = i + 1;
    let folded = 0;
    while (j < blocks.length) {
      const cand = blocks[j]!;
      if (cand.kind !== "top") break;
      if (!shouldAttemptParentChildFold(parent, cand) && folded === 0) break;
      if (!titlesAffinity(parent.title, cand.title) && folded > 0) break;
      demoteChildIntoParent(parent, cand);
      folded += 1;
      j += 1;
    }
    if (folded > 0) {
      repairs.push(`empty_parent_demote:${block.num}:${folded}`);
      next.push(parent);
      i = j;
      continue;
    }
    next.push(block);
    i += 1;
  }

  if (repairs.length === 0) return { text: raw, repairs };

  const mergedHead = renderBlocks(next);
  const out = tail ? `${mergedHead}\n\n${tail.trim()}` : mergedHead;
  return { text: out.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}
