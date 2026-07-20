import {
  clearRetainedAcceptedCorpusAuthority,
  normalizeAcceptedCorpusAuthority,
  retainAcceptedCorpusAuthority,
  type AcceptedCorpusAuthority,
} from "../agreement/acceptedCorpusAuthority";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import {
  fetchPublicAgreementVerify,
  type PublicVerifyPayload,
} from "../agreement/agreementPublicVerify";
import { loadFrozenSigningAuthority } from "../agreement/frozenSigningAuthorityApi";
import {
  classifyOwnerAgreementAuthority,
  type OwnerAuthorityClassification,
} from "../components/agreements/legacyPacketAuthorityPolicy";
import {
  clearCachedFrozenSigningAuthority,
  type FrozenSigningAuthoritySnapshotV1,
} from "../components/agreements/frozenSigningAuthoritySnapshot";
import { resolveApiBase } from "../lib/clawApi";
import { sha256Hex } from "../utils/agreements/hash";
import { clearPaidProVs01PostSignHandoffForAgreement } from "../vs01/vs01PaidProPostSignHandoff";
import { clearVs01CanonicalPacketByAgreementId } from "../vs01/vs01CanonicalPacketSeed";
import { clearSigningPacketStatus } from "../vs01/vs01SigningPacketStatusStore";
import { clearAgreementLocalSigningMarkers } from "../vs01/vs01WorkspaceSigningStatus";

export type OwnerSigningHydrationStatus =
  | "loading"
  | "unfrozen"
  | "frozen"
  | "signing"
  | "completed"
  | "conflict"
  | "legacy";

export type OwnerSigningHydrationConflict =
  | "backend_agreement_not_found"
  | "backend_unavailable"
  | "backend_agreement_id_mismatch"
  | "accepted_authority_malformed"
  | "frozen_authority_unavailable"
  | "frozen_without_accepted_authority"
  | "accepted_frozen_binding_mismatch"
  | "accepted_party_authority_missing"
  | "frozen_party_order_mismatch"
  | "frozen_signer_order_mismatch"
  | "frozen_signer_party_mismatch"
  | "frozen_execution_hash_mismatch"
  | "signing_lock_version_mismatch"
  | "signing_lock_hash_mismatch"
  | "signing_state_without_lock"
  | "signing_progress_out_of_range"
  | "completed_parity_not_certified"
  | "completed_artifact_invalid";

export type OwnerSigningStatusHydratedState = {
  agreementId: string;
  agreementTitle: string;
  status: Exclude<OwnerSigningHydrationStatus, "loading">;
  authorityClassification: OwnerAuthorityClassification;
  accepted: AcceptedCorpusAuthority | null;
  frozen: FrozenSigningAuthoritySnapshotV1 | null;
  signedCount: number;
  requiredCount: number;
  backendCompleted?: boolean;
  verify?: PublicVerifyPayload | null;
  conflict?: OwnerSigningHydrationConflict;
};

type SigningLockRecord = {
  locked_version_id?: unknown;
  content_sha256?: unknown;
};

type CompletedArtifactProjection = {
  schema?: unknown;
  agreement_id?: unknown;
  accepted_version_id?: unknown;
  accepted_corpus_sha256?: unknown;
  packet_document_id?: unknown;
  packet_revision?: unknown;
  completed_corpus_sha256?: unknown;
  material_hash?: unknown;
  completion_timestamp?: unknown;
  frozen_authority_material_hash?: unknown;
  signing_lock?: {
    locked_version_id?: unknown;
    content_sha256?: unknown;
  } | null;
};

type AgreementReadPayload = {
  id?: unknown;
  draft?: {
    id?: unknown;
    title?: unknown;
    audit_log?: unknown;
  };
  accepted_version?: unknown;
  signing_lock?: SigningLockRecord | null;
  completed_artifact?: CompletedArtifactProjection | null;
};

const base = () => resolveApiBase().replace(/\/$/, "");

function validateCompletedArtifactProjection(args: {
  agreementId: string;
  accepted: AcceptedCorpusAuthority;
  frozen: FrozenSigningAuthoritySnapshotV1;
  signingLock: SigningLockRecord | null | undefined;
  artifact: CompletedArtifactProjection | null | undefined;
}): boolean {
  const artifact = args.artifact;
  if (!artifact) return false;
  if (String(artifact.agreement_id ?? "").trim() !== args.agreementId) return false;
  if (String(artifact.accepted_version_id ?? "").trim() !== args.accepted.version_id) return false;
  if (
    String(artifact.accepted_corpus_sha256 ?? "")
      .trim()
      .toLowerCase() !== args.accepted.corpus_sha256.toLowerCase()
  ) {
    return false;
  }
  const lockVersion = String(args.signingLock?.locked_version_id ?? "").trim();
  const lockHash = String(args.signingLock?.content_sha256 ?? "").trim().toLowerCase();
  const artifactLock = artifact.signing_lock;
  if (lockVersion && String(artifactLock?.locked_version_id ?? "").trim() !== lockVersion) {
    return false;
  }
  if (lockHash && String(artifactLock?.content_sha256 ?? "").trim().toLowerCase() !== lockHash) {
    return false;
  }
  const materialHash = String(artifact.material_hash ?? "").trim().toLowerCase();
  const completedCorpusHash = String(artifact.completed_corpus_sha256 ?? "").trim().toLowerCase();
  return materialHash.length === 64 && completedCorpusHash.length === 64;
}

function clearNonAuthoritativeBrowserSigningState(agreementId: string): void {
  clearPaidProVs01PostSignHandoffForAgreement(agreementId);
  clearVs01CanonicalPacketByAgreementId(agreementId);
  clearSigningPacketStatus(agreementId);
  clearAgreementLocalSigningMarkers(agreementId);
}

export function clearOwnerSigningAuthorityCaches(agreementId: string): void {
  clearRetainedAcceptedCorpusAuthority(agreementId);
  clearCachedFrozenSigningAuthority(agreementId);
  clearNonAuthoritativeBrowserSigningState(agreementId);
}

function conflictState(args: {
  agreementId: string;
  agreementTitle?: string;
  classification?: OwnerAuthorityClassification;
  accepted?: AcceptedCorpusAuthority | null;
  frozen?: FrozenSigningAuthoritySnapshotV1 | null;
  conflict: OwnerSigningHydrationConflict;
}): OwnerSigningStatusHydratedState {
  return {
    agreementId: args.agreementId,
    agreementTitle: args.agreementTitle?.trim() || "Agreement",
    status: "conflict",
    authorityClassification: args.classification ?? "authority_conflict",
    accepted: args.accepted ?? null,
    frozen: args.frozen ?? null,
    signedCount: 0,
    requiredCount: args.frozen?.signers.length ?? 0,
    conflict: args.conflict,
  };
}

async function validateFrozenCanonicalOrder(args: {
  accepted: AcceptedCorpusAuthority;
  frozen: FrozenSigningAuthoritySnapshotV1;
}): Promise<OwnerSigningHydrationConflict | null> {
  const acceptedParties = args.accepted.legal_parties;
  if (!acceptedParties?.length) return "accepted_party_authority_missing";
  if (args.frozen.parties.length !== acceptedParties.length) {
    return "frozen_party_order_mismatch";
  }

  for (let index = 0; index < acceptedParties.length; index += 1) {
    const acceptedParty = acceptedParties[index]!;
    const frozenParty = args.frozen.parties[index];
    if (
      !frozenParty ||
      acceptedParty.canonical_order !== index ||
      frozenParty.canonicalOrder !== index ||
      frozenParty.agreementPartyId !== acceptedParty.agreement_party_id ||
      frozenParty.legalEntityName.trim() !== acceptedParty.legal_entity_name.trim() ||
      frozenParty.agreementRole.trim() !== acceptedParty.agreement_role.trim()
    ) {
      return "frozen_party_order_mismatch";
    }
  }

  const partyOrder = args.frozen.parties.map((party) => party.agreementPartyId);
  if (
    args.frozen.execution.partyOrder.length !== partyOrder.length ||
    args.frozen.execution.partyOrder.some((partyId, index) => partyId !== partyOrder[index])
  ) {
    return "frozen_party_order_mismatch";
  }

  const knownPartyIds = new Set(partyOrder);
  const signerIds = new Set<string>();
  for (let index = 0; index < args.frozen.signers.length; index += 1) {
    const signer = args.frozen.signers[index]!;
    if (
      signer.signingOrder !== index ||
      !signer.signerRecordId.trim() ||
      signerIds.has(signer.signerRecordId)
    ) {
      return "frozen_signer_order_mismatch";
    }
    signerIds.add(signer.signerRecordId);
    if (!knownPartyIds.has(signer.agreementPartyId)) {
      return "frozen_signer_party_mismatch";
    }
    if (args.frozen.execution.signerOrder[index] !== signer.signerRecordId) {
      return "frozen_signer_order_mismatch";
    }
  }
  if (args.frozen.execution.signerOrder.length !== args.frozen.signers.length) {
    return "frozen_signer_order_mismatch";
  }

  const executionHash = await sha256Hex(JSON.stringify(partyOrder));
  if (executionHash !== args.frozen.execution.executionPartyHash) {
    return "frozen_execution_hash_mismatch";
  }
  return null;
}

type BackendSignatureReference = {
  signerRoleId: string;
  participantId: string;
};

function backendHasSigningEvents(auditLog: unknown): {
  any: boolean;
  completed: boolean;
  signatures: BackendSignatureReference[];
} {
  if (!Array.isArray(auditLog)) return { any: false, completed: false, signatures: [] };
  let any = false;
  let completed = false;
  const signatures: BackendSignatureReference[] = [];
  for (const raw of auditLog) {
    if (!raw || typeof raw !== "object") continue;
    const event = raw as { event_type?: unknown; value?: unknown };
    const eventType = String(event.event_type ?? "");
    if (eventType === "signature_completed") {
      any = true;
      const value =
        event.value && typeof event.value === "object"
          ? (event.value as Record<string, unknown>)
          : {};
      signatures.push({
        signerRoleId: String(value.signer_role_id ?? "").trim(),
        participantId: String(value.participant_id ?? "").trim(),
      });
    }
    if (eventType === "signed") {
      any = true;
      completed = true;
    }
  }
  return { any, completed, signatures };
}

function resolveCompletedSignerReferences(args: {
  frozen: FrozenSigningAuthoritySnapshotV1;
  references: readonly BackendSignatureReference[];
}): Set<string> | null {
  const resolved = new Set<string>();
  for (const reference of args.references) {
    let signer = args.frozen.signers.find(
      (candidate) => candidate.signerRecordId === reference.signerRoleId,
    );
    if (!signer && reference.participantId) {
      const partySigners = args.frozen.signers.filter(
        (candidate) => candidate.agreementPartyId === reference.participantId,
      );
      if (partySigners.length === 1) signer = partySigners[0];
    }
    if (
      !signer ||
      (reference.participantId && signer.agreementPartyId !== reference.participantId)
    ) {
      return null;
    }
    resolved.add(signer.signerRecordId);
  }
  return resolved;
}

export async function hydrateOwnerSigningStatusPage(
  agreementId: string,
): Promise<OwnerSigningStatusHydratedState> {
  const id = agreementId.trim();
  if (!id) {
    return conflictState({ agreementId: "", conflict: "backend_agreement_not_found" });
  }

  let response: Response;
  try {
    response = await fetch(`${base()}/api/agreements/${encodeURIComponent(id)}`, {
      headers: clawAgreementHeaders(),
    });
  } catch {
    return conflictState({ agreementId: id, conflict: "backend_unavailable" });
  }
  if (response.status === 404) {
    clearOwnerSigningAuthorityCaches(id);
    return conflictState({ agreementId: id, conflict: "backend_agreement_not_found" });
  }
  if (!response.ok) {
    return conflictState({ agreementId: id, conflict: "backend_unavailable" });
  }

  const payload = (await response.json().catch(() => ({}))) as AgreementReadPayload;
  const backendAgreementId = String(payload.id ?? payload.draft?.id ?? "").trim();
  const agreementTitle = String(payload.draft?.title ?? "").trim() || "Agreement";
  if (backendAgreementId !== id) {
    clearOwnerSigningAuthorityCaches(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      conflict: "backend_agreement_id_mismatch",
    });
  }

  const acceptedRawPresent = payload.accepted_version != null;
  const accepted = normalizeAcceptedCorpusAuthority(payload.accepted_version, id);
  if (acceptedRawPresent && !accepted) {
    clearOwnerSigningAuthorityCaches(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      conflict: "accepted_authority_malformed",
    });
  }
  if (accepted) retainAcceptedCorpusAuthority(accepted);
  else clearRetainedAcceptedCorpusAuthority(id);

  let frozen: FrozenSigningAuthoritySnapshotV1 | null;
  try {
    frozen = await loadFrozenSigningAuthority(id);
  } catch (error) {
    clearCachedFrozenSigningAuthority(id);
    if (
      error instanceof Error &&
      error.message === "frozen_signing_authority_malformed_response"
    ) {
      clearNonAuthoritativeBrowserSigningState(id);
    }
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      conflict: "frozen_authority_unavailable",
    });
  }

  const diagnostic = classifyOwnerAgreementAuthority({
    agreementId: id,
    accepted,
    frozen,
  });
  const lockVersion = String(payload.signing_lock?.locked_version_id ?? "").trim();
  const lockHash = String(payload.signing_lock?.content_sha256 ?? "").trim().toLowerCase();
  const auditState = backendHasSigningEvents(payload.draft?.audit_log);
  const verify = await fetchPublicAgreementVerify(id);
  if (verify?.agreement_id && verify.agreement_id !== id) {
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: "backend_agreement_id_mismatch",
    });
  }
  const verifySignedCount = Math.max(0, verify?.signature_status?.signatures_recorded ?? 0);
  const backendCompleted = Boolean(auditState.completed || verify?.signature_status?.fully_executed);

  if (diagnostic.classification === "legacy_unversioned") {
    return {
      agreementId: id,
      agreementTitle,
      status: "legacy",
      authorityClassification: "legacy_unversioned",
      accepted: null,
      frozen: null,
      signedCount: verifySignedCount,
      requiredCount: Math.max(0, verify?.signature_status?.signer_party_count ?? 0),
      backendCompleted,
      verify,
    };
  }

  if (diagnostic.classification === "accepted_not_frozen") {
    if (lockVersion || auditState.any || verifySignedCount > 0 || backendCompleted) {
      clearNonAuthoritativeBrowserSigningState(id);
      return conflictState({
        agreementId: id,
        agreementTitle,
        classification: "authority_conflict",
        accepted,
        conflict: "signing_state_without_lock",
      });
    }
    return {
      agreementId: id,
      agreementTitle,
      status: "unfrozen",
      authorityClassification: "accepted_not_frozen",
      accepted,
      frozen: null,
      signedCount: 0,
      requiredCount: 0,
      backendCompleted: false,
      verify,
    };
  }

  if (diagnostic.classification === "authority_conflict" || !accepted || !frozen) {
    clearCachedFrozenSigningAuthority(id);
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict:
        diagnostic.reason === "frozen_without_accepted_authority"
          ? "frozen_without_accepted_authority"
          : "accepted_frozen_binding_mismatch",
    });
  }

  const canonicalConflict = await validateFrozenCanonicalOrder({ accepted, frozen });
  if (canonicalConflict) {
    clearCachedFrozenSigningAuthority(id);
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: canonicalConflict,
    });
  }

  if (!lockVersion && !auditState.any && verifySignedCount === 0 && !backendCompleted) {
    return {
      agreementId: id,
      agreementTitle,
      status: "frozen",
      authorityClassification: "frozen",
      accepted,
      frozen,
      signedCount: 0,
      requiredCount: frozen.signers.length,
      backendCompleted: false,
      verify,
    };
  }
  if (!lockVersion) {
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: "signing_state_without_lock",
    });
  }
  if (lockVersion !== accepted.version_id) {
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: "signing_lock_version_mismatch",
    });
  }
  if (lockHash !== accepted.corpus_sha256) {
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: "signing_lock_hash_mismatch",
    });
  }

  const verifyLock = String(verify?.signature_status?.locked_version_id ?? "").trim();
  if (verifyLock && verifyLock !== accepted.version_id) {
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: "signing_lock_version_mismatch",
    });
  }
  const requiredCount = frozen.signers.length;
  const verifyReferences =
    verify?.signature_events
      .filter((event) => event.event_type === "signature_completed")
      .map((event) => ({
        signerRoleId: String(event.signer_role_id ?? "").trim(),
        participantId: String(event.participant_id ?? "").trim(),
      })) ?? [];
  const references = verifyReferences.length ? verifyReferences : auditState.signatures;
  const completedSignerIds = resolveCompletedSignerReferences({ frozen, references });
  if (!completedSignerIds) {
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: "frozen_signer_party_mismatch",
    });
  }
  const reportedSignedCount = Math.max(
    0,
    verify?.signature_status?.signatures_recorded ?? references.length,
  );
  if (reportedSignedCount !== completedSignerIds.size) {
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: "frozen_signer_party_mismatch",
    });
  }
  const signedCount = completedSignerIds.size;
  if (signedCount > requiredCount) {
    clearNonAuthoritativeBrowserSigningState(id);
    return conflictState({
      agreementId: id,
      agreementTitle,
      accepted,
      frozen,
      conflict: "signing_progress_out_of_range",
    });
  }
  if (backendCompleted) {
    const certified = validateCompletedArtifactProjection({
      agreementId: id,
      accepted,
      frozen,
      signingLock: payload.signing_lock,
      artifact: payload.completed_artifact,
    });
    if (certified) {
      return {
        agreementId: id,
        agreementTitle,
        status: "completed",
        authorityClassification: "frozen",
        accepted,
        frozen,
        signedCount: requiredCount,
        requiredCount,
        backendCompleted: true,
        verify,
      };
    }
    return {
      ...conflictState({
        agreementId: id,
        agreementTitle,
        accepted,
        frozen,
        conflict: "completed_parity_not_certified",
      }),
      signedCount,
      requiredCount,
      backendCompleted: true,
      verify,
    };
  }

  return {
    agreementId: id,
    agreementTitle,
    status: "signing",
    authorityClassification: "frozen",
    accepted,
    frozen,
    signedCount,
    requiredCount,
    backendCompleted: false,
    verify,
  };
}

export type OwnerSigningStatusHydrationBoundary = {
  activate(agreementId: string): void;
  load(agreementId: string): Promise<OwnerSigningStatusHydratedState>;
  cancel(): void;
};

export function createOwnerSigningStatusHydrationBoundary(
  hydrate: (agreementId: string) => Promise<OwnerSigningStatusHydratedState> =
    hydrateOwnerSigningStatusPage,
): OwnerSigningStatusHydrationBoundary {
  let activeAgreementId = "";
  let generation = 0;
  const inFlight = new Map<string, Promise<OwnerSigningStatusHydratedState>>();

  return {
    activate(agreementId) {
      const id = agreementId.trim();
      if (id === activeAgreementId) return;
      activeAgreementId = id;
      generation += 1;
    },
    load(agreementId) {
      const id = agreementId.trim();
      if (id !== activeAgreementId) {
        activeAgreementId = id;
        generation += 1;
      }
      const requestGeneration = generation;
      let request = inFlight.get(id);
      if (!request) {
        request = Promise.resolve()
          .then(() => hydrate(id))
          .finally(() => {
            if (inFlight.get(id) === request) inFlight.delete(id);
          });
        inFlight.set(id, request);
      }
      return request.then((state) => {
        if (activeAgreementId !== id || generation !== requestGeneration) {
          throw new Error("owner_signing_status_stale_load");
        }
        return state;
      });
    },
    cancel() {
      activeAgreementId = "";
      generation += 1;
    },
  };
}
