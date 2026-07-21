/**
 * Frozen SoT signing handoff — manifest + recipient rows from snapshot / consumed authority only.
 * Never infer party slots from empty React UI state during VS01 / signature-track transition.
 */

import {
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  type CanonicalFinalPartyManifest,
} from "./guidedDealCompletion/canonicalFinalPartyManifest";
import {
  buildGuidedSignaturePacketFromManifest,
} from "./guidedDealCompletion/guidedFinalReviewToSigning";
import type { CanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { isIndividualPartyName } from "./guidedDealCompletion/signerPartyIdentity";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  buildCanonicalFinalPartyManifestFromAuthority,
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  type FrozenSigningAuthoritySnapshotV1,
} from "./frozenSigningAuthoritySnapshot";
import {
  isPostFreezeLifecycle,
  type SigningAuthorityLifecycleMode,
} from "./signingAuthorityLifecycle";
import {
  resolveFrozenSignerForPartyIndexFromSnapshot,
  resolveSigningHandoffRecipientsFromSnapshot,
} from "./paidProSigningHandoffFromSnapshot";

export type PaidProSigningHandoffRecipient = {
  partyLegalName: string;
  signerName: string;
  signerTitle: string;
  email: string;
  address: string;
  isIndividual: boolean;
};

export type PaidProSigningHandoffBlockReason =
  | "manifest_party_rows_missing"
  | "authority_parties_missing"
  | "recipient_rows_incomplete";

function manifestHasPartyRows(manifest: CanonicalFinalPartyManifest | null | undefined): boolean {
  return Boolean(
    manifest?.parties?.some((p) => String(p.partyName ?? "").trim().length >= 2),
  );
}

/** Live manifest for signing handoff — snapshot and consumed authority win over React memo state. */
export function resolvePaidProSigningHandoffPartyManifest(args?: {
  fallbackManifest?: CanonicalFinalPartyManifest | null;
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
}): CanonicalFinalPartyManifest {
  const snap = getAuthoritativeSigningSnapshot();
  if (snap && manifestHasPartyRows(snap.partyManifest)) {
    return snap.partyManifest;
  }

  const authority = readConsumedPaidProSignerMetadataAuthority();
  if (authority && authority.parties.length >= 2) {
    return buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: args?.intakeText ?? null,
      draftPartyNames: args?.draftPartyNames,
    });
  }

  if (manifestHasPartyRows(args?.fallbackManifest ?? null)) {
    return args!.fallbackManifest!;
  }

  return { parties: [] };
}

export function resolvePaidProSigningHandoffRecipients(args?: {
  manifest?: CanonicalFinalPartyManifest | null;
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  lifecycleMode?: SigningAuthorityLifecycleMode;
  frozenSnapshot?: FrozenSigningAuthoritySnapshotV1 | null;
}): PaidProSigningHandoffRecipient[] {
  if (isPostFreezeLifecycle(args?.lifecycleMode ?? "pre_freeze") && args?.frozenSnapshot) {
    return resolveSigningHandoffRecipientsFromSnapshot(args.frozenSnapshot);
  }

  const manifest = manifestHasPartyRows(args?.manifest ?? null)
    ? args!.manifest!
    : resolvePaidProSigningHandoffPartyManifest({
        fallbackManifest: args?.manifest ?? null,
        intakeText: args?.intakeText,
        draftPartyNames: args?.draftPartyNames,
      });
  const authority = readConsumedPaidProSignerMetadataAuthority();
  const authorityByIndex = new Map(
    (authority?.parties ?? []).map((p) => [p.partyIndex, p] as const),
  );
  const injectedSnapshot = args?.frozenSnapshot ?? null;

  return manifest.parties
    .filter((p) => String(p.partyName ?? "").trim().length >= 2)
    .map((p) => {
      const frozenSigner = injectedSnapshot
        ? resolveFrozenSignerForPartyIndexFromSnapshot(p.index, injectedSnapshot)
        : null;
      const auth = authorityByIndex.get(p.index);
      const partyLegalName = String(p.partyName ?? "").trim();
      const isIndividual =
        p.isIndividual ?? (partyLegalName ? isIndividualPartyName(partyLegalName) : false);
      return {
        partyLegalName,
        signerName: String(
          frozenSigner?.signerName ?? p.signerName ?? auth?.signerName ?? "",
        ).trim(),
        signerTitle: String(
          frozenSigner?.signerTitle ?? p.signerTitle ?? auth?.signerTitle ?? "",
        ).trim(),
        email: String(frozenSigner?.signerEmail ?? p.email ?? auth?.signerEmail ?? "").trim(),
        address: String(auth?.partyAddress ?? "").trim(),
        isIndividual: isIndividual ? true : false,
      };
    });
}

export function resolvePaidProSigningHandoffSignerManifest(args?: {
  manifest?: CanonicalFinalPartyManifest | null;
  signFirst?: boolean;
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
}): CanonicalSignerManifest {
  const snap = getAuthoritativeSigningSnapshot();
  if (snap?.signatureBlockModel?.entries?.length) {
    return snap.signatureBlockModel;
  }
  const manifest = resolvePaidProSigningHandoffPartyManifest({
    fallbackManifest: args?.manifest ?? null,
    intakeText: args?.intakeText,
    draftPartyNames: args?.draftPartyNames,
  });
  return buildGuidedSignaturePacketFromManifest(manifest, args?.signFirst ?? true);
}

export function evaluatePaidProSigningHandoffReadiness(args?: {
  manifest?: CanonicalFinalPartyManifest | null;
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  requiredPartyCount?: number;
}): {
  ok: boolean;
  reason?: PaidProSigningHandoffBlockReason;
  manifest: CanonicalFinalPartyManifest;
  recipients: PaidProSigningHandoffRecipient[];
} {
  const manifest = resolvePaidProSigningHandoffPartyManifest({
    fallbackManifest: args?.manifest ?? null,
    intakeText: args?.intakeText,
    draftPartyNames: args?.draftPartyNames,
  });
  const recipients = resolvePaidProSigningHandoffRecipients({
    manifest,
    intakeText: args?.intakeText,
    draftPartyNames: args?.draftPartyNames,
  });
  const required = Math.max(args?.requiredPartyCount ?? 2, 2);

  if (!manifestHasPartyRows(manifest)) {
    return { ok: false, reason: "manifest_party_rows_missing", manifest, recipients };
  }
  if (hasPaidProSourceOfTruth() && recipients.length < required) {
    return { ok: false, reason: "recipient_rows_incomplete", manifest, recipients };
  }
  if (recipients.some((r) => !r.partyLegalName || !r.email)) {
    return { ok: false, reason: "recipient_rows_incomplete", manifest, recipients };
  }
  return { ok: true, manifest, recipients };
}
