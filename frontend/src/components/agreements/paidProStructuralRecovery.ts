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
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  intakeDescribesBrandLicensingDistributionManufacturingStack,
  resolveAgreementTitleFromIntakeScope,
} from "./paidProAgreementTitleScope";
import { buildDeterministicQuadPartyBrandLicensingProFallback } from "./deterministicQuadPartyProFallback";
import {
  assessBrandLicensingRoleFidelity,
  resolveBrandLicensingPartyOrderFromIntake,
} from "./paidProBrandLicensingRoleMap";
import {
  expandOperativeCorpusWithUniqueSupplements,
  stripRepeatedSupplementalProvisionsFiller,
} from "./paidProSupplementalProvisionsFillerGate";

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
    const roleOrder = resolveBrandLicensingPartyOrderFromIntake(intake).filter(isAuthoritativeLegalEntityName);
    const brandFallback = buildDeterministicQuadPartyBrandLicensingProFallback({
      draft,
      rawIntake: intake,
      partyNames: roleOrder.length >= 4 ? roleOrder.slice(0, 4) : undefined,
    });
    if (brandFallback.ok) {
      let body = brandFallback.body;
      const displayMin = Math.max(minLen, PAID_PRO_RECOVERY_MIN_DISPLAY_LEN);
      if (body.length < displayMin) {
        body = expandOperativeCorpusWithUniqueSupplements(body, displayMin);
      }
      const fillerStripped = stripRepeatedSupplementalProvisionsFiller(body);
      body = fillerStripped.text;
      const fidelity = assessBrandLicensingRoleFidelity(body, intake, draft);
      if (!fidelity.ok) {
        return {
          ok: false,
          body: "",
          partyCount: 4,
          reason: `brand_licensing_role_fidelity:${fidelity.defects.join(",")}`,
        };
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
    body = expandOperativeCorpusWithUniqueSupplements(body, PAID_PRO_RECOVERY_MIN_DISPLAY_LEN + 200);
    body = stripRepeatedSupplementalProvisionsFiller(body).text;
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
