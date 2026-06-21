/**
 * Professional Output Integrity — render-authority recovery for user-visible surfaces.
 *
 * When authoritative contact data exists, downstream layers must not leave numbered
 * placeholders ([EMAIL_1], etc.) in review, signing, export, or delivery output.
 */

import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  FORBIDDEN_CONTACT_PLACEHOLDER_RENDER_RE,
  FORBIDDEN_TEMPLATE_VARIABLE_RENDER_RE,
} from "./legalPartyIdentityAuthority";
import {
  extractIntakeEmailsOrdered,
  resolveAuthoritativeEmailForContactSlot,
  substitutePaidProIntakeContactPlaceholders,
} from "./paidProIntakeContactSubstitution";
import { parseSignatureContactSlot } from "./agreementTemplatePlaceholderSafety";
import { repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { restoreExactIntakeEmails } from "./paidProEmailMask";

const NUMBERED_EMAIL_BRACKET_RE =
  /\[\s*(?:(?:SIGNER|PARTY|CONTACT)_)?EMAIL(?:_\d+)?\s*\]/gi;

const DEGRADED_LITERAL_RE =
  /\b(?:TBD|UNKNOWN|PLACEHOLDER|PARTY[_\s-]?[AB])\b/i;

export const USER_VISIBLE_PLACEHOLDER_RE = new RegExp(
  `${FORBIDDEN_CONTACT_PLACEHOLDER_RENDER_RE.source}|${FORBIDDEN_TEMPLATE_VARIABLE_RENDER_RE.source}|${DEGRADED_LITERAL_RE.source}`,
  "i",
);

export function containsUserVisiblePlaceholders(text: string): boolean {
  return USER_VISIBLE_PLACEHOLDER_RE.test(text || "");
}

export { resolveAuthoritativeEmailForContactSlot } from "./paidProIntakeContactSubstitution";

/** Replace numbered email placeholders using intake + signer-metadata authority. */
export function hydrateUserVisibleContactPlaceholders(
  text: string,
  intakeRaw: string | null | undefined,
  parties?: readonly PaidProSignerMetadataParty[],
  surface = "professional_output_integrity",
): { text: string; repairs: string[]; replacedCount: number } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");
  let replacedCount = 0;

  if (containsUserVisiblePlaceholders(out)) {
    const sub = substitutePaidProIntakeContactPlaceholders(out, intakeRaw, {
      surface,
      authorityParties: parties,
    });
    if (sub.text !== out) {
      out = sub.text;
      replacedCount += sub.replacedEmailCount;
      repairs.push("hydrate:numbered_email_substitution");
    }
  }

  if (parties && parties.length >= 2 && NUMBERED_EMAIL_BRACKET_RE.test(out)) {
    const noticeRepair = repairIncompleteIfToNoticeStanzas(out, parties);
    if (noticeRepair.repairs.length > 0) {
      out = noticeRepair.text;
      repairs.push(...noticeRepair.repairs.map((r) => `notice:${r}`));
    }
  }

  if (NUMBERED_EMAIL_BRACKET_RE.test(out)) {
    const next = out.replace(NUMBERED_EMAIL_BRACKET_RE, (match) => {
      const slot = parseSignatureContactSlot(match);
      const resolved = resolveAuthoritativeEmailForContactSlot(slot, intakeRaw, parties);
      if (!resolved) return match;
      replacedCount += 1;
      return resolved;
    });
    if (next !== out) {
      out = next;
      repairs.push("hydrate:authority_email_slot_recovery");
    }
  }

  const intakeEmails = [
    ...extractIntakeEmailsOrdered(intakeRaw),
    ...(parties ?? []).map((p) => p.signerEmail.trim()).filter(Boolean),
  ];
  const uniqueEmails = [...new Set(intakeEmails.map((e) => e.toLowerCase()))].map((low) =>
    intakeEmails.find((e) => e.toLowerCase() === low)!,
  );
  if (uniqueEmails.length > 0) {
    const restored = restoreExactIntakeEmails(out, uniqueEmails);
    if (restored.repairedCount > 0) {
      out = restored.text;
      replacedCount += restored.repairedCount;
      repairs.push("hydrate:restore_exact_authority_emails");
    }
  }

  return { text: out, repairs, replacedCount };
}

export function enforceProfessionalOutputIntegrity(
  text: string,
  opts?: {
    intakeRaw?: string | null;
    parties?: readonly PaidProSignerMetadataParty[];
    surface?: string;
  },
): { text: string; repairs: string[]; placeholdersRemaining: boolean } {
  const hydrated = hydrateUserVisibleContactPlaceholders(
    text,
    opts?.intakeRaw ?? null,
    opts?.parties,
    opts?.surface ?? "enforce_professional_output",
  );
  return {
    text: hydrated.text,
    repairs: hydrated.repairs,
    placeholdersRemaining: containsUserVisiblePlaceholders(hydrated.text),
  };
}
