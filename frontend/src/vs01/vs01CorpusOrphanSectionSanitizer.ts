/**
 * Remove standalone section-number lines (e.g. "12.") from VS01 render corpora.
 * Does not renumber sections or alter valid headings like "12. Governing Law".
 */

/** Standalone top-level section number with no title/body, e.g. "12." */
export function isOrphanStandaloneTopLevelSectionNumberLine(line: string): boolean {
  return /^\d+\.\s*$/.test(line.trim());
}

/** Standalone empty subsection marker, e.g. "12.1" or "12.1." */
export function isOrphanStandaloneSubsectionNumberLine(line: string): boolean {
  return /^\d+\.\d+\.?\s*$/.test(line.trim());
}

export function isOrphanStandaloneSectionNumberLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return (
    isOrphanStandaloneTopLevelSectionNumberLine(t) || isOrphanStandaloneSubsectionNumberLine(t)
  );
}

export function logVs01OrphanSectionNumberRemoved(payload: {
  line: string;
  boundary: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-orphan-section-number-removed]", payload);
}

/**
 * Strip orphan standalone section-number lines from corpus text before VS01 pagination/render.
 */
export function sanitizeVs01RenderCorpus(
  text: string,
  opts?: { boundary?: string },
): { text: string; removedLines: string[] } {
  const boundary = opts?.boundary ?? "vs01_render";
  const removedLines: string[] = [];
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (isOrphanStandaloneSectionNumberLine(line)) {
      removedLines.push(line.trim());
      logVs01OrphanSectionNumberRemoved({ line: line.trim(), boundary });
      continue;
    }
    out.push(line);
  }
  const joined = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return { text: joined, removedLines };
}
