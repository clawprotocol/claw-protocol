/**
 * Post-checkout local recovery → paid Pro source-of-truth handoff.
 * Recovery bodies that pass display gates commit through the same SoT path as server_full_draft.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  freezePaidProPostCheckoutRecoveryCanonicalSnapshot,
  meetsPaidProDegradedRecoveryDisplayRequirements,
  resolvePaidProPostCheckoutRecoveryDisplayPlain,
} from "./paidProPostCheckoutRenderGate";
import { hasLatchedLongAcceptedServerFullDraft } from "./paidProAcceptedServerFullDraftCommitGuard";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
  type PaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  hasPaidProPipelineSessionAcceptance,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { analyzePaidProSectionStructureCompleteness } from "./paidProSectionStructureCompletenessAuthority";
import { intakeDescribesBrandLicensingDistributionManufacturingStack } from "./paidProAgreementTitleScope";
import {
  hasBrandLicensingNoticeOrGoverningLawCorruption,
} from "./paidProExecutiveDraftPolish";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import {
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
  resolvePaidProFreezeCommitText,
} from "./paidProFreezeCandidate";

function isAuthoritativeRecoveryPipelineSource(source: string): boolean {
  return (
    source === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE ||
    source === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE ||
    source === "structural_recovery"
  );
}

export type PostCheckoutRecoverySotCommitResult =
  | {
      committed: true;
      record: PaidProSourceOfTruth;
      /** Result of freezePaidProPostCheckoutRecoveryCanonicalSnapshot only — not ref assignment. */
      canonicalSnapshotFrozen: boolean;
      reviewCorpusLen: number;
    }
  | { committed: false; reason: string; reviewCorpusLen: number };

export type PostCheckoutRecoverySotPreview = {
  eligible: boolean;
  displayPlain: string;
  blockReason: string;
  rawBodyLen: number;
  displayPlainLen: number;
};

function evaluateRecoveryFreezeGates(args: {
  displayPlain: string;
  draft: ParsedDraftShape;
  intakeText: string;
  premiumRenderSource: string;
  reviewSessionId?: string | null;
}): { ok: boolean; text: string; rejectReason: string | null } {
  const freezeArgs = {
    text: args.displayPlain,
    source: "server_full_draft",
    draft: args.draft,
    intakeText: args.intakeText,
    generationOutcome: "degraded",
    reviewSessionId: args.reviewSessionId ?? null,
    surface: "post_checkout_recovery_freeze_preview",
  };
  const prep = preparePaidProFreezeCandidateText({
    ...freezeArgs,
    source: args.premiumRenderSource,
  });
  const gates = evaluatePaidProFreezeCandidateGates(prep, freezeArgs);
  return {
    ok: gates.ok,
    text: gates.ok ? gates.text : prep.text,
    rejectReason: gates.rejectReason,
  };
}

/** Same gates as {@link tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth} without mutating SoT. */
export function previewPostCheckoutRecoverySotCommit(args: {
  body: string;
  draft: ParsedDraftShape;
  intakeText: string;
  premiumRenderSource: string;
  reviewSessionId?: string | null;
}): PostCheckoutRecoverySotPreview {
  const rawBodyLen = (args.body || "").trim().length;
  if (hasLatchedLongAcceptedServerFullDraft()) {
    return {
      eligible: false,
      displayPlain: "",
      blockReason: "latched_server_full_draft_authority_present",
      rawBodyLen,
      displayPlainLen: 0,
    };
  }
  const displayPlain = resolvePaidProPostCheckoutRecoveryDisplayPlain({
    draft: args.draft,
    intakeText: args.intakeText,
    winningPremiumBodyText: args.body,
    premiumRenderSource: args.premiumRenderSource,
    premiumDegradedServerLocalRecovery:
      args.premiumRenderSource === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  });
  const rawBody = (args.body || "").trim();
  const resolvedDisplayPlain =
    displayPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN
      ? displayPlain
      : meetsPaidProDegradedRecoveryDisplayRequirements(rawBody, args.intakeText) &&
          isAuthoritativeRecoveryPipelineSource(args.premiumRenderSource)
        ? rawBody
        : "";
  if (resolvedDisplayPlain.length < PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      eligible: false,
      displayPlain: resolvedDisplayPlain,
      blockReason: "recovery_display_plain_below_review_min",
      rawBodyLen,
      displayPlainLen: resolvedDisplayPlain.length,
    };
  }
  const completeness = analyzePaidProSectionStructureCompleteness(resolvedDisplayPlain);
  if (
    completeness.missingParentSections.length > 0 ||
    completeness.missingIntermediateSections.length > 0 ||
    completeness.fatal
  ) {
    return {
      eligible: false,
      displayPlain: resolvedDisplayPlain,
      blockReason: completeness.fatal
        ? "recovery_section_structure_completeness_fatal"
        : "recovery_section_structure_incomplete",
      rawBodyLen,
      displayPlainLen: resolvedDisplayPlain.length,
    };
  }
  if (intakeDescribesBrandLicensingDistributionManufacturingStack(args.intakeText)) {
    if (hasBrandLicensingNoticeOrGoverningLawCorruption(resolvedDisplayPlain)) {
      return {
        eligible: false,
        displayPlain: resolvedDisplayPlain,
        blockReason: "recovery_brand_licensing_notice_governing_law_corruption",
        rawBodyLen,
        displayPlainLen: resolvedDisplayPlain.length,
      };
    }
    const structure = applySectionStructureIntegrity(resolvedDisplayPlain, {
      source: "brand_licensing_recovery_sot_preview",
      repair: false,
    });
    if (structure.anomalyCount > 0) {
      return {
        eligible: false,
        displayPlain: resolvedDisplayPlain,
        blockReason: `recovery_brand_licensing_section_structure_anomaly:${structure.anomalyCount}`,
        rawBodyLen,
        displayPlainLen: resolvedDisplayPlain.length,
      };
    }
    if (!/MANUFACTURING,\s+DISTRIBUTION,\s+LICENSING/i.test(resolvedDisplayPlain)) {
      return {
        eligible: false,
        displayPlain: resolvedDisplayPlain,
        blockReason: "recovery_brand_licensing_title_missing",
        rawBodyLen,
        displayPlainLen: resolvedDisplayPlain.length,
      };
    }
    if (/\(\s*["']Client["']\s*\)/i.test(resolvedDisplayPlain.slice(0, 4_000))) {
      return {
        eligible: false,
        displayPlain: resolvedDisplayPlain,
        blockReason: "recovery_brand_licensing_client_role_label",
        rawBodyLen,
        displayPlainLen: resolvedDisplayPlain.length,
      };
    }
  }
  const freezeGates = evaluateRecoveryFreezeGates({
    displayPlain: resolvedDisplayPlain,
    draft: args.draft,
    intakeText: args.intakeText,
    premiumRenderSource: args.premiumRenderSource,
    reviewSessionId: args.reviewSessionId,
  });
  if (!freezeGates.ok) {
    return {
      eligible: false,
      displayPlain: resolvedDisplayPlain,
      blockReason: freezeGates.rejectReason ?? "recovery_freeze_gates_failed",
      rawBodyLen,
      displayPlainLen: resolvedDisplayPlain.length,
    };
  }
  return {
    eligible: true,
    displayPlain: freezeGates.text,
    blockReason: "",
    rawBodyLen,
    displayPlainLen: freezeGates.text.length,
  };
}

export function logPremiumRecoveryAuthority(args: {
  surface: string;
  /** Final authority adoption only — call after authoritativeAgreementSnapshotRef is assigned when true. */
  accepted: boolean;
  adoptedToSoT: boolean;
  /** authoritativeAgreementSnapshotRef.current assigned with non-empty committed corpus. */
  authoritativeSnapshotAssigned: boolean;
  /** freezePaidProPostCheckoutRecoveryCanonicalSnapshot produced a frozen hash. */
  canonicalSnapshotFrozen: boolean;
  blockedReason: string | null;
  reviewCorpusLen: number;
  premiumRenderSource?: string | null;
  rawBodyLen?: number | null;
  displayPlainLen?: number | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (import.meta.env.DEV && args.accepted && !args.authoritativeSnapshotAssigned) {
    // eslint-disable-next-line no-console
    console.warn("[premium-recovery-authority] accepted:true requires authoritativeSnapshotAssigned:true", {
      surface: args.surface,
    });
  }
  // eslint-disable-next-line no-console
  console.info("[premium-recovery-authority]", {
    surface: args.surface,
    accepted: args.accepted,
    adoptedToSoT: args.adoptedToSoT,
    authoritativeSnapshotAssigned: args.authoritativeSnapshotAssigned,
    canonicalSnapshotFrozen: args.canonicalSnapshotFrozen,
    blockedReason: args.blockedReason,
    reviewCorpusLen: args.reviewCorpusLen,
    premiumRenderSource: args.premiumRenderSource ?? null,
    rawBodyLen: args.rawBodyLen ?? null,
    displayPlainLen: args.displayPlainLen ?? null,
  });
}

export function tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth(args: {
  body: string;
  draft: ParsedDraftShape;
  intakeText: string;
  premiumRenderSource: string;
  reviewSessionId?: string | null;
}): PostCheckoutRecoverySotCommitResult {
  if (hasPaidProSourceOfTruth()) {
    const existing = getPaidProSourceOfTruth()!;
    if (
      existing.text.length >= PAID_PRO_AUTHORITY_MIN_LEN &&
      hasPaidProPipelineSessionAcceptance({ text: existing.text, source: existing.source })
    ) {
      const frozen = freezePaidProPostCheckoutRecoveryCanonicalSnapshot({
        text: existing.text,
        draft: args.draft,
        intakeText: args.intakeText,
        reviewSessionId: args.reviewSessionId ?? null,
      });
      return {
        committed: true,
        record: existing,
        canonicalSnapshotFrozen: Boolean(frozen?.hash),
        reviewCorpusLen: existing.text.length,
      };
    }
  }
  const preview = previewPostCheckoutRecoverySotCommit({
    body: args.body,
    draft: args.draft,
    intakeText: args.intakeText,
    premiumRenderSource: args.premiumRenderSource,
    reviewSessionId: args.reviewSessionId,
  });
  if (!preview.eligible) {
    return {
      committed: false,
      reason: preview.blockReason,
      reviewCorpusLen: preview.rawBodyLen,
    };
  }
  const freezeCommit = resolvePaidProFreezeCommitText({
    text: preview.displayPlain,
    source: "server_full_draft",
    draft: args.draft,
    intakeText: args.intakeText,
    generationOutcome: "degraded",
    reviewSessionId: args.reviewSessionId ?? null,
    surface: "post_checkout_recovery_sot_commit",
  });
  if (!freezeCommit.ok) {
    return {
      committed: false,
      reason: freezeCommit.rejectReason ?? "recovery_freeze_gates_failed",
      reviewCorpusLen: preview.displayPlainLen,
    };
  }
  markPaidProPipelineValidationPassed({ text: freezeCommit.text, source: "server_full_draft" });
  try {
    const record = establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: args.draft,
      intakeText: args.intakeText,
      reviewSessionId: args.reviewSessionId ?? null,
      generationOutcome: "degraded",
    });
    const frozen = freezePaidProPostCheckoutRecoveryCanonicalSnapshot({
      text: record.text,
      draft: args.draft,
      intakeText: args.intakeText,
      reviewSessionId: args.reviewSessionId ?? null,
    });
    return {
      committed: true,
      record,
      canonicalSnapshotFrozen: Boolean(frozen?.hash),
      reviewCorpusLen: record.text.length,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "establish_paid_pro_source_of_truth_failed";
    return { committed: false, reason, reviewCorpusLen: preview.displayPlainLen };
  }
}

export function isPremiumNetworkLocalRecoveryRenderSource(
  source: string | null | undefined,
): boolean {
  return String(source || "").trim() === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;
}
