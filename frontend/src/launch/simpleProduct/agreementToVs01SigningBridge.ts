import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import type { Vs01Counterparty } from "../../vs01/types";
import { resolveApiBase } from "../../lib/clawApi";

const BRIDGE_SESSION_KEY = "claw_agreement_vs01_bridge_handoff_v1";

export type AgreementVs01BridgeSession = {
  vs01DocumentId: string;
  agreementId: string;
  agreementTitle: string;
  creatorName: string;
  creatorEmail: string;
  counterparties: Vs01Counterparty[];
  /** VS01 step index: 2 = Signing (field placement); step 3 requires receipt from step 2. */
  targetStep: 1 | 2;
};

function newCpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Map agreement parties → VS01 creator + counterparties (non-owner signers/recipients). */
export function buildAgreementVs01BridgeSession(params: {
  agreementId: string;
  vs01DocumentId: string;
  draft: AgreementDraft | null;
}): AgreementVs01BridgeSession {
  const parties = (params.draft?.parties ?? []) as AgreementParty[];
  const owner =
    parties.find((p) => (p.role || "").toLowerCase() === "owner") ?? parties[0] ?? null;
  const others = owner ? parties.filter((p) => p !== owner) : parties.slice(1);
  const creatorName = (owner?.name || "").trim() || "Sender";
  const creatorEmail = (owner?.email || "").trim();
  const counterparties: Vs01Counterparty[] =
    others.length > 0
      ? others.map((p) => ({
          id: (p.id && String(p.id).trim()) || newCpId(),
          name: (p.name || "").trim(),
          email: (p.email || "").trim(),
          phone: (p.phone || "").trim(),
        }))
      : [{ id: newCpId(), name: "", email: "", phone: "" }];
  return {
    vs01DocumentId: params.vs01DocumentId.trim(),
    agreementId: params.agreementId.trim(),
    agreementTitle: (params.draft?.title || "").trim() || "Agreement",
    creatorName,
    creatorEmail,
    counterparties,
    targetStep: 2,
  };
}

export function writeAgreementVs01BridgeSession(payload: AgreementVs01BridgeSession): void {
  try {
    sessionStorage.setItem(BRIDGE_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readAgreementVs01BridgeSession(): AgreementVs01BridgeSession | null {
  try {
    const raw = sessionStorage.getItem(BRIDGE_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as AgreementVs01BridgeSession;
    if (!o?.vs01DocumentId?.trim() || !o.agreementId?.trim()) return null;
    if (!Array.isArray(o.counterparties)) return null;
    return o;
  } catch {
    return null;
  }
}

export function clearAgreementVs01BridgeSession(): void {
  try {
    sessionStorage.removeItem(BRIDGE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export type AgreementVs01SigningSeedResult =
  | { ok: true; documentId: string; contentSha256: string | null }
  | { ok: false; reason: string; httpStatus?: number; detail?: unknown };

/**
 * POST /api/agreements/:id/vs01-signing-seed — returns VS01 document_id for `/app/esign/:documentId`.
 */
export function logAgreementToVs01EsignRoute(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.info("[agreement-to-vs01-esign-route]", {
    source: "paid_pro_sender_first",
    signerFirst: true,
    ...payload,
  });
}

/** Paid Pro sender-first: VS01 seed failed; user stays on SimpleSend (no alternate route). */
export function logAgreementVs01SeedBlocked(payload: {
  agreementId: string;
  status: number | null;
  detail: unknown;
  source: "paid_pro_sender_first";
}): void {
  // eslint-disable-next-line no-console
  console.warn("[agreement-vs01-seed-blocked]", payload);
}

function vs01SeedFailureReason(detail: unknown, httpStatus: number): string {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    const code = o.code;
    if (typeof code === "string" && code.trim()) return code.trim();
    const message = o.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return `http_${httpStatus}`;
}

export async function fetchAgreementVs01SigningSeed(agreementId: string): Promise<AgreementVs01SigningSeedResult> {
  const id = agreementId.trim();
  if (!id) return { ok: false, reason: "missing_agreement_id" };
  try {
    const res = await fetch(
      `${resolveApiBase().replace(/\/$/, "")}/api/agreements/${encodeURIComponent(id)}/vs01-signing-seed`,
      { method: "POST", headers: clawAgreementHeaders({ "Content-Type": "application/json" }), body: "{}" },
    );
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const d = j.detail;
      const reason = vs01SeedFailureReason(d, res.status);
      // eslint-disable-next-line no-console
      console.warn("[agreement-vs01-seed-failed]", {
        agreementId: id,
        status: res.status,
        detail: d,
        raw: j,
      });
      return { ok: false, reason, httpStatus: res.status, detail: d };
    }
    const docId = typeof j.document_id === "string" ? j.document_id.trim() : "";
    if (!docId) return { ok: false, reason: "missing_document_id" };
    const hash = typeof j.content_sha256 === "string" ? j.content_sha256.trim() : null;
    // eslint-disable-next-line no-console
    console.info("[agreement-vs01-seed-success]", {
      agreementId: id,
      documentId: docId,
      content_sha256: hash,
    });
    return { ok: true, documentId: docId, contentSha256: hash };
  } catch {
    // eslint-disable-next-line no-console
    console.warn("[agreement-vs01-seed-failed]", {
      agreementId: id,
      status: 0,
      detail: "network",
    });
    return { ok: false, reason: "network", httpStatus: 0, detail: "network" };
  }
}
