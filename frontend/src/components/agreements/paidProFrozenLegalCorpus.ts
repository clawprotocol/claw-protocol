/**
 * Immutable frozen legal corpus after a professionally validated accepted-corpus handoff.
 *
 * Signer names, titles, emails, notices, and execution state travel as authority /
 * snapshot metadata (and a derived display overlay). Finalization must not rewrite
 * these legal bytes.
 */

import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";

let immutableFrozenLegalCorpus: string | null = null;

export function rememberImmutableFrozenLegalCorpus(text: string): void {
  const t = (text || "").trim();
  if (t.length < PAID_PRO_AUTHORITY_MIN_LEN) return;
  immutableFrozenLegalCorpus = t;
}

export function readImmutableFrozenLegalCorpus(): string | null {
  return immutableFrozenLegalCorpus;
}

export function clearImmutableFrozenLegalCorpus(): void {
  immutableFrozenLegalCorpus = null;
}

/**
 * After a validated accepted-corpus handoff, signer finalize emits those exact legal
 * bytes. Recital-repair finalize and SoT-only working corpora stay on the overlay path.
 */
export function resolveImmutableFrozenLegalCorpusOnSignerFinalize(args: {
  surface: string;
  signatureRegionOnly?: boolean;
  repairRecital?: boolean;
}): string | null {
  if (args.surface !== "finalize_paid_pro_signer_metadata") return null;
  if (args.repairRecital === true) return null;
  if (args.signatureRegionOnly === false) return null;
  const frozen = immutableFrozenLegalCorpus?.trim() ?? "";
  if (frozen.length < PAID_PRO_AUTHORITY_MIN_LEN) return null;
  return frozen;
}
