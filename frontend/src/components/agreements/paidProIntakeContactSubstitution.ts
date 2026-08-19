/**
 * Deterministic intake contact extraction and paid-Pro [EMAIL_N] substitution.
 * Runs before placeholder gates so user-visible Pro bodies show real emails, not stubs.
 */

import {
  isNumberedSignatureContactToken,
  isOperativeSignatureContactMisuse,
  normalizePlaceholderToken,
  parseSignatureContactSlot,
} from "./agreementTemplatePlaceholderSafety";
import { isPartyMetadataLabelValue } from "./intakeSectionLabels";
import { parseAllStructuredPartyContactBlocks } from "./labeledPartyBlockParse";
import { looksLikeStackedPartyLegalEntityLine } from "./starterPartyIdentityIsolation";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

const CONTACT_EMAIL_ANYWHERE_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const LEGAL_ENTITY_SUFFIX_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|P\.C\.|Company)\b/i;
// A street-style address tail: a 1–6 digit street number, then capitalized street/city/state/zip.
const STREET_ADDRESS_TAIL_RE = /\d{1,6}\s+\p{Lu}[\s\S]*$/u;

export type IntakeContactRecord = {
  name: string;
  title: string;
  companyHint: string;
  email: string;
  line: string;
};

const NUMBERED_EMAIL_BRACKET_RE =
  /\[\s*(?:(?:SIGNER|PARTY|CONTACT)_)?EMAIL(?:_\d+)?\s*\]/gi;

const CONTACT_SECTION_CONTEXT_RE =
  /\b(?:key contacts?|contact information|signatory information|authorized representatives?|notice contacts?|signature information)\b/i;

function pushUniqueEmail(out: string[], seen: Set<string>, email: string) {
  const e = email.trim();
  if (!e) return;
  const low = e.toLowerCase();
  if (seen.has(low)) return;
  seen.add(low);
  out.push(e);
}

/** Ordered contacts from intake bullets; falls back to standalone emails in document order. */
export function extractIntakeContacts(intakeRaw: string | null | undefined): IntakeContactRecord[] {
  const raw = String(intakeRaw || "");
  if (!raw.trim()) return [];
  const records: IntakeContactRecord[] = [];
  const seenEmails = new Set<string>();

  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const emailM = trimmed.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*$/);
    if (!emailM) continue;
    const email = emailM[1].trim();
    const low = email.toLowerCase();
    if (seenEmails.has(low)) continue;
    seenEmails.add(low);
    const beforeEmail = trimmed
      .slice(0, trimmed.lastIndexOf(email))
      .replace(/^\s*[*•\-]\s*/, "")
      .replace(/^(?:signer\s+)?email\s*:\s*/i, "")
      .trim();
    const segments = beforeEmail.split(/\s*[—–-]\s*/).map((s) => s.replace(/\s+/g, " ").trim());
    const name = segments[0] || "";
    const title = segments[1] || "";
    const companyHint = segments[2] || segments[1]?.replace(/^.*\bat\s+/i, "").trim() || "";
    if (isPartyMetadataLabelValue(name)) {
      records.push({ name: "", title: "", companyHint: "", email, line: trimmed.slice(0, 200) });
      continue;
    }
    records.push({
      name,
      title,
      companyHint,
      email,
      line: trimmed.slice(0, 200),
    });
  }

  if (records.length === 0) {
    const emails: string[] = [];
    const seen = new Set<string>();
    for (const em of raw.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) {
      pushUniqueEmail(emails, seen, em[0]);
    }
    for (const email of emails) {
      records.push({ name: "", title: "", companyHint: "", email, line: email });
    }
  }

  return records;
}

export function extractIntakeEmailsOrdered(intakeRaw: string | null | undefined): string[] {
  return extractIntakeContacts(intakeRaw).map((c) => c.email).filter(Boolean);
}

export function resolveIntakeEmailForContactSlot(
  intakeRaw: string | null | undefined,
  slot: number | null,
): string | null {
  if (!slot || slot < 1) return null;
  const emails = extractIntakeEmailsOrdered(intakeRaw);
  return emails[slot - 1] ?? null;
}

/** Intake email first; signer-metadata authority fills numbered slots when intake lacks them. */
export function resolveAuthoritativeEmailForContactSlot(
  slot: number | null,
  intakeRaw: string | null | undefined,
  parties?: readonly PaidProSignerMetadataParty[],
): string | null {
  const fromIntake = resolveIntakeEmailForContactSlot(intakeRaw, slot);
  if (fromIntake) return fromIntake;
  if (!slot || slot < 1 || !parties?.length) return null;
  const email = parties[slot - 1]?.signerEmail?.trim() ?? "";
  return email || null;
}

/**
 * TEST565 — ordered addresses from the colon-inline party-contact shape the production Redwood
 * prompt actually uses: `Legal Entity[, a Texas LLC]: Signer Name, Title, email@x.com, 123 Main St,...`.
 * `parseAllStructuredPartyContactBlocks` only handles `Party N` headers and em-dash entity-inline
 * lines, so it returned zero blocks for this shape and every `[ADDRESS_N]` survived (TEST564 unit
 * used labeled `Party N` blocks, which masked the gap). Address = the remainder after the email on
 * an entity-prefixed line; an empty string is pushed when a party line lists no trailing address so
 * slot alignment (address[slot-1]) is preserved.
 */
/**
 * TEST566 — address tail from a role-header *entity* line where the address is inline with the
 * entity/form and the email lives on a separate `Authorized signer:` line, e.g.:
 *   `Redwood Biologics, Inc., a Delaware corporation, 710 Discovery Parkway, Raleigh, NC 27609.`
 * The address begins at the first street number *after* the legal-form suffix (so a number inside the
 * entity name never wins). Returns "" when the line carries no street-style address tail.
 */
function addressTailFromEntityLine(line: string): string {
  const suffix = line.match(LEGAL_ENTITY_SUFFIX_RE);
  const rest = suffix?.index != null ? line.slice(suffix.index + suffix[0].length) : line;
  const addr = rest.match(STREET_ADDRESS_TAIL_RE);
  if (!addr) return "";
  return addr[0].replace(/[.\s]+$/, "").replace(/\s+/g, " ").trim();
}

/**
 * TEST565/566 — ordered addresses from the two production intake shapes that `parseAllStructuredParty
 * ContactBlocks` does not parse:
 *   A) colon-inline (TEST565): `Legal Entity[, a Texas LLC]: Signer, Title, email@x.com, 123 Main St,…`
 *      → address is the remainder after the email.
 *   B) role-header multiline (TEST566): a `Client:` / `Lead Provider:` header line, then an entity line
 *      `Entity, a Delaware corporation, 710 Discovery Parkway, Raleigh, NC 27609.`, then `Authorized
 *      signer: Name, Title, email`. → address is the street-tail on the entity line (no email on it).
 * One entry is pushed per detected party line, in document order, to preserve slot alignment
 * (address[slot-1]). This was the live TEST566 defect: the role-header shape yielded zero structured
 * blocks, so every `[ADDRESS_N]` survived to the boundary/placeholder gate.
 */
function extractInlineContactAddressesOrdered(intakeRaw: string): string[] {
  const out: string[] = [];
  for (const rawLine of intakeRaw.split(/\n/)) {
    const line = rawLine.replace(/^\s*[*•\u2022-]\s*/, "").trim();
    if (!line) continue;

    // Shape A — colon-inline `Entity[, form]: … email … , address`.
    const colon = line.indexOf(":");
    if (colon >= 2) {
      const prefix = line.slice(0, colon).trim();
      const tail = line.slice(colon + 1).trim();
      const entityHead = prefix.split(/,\s*(?:an?\s+)?/)[0] ?? prefix;
      if (tail && looksLikeStackedPartyLegalEntityLine(entityHead)) {
        const emailM = tail.match(CONTACT_EMAIL_ANYWHERE_RE);
        if (emailM && emailM.index != null) {
          out.push(
            tail
              .slice(emailM.index + emailM[0].length)
              .replace(/^\s*,\s*/, "")
              .trim(),
          );
          continue;
        }
      }
    }

    // Shape B — role-header entity line carrying the address inline (no email on this line). The
    // email-free guard skips both colon-inline lines (handled above) and the multi-entity "between …
    // parties" enumeration (which has legal suffixes but no street-tail → produces "" → not pushed).
    if (LEGAL_ENTITY_SUFFIX_RE.test(line) && !CONTACT_EMAIL_ANYWHERE_RE.test(line)) {
      const addr = addressTailFromEntityLine(line);
      if (addr) out.push(addr);
    }
  }
  return out;
}

/**
 * TEST564/565/566 — ordered party addresses from the intake. Structured party/contact blocks
 * (labeled `Party N`, entity-header, em-dash entity-inline) win when present; otherwise fall back to
 * the colon-inline (TEST565) and role-header entity-line (TEST566) production shapes. This is the
 * address source the render-token resolver uses to recover `[ADDRESS_N]` slots when the party
 * authority carries no `partyAddress`.
 */
export function extractIntakeAddressesOrdered(intakeRaw: string | null | undefined): string[] {
  const raw = String(intakeRaw || "");
  const structured = parseAllStructuredPartyContactBlocks(raw).map((b) => b.address.trim());
  if (structured.some((a) => a.length > 0)) return structured;
  return extractInlineContactAddressesOrdered(raw);
}

/**
 * TEST564 — resolve a numbered `[ADDRESS_N]` slot to a real address. Signer-metadata authority
 * `partyAddress` wins; otherwise fall back to the intake-listed address for that slot. Mirrors
 * `resolveAuthoritativeEmailForContactSlot` so ADDRESS tokens are no longer the *only* numbered
 * contact family without an intake fallback (the live TEST564 `document_boundary_blocked:
 * unresolved_render_tokens:[ADDRESS_1]|[ADDRESS_2]|[ADDRESS_5]` — the intake listed every address,
 * but the resolver only consulted `partyAddress`, which was empty for those slots).
 */
export function resolveAuthoritativeAddressForContactSlot(
  slot: number | null,
  intakeRaw: string | null | undefined,
  parties?: readonly PaidProSignerMetadataParty[],
): string | null {
  if (!slot || slot < 1) return null;
  const fromParty = parties?.[slot - 1]?.partyAddress?.trim() ?? "";
  if (fromParty) return fromParty;
  const fromIntake = extractIntakeAddressesOrdered(intakeRaw)[slot - 1]?.trim() ?? "";
  return fromIntake || null;
}

export function isSignatureOrContactContext(text: string, index: number): boolean {
  const window = text.slice(Math.max(0, index - 700), Math.min(text.length, index + 500));
  if (CONTACT_SECTION_CONTEXT_RE.test(window)) return true;
  return false;
}

function isEmailNumberedToken(token: string): boolean {
  const n = normalizePlaceholderToken(token);
  return /^(?:(?:SIGNER|PARTY|CONTACT)_EMAIL(?:_\d+)?|EMAIL_\d+)$/i.test(n);
}

export function logPaidProContactSubstitution(payload: {
  surface: string;
  replacedEmailCount: number;
  unresolvedEmailTokens: string[];
  intakeContactCount: number;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-contact-substitution]", payload);
}

/**
 * TEST566 — address-substitution diagnostic (parallel to `[paid-pro-contact-substitution]` for email).
 * Surfaces why `[ADDRESS_N]` survives: how many addresses the intake yielded, how many tokens resolved,
 * which stayed unresolved, and per-slot availability. Suppressed in tests; emitted in live QA.
 */
export function logPaidProAddressSubstitution(payload: {
  surface: string;
  intakeAddressCount: number;
  resolvedAddressTokenCount: number;
  unresolvedAddressTokens: string[];
  perSlotAddressAvailable: boolean[];
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-address-substitution]", payload);
}

export type PaidProContactSubstitutionResult = {
  text: string;
  replacedEmailCount: number;
  unresolvedEmailTokens: string[];
  intakeContactCount: number;
};

/**
 * Replace numbered email placeholders with intake emails when available.
 * Operative misuse (notices/payment without email) is left untouched for fatal gating.
 */
export function substitutePaidProIntakeContactPlaceholders(
  text: string,
  intakeRaw: string | null | undefined,
  opts?: { surface?: string; authorityParties?: readonly PaidProSignerMetadataParty[] },
): PaidProContactSubstitutionResult {
  const contacts = extractIntakeContacts(intakeRaw);
  const intakeContactCount = contacts.length;
  const authorityParties = opts?.authorityParties;
  let replacedEmailCount = 0;
  const unresolvedEmailTokens: string[] = [];
  const surface = opts?.surface ?? "unknown";

  const out = text.replace(NUMBERED_EMAIL_BRACKET_RE, (match, offset) => {
    const idx = typeof offset === "number" ? offset : text.indexOf(match);
    if (idx < 0 || !isEmailNumberedToken(match)) return match;
    // Operative notice/payment email slots must stay unresolved for fatal gating — never
    // hydrate them from intake even when a contact email is available.
    if (isOperativeSignatureContactMisuse(match, text, idx)) return match;
    const slot = parseSignatureContactSlot(match);
    const resolved = resolveAuthoritativeEmailForContactSlot(slot, intakeRaw, authorityParties);
    if (resolved) {
      replacedEmailCount += 1;
      return resolved;
    }

    if (isSignatureOrContactContext(text, idx) || isNumberedSignatureContactToken(match)) {
      if (!unresolvedEmailTokens.includes(match)) unresolvedEmailTokens.push(match);
      return "_________________________";
    }

    if (!unresolvedEmailTokens.includes(match)) unresolvedEmailTokens.push(match);
    return match;
  });

  if (replacedEmailCount > 0 || unresolvedEmailTokens.length > 0) {
    logPaidProContactSubstitution({
      surface,
      replacedEmailCount,
      unresolvedEmailTokens: unresolvedEmailTokens.slice(0, 12),
      intakeContactCount,
    });
  }

  return { text: out, replacedEmailCount, unresolvedEmailTokens, intakeContactCount };
}
