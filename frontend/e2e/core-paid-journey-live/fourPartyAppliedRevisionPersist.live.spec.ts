/**
 * Local server-backed four-party applied-revision persistence.
 * Snapshot-create, authorized GET, visible paper, and fresh-browser reopen use
 * the live local API. Generation intercept is not a substitute for persist.
 */
import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { TEST487_FOUR_PARTY } from "../../src/components/agreements/paidProTest487ProductionValidationFixtures";
import { RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED } from "../../src/launch/fixtures/releaseScopeMultiparty.sanitized";
import { RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA } from "../../src/launch/releaseScopeQualificationCampaign";
import {
  captureRecipientMints,
  loadCorePaidJourneyRuntime,
  seedCorePaidJourneyOwner,
  type RecipientTokenEvent,
} from "./corePaidJourneyLiveAuth";
import {
  articleText,
  assertFourPartyCustomerMeaning,
  configuredLiveApiBase,
  fetchOwnerCanonicalSnapshot,
  fourPartyPaperReady as fourPartyPaperReadyCheck,
  installQualityEvalPageGuards,
  QUALITY_EVAL_ALL_CASES,
} from "./qualityEvalJourney";

const enabled = Boolean(process.env.CORE_PAID_JOURNEY_LIVE_API && process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN);
test.skip(!enabled, "Local official API/origin required; no provider calls");

const scenario = QUALITY_EVAL_ALL_CASES.find((row) => row.id === "four_party")!;

function fourPartyFirstDraft(): string {
  const filler = Array.from({ length: 36 }, (_, i) => {
    return `Section ${i + 5}. Operative commercial paragraph ${i + 1} continues the same four-party precision-medicine platform work.`;
  }).join("\n");
  return `${RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED}\n${filler}`.trim();
}

function appliedFourPartyPaper(): string {
  return `${fourPartyFirstDraft()}\nLumen Bioinformatics Inc. pays each listed milestone amount to the named recipient.`;
}

const FOUR_PARTY_SIGNER_FIELDS = TEST487_FOUR_PARTY.map((party, idx) => ({
  party,
  nameField: idx === 0 ? "r1-name" : idx === 1 ? "r2-name" : `party-${idx}-legal-name`,
  signerField: idx === 0 ? "r1-signer-name" : idx === 1 ? "r2-signer-name" : `party-${idx}-signer-name`,
  emailField: idx === 0 ? "r1-email" : idx === 1 ? "r2-email" : idx === 2 ? "r3-email" : "r4-email",
}));

function assertPreservedAppliedPaper(text: string, label: string): void {
  expect(text.length, `${label} must be operative paper`).toBeGreaterThan(400);
  assertFourPartyCustomerMeaning(text, "applied");
  expect(text, `${label} must keep the confirmed Lumen payer`).toMatch(
    /Lumen Bioinformatics Inc\. pays each listed milestone amount/,
  );
  expect(text, `${label} must keep Thalassa milestone`).toMatch(/Thalassa Data Systems LLC receives \$180,000/);
  expect(text, `${label} must keep Massachusetts`).toMatch(/Massachusetts/);
  expect(text, `${label} must not rematerialize a joint-venture family`).not.toMatch(/JOINT VENTURE AGREEMENT/);
  expect(text, `${label} must not invent an Effective Date definition`).not.toMatch(
    /The "Effective Date" is the date on which the Agreement has been fully executed/,
  );
}

function ownerHeaders() {
  const runtime = loadCorePaidJourneyRuntime();
  return {
    Authorization: `Bearer ${runtime.access_token}`,
    "X-Claw-Org-Id": runtime.org_id,
    "Content-Type": "application/json",
  };
}

async function persistAppliedFourPartyRevision(request: APIRequestContext): Promise<{
  agreementId: string;
  applied: string;
  digest: string;
  snapshotId: string;
}> {
  const applied = appliedFourPartyPaper();
  const api = configuredLiveApiBase();
  const headers = ownerHeaders();
  const created = await request.post(`${api}/api/agreements/draft`, {
    headers,
    data: {
      title: "Precision Medicine Data Platform Agreement",
      jurisdiction: "Massachusetts",
      parties: TEST487_FOUR_PARTY.map((party, idx) => ({
        id: `p${idx + 1}`,
        name: party.legalEntity,
        role: party.role,
        email: party.email,
      })),
      purpose: "precision medicine data platform",
      payment_terms: "party-specific milestones",
    },
  });
  expect(created.ok(), `draft create failed ${created.status()} ${await created.text()}`).toBeTruthy();
  const agreementId = String((await created.json()).id || "").trim();
  expect(agreementId.length).toBeGreaterThan(8);

  const digest = createHash("sha256").update(applied).digest("hex");
  const posted = await request.post(`${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot`, {
    headers,
    data: {
      corpus_plain: applied,
      generation_session_id: "four-party-applied-persist",
      claimed_digest: digest,
      customer_confirmed_answers: RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    },
  });
  expect(posted.ok(), `snapshot-create failed ${posted.status()} ${await posted.text()}`).toBeTruthy();
  const postedSnap = (await posted.json()).snapshot || {};
  expect(String(postedSnap.snapshot_id || "")).toBeTruthy();
  expect(String(postedSnap.corpus_sha256 || "")).toBe(digest);
  expect(String(postedSnap.corpus_plain || "")).toBe(applied);
  expect(String(postedSnap.customer_confirmed_answers || "")).toBe(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA);
  return { agreementId, applied, digest, snapshotId: String(postedSnap.snapshot_id) };
}

async function fillVisibleField(page: Page, field: string, value: string): Promise<boolean> {
  const input = page.locator(`[data-claw-recipient-field="${field}"]`).first();
  if (!(await input.isVisible({ timeout: 2_000 }).catch(() => false))) return false;
  await input.fill(value);
  return (await input.inputValue()).trim() === value.trim();
}

async function completeFourPartySignerSetup(page: Page): Promise<boolean> {
  const sendReady = page.getByTestId("simple-pro-send-for-review").or(page.getByTestId("simple-pro-send-for-signature"));
  if (!(await sendReady.first().isVisible({ timeout: 4_000 }).catch(() => false))) {
    const openSetup = page.getByRole("button", { name: /Complete signer details|Finalize signer details/i }).first();
    if (await openSetup.isVisible().catch(() => false)) {
      await openSetup.click();
    }
  }
  for (const row of FOUR_PARTY_SIGNER_FIELDS) {
    await fillVisibleField(page, row.nameField, row.party.legalEntity);
    await fillVisibleField(page, row.signerField, row.party.signerName);
    await fillVisibleField(page, row.emailField, row.party.email);
  }
  const advance = page
    .getByRole("button", {
      name: /Finalize signer details and continue to review decision|Complete signer details|Save signer details|Continue to review/i,
    })
    .first();
  if (await advance.isVisible().catch(() => false) && !(await advance.isDisabled().catch(() => true))) {
    await advance.click();
  }
  return sendReady.first().isVisible({ timeout: 8_000 }).catch(() => false);
}

async function clickOwnerSend(
  page: Page,
  testId: "simple-pro-send-for-review" | "simple-pro-send-for-signature",
): Promise<boolean> {
  const button = page.getByTestId(testId);
  if (!(await button.isVisible({ timeout: 8_000 }).catch(() => false))) {
    if (!(await completeFourPartySignerSetup(page))) return false;
  }
  if (!(await button.isVisible({ timeout: 8_000 }).catch(() => false))) return false;
  if (await button.isDisabled().catch(() => false)) return false;
  await button.click();
  if (testId === "simple-pro-send-for-signature") {
    await completeFourPartySignerSetup(page);
    const confirm = page.getByRole("button", {
      name: /Finalize signer details and continue to signing|Create signing links|Save signer details/i,
    }).first();
    if (await confirm.isVisible({ timeout: 20_000 }).catch(() => false)) {
      await confirm.click();
    }
  }
  return true;
}

function mintPartyId(event: RecipientTokenEvent | undefined): string {
  const req = event?.request && typeof event.request === "object" ? event.request : {};
  const body = event?.body && typeof event.body === "object" ? event.body : {};
  return String(
    (body as { recipient_party_id?: unknown }).recipient_party_id ||
      (req as { recipient_party_id?: unknown }).recipient_party_id ||
      "",
  ).trim();
}

function mintedTokenForParticipant(
  events: RecipientTokenEvent[],
  mode: "review" | "sign",
  participantId: string,
): RecipientTokenEvent | undefined {
  const pid = participantId.trim();
  if (!pid) return undefined;
  return [...events].reverse().find((row) => {
    const body = row.body && typeof row.body === "object" ? row.body : {};
    const req = row.request || {};
    return (
      row.ok &&
      String((body as { mode?: string }).mode || req.mode || "") === mode &&
      String((body as { token?: string }).token || "").length > 12 &&
      mintPartyId(row) === pid
    );
  });
}

async function fetchOwnerParties(
  page: Page,
  agreementId: string,
): Promise<Array<{ id?: string; name?: string; email?: string }>> {
  const api = configuredLiveApiBase();
  const res = await page.request.get(`${api}/api/agreements/${encodeURIComponent(agreementId)}`, {
    headers: ownerHeaders(),
  });
  expect(res.ok(), `owner GET failed ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { draft?: { parties?: Array<{ id?: string; name?: string; email?: string }> } };
  return Array.isArray(body.draft?.parties) ? body.draft.parties : [];
}

async function recipientPaperText(page: Page): Promise<string> {
  const shell = page.getByTestId("recipient-document-shell");
  await expect(shell).toBeVisible({ timeout: 45_000 });
  await expect(shell).toContainText("Lumen Bioinformatics Inc.", { timeout: 30_000 });
  return shell.innerText();
}

async function openRecipientHref(browser: Browser, href: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const recipient = await context.newPage();
  recipient.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await recipient.goto(href, { waitUntil: "domcontentloaded" });
  return recipient;
}

test("four-party applied revision persists through snapshot-create, GET, and fresh reopen", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const first = fourPartyFirstDraft();
  const applied = appliedFourPartyPaper();
  expect(first.length).toBeGreaterThan(500);
  expect(first).not.toMatch(/\b(?:pays?|shall pay|will pay|paying party)\b/i);
  assertFourPartyCustomerMeaning(applied, "applied");
  expect(applied).not.toMatch(/JOINT VENTURE AGREEMENT/);
  expect(applied).not.toMatch(/The "Effective Date" is the date on which the Agreement has been fully executed/);

  const runtime = loadCorePaidJourneyRuntime();
  const api = configuredLiveApiBase();
  const headers = {
    Authorization: `Bearer ${runtime.access_token}`,
    "X-Claw-Org-Id": runtime.org_id,
    "Content-Type": "application/json",
  };
  const created = await request.post(`${api}/api/agreements/draft`, {
    headers,
    data: {
      title: "Precision Medicine Data Platform Agreement",
      jurisdiction: "Massachusetts",
      parties: [
        { id: "p1", name: "Lumen Bioinformatics Inc.", role: "Platform Developer", email: "elena.vasquez@lumenbio.com" },
        { id: "p2", name: "Thalassa Data Systems LLC", role: "Data Infrastructure Provider", email: "marcus.webb@thalassadata.com" },
        { id: "p3", name: "Coastal Meridian Analytics LLC", role: "Analytics Integrator", email: "priya.nair@coastalmeridian.com" },
        { id: "p4", name: "Vanguard Regulatory Sciences Ltd.", role: "Regulatory Compliance Advisor", email: "james.osullivan@vanguardregulatory.co" },
      ],
      purpose: "precision medicine data platform",
      payment_terms: "party-specific milestones",
    },
  });
  expect(created.ok(), `draft create failed ${created.status()} ${await created.text()}`).toBeTruthy();
  const agreementId = String((await created.json()).id || "").trim();
  expect(agreementId.length).toBeGreaterThan(8);

  const digest = createHash("sha256").update(applied).digest("hex");
  const posted = await request.post(`${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot`, {
    headers,
    data: {
      corpus_plain: applied,
      generation_session_id: "four-party-applied-persist",
      claimed_digest: digest,
      customer_confirmed_answers: RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    },
  });
  expect(posted.ok(), `snapshot-create failed ${posted.status()} ${await posted.text()}`).toBeTruthy();
  const postedBody = await posted.json();
  const postedSnap = postedBody.snapshot || {};
  expect(String(postedSnap.snapshot_id || "").length).toBeGreaterThan(4);
  expect(String(postedSnap.corpus_sha256 || "")).toBe(digest);
  expect(String(postedSnap.corpus_plain || "")).toBe(applied);
  expect(String(postedSnap.customer_confirmed_answers || "")).toBe(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA);

  const persisted = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(persisted.ok, "authorized canonical GET must succeed independently of the POST").toBeTruthy();
  expect(persisted.snapshotId).toBe(postedSnap.snapshot_id);
  expect(persisted.digest).toBe(digest);
  expect(persisted.length).toBe(applied.length);
  expect(persisted.corpus).toBe(applied);
  assertFourPartyCustomerMeaning(persisted.corpus, "applied");
  expect(persisted.corpus).not.toMatch(/JOINT VENTURE AGREEMENT/);
  expect(persisted.corpus).not.toMatch(/The "Effective Date" is the date on which the Agreement has been fully executed/);

  await seedCorePaidJourneyOwner(page);
  await installQualityEvalPageGuards(page);
  await page.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  let visible = "";
  await expect
    .poll(async () => {
      visible = await articleText(page, scenario.partyCue);
      return fourPartyPaperReadyCheck(visible) ? visible.length : 0;
    }, { timeout: 90_000 })
    .toBeGreaterThan(400);
  await expect(page.getByTestId("milestone-payer-clarification-question")).toHaveCount(0);
  assertFourPartyCustomerMeaning(visible, "applied");
  expect(visible).not.toMatch(/JOINT VENTURE AGREEMENT/);
  expect(visible).not.toMatch(/The "Effective Date" is the date on which the Agreement has been fully executed/);

  const freshContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1280, height: 720 },
  });
  const freshPage = await freshContext.newPage();
  await seedCorePaidJourneyOwner(freshPage);
  await installQualityEvalPageGuards(freshPage);
  await freshPage.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  let reopened = "";
  await expect
    .poll(async () => {
      reopened = await articleText(freshPage, scenario.partyCue);
      return fourPartyPaperReadyCheck(reopened) ? reopened.length : 0;
    }, { timeout: 90_000 })
    .toBeGreaterThan(400);
  await expect(freshPage).toHaveURL(new RegExp(`/app/create\\?agreementId=${agreementId}`));
  await expect(freshPage.getByTestId("milestone-payer-clarification-question")).toHaveCount(0);
  const freshGet = await fetchOwnerCanonicalSnapshot(freshPage, agreementId);
  expect(freshGet.snapshotId).toBe(persisted.snapshotId);
  expect(freshGet.digest).toBe(persisted.digest);
  expect(freshGet.corpus).toBe(applied);
  assertFourPartyCustomerMeaning(reopened, "applied");
  expect(reopened).toMatch(/Lumen Bioinformatics Inc\. pays each listed milestone amount/);
  expect(reopened).toMatch(/Thalassa Data Systems LLC receives \$180,000/);
  expect(reopened).toMatch(/Massachusetts/);
  expect(reopened).not.toMatch(/JOINT VENTURE AGREEMENT/);
  expect(reopened).not.toMatch(/The "Effective Date" is the date on which the Agreement has been fully executed/);
  await freshContext.close();
});

test("four-party saved revision continues through local review recipients", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const { agreementId, applied, digest, snapshotId } = await persistAppliedFourPartyRevision(request);
  const persisted = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(persisted.ok).toBeTruthy();
  expect(persisted.snapshotId).toBe(snapshotId);
  expect(persisted.digest).toBe(digest);
  expect(persisted.corpus).toBe(applied);

  const minted = captureRecipientMints(page);
  await seedCorePaidJourneyOwner(page);
  await installQualityEvalPageGuards(page);
  await page.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  let visible = "";
  await expect
    .poll(async () => {
      visible = await articleText(page, scenario.partyCue);
      return fourPartyPaperReadyCheck(visible) ? visible.length : 0;
    }, { timeout: 90_000 })
    .toBeGreaterThan(400);
  await expect(page.getByTestId("milestone-payer-clarification-question")).toHaveCount(0);
  assertPreservedAppliedPaper(visible, "owner visible paper");

  const sentReview = await clickOwnerSend(page, "simple-pro-send-for-review");
  expect(sentReview, "send-for-review must mount on the saved four-party applied revision").toBeTruthy();

  await expect
    .poll(async () => (await fetchOwnerParties(page, agreementId)).length, { timeout: 30_000 })
    .toBe(4);
  const parties = await fetchOwnerParties(page, agreementId);

  const reviewTokens = await expect
    .poll(() => {
      return TEST487_FOUR_PARTY.every((party) => {
        const row = parties.find((candidate) => String(candidate.name || "").includes(party.legalEntity));
        return Boolean(row?.id && mintedTokenForParticipant(minted, "review", String(row.id)));
      })
        ? minted.length
        : 0;
    }, { timeout: 45_000 })
    .toBeGreaterThan(0)
    .then(() => minted)
    .catch(() => minted);
  const missingReview = TEST487_FOUR_PARTY.filter((party) => {
    const row = parties.find((candidate) => String(candidate.name || "").includes(party.legalEntity));
    return !row?.id || !mintedTokenForParticipant(reviewTokens, "review", String(row.id));
  }).map((party) => party.legalEntity);
  expect(missingReview, `review tokens missing for ${missingReview.join(", ")}`).toEqual([]);

  for (const party of TEST487_FOUR_PARTY) {
    const row = parties.find((candidate) => String(candidate.name || "").includes(party.legalEntity))!;
    const tokenEvent = mintedTokenForParticipant(reviewTokens, "review", String(row.id));
    const token = String((tokenEvent?.body as Record<string, unknown> | undefined)?.token || "");
    const recipient = await openRecipientHref(
      browser,
      `/agreements/${agreementId}/review?t=${encodeURIComponent(token)}`,
    );
    const paper = await recipientPaperText(recipient);
    const authority = recipient.getByTestId("recipient-review-authority-meta");
    await expect(authority).toBeVisible({ timeout: 20_000 });
    expect(await authority.getAttribute("data-snapshot-id")).toBe(snapshotId);
    expect((await authority.getAttribute("data-corpus-sha256") || "").toLowerCase()).toBe(digest);
    assertPreservedAppliedPaper(paper, `${party.legalEntity} review recipient`);
    const approve = recipient.getByRole("button", { name: /^Approve draft$/i });
    const fallback = recipient.getByTestId("recipient-review-approve-draft");
    if (await approve.isVisible().catch(() => false)) {
      await approve.click();
    } else {
      await expect(fallback, `${party.legalEntity} must be able to approve the applied paper`).toBeVisible({
        timeout: 8_000,
      });
      await fallback.click();
    }
    const confirmation = recipient
      .getByTestId("recipient-accepted-awaiting-lock-root")
      .or(recipient.getByTestId("recipient-approved-waiting-header"))
      .or(recipient.getByTestId("recipient-approved-draft-collapsed"));
    await expect(confirmation.first(), `${party.legalEntity} approval must persist`).toBeVisible({ timeout: 20_000 });
    await recipient.context().close();
  }
});
