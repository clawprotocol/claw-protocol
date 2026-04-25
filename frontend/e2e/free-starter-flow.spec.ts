import { expect, test } from "@playwright/test";

const UNPAID_ECONOMICS = {
  tier: "free",
  watermark_required: false,
  free_draft_expired: false,
  free_draft_expires_at: null as string | null,
};

type DraftRecord = {
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

test("free starter flow stays stable through send and refresh", async ({ page }) => {
  const drafts = new Map<string, DraftRecord>();

  await page.route("**/api/agreements/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/parse")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            title: "Consulting Services Agreement",
            jurisdiction: "y",
            parties: [
              { name: "Acme LLC make it for 12 months and include payment language", role: "party" },
              { name: "Beta Inc", role: "party" },
            ],
            purpose: "Consulting services for product strategy.",
            payment_terms: "Monthly retainer.",
            duration: "12 months",
            due_date: null,
            effective_date: "2026-01-01",
            agreement_family: "operating_agreement",
          },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = "ag_free_starter_e2e";
      const now = new Date().toISOString();
      const rec: DraftRecord = {
        id,
        title: String(body.title || "Untitled agreement"),
        jurisdiction: String(body.jurisdiction || "Delaware"),
        parties: (Array.isArray(body.parties) ? body.parties : []) as DraftRecord["parties"],
        purpose: String(body.purpose || ""),
        payment_terms: String(body.payment_terms || ""),
        duration: body.duration == null ? null : String(body.duration),
        due_date: body.due_date == null ? null : String(body.due_date),
        effective_date: body.effective_date == null ? null : String(body.effective_date),
        versions: [{ version: 1, created_at: now, note: "created" }],
        audit_log: [],
        created_at: now,
        updated_at: now,
      };
      drafts.set(id, rec);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id, draft: rec, economics: UNPAID_ECONOMICS }),
      });
      return;
    }

    if (url.includes("/render")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rendered_html: "<p>Rendered agreement</p>" }),
      });
      return;
    }

    if (method !== "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    const rec = drafts.get(id);
    await route.fulfill({
      status: rec ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(rec ? { draft: rec, economics: UNPAID_ECONOMICS } : { detail: "not_found" }),
    });
  });

  await page.goto("/app/create");
  await page.getByRole("textbox").first().fill(
    "Need an operating-style consulting agreement between Acme and Beta with custom governance and payment terms.",
  );
  await page.getByRole("button", { name: /Create draft|Create agreement|Draft now|Review draft|Review full draft/i }).click();

  await expect(page.getByRole("button", { name: "Try simplified starting point" })).toBeVisible();
  await page.getByRole("button", { name: "Try simplified starting point" }).click();

  await page.getByRole("button", { name: /Continue to send|Continue to Send|Continue/i }).click();
  await expect(page.getByRole("region", { name: "Send agreement" })).toBeVisible();

  await page.getByLabel("Recipient 1 name").fill("Alex Owner");
  await page.getByLabel("Recipient 1 email").fill("alex@example.com");
  await page.getByLabel("Recipient 2 name (optional)").fill("Sam Counterparty");
  await page.getByLabel("Recipient 2 email (optional)").fill("sam@example.com");
  await page.getByLabel("Optional signer roles / labels").fill("Owner · Counterparty");
  await page
    .getByRole("region", { name: "Send agreement" })
    .getByRole("button", { name: "Send Agreement", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/send\/ag_free_starter_e2e/, { timeout: 15000 });
  await expect(page.getByText("Something went wrong displaying this agreement.")).toHaveCount(0);
  await expect(page.getByText("Your Agreement")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/app\/send\/ag_free_starter_e2e/);
  await expect(page.getByText("Something went wrong displaying this agreement.")).toHaveCount(0);
  await expect(page.getByText("Your Agreement")).toBeVisible();
});
