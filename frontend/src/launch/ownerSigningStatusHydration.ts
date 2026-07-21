/**
 * Phase 3C — owner signing-status page durable hydration orchestrator.
 * Loads backend-first authority; browser storage is cache-only.
 */

import type { PublicVerifyPayload } from "../agreement/agreementPublicVerify";
import { fetchPublicAgreementVerify } from "../agreement/agreementPublicVerify";
import {
  fetchDurableSigningStateFromBackend,
  type DurableSigningStateFromBackend,
} from "../agreement/durableSigningStateApi";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import type { Vs01PrepareSigningRole } from "../vs01/vs01SignerFieldAssignment";
import type { Vs01CanonicalPacketPortableV1 } from "../vs01/vs01CanonicalPacketSeed";
import type { CreatorSigningProgressSnapshot } from "../launch/creatorDashboardSigningProgress";
import {
  loadFrozenSigningAuthority,
  resolveSigningStatusCounts,
  type FrozenSigningAuthoritySnapshotV1,
} from "../components/agreements/frozenSigningAuthoritySnapshot";
import {
  classifyLegacyPacketAuthority,
  legacyFallbackPermitted,
} from "../components/agreements/legacyPacketAuthorityPolicy";
import {
  requiresDurableSnapshot,
  resolveLifecycleModeFromPacketState,
  type PacketLifecycleState,
  type SigningAuthorityLifecycleMode,
} from "../components/agreements/signingAuthorityLifecycle";
import { reconstructHandoffFromPortable } from "../launch/ownerSigningStatusResolver";

export type OwnerSigningStatusHydrationError =
  | "missing_agreement_id"
  | "missing_durable_authority"
  | "legacy_reissue_required"
  | "packet_cancelled"
  | "packet_superseded"
  | "backend_unavailable";

export type OwnerSigningStatusHydratedState = {
  ok: true;
  agreementId: string;
  agreementTitle: string;
  handoff: PaidProVs01PostSignHandoffV1;
  prepareSignerRoles: Vs01PrepareSigningRole[];
  portable: Vs01CanonicalPacketPortableV1;
  frozenSnapshot: FrozenSigningAuthoritySnapshotV1;
  lifecycleMode: SigningAuthorityLifecycleMode;
  packetState: PacketLifecycleState;
  packetRevision: string;
  progress: CreatorSigningProgressSnapshot;
  verify: PublicVerifyPayload | null;
  legacyDiagnostic?: string;
};

export type OwnerSigningStatusHydrationResult =
  | OwnerSigningStatusHydratedState
  | { ok: false; error: OwnerSigningStatusHydrationError; detail?: string; verify?: PublicVerifyPayload | null };

function portableRoleToPrepareRole(
  r: Vs01CanonicalPacketPortableV1["roles"][number],
): Vs01PrepareSigningRole {
  return {
    roleId: r.roleId,
    partyIndex: r.partyIndex,
    partyId: r.partyId,
    entityName: r.entityName,
    partyName: r.partyName,
    roleLabel: r.roleLabel,
    signerName: r.signerName,
    signerTitle: r.signerTitle,
    signerEmail: r.signerEmail,
    reviewEmail: r.reviewEmail,
    isEntityParty: r.isEntityParty,
    requiresSignature: r.requiresSignature,
    vs01CounterpartyId: r.vs01CounterpartyId,
    kind: r.kind,
  };
}

/** Merge frozen signer identity into portable prepare roles — backend snapshot wins. */
export function buildPrepareSignerRolesFromDurableAuthority(args: {
  frozen: FrozenSigningAuthoritySnapshotV1;
  portable: Vs01CanonicalPacketPortableV1;
}): Vs01PrepareSigningRole[] {
  const portableRoles = args.portable.roles.filter((r) => r.requiresSignature !== false);
  return portableRoles.map((role) => {
    const base = portableRoleToPrepareRole(role);
    const partyId = (role.partyId ?? role.vs01CounterpartyId ?? "").trim();
    const frozenSigner =
      args.frozen.signers.find((s) => s.agreementPartyId === partyId) ??
      args.frozen.signers.find((s) => s.signerRecordId === role.roleId);
    const frozenParty =
      args.frozen.parties.find((p) => p.agreementPartyId === partyId) ??
      args.frozen.parties.find((p) => p.canonicalOrder === role.partyIndex);
    if (!frozenSigner && !frozenParty) return base;
    return {
      ...base,
      partyId: frozenParty?.agreementPartyId ?? base.partyId,
      entityName: frozenParty?.legalEntityName ?? base.entityName,
      partyName: frozenParty?.legalEntityName ?? base.partyName,
      signerName: frozenSigner?.signerName ?? base.signerName,
      signerTitle: frozenSigner?.signerTitle ?? base.signerTitle,
      signerEmail: frozenSigner?.signerEmail ?? base.signerEmail,
      vs01CounterpartyId: frozenParty?.agreementPartyId ?? base.vs01CounterpartyId,
    };
  });
}

export function buildHandoffFromDurableAuthority(args: {
  frozen: FrozenSigningAuthoritySnapshotV1;
  portable: Vs01CanonicalPacketPortableV1;
  agreementTitle: string;
  packetRevision?: string;
}): PaidProVs01PostSignHandoffV1 {
  const base = reconstructHandoffFromPortable(args.portable, args.agreementTitle);
  return {
    ...base,
    agreementId: args.frozen.agreementId || base.agreementId,
    packetRevision: args.packetRevision ?? base.packetRevision,
    packetPrepareOnly: false,
  };
}

function progressFromDurableState(args: {
  frozen: FrozenSigningAuthoritySnapshotV1;
  verify: PublicVerifyPayload | null;
}): CreatorSigningProgressSnapshot {
  const counts = resolveSigningStatusCounts({ snapshot: args.frozen });
  const serverSigned = args.verify?.signature_status?.signatures_recorded ?? 0;
  const requiredCount = counts.requiredSignerCount;
  const signedCount = Math.min(Math.max(serverSigned, 0), requiredCount);
  const fullySigned =
    Boolean(args.verify?.signature_status?.fully_executed) || signedCount >= requiredCount;
  return {
    signedCount: fullySigned ? requiredCount : signedCount,
    requiredCount,
    partiallySigned: !fullySigned && signedCount > 0 && signedCount < requiredCount,
    fullySigned,
    source: "public_verify",
  };
}

/**
 * Durable owner signing-status hydration — no session/localStorage authority reads.
 */
export async function hydrateOwnerSigningStatusPage(
  agreementId: string,
): Promise<OwnerSigningStatusHydrationResult> {
  const id = agreementId.trim();
  if (!id) return { ok: false, error: "missing_agreement_id" };

  const verify = await fetchPublicAgreementVerify(id);
  const durableState = await fetchDurableSigningStateFromBackend(id);

  const frozen =
    durableState?.frozenSnapshot ??
    (await loadFrozenSigningAuthority({ agreementId: id, expectedVersion: 1 }));

  const packet = durableState?.packet ?? null;
  const packetState: PacketLifecycleState = packet?.packetState ?? "none";
  const lifecycleMode = resolveLifecycleModeFromPacketState(packetState, Boolean(frozen));

  if (packetState === "cancelled") {
    return { ok: false, error: "packet_cancelled", verify };
  }

  const legacy = classifyLegacyPacketAuthority({
    frozenSnapshot: frozen,
    portable: packet?.portable ?? null,
    packetState,
    hasBackendPacket: Boolean(packet),
  });

  if (requiresDurableSnapshot(lifecycleMode) && !frozen) {
    if (!legacyFallbackPermitted(legacy)) {
      return {
        ok: false,
        error: legacy.classification === "requires_reissue" ? "legacy_reissue_required" : "missing_durable_authority",
        detail: legacy.reason,
        verify,
      };
    }
  }

  if (!packet?.portable) {
    return { ok: false, error: "backend_unavailable", detail: "no_durable_packet", verify };
  }

  if (!frozen) {
    return { ok: false, error: "missing_durable_authority", detail: legacy.reason, verify };
  }

  if (frozen.frozenCorpusHash && packet.frozenCorpusHash && frozen.frozenCorpusHash !== packet.frozenCorpusHash) {
    return { ok: false, error: "missing_durable_authority", detail: "corpus_hash_mismatch", verify };
  }

  const agreementTitle = durableState?.agreementTitle ?? verify?.summary?.title ?? "Agreement";
  const handoff = buildHandoffFromDurableAuthority({
    frozen,
    portable: packet.portable,
    agreementTitle,
    packetRevision: packet.packetRevision,
  });
  const prepareSignerRoles = buildPrepareSignerRolesFromDurableAuthority({
    frozen,
    portable: packet.portable,
  });
  const progress = progressFromDurableState({ frozen, verify });

  return {
    ok: true,
    agreementId: id,
    agreementTitle,
    handoff,
    prepareSignerRoles,
    portable: packet.portable,
    frozenSnapshot: frozen,
    lifecycleMode,
    packetState,
    packetRevision: packet.packetRevision,
    progress,
    verify,
    legacyDiagnostic: legacy.classification !== "durable_v1" ? legacy.reason : undefined,
  };
}

export type { DurableSigningStateFromBackend };
