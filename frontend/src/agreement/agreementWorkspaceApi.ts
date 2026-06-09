import type { AgreementDraft } from "./agreementTypes";
import { normalizeAgreementDraftFromApi } from "./agreementDraftNormalize";
import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { recipientAgreementReadHeaders } from "./recipientAccessApi";
import { apiUrl, logClawClientWarning, resolveApiBase } from "../lib/clawApi";

export type WorkspaceIndexAgreement = {
  id: string;
  title: string;
  created_at?: string;
  updated_at: string;
  party_count: number;
  signer_count: number;
  version_ledger_count: number;
  completed_signed: boolean;
  has_server_signing_lock: boolean;
  locked_version_id: string | null;
  workspace_archived_at: string | null;
  review_sent_at: string | null;
  /** True when audit log includes recipient/participant approval (reviewer accepted on link). */
  reviewer_approved?: boolean;
  /** Distinct reviewer approvals counted via participant ids (when present). */
  review_approvals_completed?: number;
  review_approvals_required?: number;
  /** True when every required reviewer has approved and there are no open change requests. */
  all_reviewers_approved?: boolean;
  workspace_folder_id?: string | null;
  workspace_folder_name?: string | null;
  workspace_tags?: string[];
};

const base = () => resolveApiBase().replace(/\/$/, "");

export type WorkspaceIndexSkippedRow = {
  id: string;
  reason: string;
};

export type WorkspaceIndexResult = {
  agreements: WorkspaceIndexAgreement[];
  skipped: WorkspaceIndexSkippedRow[];
  error: string | null;
};

/** Workspace agreement list for dashboard / landing. Surfaces load errors (no silent empty list). */
export async function fetchWorkspaceIndex(): Promise<WorkspaceIndexResult> {
  const url = apiUrl("/api/agreements/workspace-index");
  try {
    const res = await fetch(url, { headers: clawAgreementHeaders() });
    if (!res.ok) {
      logClawClientWarning("agreements.workspace-index", { status: res.status, url });
      return {
        agreements: [],
        skipped: [],
        error:
          res.status >= 500
            ? "We couldn’t reach the agreements service. Try again in a moment."
            : `Could not load your agreements (HTTP ${res.status}).`,
      };
    }
    const j = (await res.json()) as {
      agreements?: WorkspaceIndexAgreement[];
      skipped?: WorkspaceIndexSkippedRow[];
    };
    return {
      agreements: Array.isArray(j.agreements) ? j.agreements : [],
      skipped: Array.isArray(j.skipped) ? j.skipped : [],
      error: null,
    };
  } catch (e) {
    logClawClientWarning("agreements.workspace-index", { error: String(e), url });
    return {
      agreements: [],
      skipped: [],
      error:
        "Network error — is the API running on port 8000? Start the backend so this page can list agreements.",
    };
  }
}

export async function postReviewSentServer(agreementId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(agreementId)}/review-sent`,
      { method: "POST", headers: clawAgreementHeaders() }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Merge server draft audit into index row for routing (e.g. signed before index refresh). */
export async function fetchAgreementAuditSignedFlag(agreementId: string): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/api/agreements/${encodeURIComponent(agreementId)}`, {
      headers: clawAgreementHeaders(),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { draft?: { audit_log?: Array<{ event_type?: string }> } };
    const audit = j?.draft?.audit_log || [];
    return audit.some((e) => (e?.event_type || "") === "signed");
  } catch {
    return false;
  }
}

/** Load agreement draft JSON for workspace routing / hydration (same shape as AgreementReview). */
/** New draft seeded from an existing agreement (new id; prior proof does not carry over). */
export async function postDraftFromPriorAgreement(sourceAgreementId: string): Promise<{
  ok: boolean;
  newAgreementId?: string;
  error?: string;
}> {
  const src = String(sourceAgreementId || "").trim();
  if (!src) return { ok: false, error: "missing_source" };
  try {
    const res = await fetch(`${base()}/api/agreements/draft-from-agreement`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ source_agreement_id: src }),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; detail?: unknown };
    if (res.ok && j.id) return { ok: true, newAgreementId: String(j.id) };
    const det = j.detail;
    const msg =
      typeof det === "string"
        ? det
        : det && typeof det === "object" && "message" in det
          ? String((det as { message?: string }).message || "")
          : "";
    return { ok: false, error: msg || `HTTP ${res.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function fetchAgreementDraft(
  agreementId: string,
  opts?: { partyNameContext?: string },
): Promise<{
  ok: boolean;
  draft: AgreementDraft | null;
}> {
  const id = String(agreementId || "").trim();
  if (!id) return { ok: false, draft: null };
  try {
    const res = await fetch(`${base()}/api/agreements/${encodeURIComponent(id)}`, {
      headers: clawAgreementHeaders(),
    });
    if (!res.ok) return { ok: false, draft: null };
    const j = (await res.json()) as { draft?: unknown };
    const draft = normalizeAgreementDraftFromApi(j?.draft ?? null, {
      fallbackAgreementId: id,
      partyNameContext: opts?.partyNameContext,
    });
    return { ok: draft != null, draft };
  } catch {
    return { ok: false, draft: null };
  }
}

/** Same GET as {@link fetchAgreementDraft} but also returns server `signing_lock` (owner resume / finalize UX). */
export async function fetchAgreementDraftWithSigningLock(
  agreementId: string,
  opts?: { partyNameContext?: string },
): Promise<{
  ok: boolean;
  draft: AgreementDraft | null;
  lockedVersionId: string | null;
}> {
  const id = String(agreementId || "").trim();
  if (!id) return { ok: false, draft: null, lockedVersionId: null };
  try {
    const res = await fetch(`${base()}/api/agreements/${encodeURIComponent(id)}`, {
      headers: clawAgreementHeaders(),
    });
    if (!res.ok) return { ok: false, draft: null, lockedVersionId: null };
    const j = (await res.json()) as {
      draft?: unknown;
      signing_lock?: { locked_version_id?: string } | null;
    };
    const draft = normalizeAgreementDraftFromApi(j?.draft ?? null, {
      fallbackAgreementId: id,
      partyNameContext: opts?.partyNameContext,
    });
    const lv = String(j?.signing_lock?.locked_version_id || "").trim();
    return { ok: draft != null, draft, lockedVersionId: lv || null };
  } catch {
    return { ok: false, draft: null, lockedVersionId: null };
  }
}

export async function patchWorkspaceArchive(agreementId: string, archived: boolean): Promise<boolean> {
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(agreementId)}/workspace-archive`,
      {
        method: "PATCH",
        headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ archived }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Assign agreement to a proof-layer folder, or pass `null` / empty to unfile. */
export async function patchWorkspaceFolder(
  agreementId: string,
  folderId: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(agreementId)}/workspace-folder`,
      {
        method: "PATCH",
        headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ folder_id: folderId?.trim() ? folderId.trim() : null }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Replace workspace tags (comma-free list; server normalizes). */
export async function patchWorkspaceTags(agreementId: string, tags: string[]): Promise<boolean> {
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(agreementId)}/workspace-tags`,
      {
        method: "PATCH",
        headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tags }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export type RecipientProposalSubmitBody = {
  instruction: string;
  proposer_id: string;
  proposer_display_name?: string;
  draft: {
    title: string;
    jurisdiction: string;
    parties: Array<{ id?: string; name: string; role: string; email?: string }>;
    purpose: string;
    payment_terms: string;
    duration: string | null;
    due_date: string | null;
    effective_date: string | null;
  };
  rendered_html: string;
};

export type RecipientProposalApiResult = {
  ok: boolean;
  proposal_id?: string;
  error?: string;
  httpStatus?: number;
  responseBody?: unknown;
};

function parseRecipientProposalApiError(
  status: number,
  payload: unknown,
): { error: string; httpStatus: number; responseBody: unknown } {
  const detail = (payload as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return { error: detail.trim(), httpStatus: status, responseBody: payload };
  }
  if (detail != null && typeof detail === "object") {
    const obj = detail as { code?: string; message?: string };
    const code = String(obj.code ?? "").trim();
    const message = String(obj.message ?? "").trim();
    if (code && message) return { error: `${code}: ${message}`, httpStatus: status, responseBody: payload };
    if (code) return { error: code, httpStatus: status, responseBody: payload };
    if (message) return { error: message, httpStatus: status, responseBody: payload };
  }
  return { error: `error_${status}`, httpStatus: status, responseBody: payload };
}

export async function stageRecipientProposalApi(
  agreementId: string,
  body: RecipientProposalSubmitBody,
  recipientAccessToken?: string | null,
): Promise<RecipientProposalApiResult> {
  const id = encodeURIComponent(agreementId);
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/recipient-proposal/stage`, {
      method: "POST",
      headers: {
        ...clawAgreementHeaders({ "Content-Type": "application/json" }),
        ...recipientAgreementReadHeaders(agreementId, recipientAccessToken),
      },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const proposal_id = String((j as { proposal_id?: unknown }).proposal_id ?? "").trim();
      return { ok: true, proposal_id: proposal_id || undefined, httpStatus: res.status, responseBody: j };
    }
    const parsed = parseRecipientProposalApiError(res.status, j);
    return { ok: false, ...parsed };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function finalizeRecipientProposalApi(
  agreementId: string,
  proposalId: string,
  recipientAccessToken?: string | null,
): Promise<RecipientProposalApiResult> {
  const id = encodeURIComponent(agreementId);
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/recipient-proposal`, {
      method: "POST",
      headers: {
        ...clawAgreementHeaders({ "Content-Type": "application/json" }),
        ...recipientAgreementReadHeaders(agreementId, recipientAccessToken),
      },
      body: JSON.stringify({ proposal_id: proposalId }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const proposal_id = String((j as { proposal_id?: unknown }).proposal_id ?? proposalId).trim();
      return { ok: true, proposal_id: proposal_id || proposalId, httpStatus: res.status, responseBody: j };
    }
    const parsed = parseRecipientProposalApiError(res.status, j);
    return { ok: false, ...parsed };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** @deprecated Prefer stageRecipientProposalApi + finalizeRecipientProposalApi */
export async function submitRecipientProposalApi(
  agreementId: string,
  body: RecipientProposalSubmitBody,
  recipientAccessToken?: string | null,
): Promise<RecipientProposalApiResult> {
  const staged = await stageRecipientProposalApi(agreementId, body, recipientAccessToken);
  if (!staged.ok || !staged.proposal_id) return staged;
  return finalizeRecipientProposalApi(agreementId, staged.proposal_id, recipientAccessToken);
}

export async function rejectRecipientProposalApi(
  agreementId: string,
  proposalId: string
): Promise<{ ok: boolean; draft?: unknown; error?: string }> {
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(agreementId)}/recipient-proposal/${encodeURIComponent(proposalId)}/reject`,
      { method: "POST", headers: clawAgreementHeaders({ "Content-Type": "application/json" }), body: "{}" }
    );
    const j = (await res.json().catch(() => ({}))) as { draft?: unknown; detail?: string };
    if (res.ok) return { ok: true, draft: j.draft };
    return { ok: false, error: j.detail || `error_${res.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function applyRecipientProposalApi(
  agreementId: string,
  proposalId: string
): Promise<{ ok: boolean; draft?: unknown; error?: string }> {
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(agreementId)}/recipient-proposal/${encodeURIComponent(proposalId)}/apply`,
      { method: "POST", headers: clawAgreementHeaders({ "Content-Type": "application/json" }), body: "{}" }
    );
    const j = (await res.json().catch(() => ({}))) as { draft?: unknown; detail?: string };
    if (res.ok) return { ok: true, draft: j.draft };
    return { ok: false, error: j.detail || `error_${res.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function recipientApproveCurrentApi(
  agreementId: string,
  opts?: {
    message?: string;
    participant_id?: string;
    participant_display_name?: string;
    recipientAccessToken?: string | null;
  }
): Promise<{ ok: boolean; error?: string; draft?: unknown }> {
  try {
    const res = await fetch(`${base()}/api/agreements/${encodeURIComponent(agreementId)}/recipient-approve`, {
      method: "POST",
      headers: {
        ...clawAgreementHeaders({ "Content-Type": "application/json" }),
        ...recipientAgreementReadHeaders(agreementId, opts?.recipientAccessToken),
      },
      body: JSON.stringify({
        message: opts?.message || "",
        participant_id: opts?.participant_id || "",
        participant_display_name: opts?.participant_display_name || "",
      }),
    });
    if (res.ok) {
      try {
        const j = (await res.json()) as { draft?: unknown };
        return { ok: true, draft: j?.draft };
      } catch {
        return { ok: true };
      }
    }
    const j = (await res.json().catch(() => ({}))) as { detail?: string };
    return { ok: false, error: j.detail || `error_${res.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function postSigningCeremonyStart(
  agreementId: string,
  participantId: string,
  recipientAccessToken?: string | null
): Promise<{
  ok: boolean;
  locked_version_id?: string;
  agreement_version_hash?: string;
  participant_display_name?: string;
  error?: string;
}> {
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(agreementId)}/signing-ceremony/start`,
      {
        method: "POST",
        headers: {
          ...clawAgreementHeaders({ "Content-Type": "application/json" }),
          ...recipientAgreementReadHeaders(agreementId, recipientAccessToken),
        },
        body: JSON.stringify({ participant_id: participantId }),
      }
    );
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      return {
        ok: true,
        locked_version_id: typeof j.locked_version_id === "string" ? j.locked_version_id : undefined,
        agreement_version_hash:
          typeof j.agreement_version_hash === "string" ? j.agreement_version_hash : undefined,
        participant_display_name:
          typeof j.participant_display_name === "string" ? j.participant_display_name : undefined,
      };
    }
    const d = j.detail as string | undefined;
    return { ok: false, error: d || `error_${res.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function postSigningCeremonyComplete(
  agreementId: string,
  body: { participant_id: string; typed_name: string; locked_version_id: string },
  recipientAccessToken?: string | null
): Promise<{
  ok: boolean;
  signed_at?: string;
  agreement_version_hash?: string;
  participant_display_name?: string;
  fully_executed?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(agreementId)}/signing-ceremony/complete`,
      {
        method: "POST",
        headers: {
          ...clawAgreementHeaders({ "Content-Type": "application/json" }),
          ...recipientAgreementReadHeaders(agreementId, recipientAccessToken),
        },
        body: JSON.stringify(body),
      }
    );
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      return {
        ok: true,
        signed_at: typeof j.signed_at === "string" ? j.signed_at : undefined,
        agreement_version_hash:
          typeof j.agreement_version_hash === "string" ? j.agreement_version_hash : undefined,
        participant_display_name:
          typeof j.participant_display_name === "string" ? j.participant_display_name : undefined,
        fully_executed: Boolean(j.fully_executed),
      };
    }
    const d = j.detail;
    if (typeof d === "object" && d !== null && "paywall" in d && (d as { paywall?: boolean }).paywall) {
      return {
        ok: false,
        error: (d as { message?: string }).message || "paywall",
        fully_executed: false,
      };
    }
    return { ok: false, error: typeof d === "string" ? d : `error_${res.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
}

export type AgreementMemoryUsageBlock = {
  tier: "none" | "standard" | "full" | string;
  semantic_search: boolean;
  relationship_view: boolean;
};

export type AgreementUsageSummary = {
  tier: string;
  agreements_created: number;
  agreements_completed: number;
  drafts_active: number;
  agreements_remaining: number | null;
  drafts_remaining: number | null;
  watermark_required: boolean;
  storage_persistent: boolean;
  paywall_required: boolean;
  soft_throttle: boolean;
  agreement_memory?: AgreementMemoryUsageBlock;
};

export async function fetchAgreementUsageSummary(): Promise<{
  ok: boolean;
  data: AgreementUsageSummary | null;
  error: string | null;
}> {
  try {
    const res = await fetch(`${base()}/api/agreements/usage/summary`, {
      headers: clawAgreementHeaders(),
    });
    if (!res.ok) {
      return { ok: false, data: null, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as AgreementUsageSummary;
    return { ok: true, data, error: null };
  } catch (e) {
    return { ok: false, data: null, error: String(e) };
  }
}
