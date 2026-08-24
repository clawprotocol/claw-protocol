/**
 * Resolve authoritative legal-entity slots for canonical signer/contact metadata.
 * Never cap to draft.parties.length when intake or signer-count authority reports more parties.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { parseAllStructuredPartyContactBlocks } from "./labeledPartyBlockParse";
import { alignIntakeSignerMetadataToLegalEntities } from "./structuredIntakePartyContactParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { partyLegalNamesMatch } from "./paidProSignerMetadataAuthority";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { intakePartyManifestLegalEntities } from "./intakePartyManifestAuthority";
import {
  repairDraftPartiesFromIntakeAuthority,
  resolveDeclaredExplicitPartyCount,
} from "./partySlotIdentityNormalize";
import { namedDumpPartiesForPaidRestore } from "./intakeNamedPartyFallback";

const UI_MAX_PARTY_SLOTS = 4;

function pushUniqueEntity(pool: string[], name: string): void {
  const trimmed = String(name ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || !isAuthoritativeLegalEntityName(trimmed)) return;
  if (pool.some((existing) => partyLegalNamesMatch(existing, trimmed))) return;
  pool.push(trimmed);
}

export function resolveLegalEntitiesForCanonicalMetadata(args: {
  legalEntities?: readonly string[];
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
}): string[] {
  const intake = String(args.intakeText ?? "").trim();
  const namedDump = namedDumpPartiesForPaidRestore(intake);
  if (namedDump.length >= 3) return namedDump;
  const draftForAuthority =
    args.draft && intake
      ? {
          ...args.draft,
          parties: repairDraftPartiesFromIntakeAuthority(args.draft.parties ?? [], intake),
        }
      : args.draft;
  const explicit = (args.legalEntities ?? [])
    .map((e) => String(e).replace(/\s+/g, " ").trim())
    .filter((e) => e.length >= 2 && isAuthoritativeLegalEntityName(e));

  const fromDraft = (draftForAuthority?.parties ?? [])
    .map((p) => String((p as { name?: string }).name ?? "").replace(/\s+/g, " ").trim())
    .filter((e) => isAuthoritativeLegalEntityName(e));

  const fromLabeled = parseAllStructuredPartyContactBlocks(intake)
    .map((b) => b.legalEntity)
    .filter(isAuthoritativeLegalEntityName);

  const fromManifest = intakePartyManifestLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  const declaredPartyCount = resolveDeclaredExplicitPartyCount(intake);

  const authoritativeCount = Math.min(
    resolveAuthoritativeSignerCount({
      intakeText: intake || null,
      draftParties: draftForAuthority?.parties,
      draftPartyNames: fromDraft.length ? fromDraft : explicit,
      manifestPartyCount: Math.max(fromDraft.length, explicit.length, fromLabeled.length, fromManifest.length),
    }).count,
    UI_MAX_PARTY_SLOTS,
  );

  const maxSlots =
    explicit.length > UI_MAX_PARTY_SLOTS
      ? explicit.length
      : Math.min(
          Math.max(
            authoritativeCount,
            explicit.length,
            fromLabeled.length,
            fromDraft.length,
            fromManifest.length,
            2,
          ),
          UI_MAX_PARTY_SLOTS,
        );

  const manifestAuthoritative =
    fromManifest.length >= 2 &&
    (declaredPartyCount == null || fromManifest.length >= declaredPartyCount) &&
    // Explicit caller-supplied legal entities win when the manifest is shorter or equal —
    // never let a 4-party Party-N bullet manifest truncate a 6-entity canonical bundle.
    !(explicit.length > fromManifest.length);
  const seedEntities = manifestAuthoritative
    ? fromManifest
    : explicit.length
      ? explicit
      : fromDraft.length
        ? fromDraft
        : fromLabeled;
  const aligned = alignIntakeSignerMetadataToLegalEntities(intake, seedEntities);

  const pool: string[] = [];
  if (manifestAuthoritative) {
    for (const name of fromManifest) pushUniqueEntity(pool, name);
  }
  for (const name of explicit) pushUniqueEntity(pool, name);
  for (const name of fromDraft) pushUniqueEntity(pool, name);
  for (const name of fromLabeled) pushUniqueEntity(pool, name);
  for (const slot of aligned) pushUniqueEntity(pool, slot.partyLegalName);

  const targetCount = Math.max(maxSlots, pool.length >= 2 ? Math.min(pool.length, maxSlots) : 2);
  while (pool.length < targetCount) {
    const slotName = aligned[pool.length]?.partyLegalName ?? fromLabeled[pool.length] ?? "";
    if (!slotName) break;
    pushUniqueEntity(pool, slotName);
  }

  return pool.slice(0, targetCount);
}
