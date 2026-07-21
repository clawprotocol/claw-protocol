import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { PaidProJ5ReviewDecisionDiagnosticSnapshot } from "../../src/components/agreements/paidProJ5ReviewDecisionDiagnostics";

export const J5_REVIEW_DECISION_DIAG_SESSION_KEY = "lawdog_j5_review_decision_diag_v1";

export async function enableJ5ReviewDecisionDiagnostics(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, J5_REVIEW_DECISION_DIAG_SESSION_KEY);
}

async function probeDomState(page: Page) {
  return page.evaluate(() => {
    const visible = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return { present: false, visible: false };
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const shown =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0;
      return { present: true, visible: shown };
    };
    const byTestId = (id: string) => visible(`[data-testid="${id}"]`);
    const chrome = byTestId("paid-pro-forced-first-review-chrome");
    const prepare = byTestId("paid-pro-forced-prepare-signatures");
    const simplePrepare = byTestId("simple-pro-send-for-signature");
    const signer = byTestId("paid-pro-inline-signer-setup");
    const body = document.body?.textContent ?? "";
    return {
      paidProReviewRoot: Boolean(document.querySelector("#premium-pro-review-scroll-anchor")),
      forcedFirstReviewChrome: chrome.present,
      forcedFirstReviewChromeVisible: chrome.visible,
      simpleFinalReviewActions: Boolean(document.querySelector('[data-testid="simple-pro-send-for-review"]')),
      prepareSignaturesControl: prepare.present || simplePrepare.present,
      prepareSignaturesVisible: prepare.visible || simplePrepare.visible,
      signerSetupShell: signer.present,
      signerSetupVisible: signer.visible,
      legacyChooser: Boolean(document.querySelector('[data-testid="premium-send-next-step-fork"]')),
      loadingIndicator: /Preparing your Pro agreement|finalizing your Pro agreement/i.test(body),
      errorBoundary: Boolean(document.querySelector('[data-testid="paid-pro-review-error-boundary"]')),
      blockingOverlay: Boolean(document.querySelector('[data-claw-blocking-overlay="true"]')),
    };
  });
}

export async function captureJ5ReviewDecisionDiagnostics(
  page: Page,
  opts?: { screenshotPath?: string; jsonPath?: string },
): Promise<PaidProJ5ReviewDecisionDiagnosticSnapshot | null> {
  const fromWindow = await page.evaluate(() => {
    const w = window as Window & {
      __LAWDOG_J5_REVIEW_DECISION_DIAG__?: PaidProJ5ReviewDecisionDiagnosticSnapshot;
    };
    return w.__LAWDOG_J5_REVIEW_DECISION_DIAG__ ?? null;
  });
  const domState = await probeDomState(page);
  const merged = fromWindow
    ? { ...fromWindow, domState: { ...fromWindow.domState, ...domState } }
    : null;

  const outDir = join(process.cwd(), "test-results", "j5-diagnostics");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = opts?.jsonPath ?? join(outDir, `j5-review-decision-${Date.now()}.json`);
  const screenshotPath = opts?.screenshotPath ?? join(outDir, `j5-review-decision-${Date.now()}.png`);

  if (merged) {
    writeFileSync(jsonPath, JSON.stringify(merged, null, 2));
  }
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return merged;
}
