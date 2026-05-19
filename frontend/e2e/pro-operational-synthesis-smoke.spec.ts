/**
 * Optional smoke: free-starter review surfaces for SaaS + multi-party rollout prompts (mocked API).
 * Viewport: mobile. No Stripe / live payment.
 */
import { expect, test, type Page } from "@playwright/test";
import { STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS } from "../src/launch/simpleProduct/proTransformationCopy";

const VIEWPORT = { width: 390, height: 784 };
const TIMEOUT_MS = 120_000;

const SAAS_PROMPT =
  "SaaS subscription between Nimbus Cloud Systems LLC and Orchard Retail Group Inc. Monthly subscription, API access, 99.9% uptime, security updates. Delaware law. ops@nimbuscloud.com legal@orchardretail.com";

const MULTI_PARTY_PROMPT = `Agreement among Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for joint AI rollout. Ironclad provides white-label workflows. Milestone payments. ethan.cole@ironcladsg.com maya.bennett@harborlinedata.com`;

type DraftRecord = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: Array<{ name: string; role: string }>;
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  versions: Array<{ version: number; created_at: string }>;
  audit_log: Array<{ event_type: string; at: string }>;
  created_at: string;
  updated_at: string;
};

const UNPAID = {
  tier: "free" as const,
  watermark_required: false,
  free_draft_expired: false,
  free_draft_expires_at: null as string | null,
};

function installParseRoute(page: Page, prompt: string) {
  const isMulti = prompt.includes("Ironclad Systems");
  const parties = isMulti
    ? [
        { name: "Ironclad Systems Group LLC", role: "party" },
        { name: "Harborline Data Solutions Inc.", role: "party" },
        { name: "Northwind Automation Partners LLC", role: "party" },
        { name: "Silver Mesa Analytics LP", role: "party" },
        { name: "VertexGrid Technologies LLC", role: "party" },
      ]
    : [
        { name: "Nimbus Cloud Systems LLC", role: "Provider" },
        { name: "Orchard Retail Group Inc.", role: "Client" },
      ];

  return page.route("**/api/agreements/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/parse")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            title: isMulti ? "Joint Rollout Agreement" : "SaaS Subscription Agreement",
            jurisdiction: "Delaware",
            parties,
            purpose: prompt.slice(0, 400),
            payment_terms: isMulti ? "Milestone payments on acceptance." : "Monthly subscription.",
            duration: "12 months",
            due_date: null,
            effective_date: "2026-06-01",
            agreement_family: "services_agreement",
          },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = `ag_pro_qa_smoke_${isMulti ? "multi" : "saas"}`;
      const now = new Date().toISOString();
      const rec: DraftRecord = {
        id,
        title: String(body.title || "Agreement"),
        jurisdiction: String(body.jurisdiction || "Delaware"),
        parties: (Array.isArray(body.parties) ? body.parties : parties) as DraftRecord["parties"],
        purpose: String(body.purpose || ""),
        payment_terms: String(body.payment_terms || ""),
        duration: "12 months",
        due_date: null,
        effective_date: "2026-06-01",
        versions: [{ version: 1, created_at: now }],
        audit_log: [],
        created_at: now,
        updated_at: now,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id, draft: rec, economics: UNPAID }),
      });
      return;
    }

    if (url.includes("/render")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rendered_html: "<p>Starter preview</p>" }),
      });
      return;
    }

    if (method !== "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: {
          id,
          title: isMulti ? "Joint Rollout Agreement" : "SaaS Subscription Agreement",
          jurisdiction: "Delaware",
          parties,
          purpose: prompt.slice(0, 400),
          payment_terms: "Per intake",
          duration: "12 months",
          due_date: null,
          effective_date: "2026-06-01",
          versions: [],
          audit_log: [],
          created_at: nowIso(),
          updated_at: nowIso(),
        },
        economics: UNPAID,
      }),
    });
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

async function assertReviewSurface(page: Page) {
  await expect(page.getByLabel("Agreement document")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Want LawDog to improve this draft?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to improve draft" })).toBeVisible();

  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollW).toBeLessThanOrEqual(clientW + 2);

  const bodyText = await page.locator("body").innerText();
  for (const stale of STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS) {
    expect(bodyText).not.toContain(stale);
  }
}

test.describe("Pro operational synthesis smoke (mobile)", () => {
  test.use({ viewport: VIEWPORT });

  test("SaaS subscription prompt reaches review without stale Pro sample copy", async ({ page }) => {
    test.setTimeout(TIMEOUT_MS);
    await installParseRoute(page, SAAS_PROMPT);
    await page.goto("/app/create", { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox").first().fill(SAAS_PROMPT);
    await page.getByRole("button", { name: /Create draft|Create agreement|Draft now|Review draft/i }).click();
    await assertReviewSurface(page);
  });

  test("Multi-party AI rollout prompt reaches review without stale Pro sample copy", async ({ page }) => {
    test.setTimeout(TIMEOUT_MS);
    await installParseRoute(page, MULTI_PARTY_PROMPT);
    await page.goto("/app/create", { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox").first().fill(MULTI_PARTY_PROMPT);
    await page.getByRole("button", { name: /Create draft|Create agreement|Draft now|Review draft/i }).click();
    await assertReviewSurface(page);
  });
});
