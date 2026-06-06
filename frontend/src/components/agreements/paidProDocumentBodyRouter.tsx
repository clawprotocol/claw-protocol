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
import {
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

/** Minimum frozen SoT length to force visible document shell (inclusive). */
export const PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN = 1000;

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
  const hasSoT = hasPaidProSourceOfTruth();
  const sotLen = hasSoT ? getPaidProSourceOfTruthText().trim().length : 0;
  if (hasSoT && sotLen >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN) {
    return {
      hasSoT,
      sotLen,
      branch: "paid_pro_visible_shell_forced",
      reason: "frozen_sot_len_meets_threshold",
      forced: true,
    };
  }
  return {
    hasSoT,
    sotLen,
    branch: "legacy",
    reason: hasSoT ? "sot_below_threshold" : "no_frozen_sot",
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
};

export function PaidProDocumentBodyForcedRoute({
  router,
  html,
  suppressEmptyFallback = false,
  compactDocumentTopPadding = false,
  visibleProPaperTrace,
  authoritativeSource = "paidProSourceOfTruth",
}: ForcedRouteProps) {
  useEffect(() => {
    logPaidProDocumentBodyRouter({
      hasSoT: router.hasSoT,
      sotLen: router.sotLen,
      branch: router.branch,
      reason: router.reason,
    });
  }, [router.hasSoT, router.sotLen, router.branch, router.reason]);

  return (
    <div
      className="mx-auto w-full max-w-[850px] px-0 sm:px-1"
      data-testid="paid-pro-document-body-forced-route"
      data-paid-pro-document-body-router="paid_pro_visible_shell_forced"
    >
      <div className="w-full max-w-[850px] rounded-sm border border-stone-200/90 bg-[#faf7f0] text-left text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_22px_48px_-8px_rgba(15,23,42,0.28)] ring-1 ring-black/[0.07]">
        <div className="px-[clamp(1.35rem,4.5vw,2.65rem)] py-3.5 sm:py-4">
          <PaidProVisibleDocumentShell
            html={html}
            suppressEmptyFallback={suppressEmptyFallback}
            compactDocumentTopPadding={compactDocumentTopPadding}
            visibleProPaperTrace={visibleProPaperTrace}
            authoritativeSource={authoritativeSource}
          />
        </div>
      </div>
    </div>
  );
}

export type { PaidProVisibleShellRenderBranch };
