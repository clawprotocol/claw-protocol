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
  readFullyExecutedSnapshotFromDraft,
  reconstructSignedCorpusFromAuditAndPortable,
  resolveVs01FullyExecutedSignedCorpus,
} from "../vs01/vs01FullyExecutedSignedSnapshot";
import { logCompletedExecutionCorpusOverlaySources } from "../vs01/paidProCompletedExecutionMetadataAuthority";
import { findVs01CanonicalPacketPortableByAgreementId } from "../vs01/vs01CanonicalPacketSeed";
import { postVs01EnsureSignedSnapshot } from "../agreement/agreementWorkspaceApi";
import { fetchPublicAgreementVerify } from "../agreement/agreementPublicVerify";

export type OwnerSignedAgreementCorpusSource =
  | "fully_executed_snapshot"
  | "reconstructed"
  | "portable_packet"
  | "local_portable"
  | "accepted_review"
  | "missing";

const SIGNED_SNAPSHOT_SOURCES: ReadonlySet<Exclude<OwnerSignedAgreementCorpusSource, "missing">> = new Set([
  "fully_executed_snapshot",
  "reconstructed",
  "portable_packet",
  "local_portable",
]);

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

function draftLooksFullyExecuted(draft: AgreementDraft): boolean {
  return (draft.audit_log ?? []).some((event) => {
    if (String(event.event_type ?? "") !== "signed") return false;
    const val = event.value;
    return Boolean(val && typeof val === "object" && (val as { fully_executed?: unknown }).fully_executed);
  });
}

function readCertifiedReviewPlainForProofView(draft: AgreementDraft): string {
  const rec = draft.accepted_review_snapshot_v1;
  if (rec && typeof rec === "object") {
    const status = String(rec.status ?? "").trim().toLowerCase();
    if (!status || status === "accepted") {
      const plain = String(rec.corpusPlain ?? rec.corpus_plain ?? "").trim();
      if (plain.length >= 80) return plain;
    }
  }
  const registry = draft.canonical_review_snapshots_v1;
  if (!registry || typeof registry !== "object") return "";
  const acceptedId = String(registry.acceptedSnapshotId ?? registry.accepted_snapshot_id ?? "").trim();
  const snaps = registry.snapshots;
  if (!acceptedId || !snaps || typeof snaps !== "object") return "";
  const snap = (snaps as Record<string, unknown>)[acceptedId];
  if (!snap || typeof snap !== "object") return "";
  const status = String((snap as { status?: unknown }).status ?? "").trim().toLowerCase();
  if (status && status !== "accepted") return "";
  return String(
    (snap as { corpusPlain?: unknown; corpus_plain?: unknown }).corpusPlain ??
      (snap as { corpus_plain?: unknown }).corpus_plain ??
      "",
  ).trim();
}

function resolveSignedCorpusFromDraft(
  draft: AgreementDraft,
): { text: string; source: Exclude<OwnerSignedAgreementCorpusSource, "missing" | "accepted_review"> } | null {
  const resolved = resolveVs01FullyExecutedSignedCorpus(draft);
  if (resolved?.text?.trim()) return resolved;
  const snap = readFullyExecutedSnapshotFromDraft(draft);
  const text = snap?.corpusPlain?.trim() ?? "";
  if (text.length >= 80) return { text, source: "fully_executed_snapshot" };
  return null;
}

function resolveSignedCorpusFromLocalPortable(
  draft: AgreementDraft,
  agreementId: string,
): { text: string; source: Exclude<OwnerSignedAgreementCorpusSource, "missing"> } | null {
  const localPortable = findVs01CanonicalPacketPortableByAgreementId(agreementId);
  if (!localPortable) return null;
  const rebuilt = reconstructSignedCorpusFromAuditAndPortable({
    draft,
    portable: localPortable,
    source: "ownerSignedAgreementView:local_portable",
  });
  if (!rebuilt?.trim()) {
    const snap = localPortable.fullyExecutedSnapshot?.corpusPlain?.trim();
    if (snap) return { text: snap, source: "local_portable" };
    return null;
  }
  logCompletedExecutionCorpusOverlaySources({
    agreementId,
    source: "ownerSignedAgreementView:local_portable",
    corpusPlain: rebuilt.trim(),
    portable: localPortable,
  });
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

function isSignedSnapshotSource(
  source: Exclude<OwnerSignedAgreementCorpusSource, "missing">,
): boolean {
  return SIGNED_SNAPSHOT_SOURCES.has(source);
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
  pdfAvailable: boolean;
} | null> {
  const id = String(agreementId || "").trim();
  if (!id) return null;
  const res = await fetchAgreementDraft(id);
  if (!res.ok || !res.draft) return null;
  const draft = res.draft as AgreementDraft;

  let renderBaseDraft = draft;
  let snapshotReadyFromEnsure = false;

  let signed: { text: string; source: Exclude<OwnerSignedAgreementCorpusSource, "missing"> } | null =
    resolveSignedCorpusFromDraft(draft);
  if (!signed?.text) {
    signed = resolveSignedCorpusFromLocalPortable(draft, id);
  }

  if (!signed?.text) {
    const verify = await fetchPublicAgreementVerify(id);
    const fullyExecuted = Boolean(verify?.signature_status?.fully_executed) || draftLooksFullyExecuted(draft);
    if (fullyExecuted) {
      const ensured = await postVs01EnsureSignedSnapshot(id);
      snapshotReadyFromEnsure = Boolean(ensured.ok && ensured.snapshot_ready);
      if (snapshotReadyFromEnsure) {
        const refreshed = await fetchAgreementDraft(id);
        if (refreshed.ok && refreshed.draft) {
          renderBaseDraft = refreshed.draft as AgreementDraft;
          signed = resolveSignedCorpusFromDraft(renderBaseDraft);
        }
      }
      if (!signed?.text) {
        const reviewPlain = readCertifiedReviewPlainForProofView(renderBaseDraft);
        if (reviewPlain.length >= 80) {
          signed = { text: reviewPlain, source: "accepted_review" };
        }
      }
      if (!signed?.text) {
        logOwnerSignedAgreementViewSource({
          agreementId: id,
          corpusSource: "missing",
          snapshotReady: snapshotReadyFromEnsure,
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

  const pdfAvailable = isSignedSnapshotSource(signed.source) || snapshotReadyFromEnsure;

  logOwnerSignedAgreementViewSource({
    agreementId: id,
    corpusSource: signed.source,
    snapshotReady: pdfAvailable,
  });

  logCompletedExecutionCorpusOverlaySources({
    agreementId: id,
    source: `ownerSignedAgreementView:${signed.source}`,
    corpusPlain: signed.text,
    portable: findVs01CanonicalPacketPortableByAgreementId(id) ?? undefined,
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
    selectedCorpusSource:
      signed.source === "accepted_review" ? "accepted_review" : "authoritative_signing_snapshot",
    agreementId: id,
  });

  return {
    draft: renderDraft,
    html,
    corpusText: signed.text,
    usesPremiumDocument: ownerAgreementReadOnlyUsesPremiumDocument(signed.text),
    corpusSource: signed.source,
    pdfAvailable,
  };
}
