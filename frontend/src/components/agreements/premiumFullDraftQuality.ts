const SECTION_SIGNALS = [
  /\bterminat/i,
  /\bconfident/i,
  /\bindemn/i,
  /\b(?:governing|choice\s+of)\s+law|law\s+of\s+the/i,
  /\b(?:fees?|compensation|payment|invoic)/i,
  /\b(?:scope|deliverable|services)\b/i,
  /\b(?:dispute|arbitrat|mediat|jurisdiction|venue)\b/i,
  /\b(?:entire\s+agreement|counterpart|electronic\s+sign)/i,
  /\b(?:liabilit|limitation)\b/i,
  /\b(?:notices?|notice\s+address)\b/i,
];

/**
 * Reject too-thin or outline-like "full draft" so we always fall back to the legacy premium section builder.
 */
export function isAcceptablePremiumFullDocumentText(text: string | null | undefined): boolean {
  const t = (text || "").replace(/\r\n/g, "\n").trim();
  if (t.length < 1600) return false;
  let hits = 0;
  for (const re of SECTION_SIGNALS) {
    if (re.test(t)) hits += 1;
  }
  if (hits < 5) return false;
  if (!/\b(?:whereas|recital|1\.|article\s+1|section\s+1)\b/i.test(t) && t.split("\n\n").length < 6) {
    return t.length >= 5000;
  }
  return true;
}
