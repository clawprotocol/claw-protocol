/**
 * Phase 3C — classify pre-Phase-3B packets for fail-closed or explicit migration.
 */

import type { FrozenSigningAuthoritySnapshotV1 } from "./frozenSigningAuthoritySnapshot";
import type { Vs01CanonicalPacketPortableV1 } from "../../vs01/vs01CanonicalPacketSeed";
import type { PacketLifecycleState } from "./signingAuthorityLifecycle";

export type LegacyPacketClassification =
  | "durable_v1"
  | "safely_recoverable"
  | "requires_reissue"
  | "unsupported";

export type LegacyPacketAuthorityDiagnostic = {
  classification: LegacyPacketClassification;
  reason: string;
  migrationRecorded?: boolean;
};

export type ClassifyLegacyPacketArgs = {
  frozenSnapshot: FrozenSigningAuthoritySnapshotV1 | null;
  portable: Vs01CanonicalPacketPortableV1 | null;
  packetState: PacketLifecycleState;
  hasBackendPacket: boolean;
};

export function classifyLegacyPacketAuthority(
  args: ClassifyLegacyPacketArgs,
): LegacyPacketAuthorityDiagnostic {
  if (args.frozenSnapshot?.version === 1 && args.hasBackendPacket) {
    const state = (args.frozenSnapshot.packetState ?? "draft").toLowerCase();
    if (state === "active" || state === "partially_signed" || state === "completed") {
      return { classification: "durable_v1", reason: "frozen_signing_authority_v1_present" };
    }
  }

  if (!args.hasBackendPacket) {
    return { classification: "unsupported", reason: "no_backend_packet" };
  }

  if (!args.portable?.seed?.corpusHash?.trim()) {
    return { classification: "requires_reissue", reason: "missing_corpus_hash" };
  }

  const roles = args.portable.roles ?? [];
  const signingRoles = roles.filter((r) => r.requiresSignature !== false);
  if (signingRoles.length < 1) {
    return { classification: "requires_reissue", reason: "no_signing_roles" };
  }

  const hasStableIds = signingRoles.every(
    (r) => Boolean((r.partyId ?? r.vs01CounterpartyId ?? "").trim()) && Boolean(r.roleId?.trim()),
  );
  if (!hasStableIds) {
    return { classification: "requires_reissue", reason: "unstable_role_identity" };
  }

  if (args.frozenSnapshot) {
    return {
      classification: "safely_recoverable",
      reason: "portable_packet_with_partial_frozen_authority",
      migrationRecorded: false,
    };
  }

  if (args.packetState === "active" || args.packetState === "partially_signed") {
    return {
      classification: "requires_reissue",
      reason: "active_packet_without_frozen_authority_v1",
    };
  }

  return {
    classification: "safely_recoverable",
    reason: "legacy_portable_only_pre_activation",
  };
}

export function legacyFallbackPermitted(diagnostic: LegacyPacketAuthorityDiagnostic): boolean {
  return (
    diagnostic.classification === "durable_v1" ||
    diagnostic.classification === "safely_recoverable"
  );
}
