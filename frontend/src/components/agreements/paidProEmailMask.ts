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
  // Never destroy unknown mask tokens (e.g. outer polish masks seen by an inner
  // remask/unmask cycle with an empty emails table).
  let out = text.replace(EMAIL_MASK_RE, (token, idx) => {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && emails[i] != null ? emails[i]! : token;
  });
  // Legacy unicode masks from older builds
  const LEGACY_EMAIL_RE = /\uE000PAID_PRO_EMAIL_(\d+)\uE001/g;
  out = out.replace(LEGACY_EMAIL_RE, (token, idx) => {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && emails[i] != null ? emails[i]! : token;
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
  out = out.replace(URL_MASK_RE, (token, idx) => {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && urls[i] != null ? urls[i]! : token;
  });
  const LEGACY_URL_RE = /\uE000PAID_PRO_URL_(\d+)\uE001/g;
  out = out.replace(LEGACY_URL_RE, (token, idx) => {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && urls[i] != null ? urls[i]! : token;
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

const WELL_FORMED_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const ENTITY_SUFFIX_IN_DOMAIN =
  "(?:LLC|L\\.L\\.C\\.|Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|LLP|LP)";

function wellFormedEmailSpanRe(local: string): RegExp {
  return new RegExp(`${escapeRe(local)}@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}`, "gi");
}

/** Damaged `local@Title Case Entity Inc.com` — stops at the glued TLD, not following wording. */
function corruptedEntityEmailSpanRe(local: string): RegExp {
  return new RegExp(
    `${escapeRe(local)}@[A-Z][A-Za-z0-9.'-]*(?:\\s+[A-Z][A-Za-z0-9.'-]*)*\\s*${ENTITY_SUFFIX_IN_DOMAIN}\\.?[A-Za-z]{2,}`,
    "g",
  );
}

function isWellFormedEmail(address: string): boolean {
  return WELL_FORMED_EMAIL_RE.test(address.trim());
}

function emailsByLocalPart(emails: readonly string[]): Map<string, string[]> {
  const byLocal = new Map<string, string[]>();
  for (const email of emails) {
    const local = email.split("@")[0]?.toLowerCase();
    if (!local) continue;
    const bucket = byLocal.get(local) ?? [];
    if (!bucket.some((item) => item.toLowerCase() === email.toLowerCase())) bucket.push(email);
    byLocal.set(local, bucket);
  }
  return byLocal;
}

export type RestoreExactEmailsOptions = {
  /**
   * When true, a well-formed address that is not in `emails` may be replaced only if
   * exactly one provided email shares its local part (confirmed party contact).
   * Default false: never overwrite a well-formed current address from stale intake.
   */
  enforceProvidedEmails?: boolean;
};

/**
 * Restore emails from the provided confirmed/intake list after polish.
 * Well-formed current addresses are not rewritten from a different well-formed source
 * unless `enforceProvidedEmails` is set and the local-part mapping is unique.
 */
export function restoreExactIntakeEmails(
  text: string,
  intakeEmails: readonly string[],
  opts?: RestoreExactEmailsOptions,
): { text: string; repairedCount: number } {
  const provided = intakeEmails.map((email) => String(email || "").trim()).filter(Boolean);
  let out = unmaskEmailAddresses(text, provided);
  let repairedCount = 0;
  const providedLower = new Set(provided.map((email) => email.toLowerCase()));
  const byLocal = emailsByLocalPart(provided);

  const replaceLocalSpans = (sourceEmail: string, allowWellFormed: boolean): void => {
    const local = sourceEmail.split("@")[0];
    if (!local) return;
    const peers = byLocal.get(local.toLowerCase()) ?? [];
    const uniquePeer = peers.length === 1 ? peers[0]! : null;

    const replaceSpan = (span: string, treatAsCorrupted: boolean): string => {
      if (span.toLowerCase() === sourceEmail.toLowerCase()) return span;
      if (providedLower.has(span.toLowerCase())) return span;
      if (!treatAsCorrupted && isWellFormedEmail(span) && !allowWellFormed) return span;
      if (!uniquePeer) return span;
      if (!treatAsCorrupted && !allowWellFormed) return span;
      repairedCount += 1;
      return uniquePeer;
    };

    out = out.replace(wellFormedEmailSpanRe(local), (span) => replaceSpan(span, false));
    out = out.replace(corruptedEntityEmailSpanRe(local), (span) => replaceSpan(span, true));
  };

  for (const email of provided) {
    replaceLocalSpans(email, false);
  }
  if (opts?.enforceProvidedEmails) {
    for (const email of provided) {
      replaceLocalSpans(email, true);
    }
  }

  return { text: out, repairedCount };
}
