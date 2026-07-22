/**
 * VS01 signing-envelope provenance — packet-layer artifact linked to immutable accepted SoT.
 *
 * Authority digests are SHA-256. Abbreviated `length:fnv` fingerprints remain display/diagnostic only
 * and must not be treated as collision-resistant proof.
 */

import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { canonicalize, sha256Hex } from "../utils/agreements/hash";
import { deriveVs01PacketLayoutCorpus } from "./buildVs01SigningPacketModel";
import {
  storeVs01CanonicalPacketPortable,
  type Vs01CanonicalPacketPortableV1,
} from "./vs01CanonicalPacketSeed";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";

export const VS01_SIGNING_ENVELOPE_SCHEMA_VERSION = "vs01.signing_envelope/v1";

/** Production-facing provenance shape recorded on the portable signing packet. */
export type Vs01SigningEnvelopeProvenanceV1 = {
  acceptedSoTDigest: string;
  acceptedSoTLength: number;
  /** Diagnostic only — never use for authority checks. */
  acceptedSoTDisplayFingerprint: string;
  packetDigest: string;
  packetSchemaVersion: string;
  signerManifestDigest: string;
  derivedAt: string;
  /** SHA-256 of packet-layer layout corpus (witness/signature alignment). */
  packetLayoutCorpusDigest: string;
  packetLayoutCorpusLength: number;
};

export type CanonicalizePrepareRolesResult =
  | { ok: true; roles: Vs01PrepareSigningRole[] }
  | { ok: false; reason: "duplicate_party_index" | "empty_roles" };

/** Canonical role order for envelope digests: ascending partyIndex; reject duplicates. */
export function canonicalizePrepareRolesForEnvelope(
  roles: readonly Vs01PrepareSigningRole[],
): CanonicalizePrepareRolesResult {
  if (!roles.length) return { ok: false, reason: "empty_roles" };
  const seen = new Set<number>();
  for (const r of roles) {
    if (seen.has(r.partyIndex)) return { ok: false, reason: "duplicate_party_index" };
    seen.add(r.partyIndex);
  }
  const sorted = [...roles].sort((a, b) => a.partyIndex - b.partyIndex);
  return { ok: true, roles: sorted };
}

export function buildSignerManifestCanonicalJson(roles: readonly Vs01PrepareSigningRole[]): string {
  const canon = canonicalizePrepareRolesForEnvelope(roles);
  if (!canon.ok) throw new Error(`signer_manifest_${canon.reason}`);
  const rows = canon.roles.map((r) => ({
    partyIndex: r.partyIndex,
    partyId: r.partyId,
    roleId: r.roleId,
    kind: r.kind,
    entityName: (r.entityName || r.partyName || "").trim(),
    requiresSignature: r.requiresSignature !== false,
    vs01CounterpartyId: r.vs01CounterpartyId ?? null,
  }));
  return JSON.stringify(canonicalize(rows));
}

async function digestText(text: string): Promise<string> {
  return (await sha256Hex(text)).toLowerCase();
}

/**
 * Build provenance for a signing envelope derived from accepted SoT + role manifest.
 * Does not mutate or re-hash accepted SoT into a new freeze.
 */
export async function buildVs01SigningEnvelopeProvenance(args: {
  acceptedSoTPlain: string;
  roles: readonly Vs01PrepareSigningRole[];
  /** When omitted, derived deterministically from accepted SoT + roles. */
  packetLayoutCorpus?: string;
  derivedAt?: string;
  packetSchemaVersion?: string;
}): Promise<Vs01SigningEnvelopeProvenanceV1> {
  const acceptedSoTPlain = (args.acceptedSoTPlain ?? "").trim();
  const canon = canonicalizePrepareRolesForEnvelope(args.roles);
  if (!canon.ok) throw new Error(`signer_manifest_${canon.reason}`);

  const packetLayoutCorpus = (
    args.packetLayoutCorpus ?? deriveVs01PacketLayoutCorpus(acceptedSoTPlain, canon.roles)
  ).trim();

  const packetSchemaVersion = args.packetSchemaVersion ?? VS01_SIGNING_ENVELOPE_SCHEMA_VERSION;
  const acceptedSoTDigest = await digestText(acceptedSoTPlain);
  const packetLayoutCorpusDigest = await digestText(packetLayoutCorpus);
  const signerManifestDigest = await digestText(buildSignerManifestCanonicalJson(canon.roles));
  const derivedAt = args.derivedAt ?? new Date().toISOString();

  const packetDigestPayload = canonicalize({
    packetSchemaVersion,
    acceptedSoTDigest,
    acceptedSoTLength: acceptedSoTPlain.length,
    packetLayoutCorpusDigest,
    packetLayoutCorpusLength: packetLayoutCorpus.length,
    signerManifestDigest,
  });
  const packetDigest = await digestText(JSON.stringify(packetDigestPayload));

  return {
    acceptedSoTDigest,
    acceptedSoTLength: acceptedSoTPlain.length,
    acceptedSoTDisplayFingerprint: fingerprintAgreementBody(acceptedSoTPlain),
    packetDigest,
    packetSchemaVersion,
    signerManifestDigest,
    derivedAt,
    packetLayoutCorpusDigest,
    packetLayoutCorpusLength: packetLayoutCorpus.length,
  };
}

export type EnvelopeProvenanceLinkageResult = {
  ok: boolean;
  reason: string | null;
};

/** Prove envelope still points at the provided accepted SoT bytes (SHA-256). */
export async function verifyEnvelopeLinksAcceptedSoT(args: {
  provenance: Vs01SigningEnvelopeProvenanceV1;
  acceptedSoTPlain: string;
}): Promise<EnvelopeProvenanceLinkageResult> {
  const text = (args.acceptedSoTPlain ?? "").trim();
  if (text.length !== args.provenance.acceptedSoTLength) {
    return { ok: false, reason: "accepted_sot_length_mismatch" };
  }
  const digest = await digestText(text);
  if (digest !== args.provenance.acceptedSoTDigest) {
    return { ok: false, reason: "accepted_sot_digest_mismatch" };
  }
  return { ok: true, reason: null };
}

/**
 * Re-derive packet layout from SoT + roles and confirm envelope packet digests still match.
 * Detects witness-tail / role-manifest drift without treating visible lines as proof.
 */
export async function verifyEnvelopePacketDerivation(args: {
  provenance: Vs01SigningEnvelopeProvenanceV1;
  acceptedSoTPlain: string;
  roles: readonly Vs01PrepareSigningRole[];
}): Promise<EnvelopeProvenanceLinkageResult> {
  const link = await verifyEnvelopeLinksAcceptedSoT(args);
  if (!link.ok) return link;
  const rebuilt = await buildVs01SigningEnvelopeProvenance({
    acceptedSoTPlain: args.acceptedSoTPlain,
    roles: args.roles,
    derivedAt: args.provenance.derivedAt,
    packetSchemaVersion: args.provenance.packetSchemaVersion,
  });
  if (rebuilt.packetLayoutCorpusDigest !== args.provenance.packetLayoutCorpusDigest) {
    return { ok: false, reason: "packet_layout_digest_mismatch" };
  }
  if (rebuilt.signerManifestDigest !== args.provenance.signerManifestDigest) {
    return { ok: false, reason: "signer_manifest_digest_mismatch" };
  }
  if (rebuilt.packetDigest !== args.provenance.packetDigest) {
    return { ok: false, reason: "packet_digest_mismatch" };
  }
  return { ok: true, reason: null };
}

/** Public-verify audit: packet → packetDigest → acceptedSoTDigest linkage. */
export async function evaluatePublicVerifyEnvelopeLinkage(args: {
  provenance: Vs01SigningEnvelopeProvenanceV1 | null | undefined;
  /** Authoritative accepted SoT plain when available for re-check. */
  acceptedSoTPlain?: string | null;
  /** Claimed source digest from the verify payload (must equal provenance.acceptedSoTDigest). */
  claimedAcceptedSoTDigest?: string | null;
}): Promise<EnvelopeProvenanceLinkageResult> {
  const prov = args.provenance;
  if (!prov) return { ok: false, reason: "envelope_provenance_missing" };
  if (!prov.acceptedSoTDigest || !prov.packetDigest || !prov.signerManifestDigest) {
    return { ok: false, reason: "envelope_provenance_incomplete" };
  }
  if (prov.packetSchemaVersion !== VS01_SIGNING_ENVELOPE_SCHEMA_VERSION) {
    return { ok: false, reason: "envelope_schema_version_mismatch" };
  }
  const claimed = (args.claimedAcceptedSoTDigest ?? "").trim().toLowerCase();
  if (claimed && claimed !== prov.acceptedSoTDigest) {
    return { ok: false, reason: "verify_claimed_sot_digest_mismatch" };
  }
  const sot = (args.acceptedSoTPlain ?? "").trim();
  if (sot) {
    return verifyEnvelopeLinksAcceptedSoT({ provenance: prov, acceptedSoTPlain: sot });
  }
  return { ok: true, reason: null };
}

/**
 * Seal a portable packet with envelope provenance and persist it.
 * seed.corpusPlain must remain accepted SoT bytes (not the packet-layout overlay).
 */
export async function sealPortablePacketEnvelopeProvenance(args: {
  documentId: string;
  portable: Vs01CanonicalPacketPortableV1;
  roles: readonly Vs01PrepareSigningRole[];
}): Promise<Vs01CanonicalPacketPortableV1> {
  const acceptedSoTPlain = args.portable.seed.corpusPlain.trim();
  const provenance = await buildVs01SigningEnvelopeProvenance({
    acceptedSoTPlain,
    roles: args.roles,
  });
  if (args.portable.seed.corpusHash !== provenance.acceptedSoTDisplayFingerprint) {
    throw new Error("portable_seed_not_accepted_sot");
  }
  const next = { ...args.portable, envelopeProvenance: provenance };
  storeVs01CanonicalPacketPortable(args.documentId, next);
  return next;
}
