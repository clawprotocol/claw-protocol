import type { AgreementDraft } from "../agreement/agreementTypes";
import { buildReviewFirstDocumentDisplayHtml } from "../agreement/reviewFirstDocumentDisplay";
import { fetchAgreementDraft } from "../agreement/agreementWorkspaceApi";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { getLawDogApiBase } from "../lib/clawApi";
import {
  resolveReviewFirstDisplayCorpus,
  type ReviewFirstDisplayCorpus,
} from "./simpleProduct/reviewFirstDisplayCorpus";

const MIN_CORPUS_FOR_PREMIUM_HTML = 500;

/** Owner dashboard pending-review: read-only agreement copy (not full negotiate workspace). */
export function buildOwnerAgreementReadOnlyPath(agreementId: string): string {
  return `/app/agreements/${encodeURIComponent(String(agreementId || "").trim())}/view`;
}

export function ownerAgreementReadOnlyUsesPremiumDocument(corpusText: string): boolean {
  return (corpusText || "").trim().length >= MIN_CORPUS_FOR_PREMIUM_HTML;
}

/** Shallow clone so downstream display helpers cannot mutate the fetched draft object. */
export function cloneOwnerReadOnlyDraft(draft: AgreementDraft): AgreementDraft {
  return {
    ...draft,
    parties: (draft.parties ?? []).map((party) => ({ ...party })),
    versions: draft.versions ? [...draft.versions] : draft.versions,
    audit_log: draft.audit_log ? [...draft.audit_log] : draft.audit_log,
  };
}

/** Freeze resolved corpus text for display rendering without aliasing caller-owned objects. */
export function freezeOwnerReadOnlyCorpus(
  corpus: ReviewFirstDisplayCorpus | null,
): ReviewFirstDisplayCorpus | null {
  if (!corpus) return null;
  return {
    source: corpus.source,
    hash: corpus.hash,
    text: String(corpus.text),
  };
}

/** Display-only HTML via the same review-first Pro renderer as recipient/owner_done surfaces. */
export function buildOwnerAgreementReadOnlyDisplayHtml(args: {
  draft: AgreementDraft;
  corpus: ReviewFirstDisplayCorpus | null;
  serverHtml?: string;
}): { html: string; corpusText: string; usesPremiumDocument: boolean } {
  const corpusFrozen = freezeOwnerReadOnlyCorpus(args.corpus);
  const corpusText = (corpusFrozen?.text ?? "").trim();
  const renderDraft = cloneOwnerReadOnlyDraft(args.draft);
  const partyNames = (renderDraft.parties ?? []).map((p) => p.name);
  const html = buildReviewFirstDocumentDisplayHtml({
    serverHtml: args.serverHtml ?? "",
    corpusText,
    partyNames,
    draft: renderDraft,
    surface: "owner_done",
    selectedCorpusSource: corpusFrozen?.source,
    agreementId: String(renderDraft.id ?? "").trim() || null,
  });
  return {
    html,
    corpusText,
    usesPremiumDocument: ownerAgreementReadOnlyUsesPremiumDocument(corpusText),
  };
}

async function fetchAgreementRenderHtml(agreementId: string): Promise<string> {
  try {
    const rr = await fetch(`${getLawDogApiBase()}/api/agreements/${encodeURIComponent(agreementId)}/render`, {
      method: "POST",
      headers: clawAgreementHeaders(),
    });
    if (!rr.ok) return "";
    const payload = (await rr.json()) as { rendered_html?: unknown };
    return String(payload.rendered_html ?? "").trim();
  } catch {
    return "";
  }
}

export async function loadOwnerAgreementReadOnlyPreview(
  agreementId: string,
): Promise<{
  draft: AgreementDraft;
  html: string;
  corpusText: string;
  usesPremiumDocument: boolean;
} | null> {
  const id = String(agreementId || "").trim();
  if (!id) return null;
  const res = await fetchAgreementDraft(id);
  if (!res.ok || !res.draft) return null;
  const draft = res.draft as AgreementDraft;
  const corpus = freezeOwnerReadOnlyCorpus(resolveReviewFirstDisplayCorpus(draft, "owner_done"));
  const serverHtml =
    !corpus || corpus.text.trim().length < MIN_CORPUS_FOR_PREMIUM_HTML
      ? await fetchAgreementRenderHtml(id)
      : "";
  const rendered = buildOwnerAgreementReadOnlyDisplayHtml({ draft, corpus, serverHtml });
  return { draft, ...rendered };
}
