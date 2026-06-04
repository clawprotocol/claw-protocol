/** Extract Name:/Title: lines from a party signature block in plain corpus text. */

export function extractExecutionBlockSignerLines(
  corpus: string,
  partyIndex: number,
): { nameLine: string; titleLine: string } {
  const headingRe =
    partyIndex === 0
      ? /CLIENT\s*:/i
      : partyIndex === 1
        ? /SERVICE\s+PROVIDER\s*:/i
        : new RegExp(`PARTY\\s+${partyIndex + 1}\\s*:`, "i");
  const idx = corpus.search(headingRe);
  if (idx < 0) return { nameLine: "", titleLine: "" };
  const tail = corpus.slice(idx, idx + 1600);
  const nameMatch = tail.match(/\nName:\s*([^\n]*)/i);
  const titleMatch = tail.match(/\nTitle:\s*([^\n]*)/i);
  return {
    nameLine: (nameMatch?.[1] ?? "").trim(),
    titleLine: (titleMatch?.[1] ?? "").trim(),
  };
}
