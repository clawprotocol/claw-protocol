export type RecipientClauseSuggestionCard = {
  id: string;
  title: string;
  meaning: string;
  status: "ready" | "needs_placement";
};

function slugId(s: string, i: number): string {
  const t = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${t || "item"}-${i}`;
}

/**
 * Lightweight parse of bullet / numbered lists into cards for the clause-suggestions surface.
 */
export function buildClauseSuggestionCardsFromUploadText(
  raw: string,
  maxCards = 12,
): RecipientClauseSuggestionCard[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const cards: RecipientClauseSuggestionCard[] = [];
  let i = 0;
  while (i < lines.length && cards.length < maxCards) {
    const line = lines[i] ?? "";
    const m = /^\s*(?:[-*•]|\d+[\.)])\s+(.+)$/.exec(line);
    if (m) {
      const title = (m[1] ?? "").trim();
      if (title.length >= 3 && title.length <= 120) {
        let meaning = "";
        let j = i + 1;
        while (j < lines.length && j < i + 4) {
          const next = (lines[j] ?? "").trim();
          if (!next) break;
          if (/^\s*(?:[-*•]|\d+[\.)])\s+/.test(lines[j] ?? "")) break;
          meaning = meaning ? `${meaning} ${next}` : next;
          j++;
        }
        if (!meaning) meaning = "Suggested change for the owner to review.";
        const needs =
          /\b(boilerplate|signature|legal\s+review|entire\s+agreement|rewrite)\b/i.test(meaning + title) ||
          title.length > 80;
        cards.push({
          id: slugId(title, cards.length),
          title: title.length > 72 ? `${title.slice(0, 69)}…` : title,
          meaning: meaning.length > 220 ? `${meaning.slice(0, 217)}…` : meaning,
          status: needs ? "needs_placement" : "ready",
        });
        i = j > i + 1 ? j : i + 1;
        continue;
      }
    }
    i++;
  }
  if (cards.length === 0 && raw.trim().length > 20) {
    const t = raw.trim().split(/\n\n+/)[0] ?? raw.trim();
    const title = t.length > 64 ? `${t.slice(0, 61)}…` : t;
    cards.push({
      id: slugId(title, 0),
      title: "Suggested change",
      meaning: raw.trim().length > 240 ? `${raw.trim().slice(0, 237)}…` : raw.trim(),
      status: "needs_placement",
    });
  }
  return cards;
}
