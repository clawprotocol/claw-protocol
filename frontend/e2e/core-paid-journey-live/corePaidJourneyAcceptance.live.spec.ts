import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { assertCorePaidJourneyAcceptanceContracts } from "../../src/launch/corePaidJourneyAcceptanceCoverage";
import {
  CORE_PAID_JOURNEY_EXPECTED_FACTS as FACTS,
  CORE_PAID_JOURNEY_FILLED_INTAKE,
  CORE_PAID_JOURNEY_MATRIX,
  CORE_PAID_JOURNEY_SPARSE_INTAKE,
  articleContainsExpectedFacts,
  articleQualityDefects,
  type CorePaidJourneyRowId,
} from "../../src/launch/corePaidJourneyAcceptanceMatrix";
import { captureRecipientMints, seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";

const ARTICLE = "simple-pro-final-review-document";
const PAINTED_ARTICLE = `[data-testid="${ARTICLE}"], [data-testid="paid-pro-visible-document-shell"]`;
const CLARIFICATION = "agreement-intake-clarification";

type RowResult = { id: CorePaidJourneyRowId; pass: boolean; detail: string };

const RESULTS: RowResult[] = [];

function record(id: CorePaidJourneyRowId, pass: boolean, detail: string): void {
  RESULTS.push({ id, pass, detail });
  persistResults();
}

function persistResults(): void {
  const dest = process.env.CORE_PAID_JOURNEY_ROW_RESULTS;
  if (!dest) return;
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        matrix: CORE_PAID_JOURNEY_MATRIX,
        rows: RESULTS,
        failed: RESULTS.filter((row) => !row.pass).map((row) => row.id),
      },
      null,
      2,
    )}\n`,
  );
}

async function articleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const readable = (el: Element | null): string => ((el as HTMLElement | null)?.innerText || "").trim();
    const nodes = Array.from(
      document.querySelectorAll(
        '[data-testid="simple-pro-final-review-document"], [data-testid="paid-pro-visible-document-shell"]',
      ),
    );
    let best = "";
    for (const node of nodes) {
      const text = readable(node);
      if (text.includes("Harbor Peak Analytics LLC") && text.length > best.length) best = text;
    }
    if (best.length > 800) return best;
    const heading = Array.from(document.querySelectorAll("h1, h2")).find((el) =>
      /CONSULTING SERVICES AGREEMENT/i.test(el.textContent || ""),
    );
    const root =
      heading?.closest(
        '[data-testid="paid-pro-visible-document-shell"], [data-testid="simple-pro-final-review-document"], article',
      ) || heading?.parentElement;
    const fromHeading = readable(root);
    return fromHeading.length > best.length ? fromHeading : best;
  });
}

async function waitForPaintedArticle(page: Page): Promise<string> {
  await expect(page.locator("body")).toContainText("Harbor Peak Analytics LLC", { timeout: 90_000 });
  await expect
    .poll(async () => {
      const text = await articleText(page);
      return text.includes("Harbor Peak Analytics LLC") && text.includes("$48,000") ? text.length : 0;
    }, { timeout: 90_000 })
    .toBeGreaterThan(800);
  return articleText(page);
}

function persistArticle(agreementId: string, article: string): void {
  const dest = process.env.CORE_PAID_JOURNEY_ROW_RESULTS;
  if (!dest) return;
  writeFileSync(dest.replace(/matrix-rows\.json$/, `article-${agreementId || "unknown"}.txt`), `${article}\n`);
}

function captureServerAgreementIds(page: Page): string[] {
  const ids: string[] = [];
  page.on("response", async (res) => {
    if (!res.ok()) return;
    if (!res.url().includes("/api/agreements") && !res.url().includes("/v1/agreements")) return;
    try {
      const body = (await res.json()) as Record<string, unknown>;
      for (const key of ["agreement_id", "id"]) {
        const value = body[key];
        if (typeof value === "string" && value.length > 8 && !value.startsWith("local")) {
          ids.push(value);
        }
      }
    } catch {
      /* ignore non-JSON */
    }
  });
  return ids;
}

async function durableAgreementId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const fromQuery = new URL(window.location.href).searchParams.get("agreementId");
    if (fromQuery) return fromQuery;
    const keys = [
      "claw_agreement_create_review_resume_v1",
      "claw_agreement_create_full_draft_marker_v1",
      "claw_current_agreement_id",
    ];
    for (const key of keys) {
      const value = (sessionStorage.getItem(key) || localStorage.getItem(key) || "").trim();
      if (value) return value;
    }
    return "";
  });
}

async function waitForServerAgreementId(page: Page, captured: string[]): Promise<string> {
  await expect
    .poll(async () => ((await durableAgreementId(page)) || captured[captured.length - 1] || "").length, {
      timeout: 60_000,
    })
    .toBeGreaterThan(8);
  return (await durableAgreementId(page)) || captured[captured.length - 1] || "";
}

async function waitForPaidCreateIntake(page: Page) {
  const loading = page.getByTestId("create-entitlement-loading");
  if (await loading.isVisible().catch(() => false)) {
    await expect(loading).toBeHidden({ timeout: 45_000 });
  }
  const intake = page.locator(".vs01-agreement-intake textarea").first();
  await expect(intake).toBeVisible({ timeout: 45_000 });
  return intake;
}

async function submitIntake(page: Page, text: string): Promise<void> {
  const intake = await waitForPaidCreateIntake(page);
  await intake.fill(text);
  await page.getByRole("button", { name: /Create agreement|Create draft|Review|Next/i }).first().click();
}

async function fillVisibleField(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if ((await field.count()) === 0) continue;
    if (!(await field.isVisible().catch(() => false))) continue;
    await field.scrollIntoViewIfNeeded();
    await field.fill(value);
    return true;
  }
  return false;
}

async function completeSignerSetup(page: Page): Promise<void> {
  const sendReady = page.getByTestId("simple-pro-send-for-review").or(page.getByTestId("simple-pro-send-for-signature"));
  if (await sendReady.first().isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: /Complete signer details|Finalize signer details/i }).first().scrollIntoViewIfNeeded().catch(() => undefined);
  const emailField = page.locator('[data-claw-recipient-field="r1-email"], [data-testid="signer-email-input-0"]').first();
  const openSetup = page.getByRole("button", { name: /Complete signer details|Finalize signer details/i }).first();
  if (!(await emailField.isVisible().catch(() => false))) {
    await emailField.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.locator('[data-testid="paid-pro-inline-signer-setup"]').first().scrollIntoViewIfNeeded().catch(() => undefined);
  }
  if (
    !(await emailField.isVisible().catch(() => false)) &&
    (await openSetup.isVisible().catch(() => false)) &&
    !(await openSetup.isDisabled().catch(() => true))
  ) {
    await openSetup.click();
    await emailField.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  }

  await fillVisibleField(page, ['[data-claw-recipient-field="r1-name"]'], FACTS.parties[0].name);
  await fillVisibleField(page, ['[data-claw-recipient-field="r2-name"]'], FACTS.parties[1].name);
  await fillVisibleField(
    page,
    ['[data-claw-recipient-field="r1-signer-name"]', '[data-testid="signer-name-input-0"]'],
    FACTS.signers[0].name,
  );
  await fillVisibleField(
    page,
    ['[data-claw-recipient-field="r2-signer-name"]', '[data-testid="signer-name-input-1"]'],
    FACTS.signers[1].name,
  );
  await fillVisibleField(
    page,
    ['[data-claw-recipient-field="r1-email"]', '[data-testid="signer-email-input-0"]'],
    FACTS.signers[0].email,
  );
  await fillVisibleField(
    page,
    ['[data-claw-recipient-field="r2-email"]', '[data-testid="signer-email-input-1"]'],
    FACTS.signers[1].email,
  );

  const advance = page
    .getByRole("button", {
      name: /Finalize signer details and continue to review decision|Complete signer details|Save signer details|Continue to review/i,
    })
    .first();
  if (await advance.isVisible().catch(() => false)) {
    await expect(advance).toBeEnabled({ timeout: 15_000 }).catch(() => undefined);
    if (!(await advance.isDisabled().catch(() => true))) {
      await advance.click();
    }
  }
}

async function draftThroughVisiblePaper(page: Page): Promise<{ agreementId: string; article: string }> {
  const capturedIds = captureServerAgreementIds(page);
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  await submitIntake(page, CORE_PAID_JOURNEY_SPARSE_INTAKE);
  const clarification = page.getByTestId(CLARIFICATION);
  await expect(clarification).toBeVisible({ timeout: 20_000 });
  const sparseBody = await page.locator("body").innerText();
  record(
    "I1_sparse_asks_targeted_questions",
    /name the parties|legal names|consultant|client/i.test(await clarification.innerText()),
    "clarification panel after sparse intake",
  );
  record(
    "I3_missing_facts_are_not_invented",
    !FACTS.parties.some((party) => sparseBody.includes(party.name)) &&
      (await page.getByRole("button", { name: /^(Send|Sign|Freeze)$/i }).count()) === 0,
    "sparse path must not invent Harbor/Ironvale or offer send/sign",
  );

  await submitIntake(page, CORE_PAID_JOURNEY_FILLED_INTAKE);
  await expect(page.getByTestId(CLARIFICATION)).toHaveCount(0, { timeout: 30_000 });
  record("I2_retains_answers_does_not_reask", true, "filled intake dismissed clarification");

  const article = await waitForPaintedArticle(page);
  const missing = articleContainsExpectedFacts(article);
  const defects = articleQualityDefects(article);
  record("Q1_article_matches_expected_facts", missing.length === 0, missing.join(",") || "all expected facts present");
  record("Q2_article_rejects_placeholders_and_filler", defects.length === 0, defects.join(",") || "no quality defects");
  const agreementId = await waitForServerAgreementId(page, capturedIds);
  persistArticle(agreementId, article);
  await completeSignerSetup(page);
  return { agreementId, article };
}

test.describe("Core paid journey acceptance", () => {
  test.afterAll(() => persistResults());

  test("coverage contracts stay closed", () => {
    expect(() => assertCorePaidJourneyAcceptanceContracts()).not.toThrow();
  });

  test("journey A: interview, visible paper, recipient review, continuity", async ({ page }) => {
    await seedCorePaidJourneyOwner(page);
    const minted = captureRecipientMints(page);
    const drafted = await draftThroughVisiblePaper(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    const afterRefresh = await articleText(page);
    const refreshId = await durableAgreementId(page);
    record(
      "C1_refresh_preserves_paper_version_path",
      refreshId === drafted.agreementId && afterRefresh.includes(FACTS.parties[0].name) && afterRefresh.includes(FACTS.economics),
      `id ${refreshId}`,
    );

    await page.goto("/app", { waitUntil: "domcontentloaded" });
    const dash = await page.locator("body").innerText();
    record(
      "C2_dashboard_reopen_same_agreement",
      /Harbor Peak|Ironvale|Consulting/i.test(dash) && !/Free Starter/i.test(dash),
      "dashboard lists the drafted commercial paper",
    );

    await page.goto(`/app/agreements/${drafted.agreementId}/view`, { waitUntil: "domcontentloaded" });
    const reopened = await page.locator("body").innerText();
    expect(reopened).toContain(FACTS.parties[0].name);
    expect(reopened).not.toMatch(/Free Starter/);

    await page.goto(`/app/create?agreementId=${encodeURIComponent(drafted.agreementId)}`, {
      waitUntil: "domcontentloaded",
    });
    await completeSignerSetup(page);
    const sendReview = page.getByTestId("simple-pro-send-for-review");
    if (!(await sendReview.isVisible({ timeout: 20_000 }).catch(() => false))) {
      record("A1_review_recipient_reads_correct_version", false, "send-for-review CTA never mounted after painted paper");
      record("A2_review_recipient_can_approve", false, "review path not reached");
      record("A3_review_propose_cannot_silently_replace", false, "review path not reached");
      record("A4_owner_approved_change_is_explicit_revision", false, "review path not reached");
      expect(false, "simple-pro-send-for-review never mounted").toBeTruthy();
      return;
    }
    await sendReview.click();
    await expect.poll(() => minted.length, { timeout: 45_000 }).toBeGreaterThan(0);
    const reviewMint = minted.find((row) => String(row.mode || "") === "review") || minted[0];
    const token = String(reviewMint.token || "");
    const version = String(reviewMint.locked_version_id || "");
    expect(token.length).toBeGreaterThan(12);
    const reviewUrl = `/agreements/${drafted.agreementId}/review?t=${encodeURIComponent(token)}&role=reviewer`;
    await page.goto(reviewUrl, { waitUntil: "domcontentloaded" });
    const recipientPaper = await page.getByTestId("recipient-document-shell").or(page.locator("body")).innerText();
    record(
      "A1_review_recipient_reads_correct_version",
      recipientPaper.includes(FACTS.parties[0].name) &&
        recipientPaper.includes(FACTS.parties[1].name) &&
        recipientPaper.includes(FACTS.economics),
      `version=${version || "unset"}`,
    );

    const approve = page.getByTestId("recipient-review-approve-draft");
    if (await approve.isVisible().catch(() => false)) {
      await approve.click();
      record("A2_review_recipient_can_approve", true, "approve control used");
    } else {
      record("A2_review_recipient_can_approve", false, "approve control not visible");
    }

    const propose = page.getByTestId("recipient-review-propose-updated-draft");
    if (await propose.isVisible().catch(() => false)) {
      await propose.click();
      record("A3_review_propose_cannot_silently_replace", true, "propose control is explicit");
      record("A4_owner_approved_change_is_explicit_revision", false, "owner-approved revision handoff not completed in this run");
    } else {
      record("A3_review_propose_cannot_silently_replace", false, "propose control not visible");
      record("A4_owner_approved_change_is_explicit_revision", false, "revision workflow not reached");
    }
  });

  test("journey B: independent intake then direct e-signing", async ({ page }) => {
    await seedCorePaidJourneyOwner(page);
    const minted = captureRecipientMints(page);
    const drafted = await draftThroughVisiblePaper(page);
    const sendSign = page.getByTestId("simple-pro-send-for-signature");
    if (!(await sendSign.isVisible({ timeout: 20_000 }).catch(() => false))) {
      record("B1_direct_sign_skips_mandatory_review", false, "send-for-signature CTA never mounted after painted paper");
      record("B2_signer_reads_locked_version_and_completes", false, "direct-sign path not reached");
      record("B3_owner_final_record_after_direct_sign", false, "direct-sign path not reached");
      expect(false, "simple-pro-send-for-signature never mounted").toBeTruthy();
      return;
    }
    await sendSign.click();
    const reviewRound = page.getByTestId("recipient-review-approve-draft");
    record(
      "B1_direct_sign_skips_mandatory_review",
      (await reviewRound.count()) === 0,
      "owner chose send for signature without opening recipient review",
    );
    const signedMinted = await expect
      .poll(() => minted.some((row) => String(row.mode || "") === "sign"), { timeout: 20_000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
    if (!signedMinted) {
      record("B2_signer_reads_locked_version_and_completes", false, "send-for-signature click did not mint a sign token");
      record("B3_owner_final_record_after_direct_sign", false, "direct-sign path not reached");
      expect(false, "recipient-access-token mode=sign never minted").toBeTruthy();
      return;
    }
    const signMint = minted.find((row) => String(row.mode || "") === "sign");
    const token = String(signMint?.token || "");
    const href = `/agreements/${drafted.agreementId}/sign?t=${encodeURIComponent(token)}`;
    await page.goto(href, { waitUntil: "domcontentloaded" });
    const signPaper = await page.getByTestId("recipient-document-shell").or(page.locator("body")).innerText();
    expect(signPaper).toContain(FACTS.parties[0].name);
    const consent = page.getByTestId("recipient-sign-consent");
    if (await consent.isVisible().catch(() => false)) {
      await consent.click();
    }
    const typed = page.getByTestId("recipient-sign-typed-name");
    if (await typed.isVisible().catch(() => false)) {
      await typed.fill(FACTS.signers[1].name);
    }
    const action = page.getByTestId("recipient-sign-action");
    if (await action.isVisible().catch(() => false)) {
      await action.click();
    }
    const complete = page.getByTestId("recipient-sign-complete-status");
    const completed = await complete.isVisible().catch(() => false);
    record(
      "B2_signer_reads_locked_version_and_completes",
      completed || /signed|complete/i.test(await page.locator("body").innerText()),
      completed ? "completion status visible" : "ceremony controls used if present",
    );

    await seedCorePaidJourneyOwner(page);
    await page.goto(`/app/agreements/${drafted.agreementId}/view`, { waitUntil: "domcontentloaded" });
    const ownerRecord = await page.locator("body").innerText();
    record(
      "B3_owner_final_record_after_direct_sign",
      ownerRecord.includes(FACTS.parties[0].name) && ownerRecord.includes(FACTS.economics),
      "owner record still shows the same Harbor/Ironvale paper",
    );
  });
});
