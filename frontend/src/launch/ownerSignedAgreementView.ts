import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraft } from "../agreement/agreementWorkspaceApi";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { getLawDogApiBase } from "../lib/clawApi";
import { buildReviewFirstDocumentDisplayHtml } from "../agreement/reviewFirstDocumentDisplay";
import {
  ownerAgreementReadOnlyUsesPremiumDocument,
  cloneOwnerReadOnlyDraft,
} from "./ownerAgreementReadOnlyView";
import {
  reconstructSignedCorpusFromAuditAndPortable,
  resolveVs01FullyExecutedSignedCorpus,
} from "../vs01/vs01FullyExecutedSignedSnapshot";
import { findVs01CanonicalPacketPortableByAgreementId } from "../vs01/vs01CanonicalPacketSeed";
import { postVs01EnsureSignedSnapshot } from "../agreement/agreementWorkspaceApi";
import { fetchPublicAgreementVerify } from "../agreement/agreementPublicVerify";

export type OwnerSignedAgreementCorpusSource =
  | "fully_executed_snapshot"
  | "reconstructed"
  | "portable_packet"
  | "local_portable"
  | "missing";

function logOwnerSignedAgreementViewSource(args: {
  agreementId: string;
  corpusSource: OwnerSignedAgreementCorpusSource;
  snapshotReady: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[owner-signed-agreement-view]", {
    agreementId: args.agreementId,
    corpusSource: args.corpusSource,
    snapshotReady: args.snapshotReady,
  });
}

function resolveSignedCorpusFromDraft(
  draft: AgreementDraft,
): { text: string; source: Exclude<OwnerSignedAgreementCorpusSource, "missing"> } | null {
  return resolveVs01FullyExecutedSignedCorpus(draft);
}

function resolveSignedCorpusFromLocalPortable(
  draft: AgreementDraft,
  agreementId: string,
): { text: string; source: Exclude<OwnerSignedAgreementCorpusSource, "missing"> } | null {
  const localPortable = findVs01CanonicalPacketPortableByAgreementId(agreementId);
  if (!localPortable) return null;
  const rebuilt = reconstructSignedCorpusFromAuditAndPortable({ draft, portable: localPortable });
  if (!rebuilt?.trim()) {
    const snap = localPortable.fullyExecutedSnapshot?.corpusPlain?.trim();
    if (snap) return { text: snap, source: "local_portable" };
    return null;
  }
  return { text: rebuilt.trim(), source: "local_portable" };
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

/** Load fully executed signed agreement for owner view-signed surface. */
export async function loadOwnerSignedAgreementPreview(
  agreementId: string,
): Promise<{
  draft: AgreementDraft;
  html: string;
  corpusText: string;
  usesPremiumDocument: boolean;
  corpusSource: Exclude<OwnerSignedAgreementCorpusSource, "missing">;
} | null> {
  const id = String(agreementId || "").trim();
  if (!id) return null;
  const res = await fetchAgreementDraft(id);
  if (!res.ok || !res.draft) return null;
  const draft = res.draft as AgreementDraft;

  let renderBaseDraft = draft;

  let signed = resolveSignedCorpusFromDraft(draft);
  if (!signed?.text) {
    signed = resolveSignedCorpusFromLocalPortable(draft, id);
  }

  if (!signed?.text) {
    const verify = await fetchPublicAgreementVerify(id);
    if (verify?.signature_status?.fully_executed) {
      const ensured = await postVs01EnsureSignedSnapshot(id);
      if (ensured.ok && ensured.snapshot_ready) {
        const refreshed = await fetchAgreementDraft(id);
        if (refreshed.ok && refreshed.draft) {
          renderBaseDraft = refreshed.draft as AgreementDraft;
          signed = resolveSignedCorpusFromDraft(renderBaseDraft);
        }
      }
      if (!signed?.text) {
        logOwnerSignedAgreementViewSource({
          agreementId: id,
          corpusSource: "missing",
          snapshotReady: Boolean(ensured.snapshot_ready),
        });
        return null;
      }
    } else {
      logOwnerSignedAgreementViewSource({
        agreementId: id,
        corpusSource: "missing",
        snapshotReady: false,
      });
      return null;
    }
  }

  logOwnerSignedAgreementViewSource({
    agreementId: id,
    corpusSource: signed.source,
    snapshotReady: true,
  });

  const renderDraft = cloneOwnerReadOnlyDraft(renderBaseDraft);
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
