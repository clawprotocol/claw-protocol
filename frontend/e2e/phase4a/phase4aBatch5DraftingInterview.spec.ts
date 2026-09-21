import { expect, test } from "@playwright/test";
import {
  PHASE4A_FEE,
  PHASE4A_FROZEN_BODY,
  PHASE4A_FROZEN_SHA,
  PHASE4A_IDS,
  PHASE4A_LAW,
  PHASE4A_PARTY_0,
  PHASE4A_PARTY_1,
  seedPhase4aPaidOwner,
} from "./phase4aPaidOwnerFixtures";

const SPARSE = "need a SaaS agreement for about 100k";
const FILLED =
  "Draft a SaaS subscription agreement between Orion Labs LLC and Contoso Retail Inc. Annual fee about 100k. Governing law New York.";

test.describe("Phase 4A Batch 5 drafting interview", () => {
  test("sparse SaaS facts become one verified commercial review under a durable id", async ({ page }) => {
    await seedPhase4aPaidOwner(page);
    await page.goto("/app/create", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();

    const intake = page.getByRole("textbox").first();
    await expect(intake).toBeVisible();
    await intake.fill(SPARSE);
    await page.getByRole("button", { name: /Create agreement|Create draft|Review/i }).first().click();

    const clarification = page.getByTestId("agreement-intake-clarification");
    await expect(clarification).toBeVisible();
    await expect(clarification).toContainText(/Name the parties|legal names|SaaS/i);
    await expect(page.getByRole("button", { name: /^(Send|Sign|Freeze)$/i })).toHaveCount(0);

    const suggested = clarification.getByRole("button").first();
    if (await suggested.isVisible()) {
      await suggested.click();
    }
    await intake.fill(FILLED);
    await page.getByRole("button", { name: /Create agreement|Create draft|Review|Next/i }).first().click();

    await expect(page.getByText(/LawDog couldn.t create the agreement/i)).toHaveCount(0);
    await expect(page.getByTestId("agreement-intake-clarification")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator("h1").first()).toHaveText(/Review your agreement draft/i);
    await expect(page.getByText("SAAS SUBSCRIPTION AGREEMENT").first()).toBeVisible();
    await expect(page.getByText(PHASE4A_PARTY_0).first()).toBeVisible();
    await expect(page.getByText(PHASE4A_PARTY_1).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`${PHASE4A_FEE}|100k|100,000`, "i")).first()).toBeVisible();
    await expect(page.getByText(new RegExp(PHASE4A_LAW, "i")).first()).toBeVisible();
    await expect(page.getByText(/Free Starter|five tenets|starter question/i)).toHaveCount(0);

    const durableId = await page.evaluate((fallback) => {
      const href = window.location.href;
      const fromQuery = new URL(href).searchParams.get("agreementId");
      if (fromQuery) return fromQuery;
      const raw = localStorage.getItem("claw_current_agreement_id") || sessionStorage.getItem("claw_current_agreement_id");
      return raw || fallback;
    }, PHASE4A_IDS.batch5);
    expect(durableId.length).toBeGreaterThan(4);

    const frozenOnReview = await page.evaluate(() => document.body.innerText);
    expect(frozenOnReview).toContain(PHASE4A_PARTY_0);
    expect(frozenOnReview).toContain("SAAS SUBSCRIPTION AGREEMENT");

    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toHaveText(/Dashboard/i);
    await expect(page.getByText(PHASE4A_PARTY_0).or(page.getByText(/SaaS Subscription Agreement/i)).first()).toBeVisible();

    await page.goto(`/app/agreements/${durableId}/view`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();
    const reopened = await page.evaluate(() => document.body.innerText);
    expect(reopened).toContain(PHASE4A_PARTY_0);
    expect(reopened).toContain(PHASE4A_PARTY_1);
    expect(reopened).toMatch(/180,000|100k|SAAS SUBSCRIPTION AGREEMENT/);
    expect(reopened).not.toMatch(/Free Starter/);

    await page.reload({ waitUntil: "domcontentloaded" });
    const reloaded = await page.evaluate(() => document.body.innerText);
    expect(reloaded).toContain(PHASE4A_PARTY_0);
    expect(reloaded).toContain(PHASE4A_FROZEN_BODY.slice(0, 40));
    expect(PHASE4A_FROZEN_SHA).toHaveLength(64);
  });
});
