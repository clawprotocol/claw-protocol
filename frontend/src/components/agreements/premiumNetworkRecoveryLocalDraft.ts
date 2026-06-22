import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import {
  buildPremiumPostCheckoutStitchedBody,
  buildTripartitePremiumPostCheckoutStitchedBody,
} from "./premiumCheckoutStitchedBody";
import { labeledPartyLegalEntities, parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import { repairDraftPartiesFromIntakeAuthority } from "./partySlotIdentityNormalize";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  rejectPremiumBodyForProRender,
  stripClientPremiumArtifactBlocksFromDraft,
} from "./premiumFullDraftClientAcceptance";
import { assessPaidProMutualConsultingProfessionalStructure } from "./paidProMutualConsultingQualityFloor";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";
import {
  buildDeterministicQuadPartyMutualServicesProFallback,
  resolveDeterministicQuadPartyNames,
} from "./deterministicQuadPartyProFallback";

export const PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE = "premium_network_local_recovery" as const;
export const PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE =
  "premium_degraded_server_local_recovery" as const;

export type PremiumPostCheckoutLocalRecoverySurface =
  | typeof PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE
  | typeof PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE;

export type PremiumNetworkLocalRecoveryBuildResult = {
  ok: boolean;
  body: string;
  reasons: string[];
};

/**
 * Deterministic Pro draft when premium-full-draft cannot be shown (network or rejected server corpus).
 * Does not establish server SoT — display/recovery only until the user retries the API.
 */
export function buildPremiumPostCheckoutLocalRecoveryProDraft(args: {
  draft: ParsedDraftShape;
  rawIntake: string;
  intakeLower?: string;
  recoverySurface: PremiumPostCheckoutLocalRecoverySurface;
}): PremiumNetworkLocalRecoveryBuildResult {
  const rawIntake = (args.rawIntake || "").trim();
  const labeledBlocks = parseLabeledPartyBlocks(rawIntake);
  const stripped = stripClientPremiumArtifactBlocksFromDraft(args.draft);
  const repairedParties = repairDraftPartiesFromIntakeAuthority(stripped.parties ?? [], rawIntake);
  const draftForRecovery: ParsedDraftShape = {
    ...stripped,
    parties: repairedParties.length ? repairedParties : stripped.parties,
  };
  const quadPartyNames = resolveDeterministicQuadPartyNames(rawIntake, draftForRecovery);
  const partyNames = labeledPartyLegalEntities(rawIntake).length
    ? labeledPartyLegalEntities(rawIntake)
    : quadPartyNames.length >= 4
      ? quadPartyNames
      : (draftForRecovery.parties || []).map((p) => String(p.name || "").trim()).filter(Boolean);

  let body = "";
  if (quadPartyNames.length >= 4) {
    const quad = buildDeterministicQuadPartyMutualServicesProFallback({
      draft: draftForRecovery,
      rawIntake,
      partyNames: quadPartyNames,
    });
    if (!quad.ok) {
      return { ok: false, body: "", reasons: quad.reasons };
    }
    body = quad.body;
  } else if (labeledBlocks.length >= 3) {
    body = buildTripartitePremiumPostCheckoutStitchedBody(draftForRecovery, rawIntake, labeledBlocks);
  } else {
    body = buildPremiumPostCheckoutStitchedBody(draftForRecovery, rawIntake);
  }

  if (quadPartyNames.length >= 4) {
    // Quad deterministic fallback already ran placeholder + acceptance prep.
  } else if (labeledBlocks.length >= 3) {
    if (/\[(?:Not yet specified|YOUR COMPANY|SERVICE PROVIDER NAME)\]/i.test(body)) {
      return { ok: false, body: "", reasons: ["placeholder_blocked"] };
    }
  } else {
    const ph = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: rawIntake,
      partyNames,
      agreementFamily: draftForRecovery.agreement_family ?? null,
      surface: args.recoverySurface,
    });
    if (!ph.ok) {
      return { ok: false, body: "", reasons: ["placeholder_blocked", ...ph.remaining] };
    }
    body = ph.text;
  }

  const prepared =
    quadPartyNames.length >= 4 || labeledBlocks.length >= 3
      ? { text: body, repairs: [] as string[] }
      : preparePaidProServerDocumentForAcceptance(body, draftForRecovery, rawIntake, {
          surface: args.recoverySurface,
        });
  body = prepared.text;

  const intakeLower = (args.intakeLower ?? rawIntake).toLowerCase();
  const renderReject = rejectPremiumBodyForProRender(body, {
    intakeLower,
    intakeText: rawIntake,
    partyNames: partyNames.length ? partyNames : null,
  });
  if (!renderReject.ok) {
    return { ok: false, body: "", reasons: renderReject.reasons };
  }

  if (quadPartyNames.length < 4) {
    const mutual = assessPaidProMutualConsultingProfessionalStructure({
      text: body,
      rawIntake,
      draft: draftForRecovery,
    });
    if (mutual.applies && !mutual.ok) {
      return {
        ok: false,
        body: "",
        reasons: [
          "mutual_consulting_floor",
          `sections:${mutual.numberedSectionCount}`,
          ...mutual.topicsMissing,
        ],
      };
    }
  }

  if (body.trim().length < PREMIUM_USABLE_BODY_MIN_LEN) {
    return { ok: false, body: "", reasons: [`too_short:${body.trim().length}`] };
  }

  return { ok: true, body: body.trim(), reasons: prepared.repairs };
}

/** @deprecated Use {@link buildPremiumPostCheckoutLocalRecoveryProDraft} with an explicit recovery surface. */
export function buildPremiumNetworkRecoveryLocalProDraft(args: {
  draft: ParsedDraftShape;
  rawIntake: string;
  intakeLower?: string;
}): PremiumNetworkLocalRecoveryBuildResult {
  return buildPremiumPostCheckoutLocalRecoveryProDraft({
    ...args,
    recoverySurface: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
  });
}
