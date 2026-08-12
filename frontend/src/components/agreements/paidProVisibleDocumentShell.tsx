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
  resolvePaidProFirstReviewVisibleDisplayPlain,
  type PaidProFirstReviewVisibleDisplayArgs,
} from "./paidProFirstReviewDisplayAuthority";
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

export const PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME = "PaidProVisibleDocumentShell";
/** SoT length threshold for synchronous canonical plain forced render (Test292). */
export const PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN = 1001;

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
  if (projectedPlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) {
    if (projectedPlain.length >= 80) {
      logTest310BlockClassification(projectedPlain);
    }
    logTest313HeadingRenderSource({
      source: resolution.source,
      plain: projectedPlain,
      paidProActive: resolution.paidProActive,
      forbiddenSourceBlocked: resolution.forbiddenSourceBlocked,
    });
    logTest314HeadingInvariant({
      source: resolution.source,
      renderer: "resolver",
      plain: projectedPlain,
    });
    return { plain: projectedPlain, source: resolution.source };
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
  const paintPlain =
    canonicalPlain.plain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
      ? canonicalPlain.plain
      : authoritativePlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
        ? authoritativePlain
        : "";
  const paintSource =
    canonicalPlain.plain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
      ? canonicalPlain.source
      : paintPlain
        ? hasSoT
          ? "paid_pro_accepted_canonical_source_of_truth"
          : "pipeline_accepted_corpus"
        : authoritativeSource;
  // Pipeline-accepted corpus is display authority even when SoT latch has not frozen yet.
  const displayAuthorityReady =
    hasSoT || authoritativePlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN;
  const { branch, reason } = resolvePaidProVisibleShellRenderBranch({
    hasSoT: displayAuthorityReady,
    sotLen,
    htmlLen,
    canonicalPlainLen: paintPlain.length,
    canonicalPlainSource: paintSource,
    paidProFirstReviewActive,
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
