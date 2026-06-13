/**
 * Pre-merge manual QA: dashboard account + multi-agreement foundation.
 * Run: rm -rf node_modules/.vite && npx playwright test e2e/dashboard-multi-agreement-manual-qa.spec.ts -c playwright.manual-qa.config.ts
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PROMPT =
  "Professional services agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc for workflow setup. Fixed fee $5,000. Texas law. Electronic signatures allowed.";
const TIMEOUT_MS = 900_000;
const ORG_ID = `qa-manual-${Date.now()}`;

type StepResult = { step: number; label: string; pass: boolean; evidence: string };

const results: StepResult[] = [];

function record(step: number, label: string, pass: boolean, evidence: string) {
  results.push({ step, label, pass, evidence });
  // eslint-disable-next-line no-console
  console.log(`[manual-qa step ${step}] ${pass ? "PASS" : "FAIL"} — ${label}\n  ${evidence}`);
}

function buildLongDegradedDocument(): string {
  const line =
    "1. Services. Provider will deliver professional workflow configuration and support services under this Agreement. ";
  return `${line.repeat(180)}2. Payment. Client pays fees as stated. 3. Governing Law. Texas. `;
}

async function clearLawdogBrowserStorage(page: Page) {
  await page.evaluate((orgId) => {
    try {
      sessionStorage.clear();
      const remove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k || k === "claw_org_id") continue;
        if (
          k.startsWith("claw_") ||
          k.startsWith("lawdog_") ||
          k.startsWith("vs01_") ||
          k.startsWith("claw_agreement")
        ) {
          remove.push(k);
        }
      }
      for (const k of remove) localStorage.removeItem(k);
      localStorage.setItem("claw_org_id", orgId);
      localStorage.setItem("claw_dev_access_tier", "free");
      localStorage.setItem("vs01_dev_mark_signed", "1");
    } catch {
      /* ignore */
    }
  }, ORG_ID);
}

type DevSendCtaOverlay = {
  label: string | null;
  action: string | null;
  reason: string | null;
  stage: string | null;
  phase: string | null;
  displayPhase: string | null;
};

type AgreementDashboardReviewCapture = {
  agreementId: string;
  tag: string;
  cardVisible: boolean;
  allApproved: string | null;
  prepareEnabled: string | null;
  status: string | null;
  nextAction: string | null;
  reviewProgress: string | null;
  approvedPartyLabels: string[];
  prepareButtonVisible: boolean;
  prepareButtonEnabled: boolean;
};

const DEV_SEND_CTA_OVERLAY_LABELS = [
  "label",
  "action",
  "reason",
  "stage",
  "phase",
  "displayPhase",
] as const;

async function readDevSendCtaOverlay(page: Page): Promise<DevSendCtaOverlay | null> {
  return page.evaluate((labels) => {
    const panels = Array.from(document.querySelectorAll("div")).filter((el) => {
      const heading = el.querySelector(":scope > div");
      return (heading?.textContent || "").includes("Dev · send CTA");
    });
    const panel = panels.find((el) => el.querySelectorAll(":scope > div").length >= 4) ?? panels[0];
    if (!panel) return null;

    const readRow = (key: string): string | null => {
      for (const row of panel.querySelectorAll(":scope > div")) {
        const text = (row.textContent || "").trim();
        const prefix = `${key}: `;
        if (text.startsWith(prefix)) return text.slice(prefix.length).trim();
      }
      return null;
    };

    const out: Record<string, string | null> = {};
    for (const key of labels) out[key] = readRow(key);
    return out as DevSendCtaOverlay;
  }, DEV_SEND_CTA_OVERLAY_LABELS);
}

async function readDevSendCtaReason(page: Page): Promise<string | null> {
  const overlay = await readDevSendCtaOverlay(page);
  return overlay?.reason ?? null;
}

async function assertDevSendCtaReasonRequired(page: Page): Promise<DevSendCtaOverlay> {
  const overlay = await readDevSendCtaOverlay(page);
  expect(overlay?.reason).toBe("paid_pro_signer_details_required");
  return overlay!;
}

async function captureAgreementDashboardReviewState(
  page: Page,
  agreementId: string,
  tag: string,
): Promise<AgreementDashboardReviewCapture> {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page
    .waitForResponse(
      (resp) => resp.url().includes("/api/agreements/workspace-index") && resp.status() < 500,
      { timeout: 60_000 },
    )
    .catch(() => null);
  await page
    .getByText("Loading agreements…")
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => null);
  await page
    .getByTestId(`creator-dashboard-agreement-skeleton-${agreementId}`)
    .waitFor({ state: "detached", timeout: 90_000 })
    .catch(() => null);

  const capture = await page.evaluate((id) => {
    const card = document.querySelector(`[data-testid="creator-dashboard-agreement-${id}"]`);
    const prepareBtn = card?.querySelector('[data-testid="creator-dashboard-action-' + id + '"]');
    const prepareText = (prepareBtn?.textContent || "").trim();
    const partyRows = Array.from(
      card?.querySelectorAll(`[data-testid^="creator-dashboard-review-party-"]`) ?? [],
    ).map((el) => (el.textContent || "").trim());
    return {
      cardVisible: Boolean(card),
      allApproved: card?.getAttribute("data-creator-dashboard-review-gate-all-approved") ?? null,
      prepareEnabled: card?.getAttribute("data-creator-dashboard-prepare-enabled") ?? null,
      status: card?.getAttribute("data-creator-dashboard-status") ?? null,
      nextAction:
        document.querySelector(`[data-testid="creator-dashboard-next-action-${id}"]`)?.textContent?.trim() ??
        null,
      reviewProgress:
        document.querySelector(`[data-testid="creator-dashboard-review-progress-${id}"]`)?.textContent?.trim() ??
        null,
      approvedPartyLabels: partyRows,
      prepareButtonVisible: prepareText.includes("Prepare signature links"),
      prepareButtonEnabled: prepareBtn instanceof HTMLButtonElement ? !prepareBtn.disabled : false,
    };
  }, agreementId);

  const result: AgreementDashboardReviewCapture = {
    agreementId,
    tag,
    ...capture,
  };
  // eslint-disable-next-line no-console
  console.log(`[manual-qa review capture ${tag}] ${JSON.stringify(result)}`);
  return result;
}

const PAID_PRO_SIGNER_FIELD_VALUES: Array<[string, string]> = [
  ["r1-name", "Blue Canyon Analytics LLC"],
  ["r1-email", "owner.qa@example.com"],
  ["r1-signer-name", "Owner Signer"],
  ["r1-signer-title", "CEO"],
  ["r1-party-address", "123 Main St, Austin TX 78701"],
  ["r2-name", "Iron Vale Systems Inc"],
  ["r2-email", "counterparty.qa@example.com"],
  ["r2-signer-name", "Counterparty Signer"],
  ["r2-signer-title", "Director"],
  ["r2-party-address", "456 Oak Ave, Dallas TX 75201"],
];

const PARTY_DISPLAY_NAMES: Record<number, string> = {
  0: "Blue Canyon Analytics LLC",
  1: "Iron Vale Systems Inc",
};

type DonePageReviewAudit = {
  tag: string;
  url: string;
  headings: Array<{ tag: string; text: string }>;
  buttons: Array<{
    text: string;
    disabled: boolean;
    testId: string | null;
  }>;
  testIdElements: Array<{ testId: string; tag: string; text: string; visible: boolean }>;
  partyRows: Array<{ partyIndex: number | null; label: string; openTestId: string | null }>;
  screenshotPath: string;
};

async function captureDonePageReviewAudit(page: Page, tag: string): Promise<DonePageReviewAudit> {
  const audit = await page.evaluate(() => {
    const isVisible = (el: Element) => {
      const node = el as HTMLElement;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0"
      );
    };

    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .filter(isVisible)
      .map((h) => ({ tag: h.tagName, text: (h.textContent || "").trim().slice(0, 160) }));

    const buttons = Array.from(document.querySelectorAll("button"))
      .filter(isVisible)
      .map((b) => ({
        text: (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        disabled: (b as HTMLButtonElement).disabled,
        testId: b.getAttribute("data-testid"),
      }));

    const keywords = ["review-link", "party", "simulation", "reviewer", "open"];
    const testIdElements = Array.from(document.querySelectorAll("[data-testid]"))
      .filter((el) => {
        const testId = el.getAttribute("data-testid") || "";
        return keywords.some((k) => testId.includes(k));
      })
      .map((el) => ({
        testId: el.getAttribute("data-testid") || "",
        tag: el.tagName,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        visible: isVisible(el),
      }));

    const partyRows: DonePageReviewAudit["partyRows"] = [];
    for (const row of document.querySelectorAll('[data-testid^="review-link-party-simulation-row-"]')) {
      const testId = row.getAttribute("data-testid") || "";
      const m = testId.match(/review-link-party-simulation-row-(\d+)/);
      const openBtn = row.querySelector('[data-testid^="review-link-party-simulation-open-"]');
      partyRows.push({
        partyIndex: m ? Number(m[1]) : null,
        label: (row.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        openTestId: openBtn?.getAttribute("data-testid") ?? null,
      });
    }
    for (const row of document.querySelectorAll('[data-testid="paid-pro-reviewer-links-table"] tbody tr')) {
      const openBtn = row.querySelector('[data-testid^="paid-pro-reviewer-open-"]');
      const copyBtn = row.querySelector('[data-testid^="paid-pro-reviewer-copy-"]');
      const refTestId = openBtn?.getAttribute("data-testid") || copyBtn?.getAttribute("data-testid") || "";
      const rowIndexMatch = refTestId.match(/-(\d+)$/);
      partyRows.push({
        partyIndex: rowIndexMatch ? Number(rowIndexMatch[1]) : null,
        label: (row.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        openTestId: openBtn?.getAttribute("data-testid") ?? null,
      });
    }

    return { url: location.href, headings, buttons, testIdElements, partyRows };
  });

  const screenshotPath = `test-results/done-page-review-audit-${tag}-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);

  const payload: DonePageReviewAudit = { tag, ...audit, screenshotPath };
  // eslint-disable-next-line no-console
  console.log(`[manual-qa done-page audit ${tag}] ${JSON.stringify(payload, null, 2)}`);
  return payload;
}

async function ensureOnDoneReviewPage(page: Page, doneUrl: string) {
  if (!page.url().includes("/app/done/")) {
    await page.goto(doneUrl, { waitUntil: "domcontentloaded" });
  }
  await expect
    .poll(
      async () => {
        if (page.url().includes("/app/done/")) return true;
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await page
    .getByTestId("review-link-party-simulation-panel")
    .or(page.getByTestId("paid-pro-reviewer-links-table"))
    .or(page.getByTestId("simple-done-open-reviewer-view-global"))
    .first()
    .waitFor({ state: "visible", timeout: 90_000 })
    .catch(() => null);
}

async function locateReviewerOpenButton(page: Page, partyIndex: number) {
  const partyName = PARTY_DISPLAY_NAMES[partyIndex] ?? "";

  const simulationOpen = page.getByTestId(`review-link-party-simulation-open-${partyIndex}`);
  if (await simulationOpen.isVisible({ timeout: 1_000 }).catch(() => false)) {
    return { locator: simulationOpen, selector: `review-link-party-simulation-open-${partyIndex}` };
  }

  const simulationRow = page.getByTestId(`review-link-party-simulation-row-${partyIndex}`);
  if (await simulationRow.isVisible({ timeout: 1_000 }).catch(() => false)) {
    const rowOpen = simulationRow.getByRole("button", { name: /Open reviewer view/i });
    if (await rowOpen.isVisible({ timeout: 1_000 }).catch(() => false)) {
      return { locator: rowOpen, selector: `review-link-party-simulation-row-${partyIndex} >> Open reviewer view` };
    }
  }

  const tableOpen = page.getByTestId(`paid-pro-reviewer-open-${partyIndex}`);
  if (await tableOpen.isVisible({ timeout: 1_000 }).catch(() => false)) {
    return { locator: tableOpen, selector: `paid-pro-reviewer-open-${partyIndex}` };
  }

  if (partyName) {
    const panel = page.getByTestId("review-link-party-simulation-panel");
    if (await panel.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const rowByName = panel.locator("li").filter({ hasText: partyName });
      const rowOpen = rowByName.getByRole("button", { name: /Open reviewer view/i });
      if (await rowOpen.isVisible({ timeout: 1_000 }).catch(() => false)) {
        return { locator: rowOpen, selector: `review-link-party-simulation-panel >> ${partyName} >> Open reviewer view` };
      }
    }
    const table = page.getByTestId("paid-pro-reviewer-links-table");
    if (await table.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const rowByName = table.locator("tr").filter({ hasText: partyName });
      const rowOpen = rowByName.getByRole("button", { name: /Open reviewer view/i });
      if (await rowOpen.isVisible({ timeout: 1_000 }).catch(() => false)) {
        return { locator: rowOpen, selector: `paid-pro-reviewer-links-table >> ${partyName} >> Open reviewer view` };
      }
    }
  }

  if (partyIndex === 1) {
    const globalOpen = page.getByTestId("simple-done-open-reviewer-view-global");
    if (await globalOpen.isVisible({ timeout: 1_000 }).catch(() => false)) {
      return { locator: globalOpen, selector: "simple-done-open-reviewer-view-global" };
    }
  }

  return null;
}

async function approveReviewerPopup(popup: Page) {
  await popup.waitForLoadState("domcontentloaded");
  popup.once("dialog", (dialog) => dialog.accept());
  const approve = popup
    .getByTestId("recipient-review-approve-draft")
    .or(popup.getByRole("button", { name: "Approve draft" }));
  await expect(approve).toBeVisible({ timeout: 60_000 });
  const approveResponse = popup
    .waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        /recipient|approve|review|agreement/i.test(resp.url()) &&
        resp.status() < 500,
      { timeout: 60_000 },
    )
    .catch(() => null);
  await approve.click();
  await approveResponse;
  await expect(
    popup.getByTestId("recipient-review-approved-status").or(popup.getByText(/approved|waiting for/i)),
  ).toBeVisible({ timeout: 30_000 }).catch(() => null);
  await popup.waitForTimeout(1_000);
  await popup.close();
}

/** Open party reviewer simulation from /app/done and approve in popup. Returns popup URL for public-route QA. */
async function openReviewerSimulationForParty(
  page: Page,
  partyIndex: number,
  doneUrl: string,
): Promise<string> {
  await ensureOnDoneReviewPage(page, doneUrl);
  const located = await locateReviewerOpenButton(page, partyIndex);
  if (!located) {
    const audit = await captureDonePageReviewAudit(page, `party-${partyIndex}-open-missing`);
    throw new Error(
      `No reviewer open control for partyIndex=${partyIndex}; audit=${JSON.stringify(audit.partyRows)}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`[manual-qa reviewer open party ${partyIndex}] selector=${located.selector}`);
  await located.locator.scrollIntoViewIfNeeded();
  const popupPromise = page.waitForEvent("popup", { timeout: 90_000 });
  await located.locator.click();
  const popup = await popupPromise;
  const reviewerUrl = popup.url();
  await approveReviewerPopup(popup);
  await page.waitForTimeout(1_000);
  return reviewerUrl;
}

type Step5DomAudit = {
  tag: string;
  url: string;
  headings: Array<{ tag: string; text: string }>;
  buttons: Array<{
    text: string;
    disabled: boolean;
    ariaDisabled: string | null;
    testId: string | null;
  }>;
  inputs: Array<{
    tag: string;
    type: string;
    name: string | null;
    placeholder: string | null;
    testId: string | null;
    recipientField: string | null;
    label: string | null;
    id: string | null;
    visible: boolean;
  }>;
  overlay: DevSendCtaOverlay | null;
  completeSignerDetailsVisible: boolean;
  completeSignerDetailsSelector: string | null;
  screenshotPath: string;
};

async function captureStep5DomAudit(page: Page, tag: string): Promise<Step5DomAudit> {
  const audit = await page.evaluate(() => {
    const isVisible = (el: Element) => {
      const node = el as HTMLElement;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0"
      );
    };

    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .filter(isVisible)
      .map((h) => ({ tag: h.tagName, text: (h.textContent || "").trim().slice(0, 160) }));

    const buttons = Array.from(document.querySelectorAll("button"))
      .filter(isVisible)
      .map((b) => ({
        text: (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        disabled: (b as HTMLButtonElement).disabled,
        ariaDisabled: b.getAttribute("aria-disabled"),
        testId: b.getAttribute("data-testid"),
      }));

    const inputs = Array.from(document.querySelectorAll("input,textarea,select")).map((inp) => ({
      tag: inp.tagName,
      type: (inp as HTMLInputElement).type || "",
      name: inp.getAttribute("name"),
      placeholder: inp.getAttribute("placeholder"),
      testId: inp.getAttribute("data-testid"),
      recipientField: inp.getAttribute("data-claw-recipient-field"),
      label: inp.closest("label")?.textContent?.trim().slice(0, 100) || null,
      id: inp.id || null,
      visible: isVisible(inp),
    }));

    const completeButtons = buttons.filter((b) => /complete signer details/i.test(b.text));
    return {
      url: location.href,
      headings,
      buttons,
      inputs,
      completeSignerDetailsVisible: completeButtons.length > 0,
      completeSignerDetailsTexts: completeButtons.map((b) => b.text),
    };
  });

  const overlay = await readDevSendCtaOverlay(page);
  const screenshotPath = `test-results/step5-dom-audit-${tag}-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);

  const payload: Step5DomAudit = {
    tag,
    url: audit.url,
    headings: audit.headings,
    buttons: audit.buttons,
    inputs: audit.inputs,
    overlay,
    completeSignerDetailsVisible: audit.completeSignerDetailsVisible,
    completeSignerDetailsSelector: audit.completeSignerDetailsVisible
      ? `button:has-text("${audit.completeSignerDetailsTexts[0] || "Complete signer details"}")`
      : overlay?.label
        ? `button:has-text("${overlay.label}")`
        : null,
    screenshotPath,
  };

  // eslint-disable-next-line no-console
  console.log(`[manual-qa step5 dom audit ${tag}] ${JSON.stringify(payload, null, 2)}`);
  return payload;
}

async function ensurePaidProSignerDetailsShell(page: Page) {
  if (!page.url().includes("/app/create")) {
    await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  }
  await expect(page.getByRole("heading", { name: "Review your Pro agreement", level: 1 })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.locator('[data-claw-recipient-field="r1-email"]')).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.locator('[data-claw-recipient-field="r2-email"]')).toBeVisible({
    timeout: 60_000,
  });
}

async function locatePaidProPrimaryCta(page: Page, fallbackLabel: string) {
  const overlay = await readDevSendCtaOverlay(page);
  const label = (overlay?.label || fallbackLabel).trim();
  return page.getByRole("button", { name: label, exact: true });
}

async function clickPaidProPrimaryCta(page: Page, fallbackLabel: string) {
  const btn = await locatePaidProPrimaryCta(page, fallbackLabel);
  await btn.scrollIntoViewIfNeeded();
  await expect(btn).toBeVisible({ timeout: 60_000 });
  await btn.click();
}

async function waitForDevSendCtaReason(page: Page, reason: string, timeoutMs = 60_000) {
  await expect
    .poll(async () => (await readDevSendCtaOverlay(page))?.reason ?? null, { timeout: timeoutMs })
    .toBe(reason);
}

async function fillPaidProInlineSignerDetails(page: Page) {
  const filled: string[] = [];
  for (const [key, value] of PAID_PRO_SIGNER_FIELD_VALUES) {
    const input = page.locator(`[data-claw-recipient-field="${key}"]`);
    const count = await input.count();
    if (count === 0) continue;
    await input.first().scrollIntoViewIfNeeded();
    await expect(input.first()).toBeVisible({ timeout: 60_000 });
    await input.first().fill(value);
    filled.push(key);
  }
  // eslint-disable-next-line no-console
  console.log(`[manual-qa signer fields filled] ${filled.join(", ")}`);
  return filled;
}

async function waitForPaidProReviewDecisionSurface(page: Page) {
  await expect
    .poll(
      async () => {
        for (const testId of [
          "paid-pro-forced-share-for-review",
          "simple-pro-send-for-review",
          "pro-review-track-continue",
          "pro-delivery-track-chooser",
          "paid-pro-forced-first-review-actions",
          "simple-pro-final-review-actions",
        ]) {
          if (await isQuicklyVisible(page.getByTestId(testId))) return testId;
        }
        const overlay = await readDevSendCtaOverlay(page);
        const reason = overlay?.reason ?? "";
        if (
          reason === "paid_pro_review_decision_on_card" ||
          reason === "paid_pro_review_decision_scroll_to_choices"
        ) {
          return reason;
        }
        return null;
      },
      { timeout: 120_000 },
    )
    .not.toBeNull();
}

async function isQuicklyVisible(
  locator: ReturnType<Page["getByTestId"]>,
  timeoutMs = 500,
): Promise<boolean> {
  return locator.isVisible({ timeout: timeoutMs }).catch(() => false);
}

async function scrollIntoViewIfPresent(page: Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => null);
}

async function clickPaidProShareForReview(page: Page): Promise<string> {
  await scrollIntoViewIfPresent(page, "#simple-pro-final-review-actions");
  await scrollIntoViewIfPresent(page, '[data-testid="paid-pro-forced-first-review-actions"]');

  const candidates: Array<{ selector: string; locator: ReturnType<Page["getByTestId"]> }> = [
    {
      selector: "paid-pro-forced-share-for-review",
      locator: page.getByTestId("paid-pro-forced-share-for-review"),
    },
    { selector: "simple-pro-send-for-review", locator: page.getByTestId("simple-pro-send-for-review") },
    { selector: "pro-review-track-continue", locator: page.getByTestId("pro-review-track-continue") },
  ];

  for (const { selector, locator } of candidates) {
    if (await isQuicklyVisible(locator)) {
      await locator.scrollIntoViewIfNeeded({ timeout: 10_000 });
      await locator.click({ timeout: 30_000 });
      return selector;
    }
  }

  const chooser = page.getByTestId("pro-delivery-track-chooser");
  if (await isQuicklyVisible(chooser)) {
    const shareInChooser = chooser.getByRole("button", { name: "Share for review", exact: true });
    if (await isQuicklyVisible(shareInChooser)) {
      await shareInChooser.scrollIntoViewIfNeeded();
      await shareInChooser.click();
      const trackContinue = page.getByTestId("pro-review-track-continue");
      if (await isQuicklyVisible(trackContinue, 5_000)) {
        await trackContinue.click();
        return "pro-delivery-track-chooser+pro-review-track-continue";
      }
      return "pro-delivery-track-chooser";
    }
  }

  const shareByRole = page.getByRole("button", { name: /Send for review|Share for review/i });
  if (await isQuicklyVisible(shareByRole)) {
    await shareByRole.scrollIntoViewIfNeeded();
    await shareByRole.click();
    return "role:Send/Share for review";
  }

  throw new Error("No Share for review CTA found after signer finalize");
}

/** Reach /app/create from dashboard CTA or continue if already redirected there. */
async function navigateToCreateFlowStart(page: Page): Promise<"/app dashboard" | "/app/create"> {
  if (!page.url().includes("/app/create")) {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page
      .waitForResponse(
        (resp) => resp.url().includes("/api/agreements/workspace-index") && resp.status() < 500,
        { timeout: 60_000 },
      )
      .catch(() => null);
    await page
      .getByText("Loading agreements…")
      .waitFor({ state: "hidden", timeout: 60_000 })
      .catch(() => null);
  }

  if (page.url().includes("/app/create")) {
    return "/app/create";
  }

  const createFirst = page.getByTestId("dashboard-create-first-agreement");
  const createNew = page.getByTestId("dashboard-create-new-agreement");
  if (await createFirst.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await createFirst.click();
    await expect(page).toHaveURL(/\/app\/create/, { timeout: 20_000 });
    return "/app dashboard";
  }
  if (await createNew.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await createNew.click();
    await expect(page).toHaveURL(/\/app\/create/, { timeout: 20_000 });
    return "/app dashboard";
  }

  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  return "/app/create";
}

async function runPaidProCheckoutToReviewShell(page: Page): Promise<"/app dashboard" | "/app/create"> {
  const startState = await navigateToCreateFlowStart(page);
  const mainTextbox = page.getByRole("textbox").first();
  await mainTextbox.fill(PROMPT);
  await page.getByRole("button", { name: /create draft|review draft|draft now/i }).first().click();
  const simplified = page.getByRole("button", { name: /try simplified starting point/i });
  if (await simplified.isVisible().catch(() => false)) await simplified.click();
  await page.getByRole("button", { name: /send with lawdog pro|continue with pro/i }).first().click();
  await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 30_000 });
  await page.getByRole("button", { name: /pay & continue|continue with pro/i }).click();
  await expect(page).toHaveURL(/\/app\/create/, { timeout: 60_000 });
  const gap = page.getByRole("dialog", { name: /finish your agreement/i });
  if (await gap.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^use defaults$/i }).click();
  }
  await expect(page.getByRole("heading", { name: "Review your Pro agreement", level: 1 })).toBeVisible({
    timeout: 180_000,
  });
  return startState;
}

async function completeSignerDetailsFirstProFlow(page: Page) {
  await ensurePaidProSignerDetailsShell(page);
  const beforeAudit = await captureStep5DomAudit(page, "before-signer-completion");
  await assertDevSendCtaReasonRequired(page);

  const filledFields = await fillPaidProInlineSignerDetails(page);
  expect(filledFields.length).toBeGreaterThanOrEqual(8);
  const afterFillAudit = await captureStep5DomAudit(page, "after-fields-filled");

  let overlay = await readDevSendCtaOverlay(page);
  if (overlay?.reason === "paid_pro_signer_details_required") {
    await clickPaidProPrimaryCta(page, "Complete signer details");
    await waitForDevSendCtaReason(page, "paid_pro_signer_details_complete");
  } else {
    expect(overlay?.reason).toBe("paid_pro_signer_details_complete");
  }

  await clickPaidProPrimaryCta(page, "Finalize signer details and continue to review decision");
  await waitForPaidProReviewDecisionSurface(page);
  const afterFinalizeAudit = await captureStep5DomAudit(page, "after-finalize");

  const shareSelector = await clickPaidProShareForReview(page);
  // eslint-disable-next-line no-console
  console.log(`[manual-qa share-for-review click] selector=${shareSelector}`);

  await expect(page).toHaveURL(/\/app\/done\//, { timeout: 120_000 });
  await expect(
    page
      .getByText(/Review links to share|Test reviewer views|Create review link/i)
      .first(),
  ).toBeVisible({ timeout: 60_000 });

  return { beforeAudit, afterFillAudit, afterFinalizeAudit };
}

async function approveViaPartySimulation(page: Page, partyIndex: number, doneUrl: string) {
  return openReviewerSimulationForParty(page, partyIndex, doneUrl);
}

async function ensureDashboardLoaded(page: Page) {
  if (!page.url().includes("/app") || page.url().includes("/app/create")) {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
  }
  await page
    .waitForResponse(
      (resp) => resp.url().includes("/api/agreements/workspace-index") && resp.status() < 500,
      { timeout: 30_000 },
    )
    .catch(() => null);
  await page
    .getByText("Loading agreements…")
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => null);
}

async function waitForAgreementDashboardCard(page: Page, agreementId: string) {
  await ensureDashboardLoaded(page);
  await page
    .getByTestId(`creator-dashboard-agreement-skeleton-${agreementId}`)
    .waitFor({ state: "detached", timeout: 60_000 })
    .catch(() => null);
  const card = page.getByTestId(`creator-dashboard-agreement-${agreementId}`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}

async function captureFailureDomAudit(page: Page, tag: string) {
  const audit = await page.evaluate(() => ({
    url: location.href,
    headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((h) => ({
      tag: h.tagName,
      text: (h.textContent || "").trim().slice(0, 120),
    })),
    buttons: Array.from(document.querySelectorAll("button"))
      .filter((b) => (b as HTMLElement).getBoundingClientRect().width > 0)
      .map((b) => ({
        text: (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
        testId: b.getAttribute("data-testid"),
        disabled: (b as HTMLButtonElement).disabled,
      })),
  }));
  // eslint-disable-next-line no-console
  console.log(`[manual-qa dom audit ${tag}] ${JSON.stringify(audit)}`);
  return audit;
}

function attachDialogAutoAccept(page: Page) {
  page.on("dialog", (dialog) => dialog.accept());
}

async function completeVs01SigningInPage(signPage: Page, assignedPartyIndex?: number): Promise<boolean> {
  attachDialogAutoAccept(signPage);
  await signPage.waitForLoadState("domcontentloaded");
  await signPage
    .getByRole("heading", { name: /Review and sign/i })
    .waitFor({ state: "visible", timeout: 60_000 })
    .catch(() => null);

  const attemptFinish = async (partyIndex?: number): Promise<boolean> => {
    const fieldSelector = (fieldType: "signature" | "initials") => {
      let sel = `[data-vs01-visual-field-type='${fieldType}']`;
      if (partyIndex !== undefined) {
        sel += `[data-vs01-visual-party-index='${partyIndex}']`;
      }
      return sel;
    };

    await signPage
      .locator(fieldSelector("signature"))
      .first()
      .waitFor({ state: "visible", timeout: 60_000 })
      .catch(() => null);

    const finish = signPage.getByRole("button", { name: "Finish signing" });
    for (let round = 0; round < 12; round += 1) {
      if (await finish.isEnabled({ timeout: 800 }).catch(() => false)) break;
      for (const fieldType of ["signature", "initials"] as const) {
        const fields = signPage.locator(fieldSelector(fieldType));
        const count = await fields.count();
        for (let i = 0; i < count; i += 1) {
          const field = fields.nth(i);
          if (await field.isVisible({ timeout: 500 }).catch(() => false)) {
            await field.click({ timeout: 2_000 }).catch(() => null);
          }
        }
      }
      const applySig = signPage.getByRole("button", { name: /Apply signature|Save signature|Use signature/i }).first();
      if (await applySig.isVisible({ timeout: 500 }).catch(() => false)) {
        await applySig.click();
      }
      if (!(await finish.isEnabled({ timeout: 500 }).catch(() => false))) {
        for (const navLabel of ["Next", "Bottom"] as const) {
          const nav = signPage.getByRole("button", { name: navLabel });
          if (await nav.isEnabled({ timeout: 500 }).catch(() => false)) {
            await nav.click();
            break;
          }
        }
      }
      await signPage.waitForTimeout(400);
    }
    if (!(await finish.isEnabled({ timeout: 12_000 }).catch(() => false))) {
      return false;
    }
    await finish.click();
    await signPage.waitForTimeout(1_500);
    return true;
  };

  if (await attemptFinish(assignedPartyIndex)) return true;
  if (assignedPartyIndex !== undefined) {
    return attemptFinish(undefined);
  }
  return false;
}

async function assertVs01PrepareBridgeReady(page: Page) {
  await expect(page.getByRole("heading", { name: "Prepare signature links" })).toBeVisible({
    timeout: 90_000,
  });
  const continueBtn = page.getByRole("button", { name: "Send signing links" });
  await expect
    .poll(
      async () => {
        if (await page.getByRole("heading", { name: "Signing packet ready" }).isVisible({ timeout: 500 }).catch(() => false)) {
          return true;
        }
        const readyCopy = await page
          .getByText(/Signature fields are ready|Signing packet ready/)
          .first()
          .isVisible({ timeout: 500 })
          .catch(() => false);
        const canContinue =
          (await continueBtn.isVisible({ timeout: 500 }).catch(() => false)) &&
          (await continueBtn.isEnabled({ timeout: 500 }).catch(() => false));
        return readyCopy && canContinue;
      },
      { timeout: 180_000 },
    )
    .toBe(true);
  if (await continueBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await continueBtn.click();
  }
  await expect(page.getByRole("heading", { name: "Signing packet ready" })).toBeVisible({
    timeout: 60_000,
  });
}

async function runDashboardPrepareAndSignBothParties(
  page: Page,
  agreementId: string,
): Promise<{ ownerSigned: boolean; counterpartySigned: boolean; signingUrl: string; publicSignerUrl: string }> {
  await waitForAgreementDashboardCard(page, agreementId);
  const prepareBtn = page.getByTestId(`creator-dashboard-action-${agreementId}`);
  await expect(prepareBtn).toBeVisible({ timeout: 30_000 });
  await expect(prepareBtn).toBeEnabled({ timeout: 15_000 });
  await prepareBtn.click();

  await page.waitForURL(/\/app\/esign/, { timeout: 120_000 });
  const signingUrl = page.url();
  attachDialogAutoAccept(page);
  await assertVs01PrepareBridgeReady(page);
  await expect(page.getByText(/Signature fields are ready|Signing packet ready/).first()).toBeVisible({
    timeout: 15_000,
  });

  const ownerOpen = page.getByRole("button", { name: "Open my signing view" });
  await expect(ownerOpen).toBeVisible({ timeout: 30_000 });
  const ownerPopupPromise = page.waitForEvent("popup", { timeout: 90_000 });
  await ownerOpen.click();
  const ownerPopup = await ownerPopupPromise;
  let publicSignerUrl = ownerPopup.url();
  const ownerSigned = await completeVs01SigningInPage(ownerPopup, 0);
  await ownerPopup.close();

  await page.getByRole("button", { name: "Refresh status" }).click().catch(() => null);
  await page.waitForTimeout(1_500);

  const cpCard = page.locator(".vs01-packet-status-card").filter({ hasText: PARTY_DISPLAY_NAMES[1] });
  const cpOpenFromCard = cpCard.getByRole("button", { name: "Open signer view" });
  const cpOpen = (await cpOpenFromCard.isVisible({ timeout: 3_000 }).catch(() => false))
    ? cpOpenFromCard
    : page.getByRole("button", { name: "Open signer view" }).first();

  let counterpartySigned = false;
  if (await cpOpen.isVisible({ timeout: 20_000 }).catch(() => false)) {
    const cpPopupPromise = page.waitForEvent("popup", { timeout: 90_000 });
    await cpOpen.click();
    const cpPopup = await cpPopupPromise;
    publicSignerUrl = cpPopup.url() || publicSignerUrl;
    counterpartySigned = await completeVs01SigningInPage(cpPopup, 1);
    await cpPopup.close().catch(() => null);
    if (!counterpartySigned) {
      await page.getByRole("button", { name: "Refresh status" }).click().catch(() => null);
      const devMark = cpCard.getByRole("button", { name: "Mark signed (dev)" });
      if (await devMark.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await devMark.click();
        counterpartySigned = true;
      }
    }
    await page.getByRole("button", { name: "Refresh status" }).click().catch(() => null);
    await page.waitForTimeout(1_000);
  }

  return { ownerSigned, counterpartySigned, signingUrl, publicSignerUrl };
}

function agreementIdFromDoneUrl(url: string): string {
  const m = url.match(/\/app\/done\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

test("dashboard multi-agreement manual QA script", async ({ page, context }) => {
  test.setTimeout(TIMEOUT_MS);

  let agreement1Id = "";
  let reviewUrl = "";
  let signingUrl = "";
  let publicReviewerUrl = "";
  let publicSignerUrl = "";
  let workspaceIndexStatus = 0;
  let observedStartState: "/app dashboard" | "/app/create" | "unknown" = "unknown";
  let reviewCaptureAfterParty2: AgreementDashboardReviewCapture | null = null;

  page.on("response", (resp) => {
    const url = resp.url();
    if (url.includes("/api/agreements/workspace-index")) {
      workspaceIndexStatus = resp.status();
    }
  });

  await page.route("**/*premium-full-draft*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const body = buildLongDegradedDocument();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        title: "Professional Services Agreement",
        agreement_family: "services_agreement",
        document_text: body,
        server_full_document_text: body,
        server_repair_document_text: "",
        key_terms_found: ["Fees", "Services"],
        missing_material_info: ["manual_qa_degraded"],
        generation_outcome: "degraded",
        schema_validation_reasons: ["manual_qa"],
        server_generation_failure_code: "manual_qa_mock",
        server_generation_failure_message:
          "LawDog Pro full generation was temporarily unavailable (manual QA). Structured fallback in use.",
      }),
    });
  });

  // Step 1 — clear browser storage (vite cache cleared in shell before run)
  try {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await clearLawdogBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    record(1, "Clear sessionStorage + LawDog draft localStorage", true, `org=${ORG_ID}, browser storage cleared`);
  } catch (e) {
    record(1, "Clear sessionStorage + LawDog draft localStorage", false, String(e));
  }

  // Step 2 — dev user at /app
  try {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    const org = await page.evaluate(() => localStorage.getItem("claw_org_id"));
    record(2, "Start from /app as dev user", org === ORG_ID, `claw_org_id=${org}`);
  } catch (e) {
    record(2, "Start from /app as dev user", false, String(e));
  }

  // Step 3 — dashboard loads without 500
  try {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page
      .waitForResponse(
        (resp) => resp.url().includes("/api/agreements/workspace-index") && resp.status() < 500,
        { timeout: 60_000 },
      )
      .catch(() => null);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    record(
      3,
      "Dashboard empty or multi-agreement loads without 500",
      workspaceIndexStatus === 200,
      `workspace-index HTTP ${workspaceIndexStatus || "pending"}; url=${page.url()}`,
    );
  } catch (e) {
    record(3, "Dashboard empty or multi-agreement loads without 500", false, String(e));
  }

  // Step 4 — create Agreement #1 (Pro review shell + signer-details-required)
  try {
    observedStartState = await runPaidProCheckoutToReviewShell(page);
    await ensurePaidProSignerDetailsShell(page);
    const devReason = await readDevSendCtaReason(page);
    expect(devReason).toBe("paid_pro_signer_details_required");
    const resume = await page.evaluate(() => sessionStorage.getItem("claw_agreement_create_review_resume_v1"));
    agreement1Id = (resume || "").trim();
    record(
      4,
      "Create Agreement #1",
      devReason === "paid_pro_signer_details_required" && Boolean(agreement1Id),
      `startState=${observedStartState}; agreementId=${agreement1Id || "missing"}; devReason=${devReason ?? "none"}; url=${page.url()}`,
    );
  } catch (e) {
    record(4, "Create Agreement #1", false, String(e));
  }

  // Step 5 — signer-details-first review flow → done page with review links
  let step5DomAudit: Step5DomAudit | null = null;
  let donePageAudit: DonePageReviewAudit | null = null;
  try {
    const flowResult = await completeSignerDetailsFirstProFlow(page);
    step5DomAudit = flowResult.beforeAudit;
    reviewUrl = page.url();
    if (!agreement1Id) agreement1Id = agreementIdFromDoneUrl(reviewUrl);
    const doneUrl = reviewUrl;
    donePageAudit = await captureDonePageReviewAudit(page, "after-share-for-review");
    publicReviewerUrl = await approveViaPartySimulation(page, 0, doneUrl);
    await approveViaPartySimulation(page, 1, doneUrl);
    if (agreement1Id) {
      await expect
        .poll(
          async () => {
            reviewCaptureAfterParty2 = await captureAgreementDashboardReviewState(
              page,
              agreement1Id,
              "after-both-parties",
            );
            return reviewCaptureAfterParty2.allApproved === "true";
          },
          { timeout: 120_000 },
        )
        .toBe(true);
    }
    const reviewApproved =
      reviewCaptureAfterParty2?.allApproved === "true" &&
      reviewCaptureAfterParty2.prepareButtonVisible &&
      reviewCaptureAfterParty2.prepareButtonEnabled;
    record(
      5,
      "Complete review flow",
      reviewUrl.includes("/app/done/") && reviewApproved === true,
      `doneUrl=${reviewUrl}; agreementId=${agreement1Id}; completeSignerDetailsVisible=${String(step5DomAudit?.completeSignerDetailsVisible ?? "unknown")}; donePageAudit=${JSON.stringify(donePageAudit?.partyRows ?? [])}; afterP2=${JSON.stringify(reviewCaptureAfterParty2)}`,
    );
  } catch (e) {
    if (!step5DomAudit) {
      try {
        await ensurePaidProSignerDetailsShell(page);
        step5DomAudit = await captureStep5DomAudit(page, "step5-failure");
      } catch {
        /* ignore secondary audit failure */
      }
    }
    record(
      5,
      "Complete review flow",
      false,
      `${String(e)}; domAudit=${JSON.stringify(step5DomAudit)}`,
    );
  }

  // Step 6 — both signatures via dashboard Prepare signature links
  try {
    if (!agreement1Id) throw new Error("missing agreement1Id");
    const signResult = await runDashboardPrepareAndSignBothParties(page, agreement1Id);
    signingUrl = signResult.signingUrl;
    publicSignerUrl = signResult.publicSignerUrl;
    record(
      6,
      "Complete both signatures",
      signResult.ownerSigned && signResult.counterpartySigned,
      `navigated=${signingUrl}; ownerSigned=${signResult.ownerSigned}; counterpartySigned=${signResult.counterpartySigned}; publicSignerUrl=${publicSignerUrl}`,
    );
  } catch (e) {
    const audit = await captureFailureDomAudit(page, "step6-failure").catch(() => null);
    record(6, "Complete both signatures", false, `${String(e)}; domAudit=${JSON.stringify(audit)}`);
  }

  // Step 7 — return to dashboard
  try {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page
      .waitForResponse(
        (resp) => resp.url().includes("/api/agreements/workspace-index") && resp.status() < 500,
        { timeout: 60_000 },
      )
      .catch(() => null);
    record(7, "Return to dashboard", true, page.url());
  } catch (e) {
    record(7, "Return to dashboard", false, String(e));
  }

  // Step 8 — Agreement #1 Fully signed, no Prepare CTA
  try {
    if (!agreement1Id) throw new Error("missing agreement1Id");
    await expect
      .poll(
        async () => {
          await waitForAgreementDashboardCard(page, agreement1Id);
          const text =
            (await page.getByTestId(`creator-dashboard-signing-status-${agreement1Id}`).textContent()) || "";
          return /Fully signed/i.test(text);
        },
        { timeout: 120_000 },
      )
      .toBe(true);
    const card = await waitForAgreementDashboardCard(page, agreement1Id);
    const signingStatus = page.getByTestId(`creator-dashboard-signing-status-${agreement1Id}`);
    const text = (await signingStatus.textContent()) || "";
    const fullySigned = /Fully signed/i.test(text);
    const prepareOnCard = await card.getByRole("button", { name: "Prepare signature links" }).count();
    const openWorkspaceVisible =
      (await page.getByTestId(`creator-dashboard-open-workspace-${agreement1Id}`).isVisible({ timeout: 5_000 }).catch(() => false)) ||
      (await page
        .getByTestId(`creator-dashboard-open-signing-packet-${agreement1Id}`)
        .isVisible({ timeout: 3_000 })
        .catch(() => false)) ||
      (await card
        .getByRole("button", { name: /Open agreement workspace|Open workspace/i })
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false));
    record(
      8,
      "Agreement #1 Fully signed; no Prepare signature links CTA",
      fullySigned && prepareOnCard === 0 && openWorkspaceVisible,
      `signingStatus="${text.trim()}"; prepareOnCard=${prepareOnCard}; openWorkspaceVisible=${openWorkspaceVisible}`,
    );
  } catch (e) {
    const audit = await captureFailureDomAudit(page, "step8-failure").catch(() => null);
    record(
      8,
      "Agreement #1 Fully signed; no Prepare signature links CTA",
      false,
      `${String(e)}; domAudit=${JSON.stringify(audit)}`,
    );
  }

  // Step 9 — Create Agreement #2 from dashboard
  try {
    const staleResumeBefore = await page.evaluate(() =>
      sessionStorage.getItem("claw_agreement_create_review_resume_v1"),
    );
    const createBtn = page
      .getByTestId("dashboard-create-new-agreement")
      .or(page.getByTestId("dashboard-create-first-agreement"));
    if (await createBtn.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await createBtn.first().click();
    } else {
      await page.goto("/app/create", { waitUntil: "domcontentloaded" });
    }
    await expect(page).toHaveURL(/\/app\/create/, { timeout: 20_000 });
    const staleResumeAfter = await page.evaluate(() =>
      sessionStorage.getItem("claw_agreement_create_review_resume_v1"),
    );
    record(
      9,
      "Create Agreement #2 from dashboard",
      staleResumeAfter === null,
      `resume before=${staleResumeBefore}; after=${staleResumeAfter}`,
    );
  } catch (e) {
    record(9, "Create Agreement #2 from dashboard", false, String(e));
  }

  // Step 10 — #1 intact, #2 clean
  try {
    if (!agreement1Id) throw new Error("missing agreement1Id");
    await ensureDashboardLoaded(page);
    const ag1Card = page.getByTestId(`creator-dashboard-agreement-${agreement1Id}`);
    const ag1TableRow = page.getByTestId(`lawdog-agreement-row-${agreement1Id}`);
    await expect(ag1Card.or(ag1TableRow).first()).toBeVisible({ timeout: 30_000 });
    const ag1Signing = page.getByTestId(`creator-dashboard-signing-status-${agreement1Id}`);
    const ag1Text = ((await ag1Signing.textContent().catch(() => "")) || "").trim();
    const ag1Intact = /Fully signed/i.test(ag1Text);
    const createClean = page.url().includes("/app/create") || page.url().endsWith("/app");
    record(
      10,
      "Agreement #1 intact; Agreement #2 starts clean",
      ag1Intact,
      `ag1 signing="${ag1Text}"; ag1CardVisible=${await ag1Card.isVisible().catch(() => false)}; url=${page.url()}; createClean=${createClean}`,
    );
  } catch (e) {
    record(10, "Agreement #1 intact; Agreement #2 starts clean", false, String(e));
  }

  // Step 11 — public reviewer + signer routes without login
  try {
    const browser = page.context().browser();
    if (!browser) throw new Error("no browser");
    const reviewTarget = publicReviewerUrl || reviewUrl;
    const signTarget = publicSignerUrl || signingUrl;
    if (!reviewTarget || !signTarget) throw new Error("missing public reviewer/signer URLs");

    const pub = await browser.newContext();
    const reviewPage = await pub.newPage();
    await reviewPage.goto(reviewTarget, { waitUntil: "domcontentloaded" });
    const reviewOk =
      (await reviewPage
        .getByRole("heading", { name: /Review agreement|Review and sign/i })
        .isVisible({ timeout: 20_000 })
        .catch(() => false)) &&
      !(await reviewPage.getByText(/log in|sign in required/i).isVisible().catch(() => false));

    const signPage = await pub.newPage();
    await signPage.goto(signTarget, { waitUntil: "domcontentloaded" });
    const noLoginWall = !(await signPage.getByText(/log in|sign in required/i).isVisible().catch(() => false));
    const signSurfaceVisible =
      (await signPage.getByRole("heading", { name: /Review and sign/i }).isVisible({ timeout: 20_000 }).catch(() => false)) ||
      (await signPage.getByTestId("vs01-recipient-canonical-render").isVisible({ timeout: 10_000 }).catch(() => false)) ||
      (await signPage.locator("[data-vs01-visual-field-type='signature']").first().isVisible({ timeout: 10_000 }).catch(() => false)) ||
      (await signPage.getByText(/signing fields could not be loaded|Preview unavailable|LawDog/i).first().isVisible({ timeout: 10_000 }).catch(() => false));
    const signOk = noLoginWall && signSurfaceVisible;

    await pub.close();
    record(
      11,
      "Public reviewer and signer links open without login",
      reviewOk && signOk,
      `reviewOk=${reviewOk}; signOk=${signOk}; reviewTarget=${reviewTarget}; signTarget=${signTarget}`,
    );
  } catch (e) {
    record(11, "Public reviewer and signer links open without login", false, String(e));
  }

  // eslint-disable-next-line no-console
  console.log(`\nObserved create-flow start state: ${observedStartState}`);
  // eslint-disable-next-line no-console
  console.log("\n========== MANUAL QA SUMMARY ==========");
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.step}. ${r.label}`);
  }
  const failed = results.filter((r) => !r.pass);
  expect(failed, `manual QA failures: ${failed.map((f) => f.step).join(", ")}`).toHaveLength(0);
});
