/**
 * Paid Pro hydrate replay — reuse frozen manifest / consumed authority instead of
 * rediscovering party count from an empty structural context.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  getFrozenCanonicalAgreementCorpus,
  type CanonicalAgreementSnapshotParty,
} from "./canonicalAgreementSnapshot";
import {
  paidProSignerMetadataPartiesFromFrozenManifest,
  readFrozenCanonicalManifestPartyNames,
} from "./frozenCanonicalManifestAuthority";
import { resolveNoticeStructuralValidationParties } from "./paidProPartyNoticeDetails";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  readPremiumRecipientHandoff,
  resolveHandoffPartySlotCount,
} from "./premiumPartyNamesHandoff";

export type PaidProHydrateStructuralContext = {
  structuralParties: readonly PaidProSignerMetadataParty[];
  draftPartyNames: string[];
  handoffPartySlots: number;
  canonicalAuthorityPartyCount: number;
  /** True when corpus hash matches an already-frozen canonical snapshot (session replay). */
  replayFromFrozenHash: boolean;
  manifestSource: "frozen_snapshot" | "consumed_authority" | "frozen_manifest_names" | "corpus_enriched" | "none";
};

function manifestRowsToDraftPartyNames(
  rows: readonly CanonicalAgreementSnapshotParty[] | undefined | null,
): string[] {
  if (!rows?.length) return [];
  return rows
    .map((row) => String(row.name ?? "").trim())
    .filter((name) => name.length >= 2);
}

export function resolvePaidProHydrateStructuralContext(args: {
  text: string;
  hash?: string | null;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
}): PaidProHydrateStructuralContext {
  const text = String(args.text ?? "").trim();
  const frozen = getFrozenCanonicalAgreementCorpus();
  const consumed = readConsumedPaidProSignerMetadataAuthority();
  const hash = String(args.hash ?? "").trim();
  const replayFromFrozenHash = Boolean(
    hash &&
      frozen?.frozen &&
      frozen.hash === hash &&
      frozen.canonicalText.trim() === text,
  );

  let structuralParties: readonly PaidProSignerMetadataParty[] = [];
  let manifestSource: PaidProHydrateStructuralContext["manifestSource"] = "none";

  if (consumed?.parties?.length) {
    structuralParties = resolveNoticeStructuralValidationParties(consumed.parties, {
      intakeText: args.intakeText ?? null,
      draftPartyNames: consumed.parties.map((p) => p.partyLegalName),
      acceptedCorpus: text,
    });
    manifestSource = "consumed_authority";
  } else if (frozen?.signerManifest?.length || frozen?.parties?.length) {
    const fromFrozen = (frozen.signerManifest?.length ? frozen.signerManifest : frozen.parties).map(
      (row, partyIndex) => ({
        partyIndex,
        partyLegalName: String(row.name ?? "").trim(),
        signerEmail: String(row.email ?? "").trim(),
        signerName: "",
        signerTitle: "",
        partyAddress: String(row.partyAddress ?? "").trim(),
      }),
    );
    structuralParties = resolveNoticeStructuralValidationParties(fromFrozen, {
      intakeText: args.intakeText ?? null,
      draftPartyNames: manifestRowsToDraftPartyNames(
        frozen.signerManifest?.length ? frozen.signerManifest : frozen.parties,
      ),
      acceptedCorpus: text,
    });
    manifestSource = "frozen_snapshot";
  } else {
    const fromManifestNames = paidProSignerMetadataPartiesFromFrozenManifest();
    if (fromManifestNames.length >= 2) {
      structuralParties = resolveNoticeStructuralValidationParties(fromManifestNames, {
        intakeText: args.intakeText ?? null,
        draftPartyNames: readFrozenCanonicalManifestPartyNames(),
        acceptedCorpus: text,
      });
      manifestSource = "frozen_manifest_names";
    }
  }

  if (structuralParties.length < 2) {
    const draftPartyNames =
      (args.draft?.parties ?? [])
        .map((p) => String(p?.name ?? "").trim())
        .filter(Boolean) ||
      readFrozenCanonicalManifestPartyNames();
    structuralParties = resolveNoticeStructuralValidationParties([], {
      intakeText: args.intakeText ?? null,
      draftPartyNames,
      acceptedCorpus: text,
    });
    if (structuralParties.length >= 2) {
      manifestSource = "corpus_enriched";
    }
  }

  const draftPartyNames =
    structuralParties.map((p) => p.partyLegalName).filter(Boolean).length >= 2
      ? structuralParties.map((p) => p.partyLegalName)
      : readFrozenCanonicalManifestPartyNames().length >= 2
        ? readFrozenCanonicalManifestPartyNames()
        : (args.draft?.parties ?? []).map((p) => String(p?.name ?? "").trim()).filter(Boolean);

  const handoff = readPremiumRecipientHandoff();
  const handoffPartySlots = handoff
    ? resolveHandoffPartySlotCount(handoff, structuralParties.length)
    : structuralParties.length;

  const canonicalAuthorityPartyCount = resolveAuthoritativeSignerCount({
    intakeText: args.intakeText ?? null,
    draftPartyNames,
    draftParties: draftPartyNames.map((name) => ({ name })),
    manifestPartyCount: Math.max(structuralParties.length, draftPartyNames.length),
  }).count;

  return {
    structuralParties,
    draftPartyNames,
    handoffPartySlots,
    canonicalAuthorityPartyCount,
    replayFromFrozenHash,
    manifestSource,
  };
}

/** Fail closed in dev/test when hydrate would validate with zero party authority. */
export function assertPaidProHydrateAuthorityInvariant(
  ctx: PaidProHydrateStructuralContext,
  surface = "paid_pro_source_of_truth_hydrate",
): void {
  if (ctx.replayFromFrozenHash && ctx.canonicalAuthorityPartyCount >= 2) return;
  if (ctx.canonicalAuthorityPartyCount >= 2) return;
  const isStrict =
    (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") ||
    (typeof import.meta !== "undefined" && import.meta.env?.DEV);
  if (!isStrict) return;
  throw new Error(
    `[paid-pro-hydrate-authority-blocked] surface=${surface} partyCount=0 manifestSource=${ctx.manifestSource} replay=${ctx.replayFromFrozenHash}`,
  );
}

export function paidProHydrateCorpusHash(text: string, hash?: string | null): string {
  const trimmed = String(text ?? "").trim();
  return String(hash ?? "").trim() || hashPaidProCorpus(trimmed);
}
