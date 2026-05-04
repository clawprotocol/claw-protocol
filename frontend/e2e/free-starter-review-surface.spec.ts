import { expect, test, type Page } from "@playwright/test";

/**
 * Free starter *review* (production path): `AgreementBuilderIntake` must not show the persisted
 * /refine block on unpaid starter; must show the Pro upsell; Continue must not be blocked by buffer.
 */
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

/** Exact copy from production QA (crypto / web dev scope + Oklahoma). */
const PROD_QA_FREELANCE_PROMPT =
  "I need a freelance software development agreement. Anthem Blanchard hires Sarah Collins to redesign and optimize the CryptoSpaces.net website for $7,500 total. $3,000 due upfront, $4,500 due on final delivery. Work includes homepage redesign, mobile optimization, analytics setup, email capture funnel, and performance improvements. Project starts May 1, 2026 and final delivery is due within 30 days. Two revision rounds included. Client owns final deliverables after full payment. Developer keeps pre-existing tools and code libraries. Both parties keep confidential information private. Oklahoma law governs. Notices by email are acceptable.";

function installFreeStarterApiRoutes(page: Page, drafts: Map<string, DraftRecord>) {
  return page.route("**/api/agreements/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/parse")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            title: "Software Development Agreement",
            jurisdiction: "Oklahoma",
            parties: [
              { name: "Anthem Blanchard", role: "party" },
              { name: "Sarah Collins", role: "party" },
            ],
            purpose: "Redesign and optimize the CryptoSpaces.net website.",
            payment_terms: "$7,500 total; $3,000 upfront, $4,500 on final delivery.",
            duration: "30 days from May 1, 2026",
            due_date: null,
            effective_date: "2026-05-01",
            agreement_family: "independent_contractor_agreement",
          },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = "ag_free_starter_prod_qa";
      const now = new Date().toISOString();
      const rec: DraftRecord = {
        id,
        title: String(body.title || "Untitled agreement"),
        jurisdiction: String(body.jurisdiction || "Oklahoma"),
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
        body: JSON.stringify({ rendered_html: "<p>Software development starter agreement preview</p>" }),
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

/** Shared: reach draft review with the prod QA prompt (used by two tests so step 6 vs 7 do not depend on fragile history goBack). */
async function goToFreeStarterReview(page: Page, drafts: Map<string, DraftRecord>) {
  await installFreeStarterApiRoutes(page, drafts);
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox").first().fill(PROD_QA_FREELANCE_PROMPT);
  await page.getByRole("button", { name: /Create draft|Create agreement|Draft now|Review draft|Review full draft/i }).click();
  const agreementDocument = page.getByLabel("Agreement document");
  await expect(agreementDocument).toBeVisible({ timeout: 60_000 });
  return agreementDocument;
}

test("1–6: free starter review + type in body + continue to invite recipients", async ({ page }) => {
  test.setTimeout(120_000);
  const drafts = new Map<string, DraftRecord>();
  const agreementDocument = await goToFreeStarterReview(page, drafts);

  await expect(page.getByText("Starter Draft", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready for Review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try simplified starting point" })).toHaveCount(0);

  await expect(page.locator("#claw-refine-this-draft")).toHaveCount(0);
  await expect(page.getByText("Refine this draft", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Add changes here. LawDog updates this agreement", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Tool-assisted drafting only/)).toHaveCount(0);

  const applyRevision = page.getByRole("button", { name: "Apply revision." });
  await expect(applyRevision).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Want LawDog to improve this draft?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to improve draft" })).toBeVisible();
  await expect(page.locator("#claw-refine-starter-pro-upsell")).toBeVisible();

  await agreementDocument.fill("E2E edit in agreement body — not persisted refine field.");
  await expect(applyWithLawDogPro).toHaveCount(0);
  const continueOrSend = page.getByRole("button", { name: /Continue to send|Continue to Send|Continue/i });
  const continueText = (await continueOrSend.first().textContent()) || "";
  expect(continueText).not.toMatch(/Apply revision/i);

  await page.getByRole("button", { name: /Continue to send|Continue to Send|Continue/i }).first().click();
  await expect(page.getByRole("region", { name: "Invite recipients" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Share this agreement", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Recipient 1 name")).toBeVisible();
});

test("1–5 + 7: upgrade from draft review routes to /app/checkout", async ({ page }) => {
  test.setTimeout(120_000);
  const drafts = new Map<string, DraftRecord>();
  await goToFreeStarterReview(page, drafts);
  await page.getByRole("button", { name: "Upgrade to improve draft" }).click();
  await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 20_000 });
});
