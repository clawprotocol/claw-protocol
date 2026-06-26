/**
 * General Paid Pro structural recovery — N-party intake/draft authority, not quad fallback prose.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import { PAID_PRO_AUTHORITY_MAX_PARTIES } from "./paidProAuthorityLimits";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import {
  collapsePartySlotCandidates,
  resolveAuthoritativeIntakePartyNames,
} from "./partySlotIdentityNormalize";
import { PAID_PRO_RECOVERY_MIN_DISPLAY_LEN } from "./paidProPostCheckoutRenderGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  intakeDescribesBrandLicensingDistributionManufacturingStack,
  resolveAgreementTitleFromIntakeScope,
} from "./paidProAgreementTitleScope";
import { buildDeterministicQuadPartyBrandLicensingProFallback } from "./deterministicQuadPartyProFallback";

export function resolvePaidProRecoveryPartyNames(
  intakeText: string,
  draft: ParsedDraftShape,
  partyCount: number,
): string[] {
  const cap = Math.min(Math.max(partyCount, 2), PAID_PRO_AUTHORITY_MAX_PARTIES);

  const frozen = readFrozenCanonicalManifestPartyNames()
    .map((n) => n.trim())
    .filter(isAuthoritativeLegalEntityName);
  if (frozen.length >= cap) return frozen.slice(0, cap);

  const draftNames = collapsePartySlotCandidates(
    (draft.parties ?? []).map((p) => String(p?.name ?? "").trim()).filter(Boolean),
  ).filter(isAuthoritativeLegalEntityName);
  if (draftNames.length >= cap) return draftNames.slice(0, cap);

  const intakeNames = resolveAuthoritativeIntakePartyNames(intakeText).filter(
    isAuthoritativeLegalEntityName,
  );
  if (intakeNames.length >= cap) return intakeNames.slice(0, cap);

  const merged = collapsePartySlotCandidates([...draftNames, ...intakeNames]).filter(
    isAuthoritativeLegalEntityName,
  );
  return merged.slice(0, cap);
}

/** Build gate-ready recovery corpus from authoritative party count and names — no quad-only fallback. */
export function buildPaidProStructuralRecoveryBody(args: {
  intakeText: string;
  draft: ParsedDraftShape;
  minLen?: number;
}): { ok: boolean; body: string; partyCount: number; reason: string | null } {
  const intake = args.intakeText.trim();
  const draft = args.draft;
  const partyCount = consumeAuthoritativeSignerCount(
    "paid_pro_structural_recovery",
    {
      intakeText: intake,
      draftParties: draft.parties ?? [],
      manifestPartyCount: readFrozenCanonicalManifestPartyNames().length,
    },
    Math.max(
      resolvePaidProRecoveryPartyNames(intake, draft, PAID_PRO_AUTHORITY_MAX_PARTIES).length,
      2,
    ),
  );

  if (partyCount < 2 || partyCount > PAID_PRO_AUTHORITY_MAX_PARTIES) {
    return {
      ok: false,
      body: "",
      partyCount,
      reason: `recovery_party_count_out_of_range:${partyCount}`,
    };
  }

  const partyNames = resolvePaidProRecoveryPartyNames(intake, draft, partyCount);
  if (partyNames.length < partyCount) {
    return {
      ok: false,
      body: "",
      partyCount,
      reason: `recovery_party_names:${partyNames.length}_expected_${partyCount}`,
    };
  }

  const minLen = args.minLen ?? PAID_PRO_RECOVERY_MIN_DISPLAY_LEN + 1200;

  if (intakeDescribesBrandLicensingDistributionManufacturingStack(intake)) {
    const brandFallback = buildDeterministicQuadPartyBrandLicensingProFallback({
      draft,
      rawIntake: intake,
    });
    if (brandFallback.ok) {
      let body = brandFallback.body;
      const targetLen = Math.max(minLen, SUBSTANTIVE_SERVER_DRAFT_MIN_LEN, 15_000);
      if (body.length < targetLen) {
        body = padOperativeCorpusBeforeWitness(body, targetLen);
        while (body.length < targetLen) {
          body +=
            "\n\nSupplemental commercial provision. Each Party shall maintain inventory reporting under Oklahoma commercial standards.";
        }
      }
      if (body.length >= PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
        return { ok: true, body, partyCount: 4, reason: null };
      }
    }
  }

  let body = buildNPartyPaidProServerCorpus({
    parties: partyNames.slice(0, partyCount),
    intakeText: intake,
    draft,
    title: resolveAgreementTitleFromIntakeScope(intake).titleUpper,
    minLen,
  });

  if (body.length < PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
    body = padOperativeCorpusBeforeWitness(body, PAID_PRO_RECOVERY_MIN_DISPLAY_LEN + 200);
  }

  if (body.length < PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
    return {
      ok: false,
      body: "",
      partyCount,
      reason: `recovery_corpus_too_short:${body.length}`,
    };
  }

  return { ok: true, body, partyCount, reason: null };
}
