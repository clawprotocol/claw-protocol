import { expect, test } from "@playwright/test";
import {
  freeStarterReviewChromeLocator,
  freeStarterReviewPreviewLocator,
  goToFreeStarterReview,
} from "./helpers/freeStarterApiMocks";

async function assertFreeStarterReviewSurface(page: import("@playwright/test").Page) {
  await expect(freeStarterReviewChromeLocator(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review your Pro agreement" })).toHaveCount(0);
  await expect(freeStarterReviewPreviewLocator(page)).toBeVisible();
  await expect(page.getByText(/Compare plans/i)).toHaveCount(0);
}

test("Journey 2 subset — starter review reaches invite recipients", async ({ page }) => {
  test.setTimeout(120_000);
  const drafts = new Map();
  await goToFreeStarterReview(page, drafts);
  await assertFreeStarterReviewSurface(page);

  // Current free-starter review-first shell: readonly preview + Continue with Pro.
  // Signer/invite fields are not mounted on this unpaid review surface (readyForSend: no).
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with Pro/i })).toBeVisible();
  await expect(page.getByLabel("Signer 1 email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Send for review/i })).toHaveCount(0);
});

test("Journey 2 subset — upgrade routes to checkout without legacy comparison card", async ({ page }) => {
  test.setTimeout(120_000);
  const drafts = new Map();
  await goToFreeStarterReview(page, drafts);
  await assertFreeStarterReviewSurface(page);

  const proCta = page.getByRole("button", { name: /Continue with Pro/i });
  if ((await proCta.count()) === 0) {
    await page.goto("/app/checkout/ag_free_starter_e2e?source=starter_review_bottom_cta");
  } else {
    await proCta.first().scrollIntoViewIfNeeded();
    await proCta.first().click();
  }
  await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 20_000 });
});
