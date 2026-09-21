import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4BillingAcceptanceContracts } from "../../src/launch/phase4BillingAcceptanceCoverage";
import {
  BILLING_AGREEMENT_RETURN,
  BILLING_ORG_B,
  createBillingFixtureState,
  seedBillingOwner,
  seedBillingSignedOut,
  switchBillingOrg,
  type BillingFixtureMode,
} from "./phase4BillingAcceptanceFixtures";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;

function attachGuards(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (CONSOLE_NOISE.test(text)) return;
    consoleErrors.push(text);
  });
  return {
    assertClean() {
      expect(pageErrors, pageErrors.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    },
  };
}

async function openBilling(page: Page, path = "/app/billing") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("billing-account-panel").or(page.getByTestId("auth-dashboard-required"))).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("Phase 4 billing acceptance", () => {
  test("coverage contracts stay closed", () => {
    expect(() => assertPhase4BillingAcceptanceContracts()).not.toThrow();
  });

  const states: Array<{ mode: BillingFixtureMode; expectText: RegExp; dataState: string }> = [
    { mode: "no_subscription", expectText: /No subscription on file/i, dataState: "no_subscription" },
    { mode: "active", expectText: /Current plan: LawDog Pro/i, dataState: "active" },
    { mode: "scheduled_cancellation", expectText: /scheduled to cancel/i, dataState: "scheduled_cancellation" },
    { mode: "expired_canceled", expectText: /no longer active/i, dataState: "expired_canceled" },
    { mode: "payment_problem", expectText: /problem with the payment/i, dataState: "payment_problem" },
    { mode: "unavailable", expectText: /unavailable/i, dataState: "unavailable" },
  ];

  for (const row of states) {
    test(`shows ${row.mode} from the server`, async ({ page }) => {
      const state = createBillingFixtureState(row.mode);
      const guards = attachGuards(page);
      await seedBillingOwner(page, state);
      await openBilling(page);
      await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", row.dataState);
      await expect(page.getByTestId("billing-status-headline")).toHaveText(row.expectText);
      if (row.mode === "active" || row.mode === "scheduled_cancellation") {
        await expect(page.getByTestId("billing-status-detail")).toContainText(/December 31, 2099|Access continues/i);
        await expect(page.getByTestId("billing-pro-cta")).toBeDisabled();
      }
      if (row.mode === "no_subscription") {
        await expect(page.getByTestId("billing-pro-cta")).toBeEnabled();
      }
      guards.assertClean();
    });
  }

  test("shows loading before the server confirms status", async ({ page }) => {
    const state = createBillingFixtureState("delayed_active");
    await seedBillingOwner(page, state);
    await page.goto("/app/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", "loading", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("billing-status-headline")).toHaveText(/Loading your subscription/i);
    await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", "active", {
      timeout: 20_000,
    });
  });

  test("signed-out billing requires a session", async ({ page }) => {
    const state = createBillingFixtureState("active");
    await seedBillingSignedOut(page, state);
    await openBilling(page);
    await expect(page.getByTestId("auth-dashboard-required")).toBeVisible();
    await expect(page.getByTestId("billing-account-panel")).toHaveCount(0);
  });

  test("wrong-org status stays unavailable and does not paint another account", async ({ page }) => {
    const state = createBillingFixtureState("wrong_org");
    await seedBillingOwner(page, state);
    await openBilling(page);
    await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", "unavailable");
    await expect(page.getByTestId("billing-status-headline")).toHaveText(/unavailable/i);
    await expect(page.locator("body")).not.toContainText("Current plan: LawDog Pro");
  });

  test("rejects a delayed prior-org response after org switch", async ({ page }) => {
    const state = createBillingFixtureState("delayed_active");
    await seedBillingOwner(page, state);
    await page.goto("/app/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("billing-account-panel")).toBeVisible({ timeout: 30_000 });
    state.mode = "no_subscription";
    state.delayMs = 0;
    await switchBillingOrg(page, BILLING_ORG_B);
    await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", "no_subscription", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("billing-status-headline")).toHaveText(/No subscription on file/i);
    await expect(page.locator("body")).not.toContainText("Current plan: LawDog Pro");
  });

  test("opens a server portal session and does not accept caller customer ids", async ({ page }) => {
    const state = createBillingFixtureState("active");
    await seedBillingOwner(page, state);
    await page.route("https://billing.stripe.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "mocked-stripe-portal" }),
    );
    await openBilling(page);
    await page.getByTestId("billing-manage-portal").click();
    await expect.poll(() => state.portalHits).toBe(1);
    expect(state.lastPortalBody?.customer_id).toBeUndefined();
    await expect(page).toHaveURL(/billing\.stripe\.com/);
  });

  test("provider failure keeps manage explicit and does not declare success", async ({ page }) => {
    const state = createBillingFixtureState("provider_fail");
    await seedBillingOwner(page, state);
    await openBilling(page);
    await expect(page.getByTestId("billing-status-headline")).toHaveText(/unavailable/i);
    await expect(page.getByTestId("billing-status-error")).toBeVisible();
    await expect(page.getByTestId("billing-manage-unavailable")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/payment successful|you're subscribed/i);
  });

  test("safe return keeps the agreement path without granting access", async ({ page }) => {
    const state = createBillingFixtureState("active");
    await seedBillingOwner(page, state);
    await openBilling(page, `/app/billing?returnTo=${encodeURIComponent(BILLING_AGREEMENT_RETURN)}`);
    await page.getByTestId("billing-return-agreement").click();
    await expect(page).toHaveURL(/\/app\/send\/ag-billing-orion/);
    await expect(page).not.toHaveURL(/premiumCompletion=1/);
  });

  test("unresolved previous purchase does not start another payment", async ({ page }) => {
    const state = createBillingFixtureState("checkout_unresolved");
    const guards = attachGuards(page);
    await seedBillingOwner(page, state);
    await page.route("https://checkout.stripe.com/**", () => {
      throw new Error("must not open a second payable checkout");
    });
    await openBilling(page);
    await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", "no_subscription");
    await page.getByTestId("billing-pro-cta").click();
    await expect(page.getByTestId("billing-checkout-recovery")).toBeVisible();
    await expect(page.getByTestId("billing-checkout-recovery")).toHaveAttribute(
      "data-checkout-recovery",
      "purchase_unresolved",
    );
    await expect(page.getByTestId("billing-checkout-recovery")).toContainText(/could not confirm the previous checkout/i);
    await expect(page.getByTestId("billing-checkout-recovery")).toContainText(/do not pay again/i);
    await expect(page).toHaveURL(/\/app\/billing/);
    await expect(page).not.toHaveURL(/checkout\.stripe\.com/);
    await expect(page.locator("body")).not.toContainText(/payment successful|you're subscribed|checkout complete/i);
    await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", "no_subscription");
    await page.getByTestId("billing-pro-cta").click();
    await expect.poll(() => state.checkoutHits).toBe(2);
    await expect(page.getByTestId("billing-checkout-recovery")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/billing/);
    guards.assertClean();
  });

  test("processing purchase does not start another payment", async ({ page }) => {
    const state = createBillingFixtureState("checkout_processing");
    const guards = attachGuards(page);
    await seedBillingOwner(page, state);
    await page.route("https://checkout.stripe.com/**", () => {
      throw new Error("must not open a second payable checkout");
    });
    await openBilling(page);
    await page.getByTestId("billing-pro-cta").click();
    await expect(page.getByTestId("billing-checkout-recovery")).toBeVisible();
    await expect(page.getByTestId("billing-checkout-recovery")).toHaveAttribute(
      "data-checkout-recovery",
      "payment_processing",
    );
    await expect(page.getByTestId("billing-checkout-recovery")).toContainText(/being processed/i);
    await expect(page.getByTestId("billing-checkout-recovery")).toContainText(/do not pay again/i);
    await expect(page).toHaveURL(/\/app\/billing/);
    await expect(page.locator("body")).not.toContainText(/payment successful|you're subscribed/i);
    await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", "no_subscription");
    guards.assertClean();
  });

  test("portal or checkout query params do not declare payment success", async ({ page }) => {
    const state = createBillingFixtureState("no_subscription");
    await seedBillingOwner(page, state);
    await openBilling(
      page,
      "/app/billing?premiumCompletion=1&checkout_session_id=cs_fake&billing_portal=1",
    );
    await expect(page.getByTestId("billing-account-panel")).toHaveAttribute("data-billing-state", "no_subscription");
    await expect(page.getByTestId("billing-status-headline")).toHaveText(/No subscription on file/i);
    await expect(page.locator("body")).not.toContainText(/payment successful|checkout complete/i);
  });
});
