/**
 * Frozen SoT signing handoff — manifest + recipient rows from snapshot / consumed authority only.
 * Never infer party slots from empty React UI state during VS01 / signature-track transition.
 */

import {
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  type CanonicalFinalPartyManifest,
  type CanonicalFinalPartyRole,
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

type DraftPartyContact = {
  name?: string;
  role?: string;
  email?: string;
  signerName?: string;
  signer_name?: string;
  signerTitle?: string;
};

function draftPartyRole(index: number): CanonicalFinalPartyRole {
  if (index === 0) return "client";
  if (index === 1) return "service_provider";
  return `party_${index}`;
}

function matchDraftPartyByLegalName(
  draftParties: readonly DraftPartyContact[] | undefined,
  legalName: string,
): DraftPartyContact | undefined {
  const want = legalName.trim().toLowerCase();
  if (!want) return undefined;
  return (draftParties ?? []).find((party) => String(party.name ?? "").trim().toLowerCase() === want);
}

export function buildSigningHandoffManifestFromDraftParties(
  draftParties?: readonly DraftPartyContact[] | null,
): CanonicalFinalPartyManifest {
  const parties = (draftParties ?? [])
    .map((party, index) => {
      const partyName = String(party.name ?? "").trim();
      const isIndividual = partyName ? isIndividualPartyName(partyName) : false;
      return {
        index,
        role: draftPartyRole(index),
        partyName,
        email: String(party.email ?? "").trim(),
        signerName: String(party.signerName || party.signer_name || "").trim() || null,
        signerTitle: String(party.signerTitle ?? "").trim() || null,
        roleLabel: String(party.role ?? "").trim(),
        signerKind: isIndividual ? ("individual" as const) : ("entity_representative" as const),
        isSenderSide: index === 0,
        isIndividual,
      };
    })
    .filter((party) => party.partyName.length >= 2);
  return { parties };
}

function mergePersistedDraftContactOntoManifest(
  manifest: CanonicalFinalPartyManifest,
  draftParties?: readonly DraftPartyContact[] | null,
): CanonicalFinalPartyManifest {
  if (!draftParties?.length) return manifest;
  return {
    parties: manifest.parties.map((party) => {
      const match = matchDraftPartyByLegalName(draftParties, party.partyName);
      if (!match) return party;
      const email = String(match.email ?? "").trim() || party.email;
      const signerName = String(match.signerName || match.signer_name || "").trim() || party.signerName;
      const signerTitle = String(match.signerTitle ?? "").trim() || party.signerTitle;
      return { ...party, email, signerName, signerTitle };
    }),
  };
}

/** Live manifest for signing handoff — snapshot and consumed authority win over React memo state. */
export function resolvePaidProSigningHandoffPartyManifest(args?: {
  fallbackManifest?: CanonicalFinalPartyManifest | null;
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  draftParties?: readonly DraftPartyContact[] | null;
}): CanonicalFinalPartyManifest {
  const snap = getAuthoritativeSigningSnapshot();
  if (snap && manifestHasPartyRows(snap.partyManifest)) {
    return mergePersistedDraftContactOntoManifest(snap.partyManifest, args?.draftParties);
  }

  const authority = readConsumedPaidProSignerMetadataAuthority();
  if (authority && authority.parties.length >= 2) {
    return mergePersistedDraftContactOntoManifest(
      buildCanonicalFinalPartyManifestFromAuthority(authority, {
        intakeText: args?.intakeText ?? null,
        draftPartyNames: args?.draftPartyNames,
      }),
      args?.draftParties,
    );
  }

  if (manifestHasPartyRows(args?.fallbackManifest ?? null)) {
    return mergePersistedDraftContactOntoManifest(args!.fallbackManifest!, args?.draftParties);
  }

  return buildSigningHandoffManifestFromDraftParties(args?.draftParties);
}

export function resolvePaidProSigningHandoffRecipients(args?: {
  manifest?: CanonicalFinalPartyManifest | null;
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  draftParties?: readonly DraftPartyContact[] | null;
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
        draftParties: args?.draftParties,
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
      const draftParty = matchDraftPartyByLegalName(args?.draftParties ?? undefined, String(p.partyName ?? ""));
      const partyLegalName = String(p.partyName ?? "").trim();
      const isIndividual =
        p.isIndividual ?? (partyLegalName ? isIndividualPartyName(partyLegalName) : false);
      return {
        partyLegalName,
        signerName: String(
          draftParty?.signerName ?? frozenSigner?.signerName ?? p.signerName ?? auth?.signerName ?? "",
        ).trim(),
        signerTitle: String(
          draftParty?.signerTitle ?? frozenSigner?.signerTitle ?? p.signerTitle ?? auth?.signerTitle ?? "",
        ).trim(),
        email: String(
          draftParty?.email ?? frozenSigner?.signerEmail ?? p.email ?? auth?.signerEmail ?? "",
        ).trim(),
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
  draftParties?: readonly DraftPartyContact[] | null;
}): CanonicalSignerManifest {
  const snap = getAuthoritativeSigningSnapshot();
  if (snap?.signatureBlockModel?.entries?.length) {
    return snap.signatureBlockModel;
  }
  const manifest = resolvePaidProSigningHandoffPartyManifest({
    fallbackManifest: args?.manifest ?? null,
    intakeText: args?.intakeText,
    draftPartyNames: args?.draftPartyNames,
    draftParties: args?.draftParties,
  });
  return buildGuidedSignaturePacketFromManifest(manifest, args?.signFirst ?? true);
}

export function evaluatePaidProSigningHandoffReadiness(args?: {
  manifest?: CanonicalFinalPartyManifest | null;
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  draftParties?: readonly DraftPartyContact[] | null;
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
    draftParties: args?.draftParties,
  });
  const recipients = resolvePaidProSigningHandoffRecipients({
    manifest,
    intakeText: args?.intakeText,
    draftPartyNames: args?.draftPartyNames,
    draftParties: args?.draftParties,
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
