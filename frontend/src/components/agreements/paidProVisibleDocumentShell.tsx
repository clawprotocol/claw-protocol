/**
 * Visible paid Pro document shell — owns the #fadeWrapper document body when
 * SimpleProFinalReviewScreen is bypassed. Forces canonical plain from frozen SoT.
 */

import { useEffect, useRef } from "react";
import { getAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { getAuthoritativeAgreementText } from "./authoritativeAgreementDocument";
import { readCanonicalAgreementCorpusForSurface } from "./canonicalAgreementSnapshot";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";
import {
  auditPaidProPostFinalizeVisibleSurface,
  logPaidProPostFinalizeVisibleSurfaceMismatch,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import type { VisibleProPaperDiagnosticsTrace } from "./visibleProPaperRenderBoundary";
import {
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

export const PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME = "PaidProVisibleDocumentShell";
/** SoT length threshold for synchronous canonical plain forced render (Test292). */
export const PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN = 1001;

export type PaidProVisibleShellRenderBranch = "canonical_plain_forced" | "html" | "empty";

const mountedLogKeys = new Set<string>();

export function resetPaidProVisibleDocumentShellLogsForTests(): void {
  mountedLogKeys.clear();
}

export function resolveCanonicalPlainForVisibleShell(): { plain: string; source: string } {
  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const locked = resolvePaidProPostFinalizeReviewPlain();
    if (locked.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) {
      return { plain: locked, source: "authoritative_signing_snapshot" };
    }
  }
  if (hasPaidProSourceOfTruth()) {
    const sot = getPaidProSourceOfTruthText().trim();
    if (sot.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) {
      return { plain: sot, source: "paidProSourceOfTruth" };
    }
  }
  const authoritative = getAuthoritativeAgreementText().trim();
  if (authoritative.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) {
    return { plain: authoritative, source: "authoritativeAgreementDocument" };
  }
  const frozen = readCanonicalAgreementCorpusForSurface("review", { tier: "pro" });
  const frozenPlain = frozen?.canonicalText?.trim() ?? "";
  if (frozenPlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN) {
    return { plain: frozenPlain, source: "frozenCanonicalCorpus" };
  }
  return { plain: "", source: "none" };
}

export function resolvePaidProVisibleShellRenderBranch(args: {
  hasSoT: boolean;
  sotLen: number;
  htmlLen: number;
  canonicalPlainLen?: number;
  canonicalPlainSource?: string;
}): { branch: PaidProVisibleShellRenderBranch; reason: string } {
  const canonicalPlainLen = args.canonicalPlainLen ?? 0;
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
};

export function PaidProVisibleDocumentShell({
  html,
  suppressEmptyFallback = false,
  compactDocumentTopPadding = false,
  visibleProPaperTrace,
  authoritativeSource = "paidProSourceOfTruth",
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hasSoT = hasPaidProSourceOfTruth();
  const sotPlain = hasSoT ? getPaidProSourceOfTruthText().trim() : "";
  const sotLen = sotPlain.length;
  const htmlLen = html.trim().length;
  const canonicalPlain = resolveCanonicalPlainForVisibleShell();
  const { branch, reason } = resolvePaidProVisibleShellRenderBranch({
    hasSoT,
    sotLen,
    htmlLen,
    canonicalPlainLen: canonicalPlain.plain.length,
    canonicalPlainSource: canonicalPlain.source,
  });
  const renderPlain =
    branch === "canonical_plain_forced"
      ? canonicalPlain.plain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
        ? canonicalPlain.plain
        : sotPlain
      : "";
  const renderSource =
    branch === "canonical_plain_forced" && canonicalPlain.plain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
      ? canonicalPlain.source
      : authoritativeSource;

  useEffect(() => {
    logPaidProVisibleShellOwnerMounted({
      componentName: PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME,
      hasSoT,
      sotLen,
      childCount: shellRef.current?.childElementCount ?? 0,
    });
    logPaidProVisibleShellRenderBranch({ branch, reason });
  }, [hasSoT, sotLen, branch, reason]);

  useEffect(() => {
    if (!isPaidProPostFinalizeHydratedCorpusLocked()) return;
    const expectedPlain = resolvePaidProPostFinalizeReviewPlain();
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

  return (
    <div
      ref={shellRef}
      className="w-full max-w-full min-w-0"
      data-testid="paid-pro-visible-document-shell"
      data-paid-pro-visible-shell-owner={PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME}
      data-paid-pro-render-branch={branch}
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
        <p
          className="px-6 py-10 text-center text-sm text-stone-500"
          data-testid="paid-pro-visible-document-shell-empty"
        >
          Agreement preview is not available yet.
        </p>
      )}
    </div>
  );
}
