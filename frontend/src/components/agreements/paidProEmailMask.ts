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

function splitEmailSpan(span: string): { address: string; trailing: string } {
  const match = span.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})([:;,.]*)(.*)$/);
  if (!match) return { address: span, trailing: "" };
  if (match[3]) return { address: span, trailing: "" };
  return { address: match[1], trailing: match[2] };
}

function isCorruptedEmailSpan(span: string): boolean {
  const { address, trailing } = splitEmailSpan(span);
  if (trailing && address) {
    return /\s/.test(address) || textContainsCorruptedEntityEmail(address) || !WELL_FORMED_EMAIL_RE.test(address);
  }
  if (/\s/.test(span)) return true;
  if (textContainsCorruptedEntityEmail(span)) return true;
  return !WELL_FORMED_EMAIL_RE.test(span.trim());
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
    const spanRe = new RegExp(`${escapeRe(local)}@[^\\n\\r,;<>\\]\\]]+`, "gi");
    const next = out.replace(spanRe, (span) => {
      const { address, trailing } = splitEmailSpan(span);
      const comparable = address || span;
      if (comparable.toLowerCase() === sourceEmail.toLowerCase()) return span;
      if (providedLower.has(comparable.toLowerCase())) return span;
      const corrupted = isCorruptedEmailSpan(span);
      if (!corrupted && !allowWellFormed) return span;
      const peers = byLocal.get(local.toLowerCase()) ?? [];
      if (peers.length !== 1) return span;
      repairedCount += 1;
      return `${peers[0]!}${trailing}`;
    });
    out = next;
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
