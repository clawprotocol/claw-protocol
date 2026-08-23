/**
 * Visible paid Pro document shell — owns the #fadeWrapper document body when
 * SimpleProFinalReviewScreen is bypassed. Forces canonical plain from paid Pro display authority.
 */

import { useEffect, useRef } from "react";
import { getAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";
import {
  logTest310BlockClassification,
  logTest310DisplaySource,
  logTest313HeadingRenderSource,
  logTest314HeadingInvariant,
  meetsPaidSessionFallbackPaintFloor,
  PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN,
  resolvePaidProFirstReviewVisibleDisplayPlain,
  type PaidProFirstReviewVisibleDisplayArgs,
} from "./paidProFirstReviewDisplayAuthority";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import { projectPaidProVisibleTitleDisplayPlain } from "./paidProDocumentTitleOpeningRepair";
import {
  auditPaidProPostFinalizeVisibleSurface,
  logPaidProPostFinalizeVisibleSurfaceMismatch,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProPostFinalizeUserVisiblePlain } from "./paidProDisplayPlainAuthority";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import type { VisibleProPaperDiagnosticsTrace } from "./visibleProPaperRenderBoundary";
import { readAcceptedPipelineReviewCorpusPlain } from "./paidProAcceptedPipelineReviewCorpus";
import {
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { stripPremiumInstructionNoiseForDocument } from "./premiumInstructionStrip";

export const PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME = "PaidProVisibleDocumentShell";
/** SoT length threshold for synchronous canonical plain forced render (Test292). */
export const PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN = 1001;
/**
 * Minimum length for a valid paid pro fallback rebuild from intake.
 * When generate fails after pay, a rebuild of 200+ non-hollow chars is valid display authority.
 * Do NOT use the 1001 SoT floor to hide a valid rebuild — that floor is for frozen generate SoT.
 * @deprecated Use PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN from paidProFirstReviewDisplayAuthority.ts
 */
export const PAID_PRO_FALLBACK_REBUILD_MIN_LEN = 200;

export type PaidProVisibleShellRenderBranch = "canonical_plain_forced" | "html" | "empty";

const mountedLogKeys = new Set<string>();

function trimOrEmpty(s: string | null | undefined): string {
  return (s || "").trim();
}

export function resetPaidProVisibleDocumentShellLogsForTests(): void {
  mountedLogKeys.clear();
}

export function resolveCanonicalPlainForVisibleShell(
  args: PaidProFirstReviewVisibleDisplayArgs = {},
): { plain: string; source: string } {
  const resolution = resolvePaidProFirstReviewVisibleDisplayPlain(args);
  logTest310DisplaySource(resolution);
  const skipTitleProjection = isPaidProPostFinalizeHydratedCorpusLocked();
  const projectedPlain =
    resolution.plain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN && !skipTitleProjection
      ? projectPaidProVisibleTitleDisplayPlain(resolution.plain, {
          fallbackTitle: args.draft?.title,
          intakeText: args.intakeText,
          family: args.draft?.agreement_family,
        })
      : resolution.plain;
  // Strip leaked user prompt prose that appears as numbered sections (e.g. "11. Mesa Realty
  // Group LLC / said", "12. Don't / count", "13. 12 month deal") and meta lines like
  // "Commercial detail carried forward from user notes". Live leak from Harbor retest.
  const strippedPlain = stripPremiumInstructionNoiseForDocument(projectedPlain);
  if (strippedPlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) {
    if (strippedPlain.length >= 80) {
      logTest310BlockClassification(strippedPlain);
    }
    logTest313HeadingRenderSource({
      source: resolution.source,
      plain: strippedPlain,
      paidProActive: resolution.paidProActive,
      forbiddenSourceBlocked: resolution.forbiddenSourceBlocked,
    });
    logTest314HeadingInvariant({
      source: resolution.source,
      renderer: "resolver",
      plain: strippedPlain,
    });
    return { plain: strippedPlain, source: resolution.source };
  }
  // Issue #83: After pay, a ≥200 non-hollow rebuild MUST paint even when < 1001.
  // This uses the same predicate as Retry lockout — meetsPaidSessionFallbackPaintFloor.
  // Works whether paidProActive is true or false — hasPaidPremiumCompletionSession() is the gate.
  if (
    hasPaidPremiumCompletionSession() &&
    meetsPaidSessionFallbackPaintFloor(strippedPlain, args.intakeText)
  ) {
    return { plain: strippedPlain, source: resolution.source || "paid_session_intake_rebuild" };
  }
  return { plain: "", source: resolution.source || "none" };
}

export function resolvePaidProVisibleShellRenderBranch(args: {
  hasSoT: boolean;
  sotLen: number;
  htmlLen: number;
  canonicalPlainLen?: number;
  canonicalPlainSource?: string;
  paidProFirstReviewActive?: boolean;
  /** Issue #83: paid-session fallback at ≥200 non-hollow. */
  paidSessionFallbackActive?: boolean;
}): { branch: PaidProVisibleShellRenderBranch; reason: string } {
  const canonicalPlainLen = args.canonicalPlainLen ?? 0;
  if (args.paidProFirstReviewActive) {
    // Never blank first-review while accepted canonical plain OR live SoT exists.
    if (canonicalPlainLen >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) {
      return {
        branch: "canonical_plain_forced",
        reason:
          args.canonicalPlainSource === "authoritative_signing_snapshot"
            ? "post_finalize_hydrated_snapshot_plain"
            : args.canonicalPlainSource === "paid_pro_accepted_canonical_source_of_truth" ||
                args.canonicalPlainSource === "review_session_authority"
              ? args.canonicalPlainSource === "review_session_authority"
                ? "review_session_authority"
                : "paid_pro_accepted_canonical_source_of_truth"
              : "paid_pro_first_review_display_authority",
      };
    }
    if (args.hasSoT && args.sotLen >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) {
      return {
        branch: "canonical_plain_forced",
        reason: "paid_pro_accepted_canonical_source_of_truth",
      };
    }
    // Issue #83: paid-session fallback at ≥200 non-hollow paints.
    if (args.paidSessionFallbackActive && canonicalPlainLen >= PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN) {
      return {
        branch: "canonical_plain_forced",
        reason: "paid_session_intake_rebuild",
      };
    }
    return { branch: "empty", reason: "paid_pro_awaiting_display_authority" };
  }
  if (
    args.canonicalPlainSource === "authoritative_signing_snapshot" &&
    canonicalPlainLen >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
  ) {
    return {
      branch: "canonical_plain_forced",
      reason: "post_finalize_hydrated_snapshot_plain",
    };
  }
  if (
    (args.hasSoT && args.sotLen >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) ||
    canonicalPlainLen >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
  ) {
    return {
      branch: "canonical_plain_forced",
      reason:
        args.hasSoT && args.sotLen >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
          ? "frozen_sot_len_above_threshold"
          : "authoritative_or_frozen_corpus_above_threshold",
    };
  }
  // Issue #83: paid-session fallback at ≥200 non-hollow paints even when paidProFirstReviewActive is false.
  if (args.paidSessionFallbackActive && canonicalPlainLen >= PAID_PRO_PAID_SESSION_FALLBACK_MIN_LEN) {
    return {
      branch: "canonical_plain_forced",
      reason: "paid_session_intake_rebuild",
    };
  }
  if (args.htmlLen > 0) {
    return { branch: "html", reason: "html_available_without_sot_threshold" };
  }
  return { branch: "empty", reason: "no_sot_and_no_html" };
}

export function logPaidProVisibleShellOwnerMounted(payload: {
  componentName: string;
  hasSoT: boolean;
  sotLen: number;
  childCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.hasSoT}|${payload.sotLen}|${payload.childCount}`;
  if (mountedLogKeys.has(key)) return;
  mountedLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-visible-shell-owner-mounted]", payload);
}

export function logPaidProVisibleShellRenderBranch(payload: {
  branch: PaidProVisibleShellRenderBranch;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-visible-shell-render-branch]", payload);
}

type Props = {
  html: string;
  suppressEmptyFallback?: boolean;
  compactDocumentTopPadding?: boolean;
  visibleProPaperTrace?: VisibleProPaperDiagnosticsTrace;
  authoritativeSource?: string;
  displayContext?: PaidProFirstReviewVisibleDisplayArgs;
};

export function PaidProVisibleDocumentShell({
  html,
  suppressEmptyFallback = false,
  compactDocumentTopPadding = false,
  visibleProPaperTrace,
  authoritativeSource = "paidProSourceOfTruth",
  displayContext,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hasSoT = hasPaidProSourceOfTruth();
  const sotPlain = hasSoT ? getPaidProSourceOfTruthText().trim() : "";
  const pipelinePlain = readAcceptedPipelineReviewCorpusPlain().trim();
  // Treat accepted pipeline corpus as display authority when SoT latch lags (resume / race).
  const authoritativePlain =
    sotPlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
      ? sotPlain
      : pipelinePlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
        ? pipelinePlain
        : sotPlain || pipelinePlain;
  const sotLen = authoritativePlain.length;
  const htmlLen = html.trim().length;
  const paidProFirstReviewActive = Boolean(displayContext?.paidProActive ?? displayContext?.premiumPaidDocumentSurface);
  // Parent may wire acceptedCanonicalPlain before agreementId / verified GET land.
  const displayContextWithCanonical: PaidProFirstReviewVisibleDisplayArgs = {
    ...(displayContext ?? {}),
    acceptedCanonicalPlain:
      trimOrEmpty(displayContext?.acceptedCanonicalPlain) ||
      authoritativePlain,
    paidProActive: paidProFirstReviewActive || Boolean(displayContext?.paidProActive),
  };
  const canonicalPlain = resolveCanonicalPlainForVisibleShell(displayContextWithCanonical);
  // Issue #83: paid-session fallback at ≥200 non-hollow.
  // Uses the SAME predicate as Retry lockout — meetsPaidSessionFallbackPaintFloor.
  const paidSessionFallbackActive =
    hasPaidPremiumCompletionSession() &&
    meetsPaidSessionFallbackPaintFloor(canonicalPlain.plain, displayContext?.intakeText);
  const paintPlain =
    canonicalPlain.plain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
      ? canonicalPlain.plain
      : authoritativePlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
        ? authoritativePlain
        : paidSessionFallbackActive
          ? canonicalPlain.plain
          : "";
  const paintSource =
    canonicalPlain.plain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
      ? canonicalPlain.source
      : authoritativePlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN && paintPlain === authoritativePlain
        ? hasSoT
          ? "paid_pro_accepted_canonical_source_of_truth"
          : "pipeline_accepted_corpus"
        : paidSessionFallbackActive
          ? canonicalPlain.source || "paid_session_intake_rebuild"
          : authoritativeSource;
  // Pipeline-accepted corpus is display authority even when SoT latch has not frozen yet.
  // Also, for paid first-review, accept fallback rebuild ≥200 chars as display authority.
  const displayAuthorityReady =
    hasSoT || authoritativePlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN || paidSessionFallbackActive;
  const { branch, reason } = resolvePaidProVisibleShellRenderBranch({
    hasSoT: displayAuthorityReady,
    sotLen,
    htmlLen,
    canonicalPlainLen: paintPlain.length,
    canonicalPlainSource: paintSource,
    paidProFirstReviewActive,
    paidSessionFallbackActive,
  });
  const renderPlain = branch === "canonical_plain_forced" ? paintPlain : "";
  const renderSource = branch === "canonical_plain_forced" ? paintSource : authoritativeSource;

  useEffect(() => {
    logPaidProVisibleShellOwnerMounted({
      componentName: PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME,
      hasSoT: displayAuthorityReady,
      sotLen,
      childCount: shellRef.current?.childElementCount ?? 0,
    });
    logPaidProVisibleShellRenderBranch({ branch, reason });
  }, [displayAuthorityReady, sotLen, branch, reason]);

  useEffect(() => {
    if (!isPaidProPostFinalizeHydratedCorpusLocked()) return;
    const expectedPlain = resolvePaidProPostFinalizeUserVisiblePlain(
      resolvePaidProPostFinalizeReviewPlain(),
    );
    if (expectedPlain.length < PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) return;
    if (countBlankSignerMetadataLinesInExecutionBlock(expectedPlain) > 0) return;
    const visibleText = shellRef.current?.innerText?.trim() ?? "";
    if (!visibleText) return;
    const signerNames = getAuthoritativeSigningSnapshot()?.signerMetadata?.partySignerNames ?? [];
    const audit = auditPaidProPostFinalizeVisibleSurface({
      visibleText,
      expectedPlain,
      signerNames,
    });
    if (audit.mismatch) {
      logPaidProPostFinalizeVisibleSurfaceMismatch(audit);
    }
  }, [branch, renderPlain, html]);

  // Review-authority corpus = live SoT (not DOM textContent / display projection).
  // CI readiness reads these attrs; never log corpus contents.
  const liveSot = hasSoT ? getPaidProSourceOfTruth() : null;
  const authorityLen = liveSot?.text?.trim().length ?? 0;
  const authorityHash =
    liveSot?.hash?.trim() ||
    (authorityLen > 0 ? hashPaidProCorpus(liveSot!.text) : "");
  const paintPlainHash =
    renderPlain.trim().length > 0 ? hashPaidProCorpus(renderPlain.trim()) : "";

  return (
    <div
      ref={shellRef}
      className="w-full max-w-full min-w-0"
      data-testid="paid-pro-visible-document-shell"
      data-paid-pro-visible-shell-owner={PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME}
      data-paid-pro-render-branch={branch}
      data-claw-review-authority-len={authorityLen > 0 ? String(authorityLen) : undefined}
      data-claw-review-authority-hash={authorityHash || undefined}
      data-claw-paint-plain-len={renderPlain.trim().length > 0 ? String(renderPlain.trim().length) : undefined}
      data-claw-paint-plain-hash={paintPlainHash || undefined}
    >
      {branch === "canonical_plain_forced" ? (
        <PaidProCanonicalPlainReviewDocument
          plain={renderPlain}
          tailPaddingClass="pb-12"
          compactTopPadding={compactDocumentTopPadding}
          authoritativeSource={renderSource}
        />
      ) : branch === "html" ? (
        <PremiumAgreementReadonlyView
          html={html}
          suppressEmptyFallback={suppressEmptyFallback}
          fullDocumentFlow
          compactDocumentTopPadding={compactDocumentTopPadding}
          visibleProPaperTrace={visibleProPaperTrace}
        />
      ) : (
        <div
          className="px-6 py-10 text-center text-sm text-stone-500"
          data-testid="paid-pro-visible-document-shell-empty"
          data-claw-review-display-gate={
            reason === "paid_pro_awaiting_display_authority"
              ? "display_authority_gate_failed"
              : reason
          }
          data-claw-review-actions-locked="true"
        >
          <p className="font-medium text-stone-700">
            {reason === "paid_pro_awaiting_display_authority"
              ? "LawDog could not confirm the server-locked agreement text for review."
              : "Agreement preview is not available yet."}
          </p>
          {reason === "paid_pro_awaiting_display_authority" ? (
            <p className="mt-2 text-xs text-stone-500">
              Review actions stay locked. Tap Retry to reload the accepted server snapshot — nothing was saved.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
