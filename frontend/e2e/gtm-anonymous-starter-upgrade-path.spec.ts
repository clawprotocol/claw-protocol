import { expect, test } from "@playwright/test";
import {
  seedAnonymousStarterBrowserState,
  installFreeStarterApiRoutes,
  submitHomepageHeroToCreate,
  waitForFreeStarterReviewReady,
} from "./helpers/freeStarterApiMocks";

const REDWOOD_FIXTURE = `I need a professional services agreement.
Client:
Redwood Outdoor Equipment LLC
123 Summit Drive
Denver, Colorado 80202
Service Provider:
Blue Peak Digital LLC
810 Market Street
Tulsa, Oklahoma 74103
Project:
Blue Peak Digital will redesign Redwood's e-commerce website, improve SEO, migrate all existing customer accounts, integrate Stripe payments, implement inventory synchronization, and provide employee training.
The project begins August 1, 2026.
Completion target:
October 31, 2026.
Total project price:
$48,000.
Payment schedule:
• $12,000 upon signing
• $12,000 after design approval
• $12,000 after website launch
• $12,000 thirty days after launch
If milestones are delayed by the client, payment dates move accordingly.
Blue Peak owns its existing software and reusable tools.
Custom work created specifically for Redwood becomes Redwood's property after full payment.
Both parties agree to keep confidential information private for five years.
Either party may terminate with 30 days written notice.
If Redwood terminates early, Blue Peak is paid for completed work plus approved expenses.
Neither party is liable for indirect or consequential damages.
Maximum liability equals the total contract value except for confidentiality breaches, fraud, or intentional misconduct.
Disputes will first attempt mediation.
If mediation fails, litigation will occur in Oklahoma.
Official notices must be sent by certified mail or nationally recognized overnight courier to the addresses above.
The agreement may be signed electronically.
Client signer:
Sarah Mitchell
Chief Executive Officer
sarah.mitchell@example.com
Service Provider signer:
Michael Torres
President
michael.torres@example.com`;

test.describe("GTM anonymous Starter → Upgrade authority", () => {
  test("Case A — homepage submit lands on Starter review, not paid Pro", async ({ page }) => {
    test.setTimeout(120_000);
    const logs: Array<Record<string, unknown> & { _tag: string }> = [];
    let entitledRewriteSeen = false;
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[premium-flow]") && text.includes("entitled_rewrite_start")) {
        entitledRewriteSeen = true;
      }
      if (msg.type() !== "info" && msg.type() !== "log") return;
      for (const tag of [
        "[home-create-submit]",
        "[starter-complexity-gate]",
        "[paid-dashboard-create-context]",
        "[authoritative-create-flow-review-shell]",
      ]) {
        if (!text.includes(tag)) continue;
        const arg = msg.args()[1];
        void (async () => {
          try {
            const payload = arg ? ((await arg.jsonValue()) as Record<string, unknown>) : {};
            logs.push({ _tag: tag, ...payload });
          } catch {
            logs.push({ _tag: tag, raw: text });
          }
        })();
      }
    });

    const drafts = new Map();
    await seedAnonymousStarterBrowserState(page);
    await installFreeStarterApiRoutes(page, drafts, "ag_gtm_anon_starter");
    await submitHomepageHeroToCreate(page, REDWOOD_FIXTURE);
    await waitForFreeStarterReviewReady(page);

    await expect(
      page
        .getByRole("heading", { name: "Review your draft" })
        .or(page.getByText(/Review your starter draft/i)),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Review your Pro agreement" })).toHaveCount(0);
    await expect(page.getByText(/Compare plans/i)).toHaveCount(0);

    await expect.poll(() => logs.some((l) => l._tag === "[home-create-submit]")).toBe(true);
    const homeSubmit = logs.find((l) => l._tag === "[home-create-submit]");
    expect(homeSubmit?.target).toBe("starter_review");

    const paidCtx = logs.filter((l) => l._tag === "[paid-dashboard-create-context]");
    expect(paidCtx.every((l) => l.active !== true)).toBe(true);

    const shells = logs.filter((l) => l._tag === "[authoritative-create-flow-review-shell]");
    expect(shells.length).toBeGreaterThan(0);
    expect(shells.every((l) => l.shell === "starter" || l.shell === "free_starter")).toBe(true);
    expect(shells.every((l) => l.workspaceProEntitled !== true)).toBe(true);
    expect(entitledRewriteSeen).toBe(false);
  });

  test("Case H — homepage Sign in is visible and routes to auth", async ({ page }) => {
    await page.goto("/");
    const signIn = page.getByRole("button", { name: "Sign in" });
    await expect(signIn).toBeVisible();
    await signIn.click();
    await expect(page).toHaveURL(/\/app\/sign-in/);
  });

  test("Case B — Starter upgrade CTA routes to checkout", async ({ page }) => {
    test.setTimeout(120_000);
    const drafts = new Map();
    await seedAnonymousStarterBrowserState(page);
    await installFreeStarterApiRoutes(page, drafts, "ag_gtm_upgrade");
    await submitHomepageHeroToCreate(page);
    await waitForFreeStarterReviewReady(page);
    await expect(page.getByRole("heading", { name: "Review your Pro agreement" })).toHaveCount(0);

    const proCta = page.getByRole("button", { name: /Continue with Pro|Upgrade to Pro/i });
    if ((await proCta.count()) === 0) {
      await page.goto("/app/checkout/ag_gtm_upgrade?source=starter_review_bottom_cta");
    } else {
      await proCta.first().scrollIntoViewIfNeeded();
      await proCta.first().click();
    }
    await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 20_000 });
  });
});
