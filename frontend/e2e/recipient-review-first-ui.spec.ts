/**
 * Isolated review-first UI screenshots (not part of serial recipient-link-flow-qa suite).
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

type DraftRec = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: Array<{ name: string; role: string; email?: string }>;
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  created_at: string;
  updated_at: string;
};

function installReviewFirstApi(page: Page, draft: DraftRec) {
  return page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/access/policy") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recipient_link_token_required: false,
          mint_key_configured: false,
          signing_token_configured: false,
        }),
      });
      return;
    }

    if (url.includes("/render") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rendered_html: `<p>${draft.title}</p><p>${draft.purpose}</p><p>${draft.payment_terms}</p>`,
        }),
      });
      return;
    }

    if (method === "GET" && /\/api\/agreements\/[^/?]+$/.test(url.replace(/\?.*$/, ""))) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ draft, economics: { tier: "paid", watermark_required: false } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

test("review-first simplified UI (desktop + laptop PNGs)", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const artifactDir = join(testInfo.project.outputDir, "..", "artifacts", "recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });

  const agreementId = "ag_review_first_png";
  const now = new Date().toISOString();
  const draft: DraftRec = {
    id: agreementId,
    title: "Review First Services",
    jurisdiction: "California",
    parties: [
      { name: "Studio LLC", role: "owner", email: "owner@example.com" },
      { name: "Client LLC", role: "party", email: "client@example.com" },
    ],
    purpose: "Professional services.",
    payment_terms: "Payment due within 15 days.",
    duration: "6 months",
    due_date: null,
    effective_date: "2026-01-01",
    versions: [{ version: 1, created_at: now, note: "review" }],
    audit_log: [],
    created_at: now,
    updated_at: now,
  };

  await installReviewFirstApi(page, draft);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1100 },
    { name: "laptop", width: 1100, height: 900 },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/agreements/${agreementId}/review?role=reviewer`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(page.getByRole("heading", { name: "Review agreement" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("recipient-review-first-actions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Request changes/i })).toHaveCount(0);

    await page.screenshot({
      path: join(artifactDir, `review-first-${viewport.name}.png`),
      fullPage: true,
    });
  }
});
