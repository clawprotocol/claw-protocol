import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";
import {
  normalizeOwnerDeliveryTrack,
  rememberOwnerDeliveryTrack,
} from "../../components/agreements/paidProOwnerDeliveryTrack";

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
  const outParties = base.map((p, i) => {
    const ap =
      apiParties.find((row) => {
        const id = String(row.id || "").trim();
        const name = String(row.name || "").trim();
        return (
          (id && id === String((p as AgreementParty).id || "").trim()) ||
          (name && name.toLowerCase() === String(p.name || "").trim().toLowerCase())
        );
      }) || apiParties[i];
    if (!ap) return p;
    const row = { ...p } as AgreementParty;
    if (ap.id) row.id = ap.id;
    const em = String(ap.email ?? "").trim();
    if (em) row.email = em;
    const signerName = String(
      ap.signerName ?? (ap as { signer_name?: string }).signer_name ?? "",
    ).trim();
    if (signerName) row.signerName = signerName;
    const signerTitle = String(ap.signerTitle ?? "").trim();
    if (signerTitle) row.signerTitle = signerTitle;
    const ph = String(ap.phone ?? "").trim();
    if (ph) row.phone = ph;
    const nm = String(ap.name ?? "").trim();
    if (nm && !String(row.name ?? "").trim()) row.name = nm;
    const rl = String(ap.role ?? "").trim();
    if (rl && !String(row.role ?? "").trim()) row.role = rl;
    return row;
  });
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
  const byId = new Map<string, AgreementParty>();
  const byName = new Map<string, AgreementParty>();
  for (const raw of local) {
    const p = raw as AgreementParty;
    const id = String(p.id || "").trim();
    const name = String(p.name || "").trim().toLowerCase();
    if (id) byId.set(id, p);
    if (name && !byName.has(name)) byName.set(name, p);
  }
  const parties = apiParties.map((ap) => {
    const id = String(ap.id || "").trim();
    const name = String(ap.name || "").trim().toLowerCase();
    const prev = (id && byId.get(id)) || (name && byName.get(name)) || ({} as AgreementParty);
    const email = String(ap.email || prev.email || "").trim();
    const signerName = String(
      ap.signerName ||
        (ap as { signer_name?: string }).signer_name ||
        prev.signerName ||
        "",
    ).trim();
    const signerTitle = String(ap.signerTitle || prev.signerTitle || "").trim();
    return {
      ...prev,
      ...ap,
      ...(id ? { id } : {}),
      name: String(ap.name || prev.name || "").trim(),
      role: ap.role || prev.role || "party",
      ...(email ? { email } : {}),
      ...(signerName ? { signerName } : {}),
      ...(signerTitle ? { signerTitle } : {}),
    };
  });
  return { ...next, parties: parties as ParsedDraftShape["parties"] };
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
