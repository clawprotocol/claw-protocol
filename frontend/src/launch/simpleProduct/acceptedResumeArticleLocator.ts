/** Visible accepted-article candidates on /app/create resume. Inspect separately; never .or().first(). */

export const ACCEPTED_RESUME_ARTICLE_CANDIDATES = [
  { name: "simple-pro-final-review-document", selector: '[data-testid="simple-pro-final-review-document"]' },
  { name: "paid-pro-visible-document-shell", selector: '[data-testid="paid-pro-visible-document-shell"]' },
  { name: "premium-agreement-readonly-article", selector: '[data-testid="premium-agreement-readonly-article"]' },
  { name: "article-tag-preview", selector: 'article[aria-label="Agreement document preview"]' },
  { name: "role-article-preview", selector: '[role="article"][aria-label="Agreement document preview"]' },
] as const;

export type AcceptedResumeArticleCandidateSnapshot = {
  name: string;
  visible: boolean;
  text: string;
};

export function selectVisibleAcceptedResumeArticle(
  candidates: readonly AcceptedResumeArticleCandidateSnapshot[],
  partyCue: string,
): AcceptedResumeArticleCandidateSnapshot | null {
  const cue = String(partyCue || "").trim();
  if (!cue) return null;
  let best: AcceptedResumeArticleCandidateSnapshot | null = null;
  for (const candidate of candidates) {
    if (!candidate.visible) continue;
    const text = String(candidate.text || "").trim();
    if (!text.includes(cue)) continue;
    if (!best || text.length > best.text.length) best = { ...candidate, text };
  }
  return best;
}
