import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = join(__dirname, "..", "..", "docs", "qa", "visual", "test266-paid-pro-review-ux");

type GapProbe = {
  statusToSignerWrapperPx: number;
  statusToSignerHeadingPx: number;
  statusToActionsPx: number;
  actionsToSignerWrapperPx: number;
};

test.describe("paid Pro review UX visual QA (Test266)", () => {
  test("captures status→signer spacing and inline signer hierarchy PNGs", async ({ page }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/dev/qa/paid-pro-review-ux", { waitUntil: "networkidle" });

    await expect(page.getByTestId("paid-pro-review-ux-visual-page")).toBeVisible();
    await expect(page.getByTestId("paid-pro-review-status-panel")).toBeVisible();
    await expect(page.getByTestId("paid-pro-inline-signer-setup-panel")).toBeVisible();

    const gaps = await page.evaluate((): GapProbe => {
      const status = document.querySelector('[data-testid="paid-pro-review-status-panel"]');
      const signerWrap = document.querySelector('[data-testid="paid-pro-inline-signer-setup"]');
      const signerHeading = document.querySelector('[data-testid="paid-pro-inline-signer-setup-panel"] h2');
      const actions = document.querySelector('[data-testid="simple-pro-final-review-actions"]');
      if (!status || !signerWrap || !signerHeading) {
        throw new Error("missing layout probes");
      }
      const s = status.getBoundingClientRect();
      const w = signerWrap.getBoundingClientRect();
      const h = signerHeading.getBoundingClientRect();
      const a = actions?.getBoundingClientRect();
      return {
        statusToSignerWrapperPx: Math.round(w.top - s.bottom),
        statusToSignerHeadingPx: Math.round(h.top - s.bottom),
        statusToActionsPx: a ? Math.round(a.top - s.bottom) : -1,
        actionsToSignerWrapperPx: a ? Math.round(w.top - a.bottom) : -1,
      };
    });

    writeFileSync(join(ARTIFACT_DIR, "gap-measurements.json"), `${JSON.stringify(gaps, null, 2)}\n`);

    const status = page.getByTestId("paid-pro-review-status-panel");
    const signerPanel = page.getByTestId("paid-pro-inline-signer-setup-panel");

    await status.scrollIntoViewIfNeeded();
    const statusBox = await status.boundingBox();
    const signerBox = await signerPanel.boundingBox();
    expect(statusBox).toBeTruthy();
    expect(signerBox).toBeTruthy();

    const clipY = Math.max(0, (statusBox!.y ?? 0) - 8);
    const clipH = Math.ceil((signerBox!.y ?? 0) + signerBox!.height - clipY + 12);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "01-review-status-to-signer-details-spacing.png"),
      clip: { x: 0, y: clipY, width: 1280, height: Math.min(clipH, 900 - clipY) },
    });

    await signerPanel.scrollIntoViewIfNeeded();
    const panelBox = await signerPanel.boundingBox();
    expect(panelBox).toBeTruthy();
    await page.screenshot({
      path: join(ARTIFACT_DIR, "02-signer-details-hierarchy.png"),
      fullPage: false,
      clip: {
        x: Math.max(0, (panelBox!.x ?? 0) - 24),
        y: Math.max(0, (panelBox!.y ?? 0) - 8),
        width: Math.min(1280, (panelBox!.width ?? 720) + 48),
        height: Math.min(860, (panelBox!.height ?? 520) + 16),
      },
    });

    await expect(page.getByText("Recipient setup", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Agreement parties", { exact: false })).toHaveCount(0);
    await expect(page.getByTestId("paid-pro-signer-setup-orientation-banner")).toHaveCount(0);

    expect(gaps.statusToActionsPx).toBe(-1);
    expect(gaps.statusToSignerHeadingPx).toBeGreaterThanOrEqual(24);
    expect(gaps.statusToSignerHeadingPx).toBeLessThanOrEqual(48);
  });
});
