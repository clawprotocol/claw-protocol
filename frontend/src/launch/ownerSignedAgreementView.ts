import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  fetchAgreementDraft,
  fetchAgreementDraftWithSigningLock,
} from "../agreement/agreementWorkspaceApi";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { getLawDogApiBase } from "../lib/clawApi";
import { sha256Hex } from "../utils/agreements/hash";
import { buildReviewFirstDocumentDisplayHtml } from "../agreement/reviewFirstDocumentDisplay";
import {
  ownerAgreementReadOnlyUsesPremiumDocument,
  cloneOwnerReadOnlyDraft,
} from "./ownerAgreementReadOnlyView";
import {
  reconstructSignedCorpusFromAuditAndPortable,
  resolveVs01FullyExecutedSignedCorpus,
} from "../vs01/vs01FullyExecutedSignedSnapshot";
import { logCompletedExecutionCorpusOverlaySources } from "../vs01/paidProCompletedExecutionMetadataAuthority";
import { findVs01CanonicalPacketPortableByAgreementId } from "../vs01/vs01CanonicalPacketSeed";
import { postVs01EnsureSignedSnapshot } from "../agreement/agreementWorkspaceApi";
import { fetchPublicAgreementVerify } from "../agreement/agreementPublicVerify";

export type OwnerSignedAgreementCorpusSource =
  | "fully_executed_snapshot"
  | "accepted_snapshot"
  | "reconstructed"
  | "portable_packet"
  | "local_portable"
  | "missing";

type SigningLockBinding = {
  locked_version_id?: string | null;
  accepted_snapshot_id?: string | null;
  accepted_snapshot_digest?: string | null;
  accepted_snapshot_length?: number | null;
};

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

function acceptedSnapshotFromDraft(draft: AgreementDraft): {
  snapshotId: string;
  digest: string;
  length: number;
  text: string;
} | null {
  const raw = (draft as AgreementDraft & {
    accepted_review_snapshot_v1?: {
      snapshotId?: string;
      corpusSha256?: string;
      corpusLength?: number;
      corpusPlain?: string;
      status?: string;
    };
  }).accepted_review_snapshot_v1;
  if (!raw || String(raw.status || "").toLowerCase() !== "accepted") return null;
  const text = typeof raw.corpusPlain === "string" ? raw.corpusPlain : "";
  const snapshotId = String(raw.snapshotId || "").trim();
  const digest = String(raw.corpusSha256 || "").trim().toLowerCase();
  const length = Number(raw.corpusLength || 0) || text.length;
  if (!snapshotId || !/^[0-9a-f]{64}$/.test(digest) || text.length < 80) return null;
  if (length && length !== text.length) return null;
  return { snapshotId, digest, length, text };
}

async function textMatchesLockDigest(text: string, digest: string): Promise<boolean> {
  const want = digest.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(want) || !text.trim()) return false;
  return (await sha256Hex(text)) === want;
}

function lockBindingUsable(lock: SigningLockBinding | null | undefined): {
  snapshotId: string;
  digest: string;
} | null {
  const snapshotId = String(lock?.accepted_snapshot_id || "").trim();
  const digest = String(lock?.accepted_snapshot_digest || "").trim().toLowerCase();
  if (!snapshotId || !/^[0-9a-f]{64}$/.test(digest)) return null;
  return { snapshotId, digest };
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

async function resolveLockBoundCorpus(args: {
  draft: AgreementDraft;
  agreementId: string;
  lock: SigningLockBinding | null;
}): Promise<{ text: string; source: Exclude<OwnerSignedAgreementCorpusSource, "missing"> } | null> {
  const binding = lockBindingUsable(args.lock);
  if (!binding) return null;

  const accepted = acceptedSnapshotFromDraft(args.draft);
  if (accepted) {
    if (accepted.snapshotId !== binding.snapshotId) return null;
    if (accepted.digest !== binding.digest) return null;
    if (!(await textMatchesLockDigest(accepted.text, binding.digest))) return null;
    return { text: accepted.text, source: "accepted_snapshot" };
  }

  const vs01 = resolveSignedCorpusFromDraft(args.draft);
  if (vs01?.text && (await textMatchesLockDigest(vs01.text, binding.digest))) {
    return vs01;
  }

  const portable = resolveSignedCorpusFromLocalPortable(args.draft, args.agreementId);
  if (portable?.text && (await textMatchesLockDigest(portable.text, binding.digest))) {
    return portable;
  }

  const fallback = String(
    (args.draft as AgreementDraft & { server_full_document_text?: string }).server_full_document_text ||
      (args.draft as AgreementDraft & { premium_server_full_document_text?: string }).premium_server_full_document_text ||
      args.draft.document_text ||
      "",
  ).trim();
  if (fallback.length >= 80 && (await textMatchesLockDigest(fallback, binding.digest))) {
    return { text: fallback, source: "reconstructed" };
  }
  return null;
}

/** Load fully executed signed agreement for owner completed-document view. */
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
  const locked = await fetchAgreementDraftWithSigningLock(id);
  const res = locked.ok && locked.draft ? locked : await fetchAgreementDraft(id);
  if (!res.ok || !res.draft) return null;
  const draft = res.draft as AgreementDraft;
  const lock = locked.ok ? locked.signingLock || null : null;

  let renderBaseDraft = draft;
  let signed = await resolveLockBoundCorpus({ draft, agreementId: id, lock });

  if (!signed?.text) {
    const verify = await fetchPublicAgreementVerify(id);
    if (verify?.signature_status?.fully_executed) {
      const ensured = await postVs01EnsureSignedSnapshot(id);
      if (ensured.ok && ensured.snapshot_ready) {
        const refreshed = await fetchAgreementDraftWithSigningLock(id);
        if (refreshed.ok && refreshed.draft) {
          renderBaseDraft = refreshed.draft as AgreementDraft;
          signed = await resolveLockBoundCorpus({
            draft: renderBaseDraft,
            agreementId: id,
            lock: refreshed.signingLock || lock,
          });
        }
      }
    }
  }

  if (!signed?.text) {
    logOwnerSignedAgreementViewSource({
      agreementId: id,
      corpusSource: "missing",
      snapshotReady: false,
    });
    return null;
  }

  logOwnerSignedAgreementViewSource({
    agreementId: id,
    corpusSource: signed.source,
    snapshotReady: true,
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
