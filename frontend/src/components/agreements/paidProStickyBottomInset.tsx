import { useCallback, useLayoutEffect, useState } from "react";

/** Whitespace below execution block before sticky CTA (human QA). */
export const PAID_PRO_EXECUTION_BLOCK_MIN_WHITESPACE_PX = 40;

/** Buffer between scrollable content end and sticky CTA top edge. */
export const PAID_PRO_STICKY_CTA_BUFFER_PX = 48;

export function readSafeAreaInsetBottomPx(): number {
  if (typeof window === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;bottom:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);";
  document.body.appendChild(probe);
  const inset = Math.max(0, probe.getBoundingClientRect().height);
  probe.remove();
  return inset;
}

export function measurePaidProStickyCtaHeightPx(barEl: HTMLElement | null): number {
  if (!barEl) return 0;
  return Math.ceil(barEl.getBoundingClientRect().height);
}

/** Scroll padding = CTA height + safe-area inset + buffer (no extra safe-area in CSS). */
export function computePaidProReviewScrollPaddingPx(args: {
  ctaHeightPx: number;
  safeAreaInsetBottomPx?: number;
}): number {
  const safe = args.safeAreaInsetBottomPx ?? readSafeAreaInsetBottomPx();
  return Math.max(0, args.ctaHeightPx + safe + PAID_PRO_STICKY_CTA_BUFFER_PX);
}

export function measureStickyBottomInsetPx(barEl: HTMLElement | null): number {
  return computePaidProReviewScrollPaddingPx({
    ctaHeightPx: measurePaidProStickyCtaHeightPx(barEl),
  });
}

export type PaidProExecutionBlockClearanceAudit = {
  pass: boolean;
  whitespaceBelowExecutionPx: number;
  executionBottomPx: number;
  stickyCtaTopPx: number;
  requiredWhitespacePx: number;
};

/**
 * Human QA: at max scroll, execution block bottom must sit at least `minWhitespacePx`
 * above the sticky CTA top edge (viewport coordinates).
 */
export function auditPaidProExecutionBlockClearance(args: {
  executionBlockEl: Pick<Element, "getBoundingClientRect">;
  stickyCtaEl: Pick<Element, "getBoundingClientRect">;
  minWhitespacePx?: number;
}): PaidProExecutionBlockClearanceAudit {
  const required = args.minWhitespacePx ?? PAID_PRO_EXECUTION_BLOCK_MIN_WHITESPACE_PX;
  const executionBottomPx = args.executionBlockEl.getBoundingClientRect().bottom;
  const stickyCtaTopPx = args.stickyCtaEl.getBoundingClientRect().top;
  const whitespaceBelowExecutionPx = stickyCtaTopPx - executionBottomPx;
  return {
    pass: whitespaceBelowExecutionPx >= required,
    whitespaceBelowExecutionPx,
    executionBottomPx,
    stickyCtaTopPx,
    requiredWhitespacePx: required,
  };
}

export type PaidProReviewStickyScrollSpacerProps = {
  heightPx: number;
  className?: string;
};

/** Visible scroll tail after the agreement execution block when sticky CTA is active. */
export function PaidProReviewStickyScrollSpacer({ heightPx, className }: PaidProReviewStickyScrollSpacerProps) {
  if (heightPx <= 0) return null;
  return (
    <div
      aria-hidden
      data-testid="paid-pro-review-bottom-spacer"
      className={className ?? "pointer-events-none shrink-0"}
      style={{ height: `${heightPx}px`, minHeight: `${heightPx}px` }}
    />
  );
}

/** Dynamic scroll padding under the agreement when a bottom sticky CTA is visible. */
export function usePaidProStickyBottomInset(active: boolean): [number, (el: HTMLElement | null) => void] {
  const [insetPx, setInsetPx] = useState(0);
  const [barEl, setBarEl] = useState<HTMLElement | null>(null);

  const attachStickyBar = useCallback((el: HTMLElement | null) => {
    setBarEl(el);
  }, []);

  useLayoutEffect(() => {
    if (!active || !barEl) {
      setInsetPx(0);
      return;
    }

    let rafId = 0;
    const update = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        setInsetPx(measureStickyBottomInsetPx(barEl));
      });
    };
    update();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(barEl);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [active, barEl]);

  return [insetPx, attachStickyBar];
}
