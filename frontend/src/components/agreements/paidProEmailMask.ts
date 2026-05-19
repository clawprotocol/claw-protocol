/** Mask / restore protected spans so party-name polish cannot corrupt emails or URLs. */

const EMAIL_ADDRESS_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
/** ASCII bracket tokens — avoid \\w-friendly underscores in legacy unicode masks. */
const EMAIL_MASK_RE = /\[\[LDG_EMAIL_(\d+)\]\]/g;
const URL_MASK_RE = /\[\[LDG_URL_(\d+)\]\]/g;

export function maskEmailAddresses(text: string): { text: string; emails: string[] } {
  const emails: string[] = [];
  const masked = text.replace(EMAIL_ADDRESS_RE, (email) => {
    const idx = emails.length;
    emails.push(email);
    return `[[LDG_EMAIL_${idx}]]`;
  });
  return { text: masked, emails };
}

export function unmaskEmailAddresses(text: string, emails: readonly string[]): string {
  let out = text.replace(EMAIL_MASK_RE, (_, idx) => {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && emails[i] != null ? emails[i] : "";
  });
  // Legacy unicode masks from older builds
  const LEGACY_EMAIL_RE = /\uE000PAID_PRO_EMAIL_(\d+)\uE001/g;
  out = out.replace(LEGACY_EMAIL_RE, (_, idx) => {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && emails[i] != null ? emails[i] : "";
  });
  return out;
}

export type ProtectedSpanMask = {
  text: string;
  emails: string[];
  urls: string[];
};

export function maskProtectedSpans(text: string): ProtectedSpanMask {
  const { text: emailMasked, emails } = maskEmailAddresses(text);
  const urls: string[] = [];
  const masked = emailMasked.replace(URL_RE, (url) => {
    const idx = urls.length;
    urls.push(url);
    return `[[LDG_URL_${idx}]]`;
  });
  return { text: masked, emails, urls };
}

export function unmaskProtectedSpans(
  text: string,
  emails: readonly string[],
  urls: readonly string[],
): string {
  let out = unmaskEmailAddresses(text, emails);
  out = out.replace(URL_MASK_RE, (_, idx) => {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && urls[i] != null ? urls[i] : "";
  });
  const LEGACY_URL_RE = /\uE000PAID_PRO_URL_(\d+)\uE001/g;
  out = out.replace(LEGACY_URL_RE, (_, idx) => {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && urls[i] != null ? urls[i] : "";
  });
  return out;
}

/** True when an email domain was corrupted by legal-entity text (e.g. @Ironclad Systems Group LLCsg.com). */
export function textContainsCorruptedEntityEmail(text: string): boolean {
  return /@[A-Za-z][^@\s]{0,140}?\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|LP)\b/i.test(
    text,
  );
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Force exact intake emails back into the document after polish (byte-for-byte when possible).
 */
export function restoreExactIntakeEmails(
  text: string,
  intakeEmails: readonly string[],
): { text: string; repairedCount: number } {
  let out = unmaskEmailAddresses(text, intakeEmails);
  let repairedCount = 0;

  for (const email of intakeEmails) {
    if (!email) continue;
    if (out.includes(email)) continue;
    const local = email.split("@")[0];
    if (!local) continue;
    const corruptRe = new RegExp(`${escapeRe(local)}@[^\\n\\r,;<>\\]\\]]+`, "gi");
    const next = out.replace(corruptRe, email);
    if (next !== out) {
      out = next;
      repairedCount += 1;
    }
  }

  return { text: out, repairedCount };
}
