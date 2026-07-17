import type { AcceptedCorpusAuthority } from "../../agreement/acceptedCorpusAuthority";
import type { FrozenSigningAuthoritySnapshotV1 } from "./frozenSigningAuthoritySnapshot";

export type OwnerAuthorityClassification =
  | "legacy_unversioned"
  | "accepted_not_frozen"
  | "frozen"
  | "authority_conflict";

export type OwnerAuthorityDiagnostic = {
  classification: OwnerAuthorityClassification;
  reason:
    | "backend_accepted_authority_absent"
    | "backend_frozen_authority_absent"
    | "backend_authorities_present"
    | "frozen_without_accepted_authority"
    | "accepted_frozen_binding_mismatch";
};

export function classifyOwnerAgreementAuthority(args: {
  agreementId: string;
  accepted: AcceptedCorpusAuthority | null;
  frozen: FrozenSigningAuthoritySnapshotV1 | null;
}): OwnerAuthorityDiagnostic {
  const agreementId = args.agreementId.trim();
  if (!args.accepted && !args.frozen) {
    return {
      classification: "legacy_unversioned",
      reason: "backend_accepted_authority_absent",
    };
  }
  if (!args.accepted && args.frozen) {
    return {
      classification: "authority_conflict",
      reason: "frozen_without_accepted_authority",
    };
  }
  if (args.accepted && !args.frozen) {
    return {
      classification: "accepted_not_frozen",
      reason: "backend_frozen_authority_absent",
    };
  }
  if (
    !args.accepted ||
    !args.frozen ||
    args.accepted.agreement_id !== agreementId ||
    args.frozen.agreementId !== agreementId ||
    args.frozen.acceptedVersionId !== args.accepted.version_id ||
    args.frozen.acceptedCorpusSha256 !== args.accepted.corpus_sha256
  ) {
    return {
      classification: "authority_conflict",
      reason: "accepted_frozen_binding_mismatch",
    };
  }
  return {
    classification: "frozen",
    reason: "backend_authorities_present",
  };
}
