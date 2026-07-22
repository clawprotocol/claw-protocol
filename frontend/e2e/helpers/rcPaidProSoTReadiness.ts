/**
 * Authoritative paid-Pro SoT readiness for RC journeys.
 * Source of truth = persisted accepted snapshot + live review-authority surface.
 * Never treat heading / overlay / DOM textContent as the readiness SoT signal.
 */
import { expect, type Page } from "@playwright/test";
import { hashPaidProCorpus } from "../../src/components/agreements/paidProSourceOfTruth";

export type PaidProHydrateStatus = "not_started" | "pending" | "completed" | "errored";

export type PaidProSoTReadinessDiag = {
  elapsedMs: number;
  url: string;
  reviewHeadingVisible: boolean;
  sotExists: boolean;
  sotLen: number;
  sotHash: string | null;
  sotHashVerifies: boolean;
  /** Live review-authority corpus (in-memory SoT exposed on the visible shell). */
  renderedLen: number;
  renderedHash: string | null;
  renderedMatchesSot: boolean;
  /** Presentation paint plain (may differ via ADR-020 display projection) — diagnostic only. */
  paintPlainLen: number;
  paintPlainHash: string | null;
  /** DOM textContent length/hash — diagnostic only; never readiness. */
  domPaperLen: number;
  domPaperHash: string | null;
  hydrateStatus: PaidProHydrateStatus;
  hydrateError: string | null;
  agreementGenerationId: string | null;
  reviewSessionId: string | null;
  idsMatch: boolean | null;
  premiumAccepted: boolean;
  seedFlag: boolean;
  grantPresent: boolean;
  resumePresent: boolean;
  overwriteLatch: boolean | null;
  renderBranch: string | null;
  winningLen: number;
  lastAuthoritativeState: string;
};

type SnapAuthority = {
  premiumAccepted: boolean;
  sotText: string;
  sotHash: string;
  winningLen: number;
  winningHash: string | null;
  agreementGenerationId: string | null;
  reviewSessionId: string | null;
};

async function readSnapAuthority(page: Page): Promise<SnapAuthority> {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
      if (!raw) {
        return {
          premiumAccepted: false,
          sotText: "",
          sotHash: "",
          winningLen: 0,
          winningHash: null,
          agreementGenerationId: null,
          reviewSessionId: null,
        };
      }
      const snap = JSON.parse(raw) as {
        premiumAccepted?: boolean;
        paidProSourceOfTruthText?: string;
        acceptedPremiumCanonicalText?: string;
        paidProSourceOfTruthHash?: string;
        acceptedPremiumCanonicalHash?: string;
        premiumWinningBodyText?: string;
        premiumReadonlyPlainText?: string;
        agreementGenerationId?: string;
        paidProPostAcceptanceOverwriteBlocked?: boolean;
      };
      const sotText = (
        snap.paidProSourceOfTruthText ||
        snap.acceptedPremiumCanonicalText ||
        ""
      ).trim();
      const sotHash = (
        snap.paidProSourceOfTruthHash ||
        snap.acceptedPremiumCanonicalHash ||
        ""
      ).trim();
      const winning = (
        snap.premiumWinningBodyText ||
        snap.premiumReadonlyPlainText ||
        ""
      ).trim();
      return {
        premiumAccepted: Boolean(snap.premiumAccepted),
        sotText,
        sotHash,
        winningLen: winning.length,
        winningHash: null,
        agreementGenerationId: (snap.agreementGenerationId || "").trim() || null,
        reviewSessionId: (snap.agreementGenerationId || "").trim() || null,
      };
    } catch {
      return {
        premiumAccepted: false,
        sotText: "",
        sotHash: "",
        winningLen: 0,
        winningHash: null,
        agreementGenerationId: null,
        reviewSessionId: null,
      };
    }
  });
}

async function readShellAuthority(page: Page): Promise<{
  authorityLen: number;
  authorityHash: string | null;
  paintPlainLen: number;
  paintPlainHash: string | null;
  renderBranch: string | null;
  articleCorpusLen: number;
  articleCorpusHash: string | null;
  domPaperLen: number;
}> {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    const article =
      document.querySelector('[data-testid="premium-agreement-readonly-article"]') ||
      document.querySelector('[aria-label="Agreement document preview"]') ||
      document.querySelector('[aria-label="Agreement document"]');
    // Prefer live SoT markers on <html> (set by replacePaidProSourceOfTruth) — shell may lag.
    const liveHash = (document.documentElement.getAttribute("data-claw-live-sot-hash") || "").trim();
    const liveLen =
      Number.parseInt(document.documentElement.getAttribute("data-claw-live-sot-len") || "0", 10) || 0;
    const shellLen = Number.parseInt(shell?.getAttribute("data-claw-review-authority-len") || "0", 10) || 0;
    const shellHash = (shell?.getAttribute("data-claw-review-authority-hash") || "").trim() || null;
    const authorityLen = liveLen > 0 ? liveLen : shellLen;
    const authorityHash = liveHash || shellHash;
    const paintPlainLen = Number.parseInt(shell?.getAttribute("data-claw-paint-plain-len") || "0", 10) || 0;
    const paintPlainHash = (shell?.getAttribute("data-claw-paint-plain-hash") || "").trim() || null;
    const renderBranch = (shell?.getAttribute("data-paid-pro-render-branch") || "").trim() || null;
    const articleCorpusLen =
      Number.parseInt(article?.getAttribute("data-claw-review-corpus-len") || "0", 10) || 0;
    const articleCorpusHash = (article?.getAttribute("data-claw-review-corpus-hash") || "").trim() || null;
    const domPaperLen = (article?.textContent || "").trim().length;
    return {
      authorityLen,
      authorityHash,
      paintPlainLen,
      paintPlainHash,
      renderBranch,
      articleCorpusLen,
      articleCorpusHash,
      domPaperLen,
    };
  });
}

async function readSessionMeta(page: Page): Promise<{
  generationId: string | null;
  seedFlag: boolean;
  grantPresent: boolean;
  resumePresent: boolean;
  retryVisible: boolean;
  overwriteLatch: boolean | null;
}> {
  return page.evaluate(() => {
    const retry =
      /Retry Pro draft/i.test(document.body?.textContent ?? "") ||
      Boolean(document.querySelector('[data-testid="pro-full-draft-quality-retry"]'));
    let overwriteLatch: boolean | null = null;
    try {
      const raw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
      if (raw) {
        const snap = JSON.parse(raw) as { paidProPostAcceptanceOverwriteBlocked?: boolean };
        if (typeof snap.paidProPostAcceptanceOverwriteBlocked === "boolean") {
          overwriteLatch = snap.paidProPostAcceptanceOverwriteBlocked;
        }
      }
    } catch {
      /* ignore */
    }
    return {
      generationId: sessionStorage.getItem("claw_active_agreement_generation_id_v1"),
      seedFlag: sessionStorage.getItem("claw_rc_checkout_return_seeded_v1") === "1",
      grantPresent: Boolean(sessionStorage.getItem("claw_advanced_full_draft_checkout_ok_v1")),
      resumePresent: Boolean(sessionStorage.getItem("claw_create_complexity_resume_v1")),
      retryVisible: retry,
      overwriteLatch,
    };
  });
}

export async function collectPaidProSoTReadinessDiag(
  page: Page,
  startedAtMs: number,
  opts?: { hydrateError?: string | null },
): Promise<PaidProSoTReadinessDiag> {
  const snap = await readSnapAuthority(page);
  const meta = await readSessionMeta(page);
  const shell = await readShellAuthority(page);
  const headingVisible = await page
    .locator("#premium-pro-review-scroll-anchor")
    .or(page.getByRole("heading", { name: /Review your Pro agreement/i }).first())
    .isVisible()
    .catch(() => false);

  const sotHashVerifies =
    Boolean(snap.sotHash) &&
    snap.sotText.length > 8_000 &&
    hashPaidProCorpus(snap.sotText) === snap.sotHash;

  // Authoritative "rendered review corpus" = live SoT on the visible shell (not DOM paper).
  const renderedLen = shell.authorityLen;
  const renderedHash = shell.authorityHash;
  const renderedMatchesSot =
    sotHashVerifies &&
    Boolean(renderedHash) &&
    renderedHash === snap.sotHash &&
    renderedLen === snap.sotText.length;

  let hydrateStatus: PaidProHydrateStatus = "not_started";
  let hydrateError = opts?.hydrateError ?? null;
  if (meta.retryVisible) {
    hydrateStatus = "errored";
    hydrateError = hydrateError || "retry_pro_draft_visible";
  } else if (!snap.premiumAccepted && !snap.sotHash) {
    hydrateStatus = snap.winningLen > 0 ? "pending" : "not_started";
  } else if (snap.sotHash && !sotHashVerifies) {
    hydrateStatus = "errored";
    hydrateError = hydrateError || "sot_hash_mismatch";
  } else if (sotHashVerifies && renderedMatchesSot) {
    // Hydrate complete = persisted SoT verified and rematerialized into the live
    // in-memory SoT (html markers / shell authority attrs). Paint/DOM/branch are
    // diagnostic only and must not gate authority readiness.
    hydrateStatus = "completed";
  } else if (sotHashVerifies) {
    hydrateStatus = "pending";
  }

  const generationId = meta.generationId || snap.agreementGenerationId;
  const reviewSessionId = snap.reviewSessionId || generationId;
  const idsMatch =
    generationId && reviewSessionId ? generationId === reviewSessionId : null;

  const lastAuthoritativeState = [
    `accepted=${snap.premiumAccepted}`,
    `sotHash=${snap.sotHash || "null"}`,
    `sotLen=${snap.sotText.length}`,
    `verify=${sotHashVerifies}`,
    `authLen=${renderedLen}`,
    `authHash=${renderedHash || "null"}`,
    `paintLen=${shell.paintPlainLen}`,
    `domLen=${shell.domPaperLen}`,
    `branch=${shell.renderBranch || "null"}`,
    `winningLen=${snap.winningLen}`,
    `hydrate=${hydrateStatus}`,
  ].join(";");

  return {
    elapsedMs: Date.now() - startedAtMs,
    url: page.url(),
    reviewHeadingVisible: headingVisible,
    sotExists: snap.sotText.length > 8_000 && Boolean(snap.sotHash),
    sotLen: snap.sotText.length,
    sotHash: snap.sotHash || null,
    sotHashVerifies,
    renderedLen,
    renderedHash,
    renderedMatchesSot,
    paintPlainLen: shell.paintPlainLen,
    paintPlainHash: shell.paintPlainHash,
    domPaperLen: shell.domPaperLen,
    domPaperHash: null,
    hydrateStatus,
    hydrateError,
    agreementGenerationId: generationId,
    reviewSessionId,
    idsMatch,
    premiumAccepted: snap.premiumAccepted,
    seedFlag: meta.seedFlag,
    grantPresent: meta.grantPresent,
    resumePresent: meta.resumePresent,
    overwriteLatch: meta.overwriteLatch,
    renderBranch: shell.renderBranch,
    winningLen: snap.winningLen,
    lastAuthoritativeState,
  };
}

/**
 * Wait until persisted accepted SoT exists, hash-verifies, hydration rematerialized
 * the live review-authority surface to that SoT (exact len+hash), and hydrate completed.
 * Heading is not the readiness signal (checked separately by callers).
 */
export async function waitForAcceptedPaidProSoTReady(
  page: Page,
  opts?: { timeoutMs?: number },
): Promise<{ hash: string; len: number; diag: PaidProSoTReadinessDiag }> {
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const startedAt = Date.now();
  let lastDiag = await collectPaidProSoTReadinessDiag(page, startedAt);

  try {
    await expect
      .poll(
        async () => {
          lastDiag = await collectPaidProSoTReadinessDiag(page, startedAt);
          return (
            lastDiag.sotExists &&
            lastDiag.sotHashVerifies &&
            lastDiag.hydrateStatus === "completed" &&
            lastDiag.renderedMatchesSot
          );
        },
        { timeout: timeoutMs, intervals: [200, 400, 800, 1_000] },
      )
      .toBe(true);
  } catch (err) {
    lastDiag = await collectPaidProSoTReadinessDiag(page, startedAt);
    // eslint-disable-next-line no-console
    console.error("[rc-paid-pro-sot-readiness] TIMEOUT_DIAG", JSON.stringify(lastDiag));
    throw err;
  }

  const hash = lastDiag.sotHash!;
  return { hash, len: lastDiag.sotLen, diag: lastDiag };
}
