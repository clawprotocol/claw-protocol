/** Mask / restore protected spans so party-name polish cannot corrupt emails or URLs. */

const EMAIL_ADDRESS_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const MASK_PREFIX = "\uE000PAID_PRO_EMAIL_";
const MASK_SUFFIX = "\uE001";
const URL_MASK_PREFIX = "\uE000PAID_PRO_URL_";
const URL_MASK_SUFFIX = "\uE001";

export function maskEmailAddresses(text: string): { text: string; emails: string[] } {
  const emails: string[] = [];
  const masked = text.replace(EMAIL_ADDRESS_RE, (email) => {
    const idx = emails.length;
    emails.push(email);
    return `${MASK_PREFIX}${idx}${MASK_SUFFIX}`;
  });
  return { text: masked, emails };
}

export function unmaskEmailAddresses(text: string, emails: readonly string[]): string {
  let out = text;
  for (let i = 0; i < emails.length; i++) {
    const token = `${MASK_PREFIX}${i}${MASK_SUFFIX}`;
    if (out.includes(token)) out = out.split(token).join(emails[i]);
  }
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
    return `${URL_MASK_PREFIX}${idx}${URL_MASK_SUFFIX}`;
  });
  return { text: masked, emails, urls };
}

export function unmaskProtectedSpans(
  text: string,
  emails: readonly string[],
  urls: readonly string[],
): string {
  let out = unmaskEmailAddresses(text, emails);
  for (let i = 0; i < urls.length; i++) {
    const token = `${URL_MASK_PREFIX}${i}${URL_MASK_SUFFIX}`;
    if (out.includes(token)) out = out.split(token).join(urls[i]);
  }
  return out;
}

/** True when an email domain was corrupted by legal-entity text (e.g. @Ironclad Systems Group LLCsg.com). */
export function textContainsCorruptedEntityEmail(text: string): boolean {
  return /@[A-Za-z][^@\s]{0,140}?\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|LP)\b/i.test(
    text,
  );
}
