import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";

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

  const apiParties = Array.isArray(apiDraft.parties) ? (apiDraft.parties as AgreementParty[]) : [];
  const base = Array.isArray(coerced.parties) ? [...coerced.parties] : [];
  const outParties = base.map((p, i) => {
    const ap = apiParties[i];
    if (!ap) return p;
    const row = { ...p } as AgreementParty;
    if (ap.id) row.id = ap.id;
    const em = String(ap.email ?? "").trim();
    if (em) row.email = em;
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
