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
  const explicit = (args.legalEntities ?? [])
    .map((e) => String(e).replace(/\s+/g, " ").trim())
    .filter((e) => e.length >= 2 && isAuthoritativeLegalEntityName(e));

  const fromDraft = (args.draft?.parties ?? [])
    .map((p) => String((p as { name?: string }).name ?? "").replace(/\s+/g, " ").trim())
    .filter((e) => isAuthoritativeLegalEntityName(e));

  const fromLabeled = parseAllStructuredPartyContactBlocks(intake)
    .map((b) => b.legalEntity)
    .filter(isAuthoritativeLegalEntityName);

  const authoritativeCount = Math.min(
    resolveAuthoritativeSignerCount({
      intakeText: intake || null,
      draftParties: args.draft?.parties,
      draftPartyNames: fromDraft.length ? fromDraft : explicit,
      manifestPartyCount: Math.max(fromDraft.length, explicit.length, fromLabeled.length),
    }).count,
    UI_MAX_PARTY_SLOTS,
  );

  const maxSlots =
    explicit.length > UI_MAX_PARTY_SLOTS
      ? explicit.length
      : Math.min(
          Math.max(authoritativeCount, explicit.length, fromLabeled.length, fromDraft.length, 2),
          UI_MAX_PARTY_SLOTS,
        );

  const seedEntities = explicit.length ? explicit : fromDraft.length ? fromDraft : fromLabeled;
  const aligned = alignIntakeSignerMetadataToLegalEntities(intake, seedEntities);

  const pool: string[] = [];
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
