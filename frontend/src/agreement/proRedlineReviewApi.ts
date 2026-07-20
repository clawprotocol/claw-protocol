import type { AgreementDraft } from "./agreementTypes";
import { normalizeAgreementDraftFromApi } from "./agreementDraftNormalize";
import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { recipientAgreementFetchInit } from "./recipientAccessApi";
import { resolveApiBase } from "../lib/clawApi";

const base = () => resolveApiBase().replace(/\/$/, "");

export type ProRedlineDiffBlock =
  | { kind: "equal"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "changed"; removed_text: string; added_text: string };

export type ProRedlineImportTextResult = {
  ok: boolean;
  pending_id?: string;
  changed_block_count?: number;
  no_changes?: boolean;
  diff_summary?: { blocks: ProRedlineDiffBlock[]; changed_block_count: number };
  error?: string;
};

export async function downloadExportDraftTxt(agreementId: string): Promise<{ ok: boolean; error?: string }> {
  const id = encodeURIComponent(agreementId.trim());
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/export-draft.txt`, { headers: clawAgreementHeaders() });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lawdog-agreement-${agreementId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function downloadExportDraftDocx(agreementId: string): Promise<{ ok: boolean; error?: string }> {
  const id = encodeURIComponent(agreementId.trim());
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/export-draft.docx`, { headers: clawAgreementHeaders() });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lawdog-agreement-${agreementId.slice(0, 8)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postProRedlineImportText(agreementId: string, importedText: string): Promise<ProRedlineImportTextResult> {
  const id = encodeURIComponent(agreementId.trim());
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/pro-redline/import-text`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ imported_text: importedText }),
    });
    const j = (await res.json().catch(() => ({}))) as ProRedlineImportTextResult & { detail?: unknown };
    if (!res.ok) return { ok: false, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
    return { ...j, ok: true as const };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postProRedlineImportFile(agreementId: string, file: File): Promise<ProRedlineImportTextResult> {
  const id = encodeURIComponent(agreementId.trim());
  const fd = new FormData();
  fd.append("file", file, file.name || "upload");
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/pro-redline/import-file`, {
      method: "POST",
      headers: clawAgreementHeaders(),
      body: fd,
    });
    const j = (await res.json().catch(() => ({}))) as ProRedlineImportTextResult;
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ...j, ok: true as const };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postProRedlineAcceptImport(agreementId: string): Promise<{
  ok: boolean;
  draft?: AgreementDraft | null;
  version_number?: number;
  error?: string;
}> {
  const id = encodeURIComponent(agreementId.trim());
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/pro-redline/accept-import`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: "{}",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      draft?: unknown;
      version_number?: number;
    };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const draft = normalizeAgreementDraftFromApi(j.draft ?? null, { fallbackAgreementId: agreementId });
    const vn = typeof j.version_number === "number" ? j.version_number : undefined;
    return { ok: true, draft, version_number: vn };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postProRedlineRejectImport(agreementId: string): Promise<{
  ok: boolean;
  draft?: AgreementDraft | null;
  error?: string;
}> {
  const id = encodeURIComponent(agreementId.trim());
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/pro-redline/reject-import`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: "{}",
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; draft?: unknown };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const draft = normalizeAgreementDraftFromApi(j.draft ?? null, { fallbackAgreementId: agreementId });
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postProRedlineReviewerSuggestion(args: {
  agreementId: string;
  participantId: string;
  suggestionText: string;
  reviewerDisplayName?: string;
  reviewerEmail?: string;
  recipientAccessToken?: string | null;
}): Promise<{ ok: boolean; suggestion_id?: string; error?: string }> {
  const id = encodeURIComponent(args.agreementId.trim());
  try {
    const auth = recipientAgreementFetchInit(args.recipientAccessToken);
    const res = await fetch(`${base()}/api/agreements/${id}/pro-redline/reviewer-suggestion`, {
      method: "POST",
      credentials: auth.credentials,
      headers: {
        ...clawAgreementHeaders({ "Content-Type": "application/json" }),
        ...(auth.headers as Record<string, string>),
      },
      body: JSON.stringify({
        participant_id: args.participantId,
        suggestion_text: args.suggestionText,
        reviewer_display_name: args.reviewerDisplayName ?? "",
        reviewer_email: args.reviewerEmail ?? "",
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; suggestion_id?: string };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, suggestion_id: j.suggestion_id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postProRedlineSuggestionReject(
  agreementId: string,
  suggestionId: string,
): Promise<{ ok: boolean; draft?: AgreementDraft | null; error?: string }> {
  const id = encodeURIComponent(agreementId.trim());
  const sid = encodeURIComponent(suggestionId.trim());
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/pro-redline/suggestions/${sid}/reject`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: "{}",
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; draft?: unknown };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const draft = normalizeAgreementDraftFromApi(j.draft ?? null, { fallbackAgreementId: agreementId });
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postProRedlineSuggestionMarkApplied(
  agreementId: string,
  suggestionId: string,
  opts?: { appliedDocumentText?: string },
): Promise<{ ok: boolean; draft?: AgreementDraft | null; error?: string }> {
  const id = encodeURIComponent(agreementId.trim());
  const sid = encodeURIComponent(suggestionId.trim());
  try {
    const res = await fetch(`${base()}/api/agreements/${id}/pro-redline/suggestions/${sid}/mark-applied`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ applied_document_text: opts?.appliedDocumentText ?? "" }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; draft?: unknown };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const draft = normalizeAgreementDraftFromApi(j.draft ?? null, { fallbackAgreementId: agreementId });
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
