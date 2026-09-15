/**
 * After owner confirmation, lock the authoritative version and mint participant-bound
 * signing invitations. Emails-only / party_0 / array order never count as bindings.
 */
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  fetchAgreementDraft,
  fetchAgreementDraftWithSigningLock,
} from "../../agreement/agreementWorkspaceApi";
import { putSigningLock } from "../../agreement/recipientAccessApi";
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
  const authoritative = server.ok && server.draft ? server.draft : workingDraft;
  const namedLegal = namedLegalSigningPartyCount(authoritative);
  const mintAllRequiredSignTokens = namedLegal >= 3;
  const ownerPartyId = ownerSigningPartyId(authoritative);
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
    const lockRes = await putSigningLock(id, {
      locked_version_id: lockedVersionId,
      locked_at: new Date().toISOString(),
      locked_by: "owner",
    });
    if (!lockRes.ok) return { ok: false, reason: lockRes.error || "signing_lock_failed" };
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
