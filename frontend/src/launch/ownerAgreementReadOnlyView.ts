import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraft } from "../agreement/agreementWorkspaceApi";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { getLawDogApiBase } from "../lib/clawApi";
import { resolveReviewFirstDisplayCorpus } from "./simpleProduct/reviewFirstDisplayCorpus";

/** Owner dashboard pending-review: read-only agreement copy (not full negotiate workspace). */
export function buildOwnerAgreementReadOnlyPath(agreementId: string): string {
  return `/app/agreements/${encodeURIComponent(String(agreementId || "").trim())}/view`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainCorpusToReadOnlyPreviewHtml(text: string): string {
  const body = (text || "").trim();
  if (!body) return "";
  return (
    "<article style='position:relative;max-width:720px;margin:0 auto'>" +
    "<p style='text-align:center;color:#475569;font-size:12px;margin-bottom:12px'>Draft Agreement (non-binding template)</p>" +
    "<pre style='white-space:pre-wrap;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:#0f172a;margin:0;padding:0;border:0;background:transparent'>" +
    escapeHtml(body) +
    "</pre></article>"
  );
}

export async function loadOwnerAgreementReadOnlyPreview(
  agreementId: string,
): Promise<{ draft: AgreementDraft; html: string } | null> {
  const id = String(agreementId || "").trim();
  if (!id) return null;
  const res = await fetchAgreementDraft(id);
  if (!res.ok || !res.draft) return null;
  const draft = res.draft as AgreementDraft;
  const corpus = resolveReviewFirstDisplayCorpus(draft, "owner_done");
  if (corpus && corpus.text.trim().length >= 80) {
    return { draft, html: plainCorpusToReadOnlyPreviewHtml(corpus.text) };
  }
  try {
    const rr = await fetch(`${getLawDogApiBase()}/api/agreements/${encodeURIComponent(id)}/render`, {
      method: "POST",
      headers: clawAgreementHeaders(),
    });
    if (rr.ok) {
      const payload = (await rr.json()) as { rendered_html?: unknown };
      const html = String(payload.rendered_html ?? "").trim();
      if (html) return { draft, html };
    }
  } catch {
    /* network optional — fall through to purpose text */
  }
  const fallback = String(draft.purpose ?? "").trim();
  if (fallback) {
    return { draft, html: plainCorpusToReadOnlyPreviewHtml(fallback) };
  }
  return { draft, html: "" };
}
