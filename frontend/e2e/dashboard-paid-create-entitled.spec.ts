/**
 * Entitled dashboard paid-create entry (no checkout): marker, bootstrap, funnel telemetry.
 * API-mocked — does not require live LLM or Stripe.
 *
 * Prerequisite (local + CI): install Playwright browsers once per environment:
 *   cd frontend && npx playwright install chromium
 * Run:
 *   cd frontend && npm run test:e2e -- e2e/dashboard-paid-create-entitled.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

const ORG_ID = "e2e-dashboard-paid-create";
const PROMPT =
  "Professional services agreement between Redwood Biologics Inc and Summit AI Consulting LLC. Fixed fee $12,000. Texas law.";

const MOCK_PAID_BODY =
  `PROFESSIONAL SERVICES AGREEMENT between Redwood Biologics Inc and Summit AI Consulting LLC. ${"Operative services, payment, and notice clauses for entitled dashboard create. ".repeat(40)}`;

function installEntitledDashboardRoutes(page: Page) {
  return page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/usage") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tier: "paid", agreements_used: 1, agreements_limit: 100 }),
      });
      return;
    }

    if (url.includes("/api/agreements/access/policy") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recipient_link_token_required: false,
          mint_key_configured: true,
          signing_token_configured: true,
          review_link_mint_enabled: true,
        }),
      });
      return;
    }

    if (url.includes("/premium-full-draft") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          document_text: MOCK_PAID_BODY,
          server_full_document_text: MOCK_PAID_BODY,
          premium_full_document_text: MOCK_PAID_BODY,
          validation: { ok: true },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            id: "ag_e2e_dashboard_paid_create",
            title: "E2E dashboard paid create",
            jurisdiction: "Texas",
            parties: [
              { name: "Redwood Biologics Inc", role: "Client" },
              { name: "Summit AI Consulting LLC", role: "Service Provider" },
            ],
            purpose: PROMPT,
            payment_terms: "Net 30",
            duration: "12 months",
            due_date: null,
            effective_date: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            versions: [{ version: 1, created_at: new Date().toISOString() }],
            audit_log: [],
          },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements") && method === "GET" && !url.includes("/access/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ agreements: [], skipped: [], error: null }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe("entitled dashboard paid-create entry", () => {
  test("dashboard CTA sets marker and records screen funnel on create", async ({ page }) => {
    test.setTimeout(180_000);

    await page.addInitScript((orgId) => {
      try {
        localStorage.setItem("claw_org_id", orgId);
        localStorage.setItem("claw_workspace_usage_tier_v1", JSON.stringify({
          orgId,
          tier: "paid",
          fetchedAt: Date.now(),
        }));
        sessionStorage.setItem("claw_authenticated_workspace_session", "1");
        sessionStorage.setItem("claw_pro_entitlement_session_v1", "e2e-entitled");
        sessionStorage.setItem("claw_pro_intent_session_v1", "e2e-entitled");
      } catch {
        /* ignore */
      }
    }, ORG_ID);

    await installEntitledDashboardRoutes(page);

    await page.goto("/app", { waitUntil: "domcontentloaded" });
    const createBtn = page
      .getByTestId("dashboard-create-new-agreement")
      .or(page.getByTestId("dashboard-create-first-agreement"));
    await expect(createBtn.first()).toBeVisible({ timeout: 30_000 });
    await createBtn.first().click();
    await expect(page).toHaveURL(/\/app\/create/, { timeout: 20_000 });

    const marker = await page.evaluate(() =>
      sessionStorage.getItem("claw_paid_dashboard_create_context_v1"),
    );
    expect(marker).toBeTruthy();
    expect(marker).toContain("dashboard_paid_create");

    const textbox = page.getByRole("textbox").first();
    await textbox.waitFor({ state: "visible", timeout: 30_000 });
    await textbox.fill(PROMPT);

    const createDraft = page.getByRole("button", { name: /create draft/i }).first();
    await expect(createDraft).toBeVisible({ timeout: 30_000 });
    await createDraft.click();

    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(() =>
            localStorage.getItem("lawdog_paid_funnel_events_v1"),
          );
          if (!raw) return "";
          return raw;
        },
        { timeout: 120_000 },
      )
      .toContain("dashboard_paid_create_screen");

    const funnelScreens = await page.evaluate(() => {
      const raw = localStorage.getItem("lawdog_paid_funnel_events_v1");
      if (!raw) return [] as string[];
      try {
        const rows = JSON.parse(raw) as Array<{ name?: string; render_source?: string }>;
        return rows
          .filter((r) => r.name === "dashboard_paid_create_screen")
          .map((r) => String(r.render_source ?? ""));
      } catch {
        return [] as string[];
      }
    });
    expect(funnelScreens).toContain("dashboard");
    expect(funnelScreens.some((s) => s === "create_intake" || s === "generating")).toBe(true);
  });
});
