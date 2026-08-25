/**
 * Re-establish canonical party metadata after checkout-back restore (restore=starterReview).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  logCanonicalPartyMetadataDiagnostics,
  readCanonicalPartyMetadata,
} from "./canonicalPartyMetadataAuthority";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import {
  runPaidProSignerMetadataAuthoritySeed,
  type PaidProSignerMetadataSeedResult,
} from "./paidProSignerMetadataSeed";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { repairCheckoutBackRestoreDraftParties } from "./checkoutBackRestore";

export type CheckoutRestoreMetadataHydrateResult = {
  seed: PaidProSignerMetadataSeedResult | null;
  fieldCounts: ReturnType<typeof computeCanonicalPartyMetadataFieldCounts>;
  /** Intake-authoritative legal entities for signer-setup UI slots (never raw corrupted draft parties). */
  legalEntities: string[];
  repairedDraft: ParsedDraftShape | null;
};

/** Project intake + repaired draft to ordered legal-entity slots for post-payment signer setup UI. */
export function resolvePaidProSignerSetupLegalEntitiesFromIntake(args: {
  intakeText: string;
  draft: ParsedDraftShape | null | undefined;
}): string[] {
  const intakeText = (args.intakeText || "").trim();
  if (!intakeText || !args.draft) return [];
  const draft = repairCheckoutBackRestoreDraftParties(args.draft, intakeText);
  return resolveLegalEntitiesForCanonicalMetadata({
    legalEntities: (draft.parties ?? [])
      .map((p) => String((p as { name?: string }).name ?? "").trim())
      .filter(Boolean),
    intakeText,
    draft,
  });
}

export function hydrateCanonicalPartyMetadataAfterCheckoutRestore(args: {
  intakeText: string;
  draft: ParsedDraftShape;
}): CheckoutRestoreMetadataHydrateResult {
  const intakeText = (args.intakeText || "").trim();
  if (!intakeText || !args.draft) {
    return {
      seed: null,
      fieldCounts: computeCanonicalPartyMetadataFieldCounts(null),
      legalEntities: [],
      repairedDraft: null,
    };
  }

  const draft = repairCheckoutBackRestoreDraftParties(args.draft, intakeText);
  const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
    legalEntities: (draft.parties ?? [])
      .map((p) => String((p as { name?: string }).name ?? "").trim())
      .filter(Boolean),
    intakeText,
    draft,
  });

  const authoritativePartyCount = Math.min(
    resolveAuthoritativeSignerCount({
      intakeText,
      draftParties: draft.parties,
      manifestPartyCount: legalEntities.length,
    }).count,
    4,
  );

  establishCanonicalPartyMetadataAtStage({
    stage: "after-checkout",
    legalEntities,
    intakeText,
    mutationSource: "structured_intake",
  });

  const seed =
    legalEntities.length >= 2
      ? runPaidProSignerMetadataAuthoritySeed({
          stage: "checkout_back_restore_signer_setup",
          legalEntities,
          intakeText,
          draft,
          uiSignerNames: Array.from({ length: authoritativePartyCount }, () => ""),
          uiSignerTitles: Array.from({ length: authoritativePartyCount }, () => ""),
          uiSignerEmails: Array.from({ length: authoritativePartyCount }, () => ""),
          uiPartyAddresses: Array.from({ length: authoritativePartyCount }, () => ""),
          authoritativePartyCount,
        })
      : null;

  const bundle = readCanonicalPartyMetadata();
  const fieldCounts = computeCanonicalPartyMetadataFieldCounts(bundle);
  logCanonicalPartyMetadataDiagnostics("signer-setup", bundle, fieldCounts);

  return { seed, fieldCounts, legalEntities, repairedDraft: draft };
}
