/**
 * Focused QA: paid-funnel `agreement_intent_id` vs Pro pipeline + `render_source` / outcome.
 * Requires: Vite (Playwright config), backend :8000 with external AI if needed.
 */
import { expect, test, type Page } from "@playwright/test";

const TEST_PER_SPEC_MS = 300_000;
const TEST2_TIMEOUT_MS = TEST_PER_SPEC_MS;
/** Funnel `premium_checkout_completed` (emit after checkout return; slow path caps here). */
const CHECKOUT_EMIT_BUDGET_MS = 90_000;
/**
 * If funnel still reports imposer `render_source` and no truthful gate, fail with diagnostics
 * (stall on live preview with “Continue to reviewer” looks like Pro success; see premiumSuccessGate + Intake CTA).
 */
const POST_CHECKOUT_RECONCILE_BUDGET_MS = 60_000;

type FunnelRow = {
  name: string;
  ts: number;
  session_id: string;
  agreement_intent_id?: string;
  device?: string;
  premium_generation_outcome?: string;
  render_source?: string;
  funnel_block_reason?: string;
};

const POST_PRO_OK_RENDER = new Set([
  "server_full_draft",
  "server_full_draft_retry",
  "server_full_document_text",
  "server_repair_document_text",
  "rejected_paid_corpus",
]);

/** After checkout, non-preview pipeline / gated sources (or unknown on rows that do not yet carry Pro render). */
function isPostCheckoutTruthRender(s: string, requireResolved: boolean): boolean {
  const t = s.trim();
  if (requireResolved) {
    if (!t || t === "unknown") return false;
  } else if (!t || t === "unknown") {
    return true;
  }
  if (t === "live_generated_preview" || t === "fallback_preview" || t === "fallback_preview_error") return false;
  if (t.startsWith("snapshot_")) return true;
  if (POST_PRO_OK_RENDER.has(t)) return true;
  if (t.startsWith("server_") && (t.includes("full") || t.includes("repair") || t.includes("draft") || t.includes("document")))
    return true;
  if (/rejected_paid|needs_details|gated/i.test(t)) return true;
  if (/^(generic|starter).*shell|shell.*agreement$/i.test(t)) return false;
  return false;
}

function isAcceptableCheckoutGenerationOutcome(
  out: string | undefined,
  render: string | undefined,
): boolean {
  const o = (out || "").trim();
  const r = (render || "").trim();
  if (o === "ok" || o === "needs_details") return true;
  if (r === "rejected_paid_corpus" || o === "gated" || /gated|rejected_paid|needs_details/.test(o)) return true;
  if (o === "unknown" && (r === "rejected_paid_corpus" || isPostCheckoutTruthRender(r, true)))
    return true;
  return false;
}

async function clearFunnelAndStorage(page: Page) {
  await page.goto("/app/ops/paid-funnel", { waitUntil: "domcontentloaded" });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /clear local funnel data/i }).click();
  const empty = page.getByText(/no paid funnel rows|No paid funnel rows/i);
  await expect(empty).toBeVisible({ timeout: 15_000 });
}

async function readFunnelReport(page: Page) {
  return page.evaluate(() => {
    const key = "lawdog_paid_funnel_events_v1";
    const raw = localStorage.getItem(key);
    const lawdog = localStorage.getItem("lawdog_session_id");
    const rows: FunnelRow[] = raw ? (JSON.parse(raw) as FunnelRow[]) : [];
    const byTs = [...rows].sort((a, b) => a.ts - b.ts);
    return { lawdog_session_id: lawdog, key, rows: byTs, rowCount: byTs.length };
  });
}

const FUNNEL_IMPOSER_RENDERS = new Set([
  "live_generated_preview",
  "fallback_preview",
  "fallback_preview_error",
  "legacy_snapshot",
  "none",
  "stale_intake",
  "snapshot_fallback",
]);

function isImposerPipelineRender(s: string | undefined): boolean {
  const t = (s || "").trim();
  if (!t || t === "unknown") return false;
  return FUNNEL_IMPOSER_RENDERS.has(t);
}

type FounderPostCheckoutTerminal = {
  hasCheckoutRow: boolean;
  /** UI shows Retry / needs-details (truthful non-finished Pro) */
  uiGateOnly: boolean;
  /** "Continue to reviewer" (or similar) present but disabled — premium_pro_truth_gate / retry */
  disabledProContinue: boolean;
};

async function waitForPremiumCheckoutCompletedInStorage(page: Page, timeoutMs: number) {
  await page.waitForFunction(
    () => {
      const raw = localStorage.getItem("lawdog_paid_funnel_events_v1");
      if (!raw) return false;
      try {
        const rows = JSON.parse(raw) as { name?: string }[];
        return (
          Array.isArray(rows) && rows.some((r) => r && r.name === "premium_checkout_completed")
        );
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: timeoutMs, polling: 500 },
  );
}

/**
 * Log founder post-checkout state (for Playwright error output; also called on timer near timeout).
 */
async function logFounderPostCheckoutDiagnostics(page: Page, label: string) {
  const d = await readPostCheckoutAdvanced(page);
  // eslint-disable-next-line no-console
  console.log(`[founder-harness] ${label}:\n`, JSON.stringify(d, null, 2));
}

/**
 * Do not require only `premium_checkout_completed` (founder can be stuck in processing or in truthful gate
 * before emit). Accept: funnel row, OR Retry/needs-details gate, OR disabled paid continue, OR fail with full diag.
 */
async function waitForFounderPostCheckoutTerminalState(page: Page, budgetMs: number): Promise<FounderPostCheckoutTerminal> {
  const start = Date.now();
  let lastPeriodicLog = start;
  let loggedSub3s = false;
  while (Date.now() - start < budgetMs) {
    const elapsed = Date.now() - start;
    if (Date.now() - lastPeriodicLog > 20_000) {
      await logFounderPostCheckoutDiagnostics(
        page,
        `periodic (${Math.floor(elapsed / 1000)}s elapsed, no premium_checkout_completed yet)`,
      );
      lastPeriodicLog = Date.now();
    }
    if (budgetMs - elapsed < 3_000 && !loggedSub3s) {
      await logFounderPostCheckoutDiagnostics(page, "sub-3s to founder post-checkout budget");
      loggedSub3s = true;
    }
    const hasRow = await page.evaluate(() => {
      const r = localStorage.getItem("lawdog_paid_funnel_events_v1");
      if (!r) return false;
      try {
        const rows = JSON.parse(r) as { name: string }[];
        return Array.isArray(rows) && rows.some((x) => x && x.name === "premium_checkout_completed");
      } catch {
        return false;
      }
    });
    if (hasRow) {
      // eslint-disable-next-line no-console
      console.log("[founder-harness] terminal: premium_checkout_completed in lawdog_paid_funnel_events_v1");
      return { hasCheckoutRow: true, uiGateOnly: false, disabledProContinue: false };
    }
    const adv = await readPostCheckoutAdvanced(page);
    if (adv.processingOverlay) {
      await page.waitForTimeout(450);
      // eslint-disable-next-line no-continue
      continue;
    }
    const hasRetry = adv.retryProVisible;
    const gateCopy = adv.gateTextVisible;
    if (hasRetry || gateCopy) {
      // eslint-disable-next-line no-console
      console.log("[founder-harness] terminal: truthful gate / Retry (no checkout row required)", {
        hasRetry,
        gateTextVisible: gateCopy,
      });
      return { hasCheckoutRow: false, uiGateOnly: true, disabledProContinue: false };
    }
    const cont = page.getByRole("button", { name: /continue to (recipient|reviewer|signer) setup/i });
    if (await cont.isVisible().catch(() => false)) {
      const dis = await cont.isDisabled().catch(() => false);
      if (dis) {
        // eslint-disable-next-line no-console
        console.log("[founder-harness] terminal: disabled Pro continue (truth-gate) without funnel checkout row yet", {
          primary: adv.primaryCtaText,
        });
        return { hasCheckoutRow: false, uiGateOnly: true, disabledProContinue: true };
      }
    }
    await page.waitForTimeout(450);
  }
  await logFounderPostCheckoutDiagnostics(page, "TIMEOUT before founder post-checkout terminal");
  throw new Error(
    "founder-harness: post-checkout budget exhausted: no premium_checkout_completed, no gate UI, and not stuck in processing. See [founder-harness] JSON logs above.",
  );
}

async function readPostCheckoutAdvanced(page: Page) {
  return page.evaluate(() => {
    const key = "lawdog_paid_funnel_events_v1";
    const raw = localStorage.getItem(key);
    const lawdog = localStorage.getItem("lawdog_session_id");
    let rows: FunnelRow[] = [];
    try {
      if (raw) {
        const parsed = JSON.parse(raw) as FunnelRow[];
        rows = Array.isArray(parsed) ? [...parsed].sort((a, b) => a.ts - b.ts) : [];
      }
    } catch {
      /* ignore */
    }
    const body = document.body?.innerText || "";
    const m = body.match(/Render source:\s*([^\n|]+)/i);
    const tEl = document.querySelector('article[aria-label="Agreement document preview"] h1, main h1');
    const documentTitle = (tEl as HTMLElement | null)?.textContent?.trim().slice(0, 200) || "—";
    const candidates = Array.from(document.querySelectorAll("button")).filter(
      (b) => (b as HTMLElement).offsetParent !== null && (b as HTMLElement).offsetWidth > 0,
    );
    const priority = candidates.find((b) =>
      /continue to (recipient|reviewer|signer) setup|retry pro draft|send with lawdog pro/i.test(b.textContent || ""),
    );
    const primary = priority || candidates[0] || null;
    const pText = primary
      ? (primary.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200)
      : "—";
    const pDis = primary ? (primary as HTMLButtonElement).disabled : false;
    return {
      url: typeof window !== "undefined" ? window.location.href : "",
      lawdog_session_id: lawdog,
      lawdog_paid_funnel_key: key,
      funnelJson: rows,
      primaryCtaText: pText,
      primaryCtaDisabled: pDis,
      allVisibleCtaLabelSample: candidates
        .slice(0, 8)
        .map((b) => (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80))
        .filter(Boolean),
      retryProVisible: /retry pro draft/i.test(body) && Array.from(document.querySelectorAll("button")).some(
        (b) => /retry pro draft/i.test(b.textContent || "") && (b as HTMLElement).offsetParent !== null,
      ),
      gateTextVisible: /we couldn.t finish|need a few more details|details to complete|couldn.t finish the pro agreement|add the missing details/i.test(
        body,
      ),
      processingOverlay: Boolean(
        (document.getElementById("claw-premium-processing-title") as HTMLElement | null)?.offsetParent,
      ),
      devRenderLine: m?.[1]?.trim() || "",
      documentTitle,
      gateTextSnippet: body
        .split("\n")
        .map((l) => l.trim())
        .find((l) => /need|retry|details|pro agreement|vesting|double-check|couldn.t finish/i.test(l) && l.length < 200)
        ?.slice(0, 200) || "—",
    };
  });
}

async function readPostCheckoutDiagnostic(page: Page) {
  return page.evaluate(() => {
    const lawdog = localStorage.getItem("lawdog_session_id");
    const raw = localStorage.getItem("lawdog_paid_funnel_events_v1");
    let checkout: Record<string, unknown> | null = null;
    try {
        if (raw) {
        const rows = JSON.parse(raw) as { name: string; ts: number; agreement_intent_id?: string; premium_generation_outcome?: string; render_source?: string; session_id?: string }[];
        if (Array.isArray(rows)) {
          const c = rows
            .filter((r) => r.name === "premium_checkout_completed")
            .sort((a, b) => a.ts - b.ts);
          if (c.length) checkout = c[c.length - 1] as unknown as Record<string, unknown>;
        }
      }
    } catch {
      /* ignore */
    }
    const body = document.body?.innerText || "";
    const m = body.match(/Render source:\s*([^\n|]+)/i);
    const devRender = m?.[1]?.trim() || "";
    const tEl = document.querySelector('article[aria-label="Agreement document preview"] h1, [data-document-root] h1, main h1');
    const documentTitle = (tEl as HTMLElement | null)?.textContent?.trim() || body.match(/^\s*(AGREEMENT|Agreement)\b/m)?.[0] || "—";
    const continueToReviewer = !!Array.from(document.querySelectorAll("button")).find(
      (b) => /continue to (recipient|reviewer) setup/i.test(b.textContent || "") && b.offsetParent !== null,
    );
    return { lawdog_session_id: lawdog, checkout, devRenderLine: devRender, documentTitle, continueToReviewerVisible: continueToReviewer };
  });
}

/**
 * Polls funnel after `premium_checkout_completed` exists. Passes if pipeline render is not an imposer,
 * or if outcome is `needs_details` / `rejected_paid_corpus`, or Retry/needs-details UI is up.
 * If imposer + no gate for `POST_CHECKOUT_RECONCILE_BUDGET_MS`, throws (no infinite wait on live preview).
 */
async function assertPostCheckoutPipelineReconciledOrThrow(page: Page) {
  const end = Date.now() + POST_CHECKOUT_RECONCILE_BUDGET_MS;
  while (Date.now() < end) {
    const d = await readPostCheckoutDiagnostic(page);
    const row = d.checkout as
      | {
          session_id?: string;
          agreement_intent_id?: string;
          render_source?: string;
          premium_generation_outcome?: string;
        }
      | null;
    if (!row) {
      await page.waitForTimeout(400);
      // eslint-disable-next-line no-continue
      continue;
    }
    const rs = row?.render_source;
    const out = row?.premium_generation_outcome;
    const o = (out || "").trim();
    const r = (rs || "").trim();
    if (o === "needs_details" || r === "rejected_paid_corpus") {
      // eslint-disable-next-line no-console
      console.log("[harness] post-checkout needs-details / rejected (funnel truth)", { render_source: r || "—", out: o || "—" });
      return;
    }
    if (r && r !== "unknown" && !isImposerPipelineRender(r)) {
      // eslint-disable-next-line no-console
      console.log("[harness] post-checkout non-imposer render_source", { render_source: r, out: o || "—" });
      return;
    }
    const hasRetry = await page.getByRole("button", { name: /retry pro draft/i }).isVisible().catch(() => false);
    const proGateAmber = await page
      .getByText(/we couldn.t finish|need a few more details|details to complete this agreement|retry pro draft/i)
      .first()
      .isVisible()
      .catch(() => false);
    const stillProcessing = await page.locator("#claw-premium-processing-title").isVisible().catch(() => false);
    if (hasRetry || proGateAmber) {
      // eslint-disable-next-line no-console
      console.log("[harness] post-checkout gate/Retry (truthful non–Pro-success path visible)", { hasRetry, proGateAmber });
      return;
    }
    if (stillProcessing) {
      /* still applying; do not treat imposer in funnel yet */
    } else if (isImposerPipelineRender(r)) {
      /* bad pipeline source without gate — keep polling until budget */
    } else if (!r || r === "unknown") {
      /* row not yet stamped */
    }
    await page.waitForTimeout(1_000);
  }
  const d = await readPostCheckoutDiagnostic(page);
  const ex = new Error(
    [
      "paid-funnel-qa: post-checkout stuck: funnel still imposer (live preview / shell) without gate after budget.",
      `session_id=${(d.checkout as { session_id?: string } | null)?.session_id || d.lawdog_session_id}`,
      `agreement_intent_id=${(d.checkout as { agreement_intent_id?: string } | null)?.agreement_intent_id || "—"}`,
      `premium_generation_outcome=${(d.checkout as { premium_generation_outcome?: string } | null)?.premium_generation_outcome || "—"}`,
      `render_source=${(d.checkout as { render_source?: string } | null)?.render_source || "—"}`,
      `dev_Rend_line=${d.devRenderLine || "—"}`,
      `documentTitle=${d.documentTitle}`,
    ].join(" | "),
  );
  // eslint-disable-next-line no-console
  console.error(ex.message, JSON.stringify(d, null, 2));
  throw ex;
}

/** Through pay & return, gap / use defaults, optional “finalizing” (non-blocking for founder). */
async function runCreateThroughCheckoutReturn(page: Page, prompt: string) {
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  const mainTextbox = page.getByRole("textbox").first();
  await mainTextbox.waitFor({ state: "visible", timeout: 30_000 });
  await mainTextbox.fill(prompt);
  const createOrReview = page.getByRole("button", { name: /create draft|review draft|draft now/i });
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
  await gapDialog.waitFor({ state: "visible", timeout: 120_000 }).catch(() => {});
  if (await gapDialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^use defaults$/i }).click();
  }
  await page
    .getByRole("heading", { name: /finalizing your complete agreement/i })
    .waitFor({ state: "visible", timeout: 180_000 })
    .catch(() => {});
}

/** Logo / design: poll funnel for `premium_checkout_completed`, then fail fast if imposer + no gate. */
async function runProUpToRecipients(page: Page, _prompt: string) {
  await runCreateThroughCheckoutReturn(page, _prompt);
  await waitForPremiumCheckoutCompletedInStorage(page, CHECKOUT_EMIT_BUDGET_MS);
  await assertPostCheckoutPipelineReconciledOrThrow(page);
  const lastCheckout = await page.evaluate(() => {
    const raw = localStorage.getItem("lawdog_paid_funnel_events_v1");
    if (!raw) return null;
    try {
      const rows = JSON.parse(raw) as FunnelRow[];
      const c = rows.filter((r) => r?.name === "premium_checkout_completed").sort((a, b) => a.ts - b.ts);
      return c[c.length - 1] ?? null;
    } catch {
      return null;
    }
  });
  // eslint-disable-next-line no-console
  console.log("[TEST1] post-checkout terminal row:", lastCheckout);

  const continueRecipients = page.getByRole("button", { name: /continue to (recipient|reviewer) setup/i });
  const continueVisible = await continueRecipients.isVisible().catch(() => false);
  const continueEnabled = continueVisible && (await continueRecipients.isEnabled().catch(() => false));
  if (continueEnabled) {
    await continueRecipients.click();
    const recipientSend = page.getByRole("region", { name: /send agreement/i });
    const r1 = page.getByLabel(/recipient 1 name/i);
    await expect(recipientSend.or(r1).first()).toBeVisible({ timeout: 60_000 });
  } else if (continueVisible) {
    // eslint-disable-next-line no-console
    console.log("[TEST1] truthful gate terminal: continue is visible but disabled; skip click");
  }
}

/**
 * Founder: do not require only `premium_checkout_completed` (90s blank wait). Reconcile when funnel has checkout row.
 */
async function runFounderProIntentPath(page: Page) {
  await runCreateThroughCheckoutReturn(page, "Two founders 60/40 vesting");

  const term = await waitForFounderPostCheckoutTerminalState(page, CHECKOUT_EMIT_BUDGET_MS);
  (page as Page & { __claw_founderTerminal?: FounderPostCheckoutTerminal }).__claw_founderTerminal = term;
  if (term.hasCheckoutRow) {
    await assertPostCheckoutPipelineReconciledOrThrow(page);
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "[harness] founder: truthful terminal without premium_checkout_completed in storage (gate-only path); skip reconcile",
    );
  }
  // Allow trailing funnel events to flush.
  await page.waitForTimeout(1500);
  const lawdogGreenBanner = page
    .getByRole("status", { name: "LawDog Pro unlocked" })
    .or(page.getByLabel("LawDog Pro unlocked", { exact: true }));
  const greenSuccessBannerVisible = await lawdogGreenBanner.isVisible().catch(() => false);
  (page as Page & { __claw_founderGreenBanner?: boolean }).__claw_founderGreenBanner = greenSuccessBannerVisible;
}

test.describe.configure({
  mode: "serial",
  timeout: Math.max(TEST_PER_SPEC_MS, TEST2_TIMEOUT_MS) + 20_000,
});

test("QA intent attribution — logo / design (Test 1)", async ({ page }) => {
  test.setTimeout(TEST_PER_SPEC_MS + 20_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("claw_org_id", "local-org");
      localStorage.setItem("claw_dev_access_tier", "free");
    } catch {
      /* ignore */
    }
  });

  const prompt = "Need a logo contract for $1,500 with 2 revisions";
  await clearFunnelAndStorage(page);
  await runProUpToRecipients(page, prompt);
  const continueRecipients = page.getByRole("button", { name: /continue to (recipient|reviewer) setup/i });
  const continueVisible = await continueRecipients.isVisible().catch(() => false);
  const continueEnabled = continueVisible && (await continueRecipients.isEnabled().catch(() => false));
  const greenBannerVisible = await page
    .getByRole("status", { name: "LawDog Pro unlocked" })
    .or(page.getByLabel("LawDog Pro unlocked", { exact: true }))
    .isVisible()
    .catch(() => false);
  await page.goto("/app/ops/paid-funnel", { waitUntil: "domcontentloaded" });
  const report = await readFunnelReport(page);

  const sids = new Set(report.rows.map((r) => r.session_id));
  const intents = report.rows.map((r) => r.agreement_intent_id ?? "<missing>");
  const unknowns = report.rows.filter((r) => !r.agreement_intent_id || r.agreement_intent_id === "custom_unknown");
  const hadEarlyUnknown = intents.includes("custom_unknown");
  const allNowDesign = report.rows.every(
    (r) => r.agreement_intent_id && r.agreement_intent_id === "design_creative",
  );

  const coRows = report.rows
    .filter((r) => r.name === "premium_checkout_completed")
    .sort((a, b) => a.ts - b.ts);
  const lastCo = coRows[coRows.length - 1];
  const noImposerFinal =
    !lastCo ||
    !isImposerPipelineRender(lastCo.render_source) ||
    (lastCo.premium_generation_outcome || "").trim() === "needs_details";
  const finalOutcome = (lastCo?.premium_generation_outcome || "").trim();
  const finalRender = (lastCo?.render_source || "").trim();
  const isFinishedServerRender = /server_full_draft|server_full_draft_retry|server_repair_draft|server_full_document_text|server_repair_document_text|snapshot_server/.test(
    finalRender,
  );
  const isBlockedRender =
    finalRender === "live_generated_preview" ||
    finalRender === "fallback_preview" ||
    finalRender === "legacy_snapshot" ||
    finalRender === "rejected_paid_corpus";
  const isSuccessPathA = finalOutcome === "ok" && isFinishedServerRender;
  const isTruthGatePathB =
    finalOutcome === "needs_details" &&
    ((lastCo?.funnel_block_reason || "").trim() === "premium_pro_truth_gate" || isBlockedRender);

  // eslint-disable-next-line no-console
  console.log(
    "\n[TEST1] session_ids:",
    sids.size,
    [...sids],
    "\n[TEST1] agreement_intent_id by row (time order):",
    report.rows.map((r) => ({
      name: r.name,
      id: r.agreement_intent_id,
      render: r.render_source,
      out: r.premium_generation_outcome,
    })),
  );
  // eslint-disable-next-line no-console
  console.log("[TEST1] backfill signal (had any custom_unknown, all rows now design_creative):", {
    hadEarlyUnknown,
    allNowDesign,
    unknownCount: unknowns.length,
  });

  expect(report.rowCount, "rows captured").toBeGreaterThan(0);
  expect(sids.size, "single session_id").toBe(1);
  expect(unknowns.length, "no custom_unknown on any row (logo prompt)").toBe(0);
  expect(allNowDesign, "all rows design_creative for logo contract prompt").toBe(true);
  const checkout = coRows;
  expect(checkout.length, "premium_checkout_completed present").toBeGreaterThan(0);
  expect(isSuccessPathA || isTruthGatePathB, "Test1 must end in success path A or truthful gate path B").toBe(true);
  if (isTruthGatePathB) {
    expect(greenBannerVisible, "truth-gated path must not show green success banner").toBe(false);
    expect(continueVisible, "truth-gated path should still show continue affordance").toBe(true);
    expect(continueEnabled, "truth-gated path must keep continue disabled").toBe(false);
  }
  for (const r of report.rows) {
    if (["premium_checkout_completed", "premium_success_banner_seen", "recipient_setup_opened", "agreement_sent"].includes(r.name)) {
      const rs = r.render_source || "";
      const okish =
        /server_full_draft|server_full_draft_retry|snapshot_server/.test(rs) ||
        rs === "unknown" ||
        (r.name === "premium_checkout_completed" && (r.premium_generation_outcome || "").trim() === "needs_details");
      expect(okish, `row ${r.name} render_source: ${rs}`).toBe(true);
    }
  }
  const finalCheckout = lastCo!;
  expect(
    /server_full_draft|server_full_draft_retry|snapshot_server/.test(finalCheckout.render_source || "") ||
      finalCheckout.render_source === "unknown" ||
      (finalCheckout.premium_generation_outcome || "").trim() === "needs_details",
  ).toBe(true);
  expect(
    noImposerFinal,
    "final premium_checkout_completed must not be imposer-only without needs_details (see funnel truth revision row)",
  ).toBe(true);
});

test("QA intent attribution — two founders 60/40 (Test 2, founder harness)", async ({ page }) => {
  test.setTimeout(TEST2_TIMEOUT_MS + 20_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("claw_org_id", "local-org");
      localStorage.setItem("claw_dev_access_tier", "free");
    } catch {
      /* ignore */
    }
  });

  await clearFunnelAndStorage(page);
  await runFounderProIntentPath(page);
  const ft = (page as Page & { __claw_founderTerminal?: FounderPostCheckoutTerminal }).__claw_founderTerminal;
  const greenFromPage = (page as Page & { __claw_founderGreenBanner?: boolean }).__claw_founderGreenBanner ?? false;
  await page.goto("/app/ops/paid-funnel", { waitUntil: "domcontentloaded" });
  const report = await readFunnelReport(page);

  const sids = new Set(report.rows.map((r) => r.session_id).filter(Boolean));
  const sid = [...sids][0] ?? "";
  const bySession = sid ? report.rows.filter((r) => r.session_id === sid) : report.rows;
  const unknowns = bySession.filter(
    (r) => r.agreement_intent_id === "custom_unknown" || (r.name !== "free_draft_generated" && !r.agreement_intent_id),
  );
  const coCompleted = bySession
    .filter((r) => r.name === "premium_checkout_completed")
    .sort((a, b) => a.ts - b.ts);
  const checkoutRow = coCompleted[coCompleted.length - 1];
  const firstCheckoutTs = coCompleted[0]?.ts ?? 0;
  const tOpened = bySession.find((r) => r.name === "premium_checkout_opened")?.ts;
  const postOpenBaseline = firstCheckoutTs || tOpened || 0;

  const postCheckoutProImposter = bySession.filter((r) => {
    if (!postOpenBaseline || r.ts < postOpenBaseline) return false;
    const o = (r.premium_generation_outcome || "").trim();
    if (o === "needs_details") return false;
    const rs = r.render_source || "";
    return (
      rs === "live_generated_preview" ||
      (rs === "fallback_preview" && r.name !== "free_draft_generated") ||
      rs === "legacy_snapshot"
    );
  });

  // eslint-disable-next-line no-console
  console.log("\n========== [TEST2] FOUNDER INTENT QA REPORT ==========");
  // eslint-disable-next-line no-console
  console.log("event_rows (time order):", bySession.map((r) => r.name).join(" → "));
  // eslint-disable-next-line no-console
  console.log("session_id(s) (row + lawdog key):", [...sids], "lawdog_session_id:", report.lawdog_session_id);
  // eslint-disable-next-line no-console
  console.log(
    "agreement_intent_id per row:",
    bySession.map((r) => ({ name: r.name, agreement_intent_id: r.agreement_intent_id ?? "—" })),
  );
  // eslint-disable-next-line no-console
  console.log(
    "premium_generation_outcome per row:",
    bySession.map((r) => ({ name: r.name, premium_generation_outcome: r.premium_generation_outcome ?? "—" })),
  );
  // eslint-disable-next-line no-console
  console.log(
    "render_source per row:",
    bySession.map((r) => ({ name: r.name, render_source: r.render_source ?? "—" })),
  );
  // eslint-disable-next-line no-console
  console.log("green success banner (LawDog Pro unlocked):", greenFromPage);
  // eslint-disable-next-line no-console
  console.log("pass_preflight:", {
    rowCount: bySession.length,
    noCustomUnknown: unknowns.length === 0,
    hasCheckout: Boolean(checkoutRow),
    founderTerminal: ft,
    postCheckoutProImposterCount: postCheckoutProImposter.length,
  });

  expect(sids.size, "expected single lawdog session in rows").toBe(1);
  expect(bySession.length, "session rows exist").toBeGreaterThan(0);
  expect(unknowns.length, "no lingering custom_unknown (earlier custom_unknown backfilled to founder)").toBe(0);
  for (const r of bySession) {
    expect(r.agreement_intent_id, r.name).toBe("founder_equity_vesting");
  }

  if (coCompleted.length) {
    expect(
      isAcceptableCheckoutGenerationOutcome(
        checkoutRow!.premium_generation_outcome,
        checkoutRow!.render_source,
      ),
      `checkout outcome/render: out=${checkoutRow!.premium_generation_outcome} render=${checkoutRow!.render_source}`,
    ).toBe(true);
    {
      const r = (checkoutRow!.render_source || "").trim();
      const o = (checkoutRow!.premium_generation_outcome || "").trim();
      if (o === "ok" && (isImposerPipelineRender(r) || r === "live_generated_preview" || r === "fallback_preview")) {
        expect.fail(`[founder-qa] live / fallback as ok is not a valid Pro success: render=${r} out=${o}`);
      }
    }
    expect(
      (() => {
        const r = (checkoutRow!.render_source || "").trim();
        const o = (checkoutRow!.premium_generation_outcome || "").trim();
        return o === "needs_details" || isPostCheckoutTruthRender(r, true);
      })(),
      "last premium_checkout_completed: needs_details or non-imposer server/rejected path",
    ).toBe(true);

    for (const r of bySession) {
      if (firstCheckoutTs > 0 && r.ts >= firstCheckoutTs) {
        const o = (r.premium_generation_outcome || "").trim();
        if (o !== "needs_details") {
          expect(
            isPostCheckoutTruthRender((r.render_source || "").trim(), false),
            `post-checkout row ${r.name} render_source: ${r.render_source ?? "—"}`,
          ).toBe(true);
        }
      }
    }
    expect(postCheckoutProImposter, "no live or fallback as post-open pro-posing imposer (without needs_details)").toEqual([]);
  } else {
    expect(
      Boolean(ft?.uiGateOnly) || Boolean(ft?.disabledProContinue),
      "without premium_checkout_completed, founder flow must have ended in truthful gate/Retry or disabled Pro continue (see [founder-harness] logs if this fails)",
    ).toBe(true);
    expect(
      bySession.some((r) => r.name === "premium_checkout_opened"),
      "expected checkout_opened in funnel for founder session",
    ).toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      "[TEST2] gate-only: intent still founder; premium_checkout_completed optional if UI truth gate before emit was persisted",
    );
  }

  expect(
    bySession.some(
      (r) => r.name === "premium_checkout_opened" || r.name === "premium_checkout_completed",
    ),
  ).toBe(true);
  // All assertions above passed; Playwright marks the spec green.
  // eslint-disable-next-line no-console
  console.log(
    "[TEST2] result: all harness assertions passed (outcome, founder intent, checkout render, post-checkout truth)",
  );
});
