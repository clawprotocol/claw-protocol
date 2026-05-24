/**
 * One-shot paid funnel dashboard QA (local): clear → create → upgrade → dev checkout → Pro success → recipients.
 * Expects: Vite on 127.0.0.1:4173, backend on 127.0.0.1:8000, LLM for premium full draft.
 */
import { expect, test } from "@playwright/test";
import { PAID_FUNNEL_DISPLAY_ORDER } from "../src/lib/experimentation/paidFunnelLocalStorage";

const PROMPT = "Need a logo contract for $1,500 with 2 revisions";
const TIMEOUT_MS = 600_000;

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

test("paid funnel: full path and dashboard (QA)", async ({ page }) => {
  test.setTimeout(TIMEOUT_MS);

  const consoleLines: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || (msg.type() === "log" && msg.text().includes("[paid-funnel]"))) {
      consoleLines.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("claw_org_id", "local-org");
      localStorage.setItem("claw_dev_access_tier", "free");
    } catch {
      /* ignore */
    }
  });

  // 1) Clear funnel from operator route
  await page.goto("/app/ops/paid-funnel", { waitUntil: "domcontentloaded" });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /clear local funnel data/i }).click();
  const empty = page.getByText(/no paid funnel rows|No paid funnel rows/i);
  await expect(empty).toBeVisible({ timeout: 15_000 });

  // 2) Create free draft
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  const mainTextbox = page.getByRole("textbox").first();
  await mainTextbox.waitFor({ state: "visible", timeout: 30_000 });
  await mainTextbox.fill(PROMPT);

  const createOrReview = page.getByRole("button", {
    name: /create draft|review draft|draft now/i,
  });
  await createOrReview.first().click();

  // Complexity gate: prefer simplified to reach review quickly
  const trySimplified = page.getByRole("button", { name: /try simplified starting point/i });
  if (await trySimplified.isVisible().catch(() => false)) {
    await trySimplified.click();
  }

  // 3) Premium upsell: CTA navigates directly to create-flow checkout (no intermediate modal in this path)
  const sendWithPro = page.getByRole("button", { name: /send with lawdog pro|continue with pro/i }).first();
  await expect(sendWithPro).toBeVisible({ timeout: 120_000 });
  await sendWithPro.click();

  // 4) Checkout (dev: Pay & continue triggers bypass)
  await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 30_000 });
  await page.getByRole("button", { name: /pay & continue|continue with pro/i }).click();

  // 5) Return to create with premium completion — gap panel may require answers before Pro build runs
  await expect(page).toHaveURL(/\/app\/create/, { timeout: 60_000 });
  const gapDialog = page.getByRole("dialog", { name: /finish your agreement/i });
  await gapDialog.waitFor({ state: "visible", timeout: 120_000 }).catch(() => {
    /* optional — may already be generating */
  });
  if (await gapDialog.isVisible().catch(() => false)) {
    // "Use defaults" alone kicks off generation and swaps this panel for "Finalizing…" — do not also click "Build my agreement"
    await page.getByRole("button", { name: /^use defaults$/i }).click();
  }
  // Processing → success
  await page
    .getByRole("heading", { name: /finalizing your complete agreement/i })
    .waitFor({ state: "visible", timeout: 180_000 })
    .catch(() => {
      /* may skip straight to success in fast paths */
    });
  await expect(page.getByText("Your complete agreement is ready.", { exact: true })).toBeVisible({
    timeout: TIMEOUT_MS - 180_000,
  });

  // 6) Continue to recipient setup
  const continueRecipients = page.getByRole("button", { name: /continue to recipient setup/i });
  await expect(continueRecipients).toBeVisible({ timeout: 60_000 });
  await continueRecipients.click();

  // 7) Recipient setup visible
  const recipientSend = page.getByRole("region", { name: /send agreement/i });
  const r1 = page.getByLabel(/recipient 1 name/i);
  await expect(recipientSend.or(r1).first()).toBeVisible({ timeout: 60_000 });

  // 8) Dashboard snapshot
  await page.goto("/app/ops/paid-funnel", { waitUntil: "domcontentloaded" });
  const report = await page.evaluate(() => {
    const key = "lawdog_paid_funnel_events_v1";
    const raw = localStorage.getItem(key);
    const lawdog = localStorage.getItem("lawdog_session_id");
    const rows = raw
      ? (JSON.parse(raw) as Array<{
          name: string;
          ts: number;
          session_id: string;
          agreement_intent_id?: string;
          device?: string;
          premium_generation_outcome?: string;
          render_source?: string;
        }>)
      : [];
    return { key, lawdog_session_id: lawdog, rows, rowCount: rows.length };
  });

  // eslint-disable-next-line no-console
  console.log("\n========== PAID FUNNEL QA REPORT ==========\n");
  // eslint-disable-next-line no-console
  console.log("lawdog_session_id:", report.lawdog_session_id);
  // eslint-disable-next-line no-console
  console.log("total stored rows:", report.rowCount);
  // eslint-disable-next-line no-console
  console.log("events (name order as captured):\n", report.rows.map((r) => r.name).join(" → "));

  const sessionIds = new Set(report.rows.map((r) => r.session_id).filter(Boolean));
  // eslint-disable-next-line no-console
  console.log("distinct session_id in events:", sessionIds.size, [...sessionIds]);

  const byName = (n: string) => report.rows.filter((r) => r.name === n);
  const firstMeta = report.rows[report.rows.length - 1];
  if (firstMeta) {
    // eslint-disable-next-line no-console
    console.log("sample last row metadata:", {
      agreement_intent_id: firstMeta.agreement_intent_id,
      device: firstMeta.device,
      premium_generation_outcome: firstMeta.premium_generation_outcome,
      render_source: firstMeta.render_source,
    });
  }

  const missing = PAID_FUNNEL_DISPLAY_ORDER.filter((step) => byName(step).length === 0);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn("Missing funnel event rows:", missing);
  } else {
    // eslint-disable-next-line no-console
    console.log("All display-order steps have at least one event row.");
  }

  // eslint-disable-next-line no-console
  console.log("Optional: paid-funnel console lines:\n", consoleLines.slice(-30).join("\n"));

  expect(report.rowCount, "should have paid funnel local rows").toBeGreaterThan(0);
  expect(sessionIds.size, "session_id should be single browser profile").toBe(1);
  for (const step of [
    "free_draft_generated",
    "premium_upsell_seen",
    "premium_checkout_opened",
    "premium_checkout_completed",
    "premium_success_banner_seen",
    "premium_continue_recipients_clicked",
    "recipient_setup_opened",
  ]) {
    expect(byName(step).length, `expected ${step}`).toBeGreaterThan(0);
  }
  // Only emitted on inline send success (not this path)
  // expect(byName("agreement_sent").length).toBeGreaterThan(0);
});
