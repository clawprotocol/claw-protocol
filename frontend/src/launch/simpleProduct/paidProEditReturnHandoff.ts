import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { looksLikeEmail, stripRecipientEmailNoise } from "../../components/agreements/recipientEmailValidation";
import { isPaidProAgreementAuthoritative } from "../../components/agreements/paidProAgreementAuthority";
import {
  hasMaterialPremiumPipelineCorpus,
  materialPremiumPipelineCorpusMaxLen,
} from "../../components/agreements/sendHandoffAuthoritativeCorpus";
import type { PremiumSendIntent } from "./premiumSendIntent";

const SESSION_KEY = "claw_paid_pro_edit_return_v1";

/** Minimum full-text length for preview fallbacks when pipeline fields are empty (edit-return only). */
const EDIT_RETURN_PREVIEW_FALLBACK_MIN = 1000;

export type PaidProEditReturnDraftSnapshotV1 = {
  server_full_document_text?: string | null;
  premium_server_full_document_text?: string | null;
  premium_full_document_text?: string | null;
  premium_render_source?: string | null;
  document_text?: string | null;
  rendered_document_text?: string | null;
  purpose?: string | null;
  title?: string | null;
  jurisdiction?: string | null;
  payment_terms?: string | null;
  duration?: string | null;
  due_date?: string | null;
  effective_date?: string | null;
  parties?: AgreementParty[] | null;
  id?: string | null;
};

export type PaidProEditReturnHandoffPayload = {
  v: 2;
  agreementId: string;
  premiumSendIntent: PremiumSendIntent;
  savedAt: number;
  draftSnapshot: PaidProEditReturnDraftSnapshotV1;
};

function shortAgreementId(id: string): string {
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 8)}…`;
}

function recipientEmailCountFromDraft(d: AgreementDraft | null | undefined): number {
  if (!d?.parties?.length) return 0;
  let n = 0;
  for (const p of d.parties) {
    const em = stripRecipientEmailNoise(String((p as { email?: string }).email ?? ""));
    if (looksLikeEmail(em)) n += 1;
  }
  return n;
}

export function logPaidProEditReturnWrite(payload: {
  agreementIdShort: string;
  hasPremiumDoc: boolean;
  docLen: number;
  partyCount: number;
  recipientEmailCount: number;
  intent: PremiumSendIntent;
}): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-edit-return-write]", payload);
}

export function logPaidProEditReturnRead(payload: {
  agreementIdShort: string;
  hasPremiumDoc: boolean;
  docLen: number;
  partyCount: number;
  recipientEmailCount: number;
  intent: PremiumSendIntent;
}): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-edit-return-read]", payload);
}

export function logPaidProEditReturnHydrated(payload: {
  agreementIdShort: string;
  createUiStage: string;
  createFlowPhase: string;
  displayPhase: string;
  hasPremiumDoc: boolean;
  docLen: number;
}): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-edit-return-hydrated]", payload);
}

export function logPaidProEditReturnSkipBasicGenerate(reason: string, agreementIdShort: string): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-edit-return-skip-basic-generate]", { reason, agreementIdShort });
}

/** Recoverable paid body for edit-return: premium pipeline ≥500 or long preview / server text. */
export function paidProEditReturnHasRecoverableBody(d: AgreementDraft | null | undefined): boolean {
  if (!d) return false;
  if (hasMaterialPremiumPipelineCorpus(d)) return true;
  const sf = String(d.server_full_document_text ?? "").trim().length;
  if (sf > EDIT_RETURN_PREVIEW_FALLBACK_MIN) return true;
  const dt = String(d.document_text ?? "").trim().length;
  const rt = String(d.rendered_document_text ?? "").trim().length;
  if (dt > EDIT_RETURN_PREVIEW_FALLBACK_MIN || rt > EDIT_RETURN_PREVIEW_FALLBACK_MIN) return true;
  return false;
}

/**
 * Pick the best draft for session handoff when returning to /app/create (live bridge → initial → primed).
 */
export function resolvePaidProEditReturnSourceDraft(args: {
  live: AgreementDraft | null;
  initial: AgreementDraft | null;
  primed: AgreementDraft | null;
  agreementId: string;
}): AgreementDraft | null {
  const { agreementId } = args;
  const candidates: (AgreementDraft | null)[] = [args.live, args.initial, args.primed];
  for (const d of candidates) {
    if (!d) continue;
    if (isPaidProAgreementAuthoritative({ draft: d, agreementId }) && paidProEditReturnHasRecoverableBody(d)) {
      return d;
    }
  }
  for (const d of candidates) {
    if (!d) continue;
    if (paidProEditReturnHasRecoverableBody(d)) return d;
  }
  return null;
}

export function extractPaidProEditReturnDraftSnapshot(d: AgreementDraft): PaidProEditReturnDraftSnapshotV1 {
  return {
    server_full_document_text: d.server_full_document_text ?? null,
    premium_server_full_document_text: d.premium_server_full_document_text ?? null,
    premium_full_document_text: d.premium_full_document_text ?? null,
    premium_render_source: d.premium_render_source ?? null,
    document_text: d.document_text ?? null,
    rendered_document_text: d.rendered_document_text ?? null,
    purpose: d.purpose ?? null,
    title: d.title ?? null,
    jurisdiction: d.jurisdiction ?? null,
    payment_terms: d.payment_terms ?? null,
    duration: d.duration ?? null,
    due_date: d.due_date ?? null,
    effective_date: d.effective_date ?? null,
    parties: Array.isArray(d.parties) ? d.parties : null,
    id: d.id ?? null,
  };
}

export function mergePaidProEditReturnSnapshotIntoApiDraft(
  api: AgreementDraft,
  snap: PaidProEditReturnDraftSnapshotV1,
): AgreementDraft {
  const out: AgreementDraft = { ...api };
  const assignIf = (k: keyof PaidProEditReturnDraftSnapshotV1) => {
    const v = snap[k];
    if (v == null) return;
    if (typeof v === "string") {
      if (!v.trim()) return;
      (out as Record<string, unknown>)[k as string] = v;
    }
  };
  (["server_full_document_text", "premium_server_full_document_text", "premium_full_document_text"] as const).forEach(
    assignIf,
  );
  (["premium_render_source", "document_text", "rendered_document_text"] as const).forEach(assignIf);
  (["purpose", "title", "jurisdiction", "payment_terms", "duration", "due_date", "effective_date"] as const).forEach(
    assignIf,
  );
  if (Array.isArray(snap.parties) && snap.parties.length > 0) {
    out.parties = snap.parties;
  }
  if (snap.id && String(snap.id).trim()) {
    out.id = String(snap.id).trim();
  }
  return out;
}

export function writePaidProEditReturnHandoff(params: {
  agreementId: string;
  liveDraft: AgreementDraft;
  premiumSendIntent: PremiumSendIntent;
}): void {
  const id = String(params.agreementId || "").trim();
  if (!id) return;
  const d = params.liveDraft;
  const draftSnapshot = extractPaidProEditReturnDraftSnapshot(d);
  const docLen = materialPremiumPipelineCorpusMaxLen(d);
  const hasPremiumDoc = paidProEditReturnHasRecoverableBody(d);
  const partyCount = Array.isArray(d?.parties) ? d!.parties!.length : 0;
  const recipientEmailCount = recipientEmailCountFromDraft(d);
  const payload: PaidProEditReturnHandoffPayload = {
    v: 2,
    agreementId: id,
    premiumSendIntent: params.premiumSendIntent,
    savedAt: Date.now(),
    draftSnapshot,
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  logPaidProEditReturnWrite({
    agreementIdShort: shortAgreementId(id),
    hasPremiumDoc,
    docLen,
    partyCount,
    recipientEmailCount,
    intent: params.premiumSendIntent,
  });
}

export function readPaidProEditReturnHandoff(): PaidProEditReturnHandoffPayload | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o?.v !== 2 || !String(o.agreementId || "").trim()) return null;
    const intent = o.premiumSendIntent === "signature" || o.premiumSendIntent === "review" ? o.premiumSendIntent : null;
    if (!intent) return null;
    const snap = o.draftSnapshot;
    if (!snap || typeof snap !== "object") return null;
    return {
      v: 2,
      agreementId: String(o.agreementId).trim(),
      premiumSendIntent: intent,
      savedAt: typeof o.savedAt === "number" ? o.savedAt : Date.now(),
      draftSnapshot: snap as PaidProEditReturnDraftSnapshotV1,
    };
  } catch {
    return null;
  }
}

export function clearPaidProEditReturnHandoff(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
