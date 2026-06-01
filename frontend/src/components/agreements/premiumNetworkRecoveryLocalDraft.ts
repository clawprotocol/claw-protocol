import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import { buildPremiumPostCheckoutStitchedBody } from "./premiumCheckoutStitchedBody";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  rejectPremiumBodyForProRender,
  stripClientPremiumArtifactBlocksFromDraft,
} from "./premiumFullDraftClientAcceptance";
import { assessPaidProMutualConsultingProfessionalStructure } from "./paidProMutualConsultingQualityFloor";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";

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
  const stripped = stripClientPremiumArtifactBlocksFromDraft(args.draft);
  const partyNames = (stripped.parties || []).map((p) => String(p.name || "").trim()).filter(Boolean);

  let body = buildPremiumPostCheckoutStitchedBody(stripped, rawIntake);
  const ph = finalizeUserVisibleAgreementPlainText(body, {
    intakeRaw: rawIntake,
    partyNames,
    agreementFamily: stripped.agreement_family ?? null,
    surface: args.recoverySurface,
  });
  if (!ph.ok) {
    return { ok: false, body: "", reasons: ["placeholder_blocked", ...ph.remaining] };
  }
  body = ph.text;

  const prepared = preparePaidProServerDocumentForAcceptance(body, stripped, rawIntake);
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

  const mutual = assessPaidProMutualConsultingProfessionalStructure({
    text: body,
    rawIntake,
    draft: stripped,
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
