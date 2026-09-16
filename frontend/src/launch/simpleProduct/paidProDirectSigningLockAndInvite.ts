/**
 * After owner confirmation, lock the authoritative version and mint participant-bound
 * signing invitations. Emails-only / party_0 / array order never count as bindings.
 */
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  fetchAgreementDraft,
  fetchAgreementDraftWithSigningLock,
} from "../../agreement/agreementWorkspaceApi";
import { mintRecipientAccessTokenResult, putSigningLock } from "../../agreement/recipientAccessApi";
import { persistOwnerDeliveryTrack } from "../../components/agreements/paidProOwnerDeliveryTrack";
import { persistReviewEmailPartyRolesOnServer } from "./reviewEmailPartyRoles";
import type { RecipientSetupEmailInput } from "./agreementToVs01SigningBridge";

function ownerSigningPartyId(draft: AgreementDraft | null | undefined): string | null {
  const parties = Array.isArray(draft?.parties) ? draft.parties : [];
  const owners = parties.filter((party) => String(party.role ?? "").trim().toLowerCase() === "owner");
  if (owners.length !== 1) return null;
  const id = String(owners[0]?.id ?? "").trim();
  return id || null;
}

export function namedLegalSigningPartyCount(draft: AgreementDraft | null | undefined): number {
  const parties = Array.isArray(draft?.parties) ? draft.parties : [];
  return parties.filter((party) => String(party.name || "").trim().length >= 2).length;
}

function signingPartyDraftScore(draft: AgreementDraft): number {
  const named = namedLegalSigningPartyCount(draft);
  const required = requiredDirectSigningParticipantIds(draft).length;
  // Two-party Harbor drafts often arrive as Client / Service Provider. After
  // review-email persist they carry owner/reviewer. Prefer the owner-normalized
  // sibling on an equal named-legal count so lock does not fail missing_owner.
  const ownerBonus =
    named < 3 && isDurableSigningParticipantId(ownerSigningPartyId(draft)) ? 5 : 0;
  return required * 10 + named + ownerBonus;
}

export function richerSigningPartyDraft(
  left: AgreementDraft | null | undefined,
  right: AgreementDraft | null | undefined,
): AgreementDraft | null {
  if (!left) return right ?? null;
  if (!right) return left;
  return signingPartyDraftScore(right) > signingPartyDraftScore(left) ? right : left;
}

/** Three- and four-party deals have no workspace-owner legal-party role; every named party signs. */
export function shouldMintSignTokenForEveryRequiredParticipant(
  draft: AgreementDraft | null | undefined,
): boolean {
  return namedLegalSigningPartyCount(draft) >= 3;
}

const SYNTHETIC_PARTY_ID = /^party_\d+$/i;
const SYNTHETIC_HASH_PARTY_ID = /^party_[0-9a-f]+:[0-9a-f]+$/i;

export function isDurableSigningParticipantId(id: string | null | undefined): id is string {
  const value = String(id || "").trim();
  if (!value || value.startsWith("legacy_")) return false;
  if (SYNTHETIC_PARTY_ID.test(value)) return false;
  if (SYNTHETIC_HASH_PARTY_ID.test(value)) return false;
  return true;
}

function normalizeWorkflowRole(role: string | null | undefined): string {
  const value = String(role || "").trim().toLowerCase();
  if (value === "owner" || value === "sender" || value === "landlord") return "owner";
  if (value === "signer" || value === "signatory") return "signer";
  if (value === "reviewer") return "reviewer";
  if (["viewer", "counterparty", "fyi", "copy", "read_only", "readonly"].includes(value)) {
    return "viewer";
  }
  return value || "party";
}

export function requiredDirectSigningParticipantIds(draft: AgreementDraft | null | undefined): string[] {
  const parties = Array.isArray(draft?.parties) ? draft.parties : [];
  const ids: string[] = [];
  for (const party of parties) {
    const role = normalizeWorkflowRole(party.role);
    if (role === "viewer") continue;
    if (party.requiresSignature === false) continue;
    const id = String(party.id || "").trim();
    if (!isDurableSigningParticipantId(id)) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function resolveDirectSigningLockedVersionId(
  draft: AgreementDraft | null | undefined,
  agreementId: string,
  existingLockedVersionId?: string | null,
): string {
  const existing = String(existingLockedVersionId || "").trim();
  if (existing) return existing;
  const versions = Array.isArray(draft?.versions) ? draft.versions : [];
  const last = versions[versions.length - 1];
  const version = last?.version;
  if (typeof version === "number" && Number.isFinite(version) && version > 0) {
    return `v${version}`;
  }
  const compact = agreementId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return compact ? `lv_${compact}` : "lv_direct";
}

export type DirectSigningLockAndInviteResult =
  | {
      ok: true;
      ownerPartyId: string;
      lockedVersionId: string;
      requiredParticipantIds: string[];
      mintAllRequiredSignTokens: boolean;
      draft: AgreementDraft;
    }
  | { ok: false; reason: string };

export async function lockAuthoritativeVersionAndMintSigningInvites(options: {
  agreementId: string;
  draft: AgreementDraft;
  recipientSetup?: RecipientSetupEmailInput | null;
}): Promise<DirectSigningLockAndInviteResult> {
  const id = String(options.agreementId || "").trim();
  if (!id) return { ok: false, reason: "missing_agreement" };

  const trackOk = await persistOwnerDeliveryTrack(id, "signature");
  if (!trackOk) return { ok: false, reason: "delivery_track_persist_failed" };

  const roles = await persistReviewEmailPartyRolesOnServer(id, options.draft, options.recipientSetup);
  const workingDraft = roles.draft;

  const server = await fetchAgreementDraftWithSigningLock(id);
  const serverDraft = server.ok && server.draft ? server.draft : null;
  let authoritative =
    richerSigningPartyDraft(
      richerSigningPartyDraft(options.draft, workingDraft),
      serverDraft,
    ) ?? workingDraft;
  let namedLegal = namedLegalSigningPartyCount(authoritative);
  let mintAllRequiredSignTokens = namedLegal >= 3;
  let ownerPartyId = ownerSigningPartyId(authoritative);
  if (!mintAllRequiredSignTokens && !isDurableSigningParticipantId(ownerPartyId)) {
    const roleNormalized =
      richerSigningPartyDraft(workingDraft, serverDraft) ?? workingDraft;
    if (isDurableSigningParticipantId(ownerSigningPartyId(roleNormalized))) {
      authoritative = roleNormalized;
      namedLegal = namedLegalSigningPartyCount(authoritative);
      mintAllRequiredSignTokens = namedLegal >= 3;
      ownerPartyId = ownerSigningPartyId(authoritative);
    }
  }
  if (!mintAllRequiredSignTokens && !isDurableSigningParticipantId(ownerPartyId)) {
    return { ok: false, reason: "missing_owner_participant" };
  }

  const participantIds = requiredDirectSigningParticipantIds(authoritative);
  if (!mintAllRequiredSignTokens) {
    if (!ownerPartyId || !participantIds.includes(ownerPartyId)) {
      return { ok: false, reason: "owner_not_in_required_signers" };
    }
    if (participantIds.length < 2) {
      return { ok: false, reason: "missing_counterparty_participant" };
    }
  } else if (participantIds.length < 3) {
    return { ok: false, reason: "missing_counterparty_participant" };
  }

  let lockedVersionId = String(server.lockedVersionId || "").trim();
  if (!lockedVersionId) {
    lockedVersionId = resolveDirectSigningLockedVersionId(authoritative, id);
    try {
      const lockRes = await putSigningLock(id, {
        locked_version_id: lockedVersionId,
        locked_at: new Date().toISOString(),
        locked_by: "owner",
      });
      if (!lockRes.ok) return { ok: false, reason: lockRes.error || "signing_lock_failed" };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error && err.message.trim() ? err.message : "signing_lock_failed",
      };
    }
  }

  const refreshed = await fetchAgreementDraft(id);
  const lockActorId =
    ownerPartyId && isDurableSigningParticipantId(ownerPartyId) ? ownerPartyId : participantIds[0] || "";
  if (!isDurableSigningParticipantId(lockActorId)) {
    return { ok: false, reason: mintAllRequiredSignTokens ? "missing_counterparty_participant" : "missing_owner_participant" };
  }
  return {
    ok: true,
    ownerPartyId: lockActorId,
    lockedVersionId,
    requiredParticipantIds: participantIds,
    mintAllRequiredSignTokens,
    draft: refreshed.ok && refreshed.draft ? refreshed.draft : authoritative,
  };
}

function recipientLinkMintKey(): string {
  return (
    (import.meta as unknown as { env?: { VITE_RECIPIENT_LINK_MINT_KEY?: string } }).env
      ?.VITE_RECIPIENT_LINK_MINT_KEY || ""
  );
}

/**
 * Lock + mint from the persisted GET draft. Does not depend on guided UI refs,
 * remount latches, or packet activation. Freeze persist stays draft; this is
 * the production boundary that writes the signing lock and phase=sign invites.
 */
export async function lockAndMintSigningInvitesFromPersistedDraft(options: {
  agreementId: string;
  draft?: AgreementDraft | null;
}): Promise<
  | (Extract<DirectSigningLockAndInviteResult, { ok: true }> & { mintedParticipantIds: string[] })
  | { ok: false; reason: string }
> {
  const id = String(options.agreementId || "").trim();
  if (!id) return { ok: false, reason: "missing_agreement" };
  const server = await fetchAgreementDraft(id);
  const authoritative =
    richerSigningPartyDraft(
      options.draft,
      server.ok && server.draft ? server.draft : null,
    ) ?? options.draft ?? null;
  if (!authoritative) return { ok: false, reason: "missing_draft" };

  const locked = await lockAuthoritativeVersionAndMintSigningInvites({
    agreementId: id,
    draft: authoritative,
  });
  if (!locked.ok) return locked;

  const mintedParticipantIds: string[] = [];
  const mintKey = recipientLinkMintKey();
  for (const participantId of locked.requiredParticipantIds) {
    const minted = await mintRecipientAccessTokenResult(
      id,
      { mode: "sign", role: "signer", recipient_party_id: participantId },
      mintKey,
    );
    if (!minted.ok) {
      return { ok: false, reason: minted.code || minted.detail || "sign_mint_failed" };
    }
    mintedParticipantIds.push(participantId);
  }
  if (mintedParticipantIds.length < 1) {
    return { ok: false, reason: "sign_mint_failed" };
  }
  return { ...locked, mintedParticipantIds };
}
