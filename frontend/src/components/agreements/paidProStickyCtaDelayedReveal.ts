import { useCallback, useEffect, useMemo, useState } from "react";

/** Reveal after this many pixels scrolled into the review region. */
export const PAID_PRO_STICKY_REVEAL_SCROLL_PX = 160;

/** Reveal after this fraction of review scroll span (use earlier of px vs ratio). */
export const PAID_PRO_STICKY_REVEAL_SCROLL_RATIO = 0.15;

export const PAID_PRO_STICKY_REVEAL_MOBILE_MAX_WIDTH_PX = 639;

export type PaidProStickyCtaDelayedRevealForceArgs = {
  signerSetupPanelActive: boolean;
  signerFieldsActive: boolean;
  signerDetailsComplete: boolean;
  stickyPhase:
    | "signer_details_required"
    | "signer_details_complete"
    | "review_decision"
    | "prepare_signing"
    | "send_ready"
    | null
    | undefined;
  signaturePreparationRequested: boolean;
  recoveryOrRetryActive: boolean;
  isMobileViewport: boolean;
};

export function resolvePaidProStickyScrollThresholdPx(reviewScrollSpanPx: number): number {
  const span = Math.max(0, Math.floor(reviewScrollSpanPx));
  const ratioThreshold = Math.floor(span * PAID_PRO_STICKY_REVEAL_SCROLL_RATIO);
  if (span <= 0) return PAID_PRO_STICKY_REVEAL_SCROLL_PX;
  return Math.min(PAID_PRO_STICKY_REVEAL_SCROLL_PX, Math.max(1, ratioThreshold));
}

export function paidProStickyScrollMeetsRevealThreshold(args: {
  scrolledPx: number;
  reviewScrollSpanPx: number;
}): boolean {
  const threshold = resolvePaidProStickyScrollThresholdPx(args.reviewScrollSpanPx);
  return args.scrolledPx >= threshold;
}

/** Immediate visibility — urgent signer / send / recovery / mobile clarity. */
export function resolvePaidProStickyCtaRevealImmediately(
  args: PaidProStickyCtaDelayedRevealForceArgs,
): boolean {
  if (args.recoveryOrRetryActive) return true;
  if (args.isMobileViewport) return true;
  if (args.signerSetupPanelActive || args.signerFieldsActive) return true;
  if (args.signerDetailsComplete) return true;
  if (args.signaturePreparationRequested) return true;
  if (args.stickyPhase === "signer_details_complete") return true;
  if (args.stickyPhase === "review_decision") return true;
  if (args.stickyPhase === "prepare_signing" || args.stickyPhase === "send_ready") return true;
  return false;
}

export type PaidProReviewScrollProgress = {
  scrolledPx: number;
  reviewScrollSpanPx: number;
  thresholdPx: number;
};

function readElementScrollProgress(el: HTMLElement): PaidProReviewScrollProgress {
  const scrollSpan = Math.max(0, el.scrollHeight - el.clientHeight);
  const scrolledPx = Math.max(0, el.scrollTop);
  return {
    scrolledPx,
    reviewScrollSpanPx: scrollSpan > 0 ? scrollSpan : el.clientHeight,
    thresholdPx: resolvePaidProStickyScrollThresholdPx(scrollSpan > 0 ? scrollSpan : el.clientHeight),
  };
}

function readWindowReviewScrollProgress(reviewRoot: HTMLElement | null): PaidProReviewScrollProgress {
  if (typeof window === "undefined") {
    return { scrolledPx: 0, reviewScrollSpanPx: 0, thresholdPx: PAID_PRO_STICKY_REVEAL_SCROLL_PX };
  }
  const root =
    reviewRoot ??
    document.getElementById("simple-pro-final-review-screen") ??
    document.getElementById("claw-simple-create-preview");
  if (!root) {
    return {
      scrolledPx: Math.max(0, window.scrollY),
      reviewScrollSpanPx: Math.max(document.documentElement.scrollHeight - window.innerHeight, window.innerHeight),
      thresholdPx: PAID_PRO_STICKY_REVEAL_SCROLL_PX,
    };
  }
  const rect = root.getBoundingClientRect();
  const rootTop = window.scrollY + rect.top;
  const scrolledPx = Math.max(0, window.scrollY - rootTop + 48);
  const reviewScrollSpanPx = Math.max(root.scrollHeight, rect.height, window.innerHeight);
  return {
    scrolledPx,
    reviewScrollSpanPx,
    thresholdPx: resolvePaidProStickyScrollThresholdPx(reviewScrollSpanPx),
  };
}

function findReviewScrollContainers(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  const ids = ["claw-simple-create-preview", "simple-pro-final-review-screen"];
  const roots = ids
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => Boolean(el));
  const overflowRoots = roots.filter((el) => {
    const oy = getComputedStyle(el).overflowY;
    return oy === "auto" || oy === "scroll";
  });
  return overflowRoots.length > 0 ? overflowRoots : roots;
}

export function measurePaidProReviewScrollProgress(): PaidProReviewScrollProgress {
  const containers = findReviewScrollContainers();
  const overflow = containers.find((el) => el.scrollHeight > el.clientHeight + 4);
  if (overflow) return readElementScrollProgress(overflow);
  return readWindowReviewScrollProgress(containers[0] ?? null);
}

let paidProStickyCtaRevealedThisSession = false;

export function paidProStickyCtaDelayedRevealSessionActive(): boolean {
  return paidProStickyCtaRevealedThisSession;
}

export function markPaidProStickyCtaDelayedRevealSession(): void {
  paidProStickyCtaRevealedThisSession = true;
}

/** Test-only: reset session latch between cases. */
export function resetPaidProStickyCtaDelayedRevealSessionForTests(): void {
  paidProStickyCtaRevealedThisSession = false;
}

export function resolvePaidProStickyCtaVisuallyRevealed(args: {
  sessionRevealed: boolean;
  scrollRevealed: boolean;
  forceImmediate: boolean;
}): boolean {
  if (args.forceImmediate) return true;
  if (args.sessionRevealed) return true;
  return args.scrollRevealed;
}

export type UsePaidProStickyCtaDelayedRevealArgs = {
  enabled: boolean;
  forceImmediate: boolean;
};

export function usePaidProStickyCtaDelayedReveal(args: UsePaidProStickyCtaDelayedRevealArgs): {
  visuallyRevealed: boolean;
  scrollRevealed: boolean;
} {
  const [scrollRevealed, setScrollRevealed] = useState(
    () => paidProStickyCtaRevealedThisSession || args.forceImmediate,
  );
  const [sessionRevealed, setSessionRevealed] = useState(
    () => paidProStickyCtaRevealedThisSession || args.forceImmediate,
  );

  const evaluateScroll = useCallback(() => {
    if (!args.enabled || args.forceImmediate) return;
    if (paidProStickyCtaRevealedThisSession) return;
    const progress = measurePaidProReviewScrollProgress();
    if (paidProStickyScrollMeetsRevealThreshold(progress)) {
      paidProStickyCtaRevealedThisSession = true;
      setScrollRevealed(true);
      setSessionRevealed(true);
    }
  }, [args.enabled, args.forceImmediate]);

  useEffect(() => {
    if (!args.enabled) return;
    if (args.forceImmediate) {
      paidProStickyCtaRevealedThisSession = true;
      setScrollRevealed(true);
      setSessionRevealed(true);
      return;
    }
    if (paidProStickyCtaRevealedThisSession) {
      setScrollRevealed(true);
      setSessionRevealed(true);
      return;
    }
    evaluateScroll();
    const onScroll = () => evaluateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const containers = findReviewScrollContainers();
    containers.forEach((el) => el.addEventListener("scroll", onScroll, { passive: true }));
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => evaluateScroll())
        : null;
    containers.forEach((el) => ro?.observe(el));
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      containers.forEach((el) => el.removeEventListener("scroll", onScroll));
      ro?.disconnect();
      window.removeEventListener("resize", onScroll);
    };
  }, [args.enabled, args.forceImmediate, evaluateScroll]);

  const visuallyRevealed = useMemo(
    () =>
      resolvePaidProStickyCtaVisuallyRevealed({
        sessionRevealed: sessionRevealed || paidProStickyCtaRevealedThisSession,
        scrollRevealed,
        forceImmediate: args.forceImmediate,
      }),
    [sessionRevealed, scrollRevealed, args.forceImmediate],
  );

  return { visuallyRevealed, scrollRevealed: scrollRevealed || paidProStickyCtaRevealedThisSession };
}

export function isPaidProStickyRevealMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${PAID_PRO_STICKY_REVEAL_MOBILE_MAX_WIDTH_PX}px)`).matches;
}
