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

const UNPAID_ECONOMICS = {
  tier: "free",
  watermark_required: false,
  free_draft_expired: false,
  free_draft_expires_at: null as string | null,
};

function installAgreementApiRoutes(page: Page, drafts: Map<string, DraftRecord>) {
  return page.route("**/api/agreements/**", async (route) => {
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
      const id = "ag_canonical_starter";
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
}

async function assertCanonicalUnpaidSendShell(page: Page) {
  await expect(page.getByText("Send this agreement", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toHaveCount(1);
  await expect(page.getByText("Quick check")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send with LawDog Pro" })).toHaveCount(1);

  await expect(page.getByText("Delivery status matrix")).toHaveCount(0);
  await expect(page.getByText(/Attach payment/i)).toHaveCount(0);
  await expect(page.getByText("Learn more about optional payments")).toHaveCount(0);
  await expect(page.getByText("Edit recipients & routing")).toHaveCount(0);
  await expect(page.getByText("Advanced options — links & FYI copy")).toHaveCount(0);
  await expect(page.getByText("Understand roles")).toHaveCount(0);

  await expect(page.getByText("Something went wrong displaying this agreement.")).toHaveCount(0);
}

/** Intake → `/app/send/:id` lands on review first; advance to send when the footer CTA is present. */
async function ensureSimpleSendReviewPageOnSendStep(page: Page) {
  const toSend = page.getByRole("button", { name: /Continue to send|Continue to Send|Continue/i }).first();
  if (await toSend.isVisible().catch(() => false)) {
    await toSend.click();
  }
  await expect(page.getByText("Send this agreement", { exact: true })).toBeVisible({ timeout: 15000 });
}

test("starter basic → send shows canonical unpaid shell", async ({ page }) => {
  const drafts = new Map<string, DraftRecord>();
  await installAgreementApiRoutes(page, drafts);

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

  await expect(page).toHaveURL(/\/app\/send\/ag_canonical_starter/, { timeout: 15000 });
  await ensureSimpleSendReviewPageOnSendStep(page);
  await assertCanonicalUnpaidSendShell(page);
});

test("advanced prompt → simplified starter → send shows canonical unpaid shell", async ({ page }) => {
  const drafts = new Map<string, DraftRecord>();
  await installAgreementApiRoutes(page, drafts);

  await page.goto("/app/create");
  await page
    .getByRole("textbox")
    .first()
    .fill(
      "Advanced addendum: nested governance, escrow tranches, multi-jurisdiction tax reps, and waterfall economics. " +
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

  await expect(page).toHaveURL(/\/app\/send\/ag_canonical_starter/, { timeout: 15000 });
  await ensureSimpleSendReviewPageOnSendStep(page);
  await assertCanonicalUnpaidSendShell(page);
});

test("refresh on /app/send/:id preserves canonical unpaid shell", async ({ page }) => {
  const drafts = new Map<string, DraftRecord>();
  await installAgreementApiRoutes(page, drafts);

  const id = "ag_canonical_refresh";
  const now = new Date().toISOString();
  drafts.set(id, {
    id,
    title: "Refresh test agreement",
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
  await assertCanonicalUnpaidSendShell(page);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/app/send/${id}`));
  await assertCanonicalUnpaidSendShell(page);
});
