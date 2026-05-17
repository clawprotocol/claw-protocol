import { test, expect } from "@playwright/test";

const PREPARE_LAYOUT_CSS = `
.vs01-sign-workspace--prepare {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 22rem);
  gap: 1rem 1.25rem;
  align-items: start;
  width: 100%;
  max-width: 100%;
}
.vs01-sign-workspace--prepare .vs01-sign-rail {
  position: sticky;
  top: 0.5rem;
  align-self: start;
}
@media (min-width: 1024px) and (max-width: 1440px) {
  .vs01-sign-workspace--prepare {
    grid-template-columns: minmax(0, 1fr) minmax(260px, 20rem);
  }
}
`;

test.describe("VS01 prepare placement layout", () => {
  for (const viewport of [
    { width: 1440, height: 900, label: "1440x900" },
    { width: 1280, height: 800, label: "1280x800" },
  ]) {
    test(`prepare workspace grid aligns at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(
        `<!DOCTYPE html><html><head><style>${PREPARE_LAYOUT_CSS}</style></head><body>
  <div class="vs01-sign-workspace vs01-sign-workspace--prepare">
    <div class="vs01-sign-doc-col"><div style="height:480px;background:#1e293b">Document preview</div></div>
    <aside class="vs01-sign-rail"><p>Place fields for</p><button type="button">Owner</button></aside>
  </div>
</body></html>`,
        { waitUntil: "domcontentloaded" },
      );

      const workspace = page.locator(".vs01-sign-workspace--prepare");
      await expect(workspace).toBeVisible();
      const gridCols = await workspace.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
      expect(gridCols).toMatch(/px/);
      const railPosition = await page.locator(".vs01-sign-rail").evaluate((el) => getComputedStyle(el).position);
      expect(railPosition).toBe("sticky");
      const docBox = await page.locator(".vs01-sign-doc-col").boundingBox();
      const railBox = await page.locator(".vs01-sign-rail").boundingBox();
      expect(docBox).toBeTruthy();
      expect(railBox).toBeTruthy();
      if (docBox && railBox && viewport.width >= 1024) {
        expect(railBox.x).toBeGreaterThanOrEqual(docBox.x + docBox.width * 0.45);
      }
    });
  }
});
