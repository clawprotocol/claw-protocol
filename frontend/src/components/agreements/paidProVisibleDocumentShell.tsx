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
import { resolvePaidProNoticeAuthorityPartiesForFreeze } from "./paidProNoticeContactAuthority";
import { restoreSequentialTopLevelSectionOrder } from "./paidProOrphanSectionNumberRepair";
import { ensureOperativeIfToNoticeDelivery } from "./paidProPartyNoticeDetails";
import { repairReviewPlainSectionContinuity } from "./reviewPlainSectionContinuity";
import {
  auditPaidProPostFinalizeVisibleSurface,
  logPaidProPostFinalizeVisibleSurfaceMismatch,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProPostFinalizeUserVisiblePlain } from "./paidProDisplayPlainAuthority";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import type { VisibleProPaperDiagnosticsTrace } from "./visibleProPaperRenderBoundary";
import { readAcceptedPipelineReviewCorpusPlain } from "./paidProAcceptedPipelineReviewCorpus";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { latchPaintedSequentialPersistReview } from "./paidProPaintedSequentialPersistReview";
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

/**
 * Last-good address-boundary + entity-only If-to on the buyer-visible paint corpus.
 * Persist / canonical-review-snapshot bytes do not go through
 * projectPaidProFrozenSoTDisplayPlain (consumed-metadata-only) or
 * resolvePaidProReviewRenderPlain. Display-only — does not rewrite SoT.
 */
const WITNESS_LINE_RE = /^(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b/im;
const TOP_LEVEL_SECTION_HEADING_RE = /^(?:#{1,4}\s+)?\d{1,2}\.\s+(?!\d)[A-Z].+$/m;
const NOTICES_SECTION_HEADING_RE =
  /^(?:#{1,4}\s+)?(?:\d+\.)+\s+(?:NOTICES|Notices|Notice)\b[^\n]*$/im;

function nextTopLevelSectionCut(tail: string): number | null {
  const nxt = tail.match(TOP_LEVEL_SECTION_HEADING_RE);
  const wit = tail.match(/^\s*(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b/im);
  const cuts = [nxt, wit]
    .map((m) => (m && m.index !== undefined ? m.index : null))
    .filter((n): n is number => n !== null);
  return cuts.length ? Math.min(...cuts) : null;
}

function isPreservableCommittedPaintParagraph(paragraph: string): boolean {
  const t = paragraph.trim();
  if (t.length < 16 || t.length > 800) return false;
  // Only standalone refine sentences — never re-hydrate a persist heading/If-to block
  // that display projection already split or dropped (fused Agreement12. NOTICES).
  if (/\n/.test(t)) return false;
  if (/^(?:#{1,4}\s+)?\d{1,2}\.\s+(?!\d)/.test(t)) return false;
  if (/\d+\.\s+NOTICES\b/i.test(t) || /Agreement\d+\.\s+NOTICES/i.test(t)) return false;
  if (/^(IN WITNESS WHEREOF|CLIENT\s*:|SERVICE PROVIDER\s*:|PARTY\s+\d+|If to\s+)/i.test(t)) {
    return false;
  }
  if (/^(By|Name|Title|Date|Address|Email)\s*:/i.test(t)) return false;
  return /[A-Za-z]/.test(t);
}

/**
 * Display projection (If-to / section-order) can drop a trailing refine paragraph
 * that sits after the last numbered heading. Splice those committed sentences
 * back into Notices (or the last rendered section body) so forced-route paint
 * matches CRS / SoT.
 */
export function reattachMissingCommittedPaintParagraphs(source: string, projected: string): string {
  const src = (source || "").replace(/\r\n/g, "\n");
  const out = (projected || "").replace(/\r\n/g, "\n");
  if (!src.trim() || !out.trim()) return projected;
  const missing = src
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => isPreservableCommittedPaintParagraph(p) && !out.includes(p));
  if (!missing.length) return projected;

  const block = `\n\n${missing.join("\n\n")}\n\n`;
  const notices = NOTICES_SECTION_HEADING_RE.exec(out);
  const spliceAtHeading = (headingIndex: number, headingLength: number): string => {
    const after = headingIndex + headingLength;
    const cut = nextTopLevelSectionCut(out.slice(after));
    const insertAt = after + (cut !== null ? cut : out.slice(after).trimEnd().length);
    return `${out.slice(0, insertAt).replace(/\s+$/, "")}${block}${out.slice(insertAt).replace(/^\n+/, "")}`;
  };
  if (notices && notices.index !== undefined) {
    return spliceAtHeading(notices.index, notices[0].length);
  }
  const headingRe = /^(?:#{1,4}\s+)?\d{1,2}\.\s+(?!\d)[A-Z].+$/gm;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(out)) !== null) last = m;
  if (last && last.index !== undefined) {
    return spliceAtHeading(last.index, last[0].length);
  }
  const wit = WITNESS_LINE_RE.exec(out);
  if (wit && wit.index !== undefined) {
    return `${out.slice(0, wit.index).replace(/\s+$/, "")}${block}${out.slice(wit.index)}`;
  }
  return `${out.replace(/\s+$/, "")}${block}`;
}

function projectLastGoodIfToOnPaintPlain(
  plain: string,
  args?: PaidProFirstReviewVisibleDisplayArgs,
): string {
  const body = (plain || "").replace(/\r\n/g, "\n").trimEnd();
  if (!body) return body;
  const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
    acceptedCorpus: body,
  });
  let afterIfTo = body;
  if (parties.length >= 2) {
    const noticed = ensureOperativeIfToNoticeDelivery(body, parties, {
      intakeText: args?.intakeText ?? null,
      draftPartyNames: (args?.draft?.parties ?? [])
        .map((p) => String(p?.name ?? "").trim())
        .filter(Boolean),
      acceptedCorpus: body,
    });
    if (noticed.repairs.length > 0) afterIfTo = noticed.text;
  }
  // Notices splice / persist bytes can keep 12/13 ahead of the original 11. Governing Law.
  // Restore last-good sequential identity order (10 then 11 then 12 then 13) on paint.
  const ordered = restoreSequentialTopLevelSectionOrder(afterIfTo);
  const afterOrder = ordered.repairs.length > 0 ? ordered.text : afterIfTo;
  // Fill unused late-section holes (12 then 14 / 10 then 12) and restore a supplied
  // governing-law term. Does not remint leftover 1..8 into 10/11/12/13.
  const continued = repairReviewPlainSectionContinuity(afterOrder, {
    intakeText: args?.intakeText,
    jurisdiction: args?.draft?.jurisdiction,
  });
  return continued.repairs.length > 0 ? continued.text : afterOrder;
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
  const titledPlain =
    resolution.plain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN && !skipTitleProjection
      ? projectPaidProVisibleTitleDisplayPlain(resolution.plain, {
          fallbackTitle: args.draft?.title,
          intakeText: args.intakeText,
          family: args.draft?.agreement_family,
        })
      : resolution.plain;
  // First failing live-paint predicates: persist / canonical-review-snapshot corpus
  // reached the preview without last-good If-to or sequential 10/11/12/13 order.
  // Display-only; does not rewrite SoT.
  const projectedPlain =
    titledPlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN
      ? reattachMissingCommittedPaintParagraphs(
          titledPlain,
          projectLastGoodIfToOnPaintPlain(titledPlain, args),
        )
      : titledPlain;
  const paintEligible =
    projectedPlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN ||
    (titledPlain.length >= PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN &&
      projectedPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN);
  if (paintEligible) {
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
        ? reattachMissingCommittedPaintParagraphs(
            authoritativePlain,
            projectLastGoodIfToOnPaintPlain(authoritativePlain, displayContextWithCanonical),
          )
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
  if (branch === "canonical_plain_forced" && renderPlain.trim().length >= 500) {
    latchPaintedSequentialPersistReview({
      paintedPlain: renderPlain,
      authorityPlain: liveSot?.text || authoritativePlain,
    });
  }

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
