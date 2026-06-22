/**
 * Read canonical party manifest frozen at Paid Pro SoT establish — sole authority after freeze
 * when intake/draft consumers would otherwise drift to two-party fallbacks.
 */

import type { CanonicalAgreementSnapshotParty } from "./canonicalAgreementSnapshot";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { getAuthoritativeAgreementDocument } from "./authoritativeAgreementDocument";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

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
  if (fromFrozen.length >= 2) return fromFrozen.slice(0, 4);

  const doc = getAuthoritativeAgreementDocument();
  const fromDoc = manifestRowsFromSnapshot(doc?.canonicalPartyManifest);
  if (fromDoc.length >= 2) return fromDoc.slice(0, 4);

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
