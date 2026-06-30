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

export type CheckoutRestoreMetadataHydrateResult = {
  seed: PaidProSignerMetadataSeedResult | null;
  fieldCounts: ReturnType<typeof computeCanonicalPartyMetadataFieldCounts>;
};

export function hydrateCanonicalPartyMetadataAfterCheckoutRestore(args: {
  intakeText: string;
  draft: ParsedDraftShape;
}): CheckoutRestoreMetadataHydrateResult {
  const intakeText = (args.intakeText || "").trim();
  if (!intakeText || !args.draft) {
    return {
      seed: null,
      fieldCounts: computeCanonicalPartyMetadataFieldCounts(null),
    };
  }

  const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
    legalEntities: (args.draft.parties ?? [])
      .map((p) => String((p as { name?: string }).name ?? "").trim())
      .filter(Boolean),
    intakeText,
    draft: args.draft,
  });

  const authoritativePartyCount = Math.min(
    resolveAuthoritativeSignerCount({
      intakeText,
      draftParties: args.draft.parties,
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
          draft: args.draft,
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

  return { seed, fieldCounts };
}
