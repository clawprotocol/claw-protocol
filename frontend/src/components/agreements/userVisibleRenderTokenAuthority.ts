/**
 * User-Visible Render Token Authority — single resolver and terminal gate for all Paid Pro surfaces.
 *
 * No unresolved render token may reach review, signing, export, delivery, or archival output.
 * Repairs rebuild from structured authority; corrupted corpus text is never the sole repair source.
 */

import type {
  PaidProPartyRoleContext,
  PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import {
  authorityPartiesFromLabeledPartyIntake,
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  FORBIDDEN_CONTACT_PLACEHOLDER_RENDER_RE,
  FORBIDDEN_INTERNAL_ALIAS_RENDER_RE,
  FORBIDDEN_TEMPLATE_VARIABLE_RENDER_RE,
} from "./legalPartyIdentityAuthority";
import {
  extractIntakeContacts,
  resolveAuthoritativeEmailForContactSlot,
  substitutePaidProIntakeContactPlaceholders,
} from "./paidProIntakeContactSubstitution";
import {
  normalizePlaceholderToken,
  parseSignatureContactSlot,
} from "./agreementTemplatePlaceholderSafety";
import { repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { restoreExactIntakeEmails } from "./paidProEmailMask";
import { getPaidProSourceOfTruthText, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";

const NUMBERED_RENDER_TOKEN_RE =
  /\[\s*(?:(?:SIGNER|PARTY|CONTACT|ORG)_)?(?:EMAIL|ADDRESS|PARTY_ADDRESS|SIGNER_NAME|NAME|TITLE|PARTY_NAME|DATE)(?:_\d+)?\s*\]/gi;

const DEGRADED_LITERAL_RE =
  /\b(?:TBD|UNKNOWN|PLACEHOLDER)\b/i;

const PARTY_AB_LITERAL_RE = /\bPARTY[_\s-]?[AB]\b(?!\s*(?:LLC|Inc|Corp|Ltd|LP))/i;

export const UNRESOLVED_RENDER_TOKEN_SCAN_RE = new RegExp(
  [
    FORBIDDEN_CONTACT_PLACEHOLDER_RENDER_RE.source,
    FORBIDDEN_TEMPLATE_VARIABLE_RENDER_RE.source,
    FORBIDDEN_INTERNAL_ALIAS_RENDER_RE.source,
    DEGRADED_LITERAL_RE.source,
    PARTY_AB_LITERAL_RE.source,
  ].join("|"),
  "gi",
);

export type RenderTokenMatch = {
  token: string;
  index: number;
};

export type RenderTokenAuthorityContext = {
  intakeRaw?: string | null;
  partyNames?: readonly string[] | null;
  parties?: readonly PaidProSignerMetadataParty[];
  surface?: string;
  /** When true, unresolved tokens after authority recovery block progression. */
  blockOnUnresolved?: boolean;
};

export type RenderTokenAuthorityOutcome = {
  text: string;
  repairs: string[];
  unresolvedTokens: string[];
  replacedCount: number;
  ok: boolean;
  blocked: boolean;
};

export function containsUnresolvedRenderTokens(text: string): boolean {
  return scanUnresolvedRenderTokens(text).length > 0;
}

/** Scan all prohibited user-visible render tokens (independent of fatal/nonfatal placeholder classification). */
export function scanUnresolvedRenderTokens(text: string): RenderTokenMatch[] {
  const t = (text || "").replace(/\r\n/g, "\n");
  const matches: RenderTokenMatch[] = [];
  const seen = new Set<string>();

  const push = (token: string, index: number) => {
    const trimmed = token.trim();
    if (!trimmed || trimmed.length > 200) return;
    const key = `${trimmed}@${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({ token: trimmed, index });
  };

  UNRESOLVED_RENDER_TOKEN_SCAN_RE.lastIndex = 0;
  for (const m of t.matchAll(UNRESOLVED_RENDER_TOKEN_SCAN_RE)) {
    if (m.index != null) push(m[0], m.index);
  }

  NUMBERED_RENDER_TOKEN_RE.lastIndex = 0;
  for (const m of t.matchAll(NUMBERED_RENDER_TOKEN_RE)) {
    if (m.index != null) push(m[0], m.index);
  }

  return matches;
}

function partyForSlot(
  parties: readonly PaidProSignerMetadataParty[] | undefined,
  slot: number | null,
): PaidProSignerMetadataParty | undefined {
  if (!slot || slot < 1 || !parties?.length) return undefined;
  return parties[slot - 1];
}

function resolveMustacheOrDollarToken(
  token: string,
  ctx: RenderTokenAuthorityContext,
): string | null {
  const parties = ctx.parties ?? [];
  const inner = token
    .replace(/^\{\{\s*|\s*\}\}$/g, "")
    .replace(/^\$\{\s*|\s*\}$/g, "")
    .trim()
    .toLowerCase();

  if (!inner) return null;

  if (/^(?:venue|jurisdiction|governing_?law)$/i.test(inner)) {
    const intake = String(ctx.intakeRaw ?? "");
    const law = intake.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+law\b/i)?.[1];
    if (law) return law;
    const state = intake.match(/\b(?:Texas|California|New York|Delaware|Florida)\b/i)?.[0];
    return state || null;
  }

  const legalForSlot = (slot: number): string | null =>
    parties[slot - 1]?.partyLegalName?.trim() || ctx.partyNames?.[slot - 1]?.trim() || null;

  // Party legal name. Slot resolves from an explicit index (party_3), an A/B suffix (party_a),
  // or the role keyword's implied position (company/client → 1, counterparty/provider → 2). The
  // mustache path previously hard-coded only slots 1 and 2, so any {{party_3}}/{{email_4}} style
  // token in a 3+ party agreement survived unresolved and blocked the substantive draft
  // (document_boundary_blocked). The bracket path already scales to N — this mirrors it.
  let m: RegExpMatchArray | null;
  if (/^party_?a$/i.test(inner)) return legalForSlot(1);
  if (/^party_?b$/i.test(inner)) return legalForSlot(2);
  if ((m = inner.match(/^(?:company|client|org|organization)(?:_?(\d+))?$/i))) {
    return legalForSlot(m[1] ? Number(m[1]) : 1);
  }
  if ((m = inner.match(/^(?:counterparty|service_?provider|provider)(?:_?(\d+))?$/i))) {
    return legalForSlot(m[1] ? Number(m[1]) : 2);
  }
  if ((m = inner.match(/^party_?(\d+)$/i))) {
    return legalForSlot(Number(m[1]));
  }
  if ((m = inner.match(/^(?:email|contact_?email)(?:_?(\d+))?$/i))) {
    return resolveAuthoritativeEmailForContactSlot(m[1] ? Number(m[1]) : 1, ctx.intakeRaw, parties);
  }
  if ((m = inner.match(/^(?:signer|signer_?name)(?:_?(\d+))?$/i))) {
    return parties[(m[1] ? Number(m[1]) : 1) - 1]?.signerName?.trim() || null;
  }
  if ((m = inner.match(/^(?:signer_?title|title)(?:_?(\d+))?$/i))) {
    return parties[(m[1] ? Number(m[1]) : 1) - 1]?.signerTitle?.trim() || null;
  }
  if ((m = inner.match(/^(?:party_?address|address)(?:_?(\d+))?$/i))) {
    return parties[(m[1] ? Number(m[1]) : 1) - 1]?.partyAddress?.trim() || null;
  }
  return null;
}

/** Single centralized resolver for all render-token families. */
export function resolveRenderTokenFromAuthority(
  token: string,
  ctx: RenderTokenAuthorityContext,
): string | null {
  const parties = ctx.parties;
  const raw = (token || "").trim();
  if (!raw) return null;

  if (FORBIDDEN_TEMPLATE_VARIABLE_RENDER_RE.test(raw)) {
    return resolveMustacheOrDollarToken(raw, ctx);
  }

  const normalized = normalizePlaceholderToken(raw);
  const slot = parseSignatureContactSlot(raw);

  if (/^(?:(?:SIGNER|PARTY|CONTACT)_)?EMAIL(?:_\d+)?$/i.test(normalized)) {
    return resolveAuthoritativeEmailForContactSlot(slot, ctx.intakeRaw, parties);
  }
  if (/^(?:(?:SIGNER|PARTY|CONTACT)_)?(?:ADDRESS|PARTY_ADDRESS)(?:_\d+)?$/i.test(normalized)) {
    return partyForSlot(parties, slot)?.partyAddress?.trim() || null;
  }
  if (/^(?:(?:SIGNER|PARTY|CONTACT)_)?(?:SIGNER_NAME|NAME)(?:_\d+)?$/i.test(normalized)) {
    return partyForSlot(parties, slot)?.signerName?.trim() || null;
  }
  if (/^(?:(?:SIGNER|PARTY|CONTACT)_)?TITLE(?:_\d+)?$/i.test(normalized)) {
    return partyForSlot(parties, slot)?.signerTitle?.trim() || null;
  }
  if (/^(?:(?:PARTY|ORG|COMPANY|CLIENT)_)?(?:PARTY_)?NAME(?:_\d+)?$/i.test(normalized)) {
    return partyForSlot(parties, slot)?.partyLegalName?.trim() || null;
  }

  if (/^PARTY[_\s-]?A$/i.test(normalized)) {
    return parties?.[0]?.partyLegalName?.trim() || ctx.partyNames?.[0]?.trim() || null;
  }
  if (/^PARTY[_\s-]?B$/i.test(normalized)) {
    return parties?.[1]?.partyLegalName?.trim() || ctx.partyNames?.[1]?.trim() || null;
  }

  return null;
}

export function buildRenderTokenAuthorityParties(
  ctx: Pick<RenderTokenAuthorityContext, "intakeRaw" | "partyNames" | "parties">,
): PaidProSignerMetadataParty[] {
  if (ctx.parties && ctx.parties.length > 0) return [...ctx.parties];

  const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties;
  if (consumed && consumed.length >= 2) return [...consumed];

  const labeled = authorityPartiesFromLabeledPartyIntake(ctx.intakeRaw);
  if (labeled.length >= 2) return labeled;

  const contacts = extractIntakeContacts(ctx.intakeRaw);
  const names = (ctx.partyNames ?? []).map((n) => String(n ?? "").trim()).filter(Boolean);
  const count = Math.max(names.length, contacts.length, 2);
  return Array.from({ length: count }, (_, i) => ({
    partyIndex: i,
    partyLegalName: names[i] ?? contacts[i]?.companyHint ?? "",
    signerEmail: contacts[i]?.email ?? "",
    signerName: contacts[i]?.name ?? "",
    signerTitle: contacts[i]?.title ?? "",
    partyAddress: "",
  }));
}

function replaceUnresolvedTokensFromAuthority(
  text: string,
  ctx: RenderTokenAuthorityContext,
): { text: string; repairs: string[]; replacedCount: number } {
  const repairs: string[] = [];
  let replacedCount = 0;
  let out = text;

  const tokens = scanUnresolvedRenderTokens(out);
  for (const { token } of tokens) {
    const resolved = resolveRenderTokenFromAuthority(token, ctx);
    if (!resolved || resolved === token) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const next = out.replace(new RegExp(escaped, "g"), resolved);
    if (next !== out) {
      out = next;
      replacedCount += 1;
      repairs.push(`token:${token.slice(0, 40)}→authority`);
    }
  }

  return { text: out, repairs, replacedCount };
}

/**
 * Terminal gate: hydrate numbered contacts, rebuild notice stanzas, resolve all token families
 * from structured authority, then report any survivors.
 */
export function enforceUserVisibleRenderTokenAuthority(
  text: string,
  ctx?: RenderTokenAuthorityContext,
): RenderTokenAuthorityOutcome {
  const surface = ctx?.surface ?? "user_visible_render_token_gate";
  const parties = buildRenderTokenAuthorityParties(ctx ?? {});
  const authorityCtx: RenderTokenAuthorityContext = {
    ...ctx,
    parties,
  };
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");
  let replacedCount = 0;

  const sub = substitutePaidProIntakeContactPlaceholders(out, ctx?.intakeRaw ?? null, {
    surface,
    authorityParties: parties,
  });
  if (sub.text !== out) {
    out = sub.text;
    replacedCount += sub.replacedEmailCount;
    repairs.push("authority:numbered_email_substitution");
  }

  if (parties.length >= 2) {
    // TEST540 — this terminal render-token gate previously called notice repair WITHOUT a role
    // context, dropping the authoritative intake identity even though `ctx.intakeRaw` was in scope.
    // When `parties` was rebuilt from a contaminated consumed-authority snapshot (a "Party 1"
    // placeholder in slot 0), the notice resolver had no manifest to recover the real entity and
    // degraded slot 0 to "Party N" — the exact `paid-pro-notice-entity-missing` / Party 1 failure.
    // Threading the intake manifest identity here lets the resolver restore the canonical entity.
    const noticeRoleContext: PaidProPartyRoleContext = {
      intakeText: ctx?.intakeRaw ?? null,
      draftPartyNames: (ctx?.partyNames ?? parties.map((p) => p.partyLegalName))
        .map((n) => String(n ?? "").trim())
        .filter((n) => n.length >= 2),
      acceptedCorpus: out,
    };
    const noticeRepair = repairIncompleteIfToNoticeStanzas(out, parties, noticeRoleContext);
    if (noticeRepair.repairs.length > 0) {
      out = noticeRepair.text;
      repairs.push(...noticeRepair.repairs.map((r) => `notice:${r}`));
    }
  }

  const slotRecovery = replaceUnresolvedTokensFromAuthority(out, authorityCtx);
  if (slotRecovery.replacedCount > 0) {
    out = slotRecovery.text;
    replacedCount += slotRecovery.replacedCount;
    repairs.push(...slotRecovery.repairs);
  }

  const intakeEmails = [
    ...extractIntakeContacts(ctx?.intakeRaw).map((c) => c.email),
    ...parties.map((p) => p.signerEmail.trim()).filter(Boolean),
  ];
  const uniqueEmails = [...new Set(intakeEmails.map((e) => e.toLowerCase()))].map((low) =>
    intakeEmails.find((e) => e.toLowerCase() === low)!,
  );
  if (uniqueEmails.length > 0) {
    const restored = restoreExactIntakeEmails(out, uniqueEmails);
    if (restored.repairedCount > 0) {
      out = restored.text;
      replacedCount += restored.repairedCount;
      repairs.push("authority:restore_exact_emails");
    }
  }

  if (hasPaidProSourceOfTruth() && parties.length < 2) {
    const sotParties = buildRenderTokenAuthorityParties({
      intakeRaw: getPaidProSourceOfTruthText(),
      partyNames: ctx?.partyNames,
    });
    if (sotParties.length >= 2) {
      const sotPass = enforceUserVisibleRenderTokenAuthority(out, {
        ...ctx,
        parties: sotParties,
        surface: `${surface}:sot_recovery`,
        blockOnUnresolved: false,
      });
      if (sotPass.replacedCount > 0) {
        out = sotPass.text;
        replacedCount += sotPass.replacedCount;
        repairs.push(...sotPass.repairs.map((r) => `sot:${r}`));
      }
    }
  }

  const unresolvedTokens = [...new Set(scanUnresolvedRenderTokens(out).map((m) => m.token))];
  const blocked = unresolvedTokens.length > 0 && ctx?.blockOnUnresolved !== false;
  return {
    text: out,
    repairs,
    unresolvedTokens,
    replacedCount,
    ok: unresolvedTokens.length === 0,
    blocked,
  };
}
