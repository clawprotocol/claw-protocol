/**
 * Read canonical party manifest frozen at Paid Pro SoT establish — sole authority after freeze
 * when intake/draft consumers would otherwise drift to two-party fallbacks.
 */

import { PAID_PRO_AUTHORITY_MAX_PARTIES } from "./paidProAuthorityLimits";
import { getFrozenCanonicalAgreementCorpus, type CanonicalAgreementSnapshotParty } from "./canonicalAgreementSnapshot";
import { getAuthoritativeAgreementDocument } from "./authoritativeAgreementDocument";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import type { PremiumRecipientHandoffSlot } from "./premiumPartyNamesHandoff";
import { signerMetadataInputRaw } from "../../agreement/signerMetadataNormalize";

function cleanManifestPartyName(name: string): string {
  return (name || "")
    .replace(/\s*\((?:"|“)?(?:Client|Service Provider|Provider|Company|Contractor|Party)(?:"|”)?\)\.?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function manifestRowsFromSnapshot(
  rows: readonly CanonicalAgreementSnapshotParty[] | undefined | null,
): string[] {
  if (!rows?.length) return [];
  const names: string[] = [];
  for (const row of rows) {
    const name = cleanManifestPartyName(String(row.name ?? "").trim());
    if (name.length >= 2 && isAuthoritativeLegalEntityName(name) && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/** Party legal names from frozen canonical snapshot or authoritative agreement document. */
export function readFrozenCanonicalManifestPartyNames(): string[] {
  const frozen = getFrozenCanonicalAgreementCorpus();
  const fromFrozen = manifestRowsFromSnapshot(frozen?.signerManifest ?? frozen?.parties);
  if (fromFrozen.length >= 2) return fromFrozen.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);

  const doc = getAuthoritativeAgreementDocument();
  const fromDoc = manifestRowsFromSnapshot(doc?.canonicalPartyManifest);
  if (fromDoc.length >= 2) return fromDoc.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);

  return [];
}

export function readFrozenCanonicalManifestPartyCount(): number {
  return readFrozenCanonicalManifestPartyNames().length;
}

export function paidProSignerMetadataPartiesFromFrozenManifest(): PaidProSignerMetadataParty[] {
  return readFrozenCanonicalManifestPartyNames().map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail: "",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
  }));
}

/** Frozen/consumed signer metadata for signer-setup UI — never downgraded below establish-time manifest. */
export function readFrozenSignerMetadataHandoffSlots(): PremiumRecipientHandoffSlot[] {
  const consumed = readConsumedPaidProSignerMetadataAuthority();
  if (consumed && consumed.parties.length >= 2) {
    return consumed.parties.map((p) => ({
      name: String(p.partyLegalName ?? "").trim(),
      email: String(p.signerEmail ?? "").trim(),
      role: "party",
      signerName: signerMetadataInputRaw(p.signerName),
      signerTitle: signerMetadataInputRaw(p.signerTitle),
      partyAddress: String(p.partyAddress ?? "").trim(),
    }));
  }
  const frozen = getFrozenCanonicalAgreementCorpus();
  const rows: CanonicalAgreementSnapshotParty[] =
    frozen?.signerManifest?.length ? frozen.signerManifest : frozen?.parties ?? [];
  if (rows.length < 2) return [];
  return rows.map((row) => ({
    name: cleanManifestPartyName(String(row.name ?? "")),
    email: String(row.email ?? "").trim(),
    role: String(row.role ?? "").trim() || "party",
    signerName: "",
    signerTitle: "",
    partyAddress: String(row.partyAddress ?? "").trim(),
  }));
}
