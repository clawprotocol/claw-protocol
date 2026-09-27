import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";
import {
  normalizeOwnerDeliveryTrack,
  rememberOwnerDeliveryTrack,
} from "../../components/agreements/paidProOwnerDeliveryTrack";
import { mergeStructuredPartyIdentity } from "../../agreement/partyIdentityPersist";

function mergeAuthoritativeApiPartySet(
  current: readonly AgreementParty[],
  apiParties: readonly AgreementParty[],
): AgreementParty[] {
  const namedApiParties = apiParties.filter((party) => String(party.name || "").trim());
  if (namedApiParties.length === 0) return [...current];
  // GET /api/agreements/:id is the durable membership/order authority on resume.
  // The identity merge emits incoming rows first; discard unmatched local/default rows
  // so stale or synthetic IDs cannot duplicate persisted legal parties.
  return mergeStructuredPartyIdentity({
    current,
    incoming: namedApiParties,
  }).slice(0, namedApiParties.length) as AgreementParty[];
}

/**
 * Production resume from GET /api/agreements/:id uses {@link coerceDraftFromApiPayload}, which only maps a
 * subset of fields. Re-attach authoritative Pro corpus + party contact fields from the normalized API draft
 * so paid Pro review/edit-return does not fall into "Retry Pro" / free-parse regeneration.
 */
export function mergePaidProAuthoritativeDraftFieldsFromApi(
  coerced: ParsedDraftShape,
  apiDraft: AgreementDraft | null,
): ParsedDraftShape {
  if (!apiDraft) return coerced;
  const o = apiDraft as Record<string, unknown>;
  const str = (k: string): string | null => {
    const v = o[k];
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t : null;
  };
  const extras: Record<string, string> = {};
  const prs = str("premium_render_source");
  if (prs) extras.premium_render_source = prs;
  const sfd = str("server_full_document_text");
  if (sfd) extras.server_full_document_text = sfd;
  const pfd = str("premium_full_document_text");
  if (pfd) extras.premium_full_document_text = pfd;
  const psfd = str("premium_server_full_document_text");
  if (psfd) extras.premium_server_full_document_text = psfd;
  const psr = str("premium_server_repair_document_text");
  if (psr) extras.premium_server_repair_document_text = psr;
  const dt = str("document_text");
  if (dt) extras.document_text = dt;
  const rt = str("rendered_document_text");
  if (rt) extras.rendered_document_text = rt;
  const deliveryTrack = normalizeOwnerDeliveryTrack(apiDraft.owner_delivery_track);
  if (deliveryTrack) extras.owner_delivery_track = deliveryTrack;
  const agreementId = str("id");
  if (agreementId && deliveryTrack) rememberOwnerDeliveryTrack(agreementId, deliveryTrack);

  const apiParties = Array.isArray(apiDraft.parties) ? (apiDraft.parties as AgreementParty[]) : [];
  const base = Array.isArray(coerced.parties) ? [...coerced.parties] : [];
  const outParties = mergeAuthoritativeApiPartySet(base as AgreementParty[], apiParties);
  return { ...coerced, ...extras, parties: outParties as ParsedDraftShape["parties"] } as ParsedDraftShape;
}

/**
 * Intake defaults on a short GET shell can drop counterparty rows or emails.
 * Restore authorized GET parties after those defaults so review-link mint keeps
 * the Ironvale/Jordan recipient identity.
 */
export function retainAuthorizedApiPartiesAfterIntakeDefaults(
  next: ParsedDraftShape,
  apiDraft: AgreementDraft | null,
): ParsedDraftShape {
  if (!apiDraft) return next;
  const apiParties = Array.isArray(apiDraft.parties) ? (apiDraft.parties as AgreementParty[]) : [];
  if (apiParties.length === 0) return next;
  const local = Array.isArray(next.parties) ? [...next.parties] : [];
  const parties = mergeAuthoritativeApiPartySet(local as AgreementParty[], apiParties);
  return { ...next, parties: parties as ParsedDraftShape["parties"] };
}

/** Saved agreement rows with durable ids. Null when membership is not yet persisted. */
export function durablePersistedLegalParties<T extends { id?: string | null; name?: string | null }>(
  parties: readonly T[] | null | undefined,
): T[] | null {
  const named = (parties ?? []).filter((party) => String(party?.name ?? "").trim().length >= 2);
  if (named.length < 2 || named.length > 4) return null;
  if (!named.every((party) => String(party.id ?? "").trim())) return null;
  return named;
}

export function namedLegalPartyCountFromParties(
  parties: readonly { name?: string }[] | undefined | null,
): number {
  return (parties ?? []).filter((party) => String(party.name || "").trim().length >= 2).length;
}

export function shouldKeepPersistedApiPartiesOnResume(args: {
  signerSetupResume: boolean;
  apiParties: readonly { name?: string }[] | undefined | null;
}): boolean {
  return Boolean(args.signerSetupResume) || namedLegalPartyCountFromParties(args.apiParties) >= 3;
}

export function liveSignerUiFieldsFromDraftParties(
  parties: readonly {
    name?: string;
    email?: string;
    signerEmail?: string;
    signerName?: string;
    signerTitle?: string;
  }[],
): {
  legal: string[];
  names: string[];
  titles: string[];
  emails: string[];
} {
  return {
    legal: parties.map((party) => String(party.name ?? "").trim()),
    names: parties.map((party) => String(party.signerName ?? "").trim()),
    titles: parties.map((party) => String(party.signerTitle ?? "").trim()),
    emails: parties.map((party) => String(party.signerEmail ?? party.email ?? "").trim()),
  };
}
