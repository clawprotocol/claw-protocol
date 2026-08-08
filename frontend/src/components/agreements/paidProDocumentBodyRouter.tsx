/**
 * Top-level paid Pro document body router for #fadeWrapper — forces visible shell
 * from frozen SoT before any legacy hollow branch can render (Test293).
 */

import { useEffect } from "react";
import {
  PaidProVisibleDocumentShell,
  type PaidProVisibleShellRenderBranch,
} from "./paidProVisibleDocumentShell";
import type { VisibleProPaperDiagnosticsTrace } from "./visibleProPaperRenderBoundary";
import type { PaidProFirstReviewVisibleDisplayArgs } from "./paidProFirstReviewDisplayAuthority";
import {
  hasFrozenCanonicalAgreementCorpus,
  readCanonicalAgreementCorpusForSurface,
} from "./canonicalAgreementSnapshot";
import {
  acceptedPipelineReviewCorpusLen,
  hasAcceptedPipelineReviewCorpusForRender,
  readAcceptedPipelineReviewCorpusPlain,
} from "./paidProAcceptedPipelineReviewCorpus";
import {
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  hasPaidProReviewSessionAuthority,
  resolvePaidProReviewSessionAuthorityPaintPlain,
} from "./paidProReviewSessionAuthority";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { hasAcceptedPaidCreateFlowFreezeLatch } from "./authoritativeCreateFlowReviewShell";
import { getLatchedAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";

/** Minimum frozen SoT length to force visible document shell (inclusive). */
export const PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN = 1000;

function latchedAcceptedFreezeCorpusLen(): number {
  if (!hasAcceptedPaidCreateFlowFreezeLatch()) return 0;
  const body = getLatchedAcceptedServerFullDraftAuthority()?.body.trim() ?? "";
  return body.length >= PAID_PRO_AUTHORITY_MIN_LEN ? body.length : 0;
}

/** Read-only canonical review corpus length for render routing (no SoT mutation). */
export function resolveCanonicalReviewCorpusLenForRender(): number {
  const authority = resolvePaidProReviewSessionAuthorityPaintPlain();
  if (authority && authority.plain.length >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN) {
    return authority.plain.length;
  }
  if (hasPaidProSourceOfTruth()) {
    return getPaidProSourceOfTruthText().trim().length;
  }
  const frozen = readCanonicalAgreementCorpusForSurface("review", { tier: "pro" });
  if (frozen?.canonicalText?.trim()) return frozen.canonicalText.trim().length;
  const pipelineLen = acceptedPipelineReviewCorpusLen();
  if (pipelineLen >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN) return pipelineLen;
  const latchLen = latchedAcceptedFreezeCorpusLen();
  if (latchLen >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN) return latchLen;
  return 0;
}

export function hasCanonicalReviewCorpusForRender(): boolean {
  if (hasPaidProReviewSessionAuthority() || hasPaidProSourceOfTruth() || hasFrozenCanonicalAgreementCorpus()) {
    return true;
  }
  if (hasAcceptedPipelineReviewCorpusForRender()) return true;
  // Keep just-accepted create-flow freeze paint mounted even if SoT establish lagged.
  return latchedAcceptedFreezeCorpusLen() >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN;
}

export function shouldForcePaidProReviewDocumentRender(): boolean {
  return (
    hasCanonicalReviewCorpusForRender() &&
    resolveCanonicalReviewCorpusLenForRender() >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN
  );
}

/**
 * Review document card gate — corpus force must win over transient canDisplay / runtime-authority
 * gaps so a locked Pro body cannot flash then unmount (documentRendererCount: 0).
 */
export function resolveShowPaidProReviewDocumentCard(args: {
  dashboardSignerSetupResumeUiActive?: boolean;
  canDisplayPaidProAgreementDocument: boolean;
}): boolean {
  return Boolean(
    args.dashboardSignerSetupResumeUiActive ||
      args.canDisplayPaidProAgreementDocument ||
      shouldForcePaidProReviewDocumentRender(),
  );
}

/** Once a canonical Pro corpus is locked, leave generating/hydrating display phases. */
export function shouldExitPaidProGeneratingDisplayPhase(args: {
  displayPhase: string;
  corpusForcesDocumentRender: boolean;
}): boolean {
  if (!args.corpusForcesDocumentRender) return false;
  return (
    args.displayPhase === "intake" ||
    args.displayPhase === "generating_draft" ||
    args.displayPhase === "hydrating_generated" ||
    args.displayPhase === "preparing_review" ||
    args.displayPhase === "editing_pro"
  );
}

export type PaidProDocumentBodyRouterBranch = "paid_pro_visible_shell_forced" | "legacy";

export type PaidProDocumentBodyRouterState = {
  hasSoT: boolean;
  sotLen: number;
  branch: PaidProDocumentBodyRouterBranch;
  reason: string;
  forced: boolean;
};

const routerLogKeys = new Set<string>();

export function resetPaidProDocumentBodyRouterLogsForTests(): void {
  routerLogKeys.clear();
}

export function resolvePaidProDocumentBodyRouter(): PaidProDocumentBodyRouterState {
  const hasSoT = hasPaidProSourceOfTruth() || hasPaidProReviewSessionAuthority();
  const authority = resolvePaidProReviewSessionAuthorityPaintPlain();
  const sotLen = authority?.plain.length
    ? authority.plain.length
    : hasPaidProSourceOfTruth()
      ? getPaidProSourceOfTruthText().trim().length
      : 0;
  const pipelinePlain = readAcceptedPipelineReviewCorpusPlain();
  const canonicalReviewLen = resolveCanonicalReviewCorpusLenForRender();
  const hasCanonicalCorpus = hasCanonicalReviewCorpusForRender();
  if (hasCanonicalCorpus && canonicalReviewLen >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN) {
    return {
      hasSoT,
      sotLen: canonicalReviewLen,
      branch: "paid_pro_visible_shell_forced",
      reason: hasPaidProReviewSessionAuthority()
        ? "review_session_authority_len_meets_threshold"
        : hasPaidProSourceOfTruth()
          ? "frozen_sot_len_meets_threshold"
          : pipelinePlain.length >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN
            ? "pipeline_accepted_corpus_len_meets_threshold"
            : "canonical_review_corpus_len_meets_threshold",
      forced: true,
    };
  }
  return {
    hasSoT,
    sotLen: sotLen || canonicalReviewLen,
    branch: "legacy",
    reason: hasSoT
      ? "sot_below_threshold"
      : hasCanonicalCorpus
        ? "canonical_corpus_below_threshold"
        : "no_canonical_review_corpus",
    forced: false,
  };
}

export function logPaidProDocumentBodyRouter(payload: {
  hasSoT: boolean;
  sotLen: number;
  branch: PaidProDocumentBodyRouterBranch;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.branch}|${payload.hasSoT}|${payload.sotLen}|${payload.reason}`;
  if (routerLogKeys.has(key)) return;
  routerLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-document-body-router]", payload);
}

type ForcedRouteProps = {
  router: PaidProDocumentBodyRouterState;
  html: string;
  suppressEmptyFallback?: boolean;
  compactDocumentTopPadding?: boolean;
  visibleProPaperTrace?: VisibleProPaperDiagnosticsTrace;
  authoritativeSource?: string;
  /** Inside the paid Pro white review card — skip duplicate outer frame chrome. */
  embedded?: boolean;
  displayContext?: PaidProFirstReviewVisibleDisplayArgs;
};

export function PaidProDocumentBodyForcedRoute({
  router,
  html,
  suppressEmptyFallback = false,
  compactDocumentTopPadding = false,
  visibleProPaperTrace,
  authoritativeSource = "paidProSourceOfTruth",
  embedded = false,
  displayContext,
}: ForcedRouteProps) {
  useEffect(() => {
    logPaidProDocumentBodyRouter({
      hasSoT: router.hasSoT,
      sotLen: router.sotLen,
      branch: router.branch,
      reason: router.reason,
    });
  }, [router.hasSoT, router.sotLen, router.branch, router.reason]);

  // Parent→shell boundary: wire immutable review-session authority (else SoT / pipeline)
  // so paint cannot race on missing agreementId / verified GET or a competing hash.
  // Router may already force with pipeline/canonical sotLen while hasPaidProSourceOfTruth()
  // is still false — must still hand that plain to PaidProVisibleDocumentShell.
  // Post-finalize hydrated signing corpus wins over a longer pre-signer SoT (blank Name/Title).
  const postFinalizePlain = isPaidProPostFinalizeHydratedCorpusLocked()
    ? resolvePaidProPostFinalizeReviewPlain().trim()
    : "";
  const authorityPlain = resolvePaidProReviewSessionAuthorityPaintPlain()?.plain.trim() || "";
  const sotPlain = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText().trim() : "";
  const pipelinePlain = readAcceptedPipelineReviewCorpusPlain().trim();
  const parentPlain = (displayContext?.acceptedCanonicalPlain || "").trim();
  const acceptedCanonicalPlain =
    postFinalizePlain.length >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN
      ? postFinalizePlain
      : [authorityPlain, sotPlain, pipelinePlain, parentPlain].reduce(
          (best, t) => (t.length > best.length ? t : best),
          "",
        );
  const shellDisplayContext: PaidProFirstReviewVisibleDisplayArgs = {
    ...(displayContext ?? {}),
    paidProActive: true,
    premiumPaidDocumentSurface: displayContext?.premiumPaidDocumentSurface ?? true,
    premiumCheckoutCompleted: displayContext?.premiumCheckoutCompleted ?? true,
    acceptedCanonicalPlain:
      acceptedCanonicalPlain.length >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN
        ? acceptedCanonicalPlain
        : displayContext?.acceptedCanonicalPlain,
  };

  const shell = (
    <PaidProVisibleDocumentShell
      html={html}
      suppressEmptyFallback={suppressEmptyFallback}
      compactDocumentTopPadding={compactDocumentTopPadding}
      visibleProPaperTrace={visibleProPaperTrace}
      authoritativeSource={authoritativeSource}
      displayContext={shellDisplayContext}
    />
  );

  if (embedded) {
    return (
      <div
        data-testid="paid-pro-document-body-forced-route"
        data-paid-pro-document-body-router="paid_pro_visible_shell_forced"
      >
        {shell}
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-[850px] px-0 sm:px-1"
      data-testid="paid-pro-document-body-forced-route"
      data-paid-pro-document-body-router="paid_pro_visible_shell_forced"
    >
      <div className="w-full max-w-[850px] rounded-sm border border-stone-200/90 bg-[#faf7f0] text-left text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_22px_48px_-8px_rgba(15,23,42,0.28)] ring-1 ring-black/[0.07]">
        <div className="px-[clamp(1.35rem,4.5vw,2.65rem)] py-3.5 sm:py-4">{shell}</div>
      </div>
    </div>
  );
}

export type { PaidProVisibleShellRenderBranch };
