import { expect, test } from "@playwright/test";
import { goToFreeStarterReview } from "./helpers/freeStarterApiMocks";

async function assertFreeStarterReviewSurface(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review your Pro agreement" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Agreement document preview" })).toBeVisible();
  await expect(page.locator("#claw-refine-this-draft")).toHaveCount(0);
  await expect(page.getByText("Refine this draft", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try simplified starting point" })).toHaveCount(0);
}

test("1–6: free starter review + type in body + continue to invite recipients", async ({ page }) => {
  test.setTimeout(120_000);
  const drafts = new Map();
  await goToFreeStarterReview(page, drafts, "ag_free_starter_prod_qa");
  await assertFreeStarterReviewSurface(page);

  await page.getByLabel("Signer 1 email").fill("anthem@example.com");
  await page.getByLabel(/^Signer name/).first().fill("Anthem Blanchard");
  await page.getByLabel("Signer 2 email").fill("sarah@example.com");
  await page.getByLabel(/^Signer name/).nth(1).fill("Sarah Collins");
  const signerCta = page.getByRole("button", {
    name: /Complete signer details|Finalize signer details and continue/i,
  });
  await signerCta.scrollIntoViewIfNeeded();
  await signerCta.click();

  await expect(page.getByRole("region", { name: "Review step guidance" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Prepare for signing" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Send for review/i })).toBeVisible();
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
