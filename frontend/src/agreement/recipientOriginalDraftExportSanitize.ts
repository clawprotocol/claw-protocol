/**
 * Ensures “original / draft” PDF exports never carry compare diff markup (ins/del, redline hooks).
 * Implemented without DOM so it works in Node (Vitest `environment: "node"`) and in the browser.
 */

function stripCompareDataAttributes(html: string): string {
  let s = html;
  s = s.replace(/\s*data-redline\s*=\s*(?:"[^"]*"|'[^']*')\s*/gi, " ");
  s = s.replace(/\s*data-recipient-redline-anchor\s*=\s*(?:"[^"]*"|'[^']*')\s*/gi, " ");
  s = s.replace(/\s*data-redline(?=[\s>])/gi, "");
  s = s.replace(/\s*data-recipient-redline-anchor(?=[\s>])/gi, "");
  return s;
}

/**
 * Unwraps `<ins>` / `<del>` to plain text and strips common redline data attributes.
 */
export function stripCompareMarkupFromOriginalDraftHtml(html: string): string {
  const raw = String(html ?? "");
  if (!raw.trim()) return raw;
  let s = raw;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/<ins\b[^>]*>([\s\S]*?)<\/ins>/gi, "$1");
    s = s.replace(/<del\b[^>]*>([\s\S]*?)<\/del>/gi, "$1");
  }
  s = stripCompareDataAttributes(s);
  return s;
}
