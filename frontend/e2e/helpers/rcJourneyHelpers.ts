/**
 * Narrow RC journey helpers — read current production authority boundaries in browser.
 */
import { expect, type Page } from "@playwright/test";
import { hashPaidProCorpus } from "../../src/components/agreements/paidProSourceOfTruth";

export type PremiumCompletionSnapshotRead = {
  paidProSourceOfTruthHash: string | null;
  acceptedPremiumCanonicalHash: string | null;
  corpusLen: number;
};

/** Read authoritative paid Pro hash + corpus length from claw_premium_completion_snapshot_v1. */
export async function readPremiumCompletionSnapshot(page: Page): Promise<PremiumCompletionSnapshotRead> {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
      if (!raw) return { paidProSourceOfTruthHash: null, acceptedPremiumCanonicalHash: null, corpusLen: 0 };
      const snap = JSON.parse(raw) as {
        paidProSourceOfTruthHash?: string;
        acceptedPremiumCanonicalHash?: string;
        premiumReadonlyPlainText?: string;
        premiumWinningBodyText?: string;
        paidProSourceOfTruthText?: string;
      };
      const corpus =
        snap.paidProSourceOfTruthText ||
        snap.premiumReadonlyPlainText ||
        snap.premiumWinningBodyText ||
        "";
      return {
        paidProSourceOfTruthHash: snap.paidProSourceOfTruthHash?.trim() || null,
        acceptedPremiumCanonicalHash: snap.acceptedPremiumCanonicalHash?.trim() || null,
        corpusLen: corpus.length,
      };
    } catch {
      return { paidProSourceOfTruthHash: null, acceptedPremiumCanonicalHash: null, corpusLen: 0 };
    }
  });
}

/** Dev overlay exposes authoritativeLen when prod shell is active (supported diagnostic). */
export async function readDevAuthoritativeCorpusLen(page: Page): Promise<number> {
  const fromDev = await page.evaluate(() => {
    const text = document.body?.textContent ?? "";
    const auth = text.match(/authoritativeLen:\s*(\d+)/i);
    if (auth) return Number.parseInt(auth[1] ?? "0", 10) || 0;
    const working = text.match(/workingCorpusLen:\s*(\d+)/i);
    return Number.parseInt(working?.[1] ?? "0", 10) || 0;
  });
  const snap = await readPremiumCompletionSnapshot(page);
  // Prefer the larger of overlay vs snapshot — a stale/low overlay must not mask SoT length.
  return Math.max(fromDev > 0 ? fromDev : 0, snap.corpusLen);
}

export function agreementDocumentLocator(page: Page) {
  return page
    .getByLabel("Agreement document")
    .or(page.locator('[aria-label="Agreement document preview"]'))
    .or(page.getByRole("article", { name: "Agreement document preview" }));
}

export type AuthoritativePaidCorpusProof = {
  docText: string;
  snapshot: PremiumCompletionSnapshotRead;
  devAuthoritativeLen: number;
  authoritativeLen: number;
};

/** Assert substantive paid review via dev diagnostic and/or completion snapshot. */
export async function assertAuthoritativePaidReviewDocument(
  page: Page,
  opts?: { minLen?: number },
): Promise<AuthoritativePaidCorpusProof> {
  const minLen = opts?.minLen ?? 8_000;
  await expect
    .poll(async () => readDevAuthoritativeCorpusLen(page), { timeout: 90_000 })
    .toBeGreaterThan(minLen);

  const devAuthoritativeLen = await readDevAuthoritativeCorpusLen(page);
  const snapshot = await readPremiumCompletionSnapshot(page);
  const docText = ((await agreementDocumentLocator(page).first().textContent({ timeout: 2_000 }).catch(() => "")) || "").trim();
  const authoritativeLen = Math.max(snapshot.corpusLen, devAuthoritativeLen, docText.length);

  expect(authoritativeLen, "authoritative paid corpus length").toBeGreaterThan(minLen);

  return { docText, snapshot, devAuthoritativeLen, authoritativeLen };
}

export async function readAuthoritativeCorpusText(page: Page): Promise<string> {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
      if (raw) {
        const snap = JSON.parse(raw) as {
          paidProSourceOfTruthText?: string;
          acceptedPremiumCanonicalText?: string;
          premiumReadonlyPlainText?: string;
          premiumWinningBodyText?: string;
        };
        const fromSnap =
          snap.paidProSourceOfTruthText ||
          snap.acceptedPremiumCanonicalText ||
          snap.premiumReadonlyPlainText ||
          snap.premiumWinningBodyText ||
          "";
        if (fromSnap.trim().length > 0) return fromSnap;
      }
    } catch {
      /* ignore */
    }
    // Never hash full document.body (nav/CSS chrome). Prefer the agreement document surface.
    const article =
      document.querySelector('[aria-label="Agreement document preview"]') ||
      document.querySelector('[aria-label="Agreement document"]') ||
      document.querySelector('article[aria-label]');
    return (article?.textContent ?? "").trim();
  });
}

async function readSnapshotHashCorpus(page: Page): Promise<{ hash: string; corpusText: string }> {
  const corpusText = await readAuthoritativeCorpusText(page);
  const hash = await page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
      if (!raw) return "";
      const snap = JSON.parse(raw) as {
        paidProSourceOfTruthHash?: string;
        acceptedPremiumCanonicalHash?: string;
      };
      return (snap.paidProSourceOfTruthHash || snap.acceptedPremiumCanonicalHash || "").trim();
    } catch {
      return "";
    }
  });
  return { hash, corpusText };
}

/** Assert snapshot hash matches stored authoritative corpus text (post-acceptance SoT parity). */
export async function assertAuthoritativePaidHashParity(page: Page): Promise<{ hash: string; corpusLen: number }> {
  const data = await readSnapshotHashCorpus(page);
  const corpusText = data.corpusText.trim();
  expect(corpusText.length, "authoritative corpus text in snapshot").toBeGreaterThan(8_000);
  const computed = hashPaidProCorpus(corpusText);
  if (data.hash) {
    expect(data.hash, "snapshot hash matches authoritative corpus text").toBe(computed);
  }
  return { hash: data.hash || computed, corpusLen: corpusText.length };
}

/** Assert exact paid SoT / accepted corpus hash — never treats UI chrome as corpus. */
export async function assertAuthoritativePaidHash(
  page: Page,
  expectedHash: string,
): Promise<void> {
  const data = await readSnapshotHashCorpus(page);
  if (data.hash) {
    expect(data.hash, "snapshot SoT hash").toBe(expectedHash);
    if (data.corpusText.trim().length > 8_000) {
      expect(hashPaidProCorpus(data.corpusText), "snapshot corpus text hash").toBe(expectedHash);
    }
    return;
  }
  const corpus = data.corpusText.trim();
  expect(corpus.length, "authoritative corpus text required for exact hash").toBeGreaterThan(8_000);
  expect(hashPaidProCorpus(corpus), "authoritative corpus hash").toBe(expectedHash);
}

/** Dev overlay diagnostics (supported in DEV simple create). */
export type DevShellDiagnostics = {
  stage: string;
  phase: string;
  displayPhase: string;
  prodShell: string;
  draft: string;
  reason: string;
  authoritativeLen: number;
};

export async function readDevShellDiagnostics(page: Page): Promise<DevShellDiagnostics> {
  const fromDom = await page.evaluate(() => {
    const text = document.body?.textContent ?? "";
    const grab = (re: RegExp) => text.match(re)?.[1]?.trim() ?? "";
    return {
      stage: grab(/stage:\s*(\S+)/i),
      phase: grab(/phase:\s*(\S+)/i),
      displayPhase: grab(/displayPhase:\s*(\S+)/i),
      prodShell: grab(/prodShell:\s*(\S+)/i),
      draft: grab(/draft:\s*(\S+)/i),
      reason: grab(/reason:\s*(\S+)/i),
      authoritativeLen: Number.parseInt(grab(/authoritativeLen:\s*(\d+)/i) || "0", 10) || 0,
    };
  });
  if (fromDom.authoritativeLen > 0 || fromDom.prodShell === "yes" || fromDom.phase === "draft_ready_for_review") {
    return fromDom;
  }
  const snap = await readPremiumCompletionSnapshot(page);
  return {
    ...fromDom,
    authoritativeLen: Math.max(fromDom.authoritativeLen, snap.corpusLen),
  };
}

/** Wait until production review shell reflects accepted corpus (no reload). */
export async function waitForPaidProReviewShellReady(
  page: Page,
  opts?: { timeout?: number },
): Promise<void> {
  const timeout = opts?.timeout ?? 180_000;
  await expect
    .poll(async () => {
      const shell = await readDevShellDiagnostics(page);
      if (shell.authoritativeLen <= 8_000) return false;
      return (
        shell.prodShell === "yes" ||
        (shell.phase === "draft_ready_for_review" && shell.draft === "yes")
      );
    }, { timeout })
    .toBe(true);
}

/** Optional reload fallback when post-generation UI stalls on intake chrome. */
export async function stabilizePaidProReviewShellFromSnapshot(page: Page): Promise<number> {
  const proof = await assertAuthoritativePaidReviewDocument(page);
  try {
    await waitForPaidProReviewShellReady(page, { timeout: 45_000 });
    return proof.authoritativeLen;
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Review your Pro agreement/i })).toBeVisible({
      timeout: 60_000,
    });
    await waitForPaidProReviewShellReady(page, { timeout: 90_000 });
    return Math.max(proof.authoritativeLen, await readDevAuthoritativeCorpusLen(page));
  }
}

const PAID_REVIEW_DECISION_BUTTON =
  /Add signers \/ prepare signature links|Prepare for signing|Prepare signature links|Send for signature|Send for review/i;

/** Wait until review-decision controls or inline signer setup entry is visible. */
export async function waitForPaidProReviewDecisionSurface(
  page: Page,
  opts?: { timeout?: number },
): Promise<void> {
  const timeout = opts?.timeout ?? 180_000;
  await expect
    .poll(async () => {
      const shell = await readDevShellDiagnostics(page);
      const snap = await readPremiumCompletionSnapshot(page);
      const len = Math.max(shell.authoritativeLen, snap.corpusLen);
      if (len <= 8_000) return false;
      if (await isPaidProReviewDecisionShell(page)) return true;
      if (await hasVisiblePaidProReviewDecisionControls(page)) return true;
      const chrome = page.getByTestId("paid-pro-forced-first-review-chrome");
      if (await chrome.isVisible().catch(() => false)) return true;
      const signerEmail = page.locator('[data-claw-recipient-field="r1-email"]');
      return signerEmail.first().isVisible().catch(() => false);
    }, { timeout })
    .toBe(true);
}

/** Choose signature track on first paid review (TEST570 review-decision surface). */
export async function clickPaidProReviewSignatureTrack(page: Page): Promise<void> {
  await page
    .locator("#premium-pro-review-scroll-anchor")
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
  const trackBtn = page
    .getByTestId("paid-pro-forced-prepare-signatures")
    .or(page.getByTestId("simple-pro-send-for-signature"))
    .or(page.getByTestId("pro-review-continue-to-signing"))
    .or(page.getByRole("button", { name: PAID_REVIEW_DECISION_BUTTON }).first());
  await expect(trackBtn.first()).toBeVisible({ timeout: 60_000 });
  await trackBtn.first().scrollIntoViewIfNeeded();
  await trackBtn.first().click();
}

/** True when paid Pro review decision shell is active (signing prep entry surface). */
export async function isPaidProReviewDecisionShell(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = document.body?.textContent ?? "";
    return (
      text.includes("paid_pro_review_decision_on_card") &&
      text.includes("draft_ready_for_review") &&
      text.includes("prodShell: yes")
    );
  });
}

async function hasVisiblePaidProReviewDecisionControls(page: Page): Promise<boolean> {
  await page
    .locator("#premium-pro-review-scroll-anchor")
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
  const trackBtn = page
    .getByTestId("paid-pro-forced-prepare-signatures")
    .or(page.getByTestId("simple-pro-send-for-signature"))
    .or(page.getByTestId("simple-pro-send-for-review"))
    .or(page.getByTestId("pro-review-continue-to-signing"))
    .or(page.getByTestId("paid-pro-forced-first-review-actions"))
    .or(page.getByRole("button", { name: PAID_REVIEW_DECISION_BUTTON }).first());
  return trackBtn.first().isVisible().catch(() => false);
}

const PAID_PRO_SIGNER_FIELDS: Array<[string, string]> = [
  ["r1-name", "Red Mesa Logistics LLC"],
  ["r1-signer-name", "Sarah Mitchell"],
  ["r1-email", "sarah.mitchell@example.com"],
  ["r1-signer-title", "Chief Executive Officer"],
  ["r1-party-address", "100 Market Street, Austin, TX 78701"],
  ["r2-name", "Harbor Peak Automation LLC"],
  ["r2-signer-name", "Michael Torres"],
  ["r2-email", "michael.torres@example.com"],
  ["r2-signer-title", "President"],
  ["r2-party-address", "200 Harbor Drive, Seattle, WA 98101"],
];

/**
 * Fill any surplus Party 3+ slots that the UI keeps (generatedCount can re-assert after remove).
 * VS01 packet readiness rebuilds witness anchors for the full role set without mutating accepted SoT.
 */
async function fillSurplusPaidProSignerPartiesIfVisible(page: Page): Promise<number> {
  let filled = 0;
  for (let idx = 2; idx <= 5; idx += 1) {
    const email = page.locator(`[data-claw-recipient-field="party-${idx}-email"]`);
    if ((await email.count()) === 0) continue;
    const fields: Array<[string, string]> = [
      [`party-${idx}-legal-name`, `Additional Party ${idx + 1} LLC`],
      [`party-${idx}-signer-name`, `Signer ${idx + 1}`],
      [`party-${idx}-email`, `signer${idx + 1}@example.com`],
      [`party-${idx}-signer-title`, "Authorized Signer"],
      [`party-${idx}-address`, `${100 + idx} Extra Lane, Denver, CO 80202`],
    ];
    for (const [key, value] of fields) {
      const input = page.locator(`[data-claw-recipient-field="${key}"]`);
      if ((await input.count()) === 0) continue;
      await expect(input.first()).toBeVisible({ timeout: 15_000 });
      await input.first().scrollIntoViewIfNeeded();
      await input.first().fill(value);
      filled += 1;
    }
  }
  return filled;
}

/** Fill inline paid Pro signer details when data-claw-recipient-field inputs are visible. */
export async function fillPaidProSignerDetailsIfVisible(page: Page): Promise<number> {
  let filled = 0;
  for (const [key, value] of PAID_PRO_SIGNER_FIELDS) {
    const input = page.locator(`[data-claw-recipient-field="${key}"]`);
    if ((await input.count()) === 0) continue;
    await expect(input.first()).toBeVisible({ timeout: 30_000 });
    await input.first().scrollIntoViewIfNeeded();
    await input.first().fill(value);
    filled += 1;
  }
  filled += await fillSurplusPaidProSignerPartiesIfVisible(page);
  return filled;
}

/** Advance paid Pro signer setup through review decision when CTAs are present. */
export async function advancePaidProSignerSetupToReviewDecision(page: Page): Promise<void> {
  const emailField = page.locator('[data-claw-recipient-field="r1-email"]');
  await expect(emailField.first()).toBeVisible({ timeout: 60_000 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const filled = await fillPaidProSignerDetailsIfVisible(page);
    expect(filled).toBeGreaterThanOrEqual(6);
    await expect(emailField.first()).toHaveValue(/@example\.com/i, { timeout: 15_000 });

    // Prefer explicit finalize when present; otherwise sticky Complete advances when enabled.
    const finalizeBtn = page.getByRole("button", {
      name: /Finalize signer details and continue to review decision/i,
    });
    if (await finalizeBtn.isVisible().catch(() => false)) {
      await finalizeBtn.scrollIntoViewIfNeeded();
      await finalizeBtn.click();
    } else {
      const completeBtn = page.getByRole("button", {
        name: /Complete signer details|Finalize signer details and continue/i,
      });
      if (await completeBtn.isVisible().catch(() => false)) {
        await expect(completeBtn).toBeEnabled({ timeout: 15_000 }).catch(() => undefined);
        if (!(await completeBtn.isDisabled().catch(() => true))) {
          await completeBtn.scrollIntoViewIfNeeded();
          await completeBtn.click();
        }
      }
    }

    const prepareVisible = await page
      .getByTestId("paid-pro-forced-prepare-signatures")
      .or(page.getByTestId("simple-pro-send-for-signature"))
      .or(page.getByRole("button", { name: /Prepare for signing/i }))
      .first()
      .isVisible()
      .catch(() => false);
    const completeStill = await page
      .getByRole("button", { name: /^Complete signer details$/i })
      .isVisible()
      .catch(() => false);
    if (prepareVisible || !completeStill) return;
  }
}

/** True when signer details are populated on the paid Pro inline setup surface. */
export async function assertPaidProSignerDetailsPopulated(page: Page): Promise<void> {
  await expect(page.locator('[data-claw-recipient-field="r1-email"]').first()).toHaveValue(
    /sarah\.mitchell@example\.com/i,
    { timeout: 30_000 },
  );
  await expect(page.locator('[data-claw-recipient-field="r2-email"]').first()).toHaveValue(
    /michael\.torres@example\.com/i,
    { timeout: 30_000 },
  );
}

/** Start a fresh agreement via homepage hero (mirrors LaunchHomePage.startDrafting). */
export async function startFreshAgreementFromHomepage(page: Page, prompt: string): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#claw-hero-intake").fill(prompt);
  await page.getByRole("button", { name: "Create free draft" }).click();
  await expect(page).toHaveURL(/\/app\/create/, { timeout: 30_000 });
}
