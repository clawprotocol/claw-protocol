import type { Vs01CanonicalPacketPortableV1 } from "../vs01/vs01CanonicalPacketSeed";
import type { OwnerSigningStatusHydratedState } from "./ownerSigningStatusHydration";

export function localPresentationPermitted(state: OwnerSigningStatusHydratedState): boolean {
  return (
    state.status === "legacy" ||
    state.status === "frozen" ||
    state.status === "signing" ||
    (state.status === "conflict" && state.conflict === "completed_parity_not_certified")
  );
}

export function portableMatchesBackendAuthority(
  portable: Vs01CanonicalPacketPortableV1 | null,
  state: OwnerSigningStatusHydratedState,
): boolean {
  if (!portable || portable.seed.agreementId.trim() !== state.agreementId) return false;
  if (state.status === "legacy") return true;
  if (!state.frozen) return false;
  const signingRoles = portable.roles
    .filter((role) => role.requiresSignature !== false)
    .sort((left, right) => left.partyIndex - right.partyIndex);
  return state.frozen.parties.every((party) => {
    const role = signingRoles.find((candidate) => candidate.partyIndex === party.canonicalOrder);
    if (!role) return false;
    const partyId = String(role.partyId ?? role.vs01CounterpartyId ?? "").trim();
    const legalName = String(role.entityName ?? role.partyName ?? "").trim();
    return partyId === party.agreementPartyId && legalName === party.legalEntityName;
  });
}

export function authorityStatusCopy(state: OwnerSigningStatusHydratedState): string {
  if (state.status === "legacy") {
    return state.backendCompleted
      ? "Legacy/unversioned agreement. The backend records it as signed, but it has not been promoted to the accepted/frozen authority model."
      : "Legacy/unversioned agreement. Existing packet details are presentation data only.";
  }
  if (state.status === "unfrozen") {
    return "The backend accepted this agreement, but signing authority has not been frozen.";
  }
  if (state.status === "frozen") {
    return "Backend signing authority is frozen. No signing progress is recorded.";
  }
  if (state.status === "signing") {
    return `Backend reports ${state.signedCount} of ${state.requiredCount} required signers recorded.`;
  }
  if (state.conflict === "completed_parity_not_certified") {
    return "The backend reports completion, but completed-agreement certification is pending Phase 3B2 parity.";
  }
  return `Backend authority conflict: ${state.conflict ?? "unknown_conflict"}.`;
}
