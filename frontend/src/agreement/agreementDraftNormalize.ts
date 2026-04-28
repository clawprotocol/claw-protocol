import type { AgreementDraft, AgreementParty } from "./agreementTypes";
import type { PaymentRequestPayload } from "./paymentRequestTypes";
import { normalizePaymentRequestFromApi } from "./paymentRequestTypes";
import {
  resolvePartyNameForUserFacing,
  substitutePartyPlaceholdersInUserFacingText,
} from "./partyPlaceholderDisplay";

function coerceStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function coerceNullStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function isPlaceholderPartyRole(role: string): boolean {
  const s = (role || "").trim();
  if (!s) return false;
  return (
    /^[\[(]?\s*(?:ORG|PARTY|CLIENT|COMPANY)[_\s]*\d+\s*[\])]?$/i.test(s) ||
    /^[\[(]?\s*party[_\s]*\d+\s*[\])]?$/i.test(s) ||
    /^[\[(]?\s*(?:org|party)\d+\s*[\])]?$/i.test(s)
  );
}

function buildDefaultPartyNameContext(r: Record<string, unknown>, override?: string): string {
  const o = (override || "").trim();
  if (o) return o;
  const parts: string[] = [
    coerceStr(r.title),
    coerceStr(r.purpose),
    coerceStr(r.payment_terms),
    coerceStr((r as { intake_text?: unknown }).intake_text),
  ];
  if (Array.isArray(r.parties)) {
    for (const p of r.parties) {
      if (p == null || typeof p !== "object") continue;
      parts.push(coerceStr((p as Record<string, unknown>).name));
    }
  }
  return parts.filter(Boolean).join("\n");
}

function fallbackRoleForPartyIndex(idx: number): string {
  if (idx === 0) return "party_a";
  if (idx === 1) return "party_b";
  return "party";
}

/** Coerce API / LLM output into the workspace AgreementDraft shape with safe containers. */
export function normalizeAgreementDraftFromApi(
  raw: unknown,
  opts: { fallbackAgreementId?: string; partyNameContext?: string } = {}
): AgreementDraft | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = coerceStr(r.id) || coerceStr(opts.fallbackAgreementId);
  if (!id) return null;

  const partyNameContext = buildDefaultPartyNameContext(r, opts.partyNameContext);

  const parties: AgreementParty[] = [];
  if (Array.isArray(r.parties)) {
    for (const p of r.parties) {
      if (p == null || typeof p !== "object") continue;
      const pr = p as Record<string, unknown>;
      const rawName = coerceStr(pr.name);
      const name = resolvePartyNameForUserFacing(rawName, parties.length, partyNameContext);
      if (!name) continue;
      let role = coerceStr(pr.role) || "party";
      if (isPlaceholderPartyRole(role)) role = fallbackRoleForPartyIndex(parties.length);
      const pid = coerceStr(pr.id as string);
      const row: AgreementParty = { name, role, email: pr.email == null ? undefined : String(pr.email) };
      if (pid) row.id = pid;
      parties.push(row);
    }
  }

  const enrichedContext = [partyNameContext, ...parties.map((p) => p.name)].join("\n");
  const scrub = (s: string) => substitutePartyPlaceholdersInUserFacingText(s, enrichedContext);

  const normVersions: AgreementDraft["versions"] = [];
  if (Array.isArray(r.versions)) {
    for (const v of r.versions) {
      if (v == null || typeof v !== "object") continue;
      const vr = v as Record<string, unknown>;
      normVersions.push({
        version: typeof vr.version === "number" && Number.isFinite(vr.version) ? vr.version : Number(vr.version) || 0,
        created_at: coerceStr(vr.created_at) || new Date().toISOString(),
        note: vr.note == null ? null : String(vr.note),
      });
    }
  }

  const normAudit: AgreementDraft["audit_log"] = [];
  if (Array.isArray(r.audit_log)) {
    for (const e of r.audit_log) {
      if (e == null || typeof e !== "object") continue;
      const er = e as Record<string, unknown>;
      normAudit.push({
        event_type: coerceStr(er.event_type) || "unknown",
        at: coerceStr(er.at) || new Date().toISOString(),
        field: er.field == null ? null : String(er.field),
        value: er.value,
      });
    }
  }

  const now = new Date().toISOString();
  const prRaw = r.payment_request;
  const payment_request: PaymentRequestPayload | null =
    prRaw == null || prRaw === "" ? null : normalizePaymentRequestFromApi(prRaw);

  const durationRaw = coerceNullStr(r.duration);
  const dueRaw = coerceNullStr(r.due_date);
  const effectiveRaw = coerceNullStr(r.effective_date);

  return {
    id,
    title: scrub(coerceStr(r.title)),
    jurisdiction: coerceStr(r.jurisdiction),
    parties,
    purpose: scrub(coerceStr(r.purpose)),
    payment_terms: scrub(coerceStr(r.payment_terms)),
    duration: durationRaw ? scrub(durationRaw) : null,
    due_date: dueRaw ? scrub(dueRaw) : null,
    effective_date: effectiveRaw ? scrub(effectiveRaw) : null,
    created_at: coerceStr(r.created_at) || now,
    updated_at: coerceStr(r.updated_at) || now,
    versions: normVersions,
    audit_log: normAudit,
    review_sent_at:
      r.review_sent_at == null || r.review_sent_at === "" ? null : coerceNullStr(r.review_sent_at),
    workspace_archived_at:
      r.workspace_archived_at == null || r.workspace_archived_at === ""
        ? null
        : coerceNullStr(r.workspace_archived_at),
    workspace_folder_id:
      r.workspace_folder_id == null || r.workspace_folder_id === ""
        ? null
        : coerceNullStr(r.workspace_folder_id),
    workspace_tags: Array.isArray(r.workspace_tags)
      ? (r.workspace_tags as unknown[])
          .map((t) => String(t).trim())
          .filter(Boolean)
          .slice(0, 20)
      : [],
    payment_request,
    payment_required: Boolean(r.payment_required),
    premium_full_document_text:
      r.premium_full_document_text == null || r.premium_full_document_text === ""
        ? null
        : String(r.premium_full_document_text),
    premium_server_full_document_text:
      r.premium_server_full_document_text == null || r.premium_server_full_document_text === ""
        ? null
        : String(r.premium_server_full_document_text),
    server_full_document_text:
      r.server_full_document_text == null || r.server_full_document_text === ""
        ? null
        : String(r.server_full_document_text),
    document_text: r.document_text == null || r.document_text === "" ? null : String(r.document_text),
    rendered_document_text:
      r.rendered_document_text == null || r.rendered_document_text === ""
        ? null
        : String(r.rendered_document_text),
  };
}

/**
 * Minimum structural checks before the Agreement details (Step 2) workspace view renders.
 * Does not assert business completeness — only that required containers/ids exist.
 */
export function isAgreementDetailsStepReady(d: AgreementDraft | null, agreementId: string): boolean {
  if (!d) return false;
  if (coerceStr(d.id) !== coerceStr(agreementId)) return false;
  if (!Array.isArray(d.parties)) return false;
  if (!Array.isArray(d.versions)) return false;
  if (!Array.isArray(d.audit_log)) return false;
  return true;
}
