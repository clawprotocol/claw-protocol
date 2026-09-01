/**
 * After Continue seeds `/app/esign/doc_*`, remount / inspect must mount
 * commercial Prepare with dual-party signature fields — not the empty
 * Step-3 self-sign shell ("Sign your document" / YOU / zero fields).
 *
 * Leftover remount bind already recovers persist Review (body). That path
 * is frozen. This module only reconstructs Prepare from durable
 * frozen-signing-authority when session skip/bridge is gone (query stripped
 * after first land, or inspect without sessionStorage).
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraftWithSigningLock } from "../agreement/agreementWorkspaceApi";
import {
  persistHasTwoAuthorizedSigners,
  frozenSigningAuthorityToAuthorityParties,
} from "../components/agreements/paidProPaidReturnSignerFinalizedRestore";
import {
  adoptFrozenSigningAuthoritySnapshotForCurrentSession,
  frozenSnapshotToLegalPartyRows,
  loadFrozenSigningAuthority,
  type FrozenSigningAuthoritySnapshotV1,
} from "../components/agreements/frozenSigningAuthoritySnapshot";
import {
  buildAgreementVs01BridgeSession,
  readAgreementVs01BridgeSession,
  readPaidProAgreementBridgeSkipMarker,
  setPaidProAgreementBridgeSkipMarker,
  writeAgreementVs01BridgeSession,
  type AgreementVs01BridgeSession,
  type RecipientSetupEmailInput,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { resolveEsignEntryReviewBindContext } from "./vs01EsignRemountReviewBind";
import {
  persistReviewGetPlainForSigningSeed,
  reviewCorpusLooksLikeLeftoverFusedNotices,
} from "./vs01CurrentReviewSotForSeed";
import { fetchVs01DocumentMeta } from "./vs01Api";
import { buildVs01PrepareSigningRolesForBridge } from "../components/agreements/paidProNPartySignerSetup";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

export const FIRST_FAILING_REMOUNT_SELF_SIGN_SHELL_PREDICATE =
  "esign_remount_lands_empty_self_sign_step3_not_prepare" as const;

/**
 * Restore can paint Prepare chrome while hydrateLocalPaidProBridge returns
 * false when persist Review / bridge corpus is empty or under 1500 — canvas
 * stays on Preparing forever. After ensure and/or frozen restore, always set
 * prepareCorpusText from this certified SoT (same as #155–#157).
 */
export const FIRST_FAILING_REMOUNT_PREPARE_CORPUS_UNSET_PREDICATE =
  "esign_remount_prepare_chrome_without_prepare_corpus_text" as const;

export const PREPARE_RESTORED_FROM_FROZEN_SIGNING_AUTHORITY =
  "prepare_restored_from_frozen_signing_authority" as const;

export const PREPARE_REUSED_EXISTING_BRIDGE_SESSION =
  "prepare_reused_existing_bridge_session" as const;

export type RemountPrepareRestoreResult =
  | {
      ok: true;
      reason:
        | typeof PREPARE_RESTORED_FROM_FROZEN_SIGNING_AUTHORITY
        | typeof PREPARE_REUSED_EXISTING_BRIDGE_SESSION;
      agreementId: string;
      documentId: string;
      bridge: AgreementVs01BridgeSession;
      authorizedSignerCount: number;
    }
  | { ok: false; reason: string };

export function remountSurfaceIsEmptySelfSignShell(args: {
  hideStepper: boolean;
  paidProAgreementBridgeSkip: boolean;
  step: number;
  prepareRoleCount: number;
  placedSignatureCount: number;
}): boolean {
  return (
    args.hideStepper &&
    args.step === 2 &&
    (!args.paidProAgreementBridgeSkip || args.prepareRoleCount < 2) &&
    args.placedSignatureCount === 0
  );
}

export function shouldRestorePrepareFromFrozenSigningAuthority(args: {
  hideStepper: boolean;
  seedDocumentId: string;
  paidProAgreementBridgeSkip: boolean;
  matchingBridge: boolean;
  frozenAuthorizedSignerCount: number;
}): boolean {
  if (!args.hideStepper) return false;
  if (!args.seedDocumentId.startsWith("doc_")) return false;
  if (args.frozenAuthorizedSignerCount < 2) return false;
  if (args.paidProAgreementBridgeSkip && args.matchingBridge) return false;
  return true;
}

export type RemountPrepareCorpusTextResult =
  | { ok: true; corpus: string }
  | { ok: false; reason: "empty_or_short" | "leftover_fused" };

/**
 * Certified persist Review / restored bridge corpus for remount Prepare.
 * Same SoT as leftover remount (#155–#157). Does not invent a second corpus.
 * Synchronous — must not wait on workspace bind completing.
 */
export function resolveRemountPrepareCorpusText(args: {
  persistReviewCorpus?: string | null;
  restoredBridgeCorpus?: string | null;
}): RemountPrepareCorpusTextResult {
  const persist = persistReviewGetPlainForSigningSeed(args.persistReviewCorpus);
  const restored = persistReviewGetPlainForSigningSeed(args.restoredBridgeCorpus);
  const candidate = persist || restored;
  if (!candidate) return { ok: false, reason: "empty_or_short" };
  if (reviewCorpusLooksLikeLeftoverFusedNotices(candidate)) {
    return { ok: false, reason: "leftover_fused" };
  }
  return { ok: true, corpus: candidate };
}

/**
 * hydrateLocalPaidProBridge returns false when neither persist Review nor
 * bridge.agreementCorpusText is long enough — leaving prepareCorpusText unset.
 */
export function remountPrepareHydrateWouldSkipUnsetCorpus(args: {
  persistReviewCorpus?: string | null;
  bridgeAgreementCorpusText?: string | null;
}): boolean {
  const corpus = (args.persistReviewCorpus || args.bridgeAgreementCorpusText || "").trim();
  return corpus.length < VS01_SIGNING_CORPUS_MIN_LEN;
}

/** Fail-closed toast: restored chrome with no certified corpus, or leftover fused. */
export function remountPrepareShouldFailClosedWithoutCertifiedCorpus(args: {
  hideStepper: boolean;
  seedDocumentId: string;
  remountPrepareRestored: boolean;
  corpus: RemountPrepareCorpusTextResult;
}): boolean {
  if (!args.hideStepper || !args.seedDocumentId.startsWith("doc_")) return false;
  if (args.corpus.ok) return false;
  return args.remountPrepareRestored || args.corpus.reason === "leftover_fused";
}

export function remountHasDualPartySignatureFields(args: {
  roles: readonly { roleId: string; signerName?: string | null }[];
  fields: readonly { type: string; assignedSignerRoleId?: string | null; autoInitials?: boolean }[];
}): boolean {
  const authorized = args.roles.filter((r) => (r.signerName ?? "").trim().length >= 2);
  if (authorized.length < 2) return false;
  const sigs = args.fields.filter((f) => f.type === "signature" && !f.autoInitials);
  return authorized.every((r) => sigs.some((f) => (f.assignedSignerRoleId ?? "").trim() === r.roleId));
}

export function recipientSetupFromFrozenSigningAuthority(
  frozen: FrozenSigningAuthoritySnapshotV1,
): RecipientSetupEmailInput {
  const parties = frozenSigningAuthorityToAuthorityParties(frozen);
  return {
    recipientPartySignerNames: parties.map((p) => p.signerName),
    recipientPartySignerTitles: parties.map((p) => p.signerTitle),
    recipientPartyEmails: parties.map((p) => p.signerEmail),
    recipientPartyLegalNames: parties.map((p) => p.partyLegalName),
    recipient1Name: parties[0]?.partyLegalName,
    recipient2Name: parties[1]?.partyLegalName,
    recipient1Email: parties[0]?.signerEmail,
    recipient2Email: parties[1]?.signerEmail,
    signerSetupUiPartyCount: parties.length,
  };
}

export function overlayFrozenSigningAuthorityOntoDraft(
  draft: AgreementDraft | null,
  frozen: FrozenSigningAuthoritySnapshotV1,
  agreementId: string,
): AgreementDraft {
  const rows = frozenSnapshotToLegalPartyRows(frozen);
  const parties = rows.map((row, i) => {
    const prev = draft?.parties?.[i];
    return {
      ...prev,
      id: row.id,
      name: row.name,
      role: row.role,
      email: row.email ?? prev?.email ?? "",
      signerName: row.signerName ?? prev?.signerName,
      signerTitle: row.signerTitle ?? prev?.signerTitle,
      signerEmail: row.signerEmail ?? prev?.signerEmail,
      requiresSignature: row.requiresSignature,
    };
  });
  if (draft) return { ...draft, parties };
  return {
    id: agreementId,
    title: "Agreement",
    jurisdiction: "",
    parties,
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: [],
  };
}

export function persistPrepareBridgeSession(bridge: AgreementVs01BridgeSession): void {
  writeAgreementVs01BridgeSession(bridge);
  setPaidProAgreementBridgeSkipMarker(bridge.vs01DocumentId);
}

export function matchingPrepareBridgeForDocument(
  documentId: string,
): AgreementVs01BridgeSession | null {
  const sid = documentId.trim();
  if (!sid) return null;
  const bridge = readAgreementVs01BridgeSession();
  if (!bridge || bridge.vs01DocumentId.trim() !== sid) return null;
  return bridge;
}

function authorizedSignerCount(frozen: FrozenSigningAuthoritySnapshotV1 | null | undefined): number {
  if (!persistHasTwoAuthorizedSigners(frozen)) return frozen?.signers?.length ?? 0;
  return frozen!.signers.filter(
    (s) => s.requiresSignature !== false && (s.signerName || "").trim().length >= 2,
  ).length;
}

export async function restorePrepareFromFrozenSigningAuthority(args: {
  documentId: string;
  hideStepper?: boolean;
  reviewCorpus?: string | null;
  agreementId?: string | null;
  draft?: AgreementDraft | null;
  fetchDocumentMeta?: (id: string) => Promise<{ agreementId: string | null }>;
  fetchDraft?: (agreementId: string) => Promise<AgreementDraft | null>;
  loadFrozen?: (agreementId: string) => Promise<FrozenSigningAuthoritySnapshotV1 | null>;
}): Promise<RemountPrepareRestoreResult> {
  const documentId = args.documentId.trim();
  if (!documentId.startsWith("doc_")) {
    return { ok: false, reason: "not_server_doc" };
  }
  if (args.hideStepper === false) {
    return { ok: false, reason: "not_esign_shell" };
  }

  const existing = matchingPrepareBridgeForDocument(documentId);
  if (existing && readPaidProAgreementBridgeSkipMarker(documentId)) {
    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: existing.agreementId,
      creatorName: existing.creatorName,
      creatorEmail: existing.creatorEmail,
      ownerSignerName: existing.creatorSignerName,
      ownerSignerTitle: existing.creatorSignerTitle,
      counterparties: existing.counterparties,
      bridge: existing,
    });
    if (roles.filter((r) => (r.signerName ?? "").trim().length >= 2).length >= 2) {
      return {
        ok: true,
        reason: PREPARE_REUSED_EXISTING_BRIDGE_SESSION,
        agreementId: existing.agreementId,
        documentId,
        bridge: existing,
        authorizedSignerCount: roles.length,
      };
    }
  }

  let agreementId = (args.agreementId ?? "").trim();
  if (!agreementId) {
    const ctx = resolveEsignEntryReviewBindContext(documentId);
    agreementId = (ctx?.agreementId ?? "").trim();
  }
  if (!agreementId) {
    try {
      const meta = await (args.fetchDocumentMeta ?? fetchVs01DocumentMeta)(documentId);
      agreementId = (meta.agreementId ?? "").trim();
    } catch {
      agreementId = "";
    }
  }
  if (!agreementId) {
    return { ok: false, reason: "missing_agreement_id" };
  }

  let draft = args.draft ?? null;
  if (!draft) {
    try {
      draft = args.fetchDraft
        ? await args.fetchDraft(agreementId)
        : (await fetchAgreementDraftWithSigningLock(agreementId)).draft;
    } catch {
      draft = null;
    }
  }

  const frozen = await (args.loadFrozen
    ? args.loadFrozen(agreementId)
    : loadFrozenSigningAuthority({ agreementId, expectedVersion: 1 }));
  if (!persistHasTwoAuthorizedSigners(frozen)) {
    return { ok: false, reason: "frozen_missing_two_authorized_signers" };
  }

  const reviewCorpus = (args.reviewCorpus ?? "").trim() || (existing?.agreementCorpusText ?? "").trim();
  adoptFrozenSigningAuthoritySnapshotForCurrentSession(frozen!);
  const overlay = overlayFrozenSigningAuthorityOntoDraft(draft, frozen!, agreementId);
  const setup = recipientSetupFromFrozenSigningAuthority(frozen!);
  const bridge = buildAgreementVs01BridgeSession({
    agreementId,
    vs01DocumentId: documentId,
    draft: overlay,
    senderFirstLawdogHandoff: true,
    reviewerApprovedCleanHandoff: true,
    agreementCorpusText: reviewCorpus.length >= VS01_SIGNING_CORPUS_MIN_LEN ? reviewCorpus : undefined,
    recipientSetup: setup,
  });
  persistPrepareBridgeSession(bridge);
  return {
    ok: true,
    reason: PREPARE_RESTORED_FROM_FROZEN_SIGNING_AUTHORITY,
    agreementId,
    documentId,
    bridge,
    authorizedSignerCount: authorizedSignerCount(frozen),
  };
}
