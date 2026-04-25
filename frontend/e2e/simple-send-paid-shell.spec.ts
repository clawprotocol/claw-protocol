import { expect, test, type Page } from "@playwright/test";

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

const PAID_ECONOMICS = {
  tier: "paid",
  watermark_required: false,
  free_draft_expired: false,
  free_draft_expires_at: null as string | null,
};

function installPaidAgreementRoutes(page: Page, drafts: Map<string, DraftRecord>) {
  return page.route("**/api/agreements/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/render")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rendered_html: "<p>Paid tier preview</p>" }),
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
      body: JSON.stringify(rec ? { draft: rec, economics: PAID_ECONOMICS } : { detail: "not_found" }),
    });
  });
}

async function assertNoUnpaidCanonicalSendShell(page: Page) {
  /** Canonical unpaid shell uses an H1; premium legacy send still has an H2 with the same copy in the recipients column. */
  await expect(page.getByRole("heading", { level: 1, name: "Send this agreement" })).toHaveCount(0);
  await expect(page.getByText("Quick check")).toHaveCount(0);
}

async function assertPaidSendSurfaceVisible(page: Page) {
  await expect(page.getByText("Add recipients, then send your signature request.")).toBeVisible({ timeout: 20000 });
}

test("paid economics: send step does not show unpaid canonical shell", async ({ page }) => {
  const drafts = new Map<string, DraftRecord>();
  await installPaidAgreementRoutes(page, drafts);

  const id = "ag_paid_send_shell";
  const now = new Date().toISOString();
  drafts.set(id, {
    id,
    title: "Paid tier send test",
    jurisdiction: "Delaware",
    parties: [
      { name: "Alex Owner", role: "owner", email: "alex@example.com" },
      { name: "Sam Counterparty", role: "party", email: "sam@example.com" },
    ],
    purpose: "Consulting.",
    payment_terms: "Monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: "2026-01-01",
    versions: [{ version: 1, created_at: now, note: "created" }],
    audit_log: [],
    created_at: now,
    updated_at: now,
  });

  await page.goto(`/app/send/${encodeURIComponent(id)}?phase=send`);
  await expect(page).toHaveURL(new RegExp(`/app/send/${id}`));
  await assertPaidSendSurfaceVisible(page);
  await assertNoUnpaidCanonicalSendShell(page);
  await expect(page.getByText("Something went wrong displaying this agreement.")).toHaveCount(0);
});

test("paid send: refresh without query keeps premium surface (no unpaid shell)", async ({ page }) => {
  const drafts = new Map<string, DraftRecord>();
  await installPaidAgreementRoutes(page, drafts);

  const id = "ag_paid_send_refresh";
  const now = new Date().toISOString();
  drafts.set(id, {
    id,
    title: "Paid refresh test",
    jurisdiction: "Delaware",
    parties: [
      { name: "Alex Owner", role: "owner", email: "alex@example.com" },
      { name: "Sam Counterparty", role: "party", email: "sam@example.com" },
    ],
    purpose: "Consulting.",
    payment_terms: "Monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: "2026-01-01",
    versions: [{ version: 1, created_at: now, note: "created" }],
    audit_log: [],
    created_at: now,
    updated_at: now,
  });

  await page.goto(`/app/send/${encodeURIComponent(id)}?phase=send`);
  await expect(page).toHaveURL(new RegExp(`/app/send/${id}`));
  await assertPaidSendSurfaceVisible(page);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/app/send/${id}`));
  await expect(page.url()).not.toContain("phase=send");
  await assertPaidSendSurfaceVisible(page);
  await assertNoUnpaidCanonicalSendShell(page);
  await expect(page.getByText("Something went wrong displaying this agreement.")).toHaveCount(0);
});
