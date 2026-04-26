/**
 * QA: paid premium *degraded* path (LawDog Pro checkout succeeds; model path returns 200 degraded).
 *
 * Manual checklist (same flow, can use real backend outage or this mock):
 * 1. Homepage → /app/create → draft → LawDog Pro checkout → return ?premiumCompletion=1
 * 2. Paid Pro document card (cream “LawDog Pro” package) renders with non-empty body
 * 3. Blue info panel (sky border) when generation_outcome is degraded — not the amber quality-gate dead-end
 * 4. “Retry Pro draft” exists in the blue notice (optional later); quality-gate retry strip is not forced
 * 5. Refresh: `claw_premium_completion_snapshot_v1` keeps `serverGenerationDegraded` + `claw_premium_completed` (verify in app or storage; blue banner returns when review surface is on Draft)
 * 6. “Continue to recipient setup” / send region still available when text is non-empty
 *
 * Requires: Vite on 127.0.0.1:4173, backend on 127.0.0.1:8000 (for parse/draft/checkout; only premium-full-draft is mocked).
 */
import { expect, test } from "@playwright/test";

const PROMPT = "Need a logo contract for $1,500 with 2 revisions between Agency LLC and Client LLC";
const TIMEOUT_MS = 600_000;

function buildLongDegradedDocument(): string {
  const line =
    "1. Recitals. This Agreement sets forth the terms between the parties for professional design and brand services. ";
  return `${line.repeat(220)}2. Payment. Client shall pay fees as stated. 3. IP. Deliverables subject to payment. `;
}

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

test("paid premium degraded: Pro card, blue panel, no amber dead-end, refresh, recipients", async ({ page }) => {
  test.setTimeout(TIMEOUT_MS);

  const longBody = buildLongDegradedDocument();
  await page.route("**/api/agreements/premium-full-draft", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        title: "Logo / Brand Services Agreement",
        agreement_family: "operating_agreement",
        document_text: longBody,
        server_full_document_text: longBody,
        server_repair_document_text: "",
        key_terms_found: ["Fees", "IP"],
        missing_material_info: ["pro_model_unavailable:e2e"],
        generation_outcome: "degraded",
        schema_validation_reasons: ["fallback:e2e"],
        server_generation_failure_code: "e2e_mock",
        server_generation_failure_message:
          "LawDog Pro full generation was temporarily unavailable (E2E). Your purchase is active; the document below is a structured fallback.",
      }),
    });
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("claw_org_id", "local-org");
      localStorage.setItem("claw_dev_access_tier", "free");
    } catch {
      /* ignore */
    }
  });

  await page.goto("/app/ops/paid-funnel", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("claw_premium_completion_snapshot_v1");
      localStorage.removeItem("claw_premium_completed");
    } catch {
      /* ignore */
    }
  });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /clear local funnel data/i }).click();
  await expect(page.getByText(/no paid funnel rows|No paid funnel rows/i)).toBeVisible({ timeout: 15_000 });

  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  const mainTextbox = page.getByRole("textbox").first();
  await mainTextbox.waitFor({ state: "visible", timeout: 30_000 });
  await mainTextbox.fill(PROMPT);

  const createOrReview = page.getByRole("button", {
    name: /create draft|review draft|draft now/i,
  });
  await createOrReview.first().click();

  const trySimplified = page.getByRole("button", { name: /try simplified starting point/i });
  if (await trySimplified.isVisible().catch(() => false)) {
    await trySimplified.click();
  }

  const sendWithPro = page.getByRole("button", { name: /send with lawdog pro/i });
  await expect(sendWithPro).toBeVisible({ timeout: 120_000 });
  await sendWithPro.click();

  await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 30_000 });
  await page.getByRole("button", { name: /pay & continue/i }).click();

  await expect(page).toHaveURL(/\/app\/create/, { timeout: 60_000 });
  const gapDialog = page.getByRole("dialog", { name: /finish your agreement/i });
  await gapDialog.waitFor({ state: "visible", timeout: 120_000 }).catch(() => {
    /* optional */
  });
  if (await gapDialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^use defaults$/i }).click();
  }

  await page
    .getByRole("heading", { name: /finalizing your complete agreement/i })
    .waitFor({ state: "visible", timeout: 180_000 })
    .catch(() => {
      /* may be fast */
    });
  await expect(page.getByText("Your complete agreement is ready.", { exact: true })).toBeVisible({
    timeout: TIMEOUT_MS - 180_000,
  });

  // (1) Pro document card (on review, before “Continue to recipient setup”)
  await expect(page.getByText("Agreement package (LawDog Pro)")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("LawDog Pro", { exact: true }).first()).toBeVisible();

  // (2) Blue degraded panel
  await expect(page.getByText("Your upgrade is on file.")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/LawDog Pro full generation was temporarily unavailable \(E2E\)/i),
  ).toBeVisible();

  // (3) No amber “failed quality gate” dead-end
  await expect(page.getByText(/This draft did not meet the Pro quality gate/i)).toHaveCount(0);

  // (4) Degraded copy: later Retry is optional, not the only path
  await expect(
    page.getByText(/in a few\s*minutes for a full model-generated pass/i),
  ).toBeVisible();

  const funnelRows = await page.evaluate(() => {
    const key = "lawdog_paid_funnel_events_v1";
    const raw = localStorage.getItem(key);
    const rows = raw
      ? (JSON.parse(raw) as Array<{ premium_generation_outcome?: string; name?: string }>)
      : [];
    return rows.filter((r) => r.name === "premium_checkout_completed" && r.premium_generation_outcome === "degraded");
  });
  expect(funnelRows.length, "premium_checkout_completed with outcome degraded").toBeGreaterThan(0);

  // (5) Refresh preserves paid + snapshot + degraded metadata (source of truth: storage; UI may need an extra frame)
  await page.reload({ waitUntil: "domcontentloaded" });
  const afterReload = await page.evaluate(() => {
    let snap: Record<string, unknown> | null = null;
    try {
      const raw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
      if (raw) snap = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      snap = null;
    }
    return {
      premium_done: localStorage.getItem("claw_premium_completed"),
      has_snap: Boolean(snap),
      degraded_code: (snap?.serverGenerationDegraded as { code?: string } | undefined)?.code ?? null,
    };
  });
  expect(afterReload.premium_done, "claw_premium_completed after refresh").toBe("1");
  expect(afterReload.has_snap, "session snapshot after refresh").toBe(true);
  expect(afterReload.degraded_code, "degraded code persisted in snapshot").toBe("e2e_mock");

  // (6) Recipients: “Continue to recipient setup” must not be blocked for degraded
  const continueToRecipients = page.getByRole("button", { name: /continue to recipient setup/i });
  await expect(continueToRecipients).toBeVisible({ timeout: 60_000 });
  await continueToRecipients.click();
  await expect(page.locator("[data-claw-recipient-field=r1-name]")).toBeVisible({ timeout: 60_000 });
});
