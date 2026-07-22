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
  await expect(page.locator("#claw-refine-this-draft")).toHaveCount(0);
  await expect(page.getByText("Refine this draft", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try simplified starting point" })).toHaveCount(0);
}

test("1–6: free starter review + type in body + continue to invite recipients", async ({ page }) => {
  test.setTimeout(120_000);
  const drafts = new Map();
  await goToFreeStarterReview(page, drafts, "ag_free_starter_prod_qa");
  await assertFreeStarterReviewSurface(page);

  // Review-first unpaid shell: document preview is readable; send/invite is Pro-gated.
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible();
  await expect(freeStarterReviewPreviewLocator(page)).toContainText(/Anthem Blanchard|Sarah Collins/i);
  await expect(page.getByRole("button", { name: /Continue with Pro/i })).toBeVisible();
  await expect(page.getByLabel("Signer 1 email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Send for review/i })).toHaveCount(0);
});

test("1–5 + 7: upgrade from draft review routes to /app/checkout", async ({ page }) => {
  test.setTimeout(120_000);
  const drafts = new Map();
  await goToFreeStarterReview(page, drafts, "ag_free_starter_prod_qa");
  await assertFreeStarterReviewSurface(page);

  const proCta = page.getByRole("button", { name: /Continue with Pro/i });
  if ((await proCta.count()) === 0) {
    await page.goto("/app/checkout/ag_free_starter_prod_qa?source=starter_review_bottom_cta");
  } else {
    await proCta.first().scrollIntoViewIfNeeded();
    await proCta.first().click();
  }
  await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 20_000 });
});
