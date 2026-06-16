import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraft } from "../agreement/agreementWorkspaceApi";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { getLawDogApiBase } from "../lib/clawApi";
import { buildReviewFirstDocumentDisplayHtml } from "../agreement/reviewFirstDocumentDisplay";
import {
  ownerAgreementReadOnlyUsesPremiumDocument,
  cloneOwnerReadOnlyDraft,
} from "./ownerAgreementReadOnlyView";
import { resolveVs01FullyExecutedSignedCorpus } from "../vs01/vs01FullyExecutedSignedSnapshot";

export type OwnerSignedAgreementCorpusSource = "fully_executed_snapshot" | "reconstructed";

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

/** Load fully executed signed agreement for owner view-signed surface. */
export async function loadOwnerSignedAgreementPreview(
  agreementId: string,
): Promise<{
  draft: AgreementDraft;
  html: string;
  corpusText: string;
  usesPremiumDocument: boolean;
  corpusSource: OwnerSignedAgreementCorpusSource;
} | null> {
  const id = String(agreementId || "").trim();
  if (!id) return null;
  const res = await fetchAgreementDraft(id);
  if (!res.ok || !res.draft) return null;
  const draft = res.draft as AgreementDraft;

  const signed = resolveVs01FullyExecutedSignedCorpus(draft);
  if (!signed?.text) return null;

  const renderDraft = cloneOwnerReadOnlyDraft(draft);
  const partyNames = (renderDraft.parties ?? []).map((p) => p.name);
  const serverHtml =
    signed.text.length < 500 ? await fetchAgreementRenderHtml(id) : "";
  const html = buildReviewFirstDocumentDisplayHtml({
    serverHtml,
    corpusText: signed.text,
    partyNames,
    draft: renderDraft,
    surface: "owner_done",
    selectedCorpusSource: "authoritative_signing_snapshot",
    agreementId: id,
  });

  return {
    draft: renderDraft,
    html,
    corpusText: signed.text,
    usesPremiumDocument: ownerAgreementReadOnlyUsesPremiumDocument(signed.text),
    corpusSource: signed.source,
  };
}
