/**
 * Local server-backed four-party applied-revision persistence.
 * Snapshot-create, authorized GET, visible paper, and fresh-browser reopen use
 * the live local API. Generation intercept is not a substitute for persist.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import { IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE } from "../../src/components/agreements/ironcladJointRolloutFixtures";
import {
  articleText,
  assertFourPartyCustomerMeaning,
  captureServerAgreementIds,
  completeSignerDetailsThroughVisibleCustomerUi,
  configuredLiveApiBase,
  fetchOwnerCanonicalSnapshot,
  fourPartyPaperReady as fourPartyPaperReadyCheck,
  installQualityEvalPageGuards,
  QUALITY_EVAL_ALL_CASES,
  submitIntake,
  waitForServerAgreementId,
  waitForOwnerWorkspaceReady,
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

type FourPartySignerSetupRow = {
  party: { legalEntity: string; signerName: string; email: string };
  nameField: string;
  signerField: string;
  emailFields: readonly string[];
};

const FOUR_PARTY_SIGNER_FIELDS: FourPartySignerSetupRow[] = TEST487_FOUR_PARTY.map((party, idx) => ({
  party,
  nameField: idx === 0 ? "r1-name" : idx === 1 ? "r2-name" : `party-${idx}-legal-name`,
  signerField: idx === 0 ? "r1-signer-name" : idx === 1 ? "r2-signer-name" : `party-${idx}-signer-name`,
  emailFields:
    idx === 0 ? ["r1-email"] : idx === 1 ? ["r2-email"] : idx === 2 ? ["r3-email"] : ["r4-email"],
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
  const current = (await input.inputValue().catch(() => "")).trim();
  if (current === value.trim()) return true;
  try {
    await input.fill(value, { timeout: 4_000 });
  } catch {
    return (await input.inputValue().catch(() => "")).trim() === value.trim();
  }
  return (await input.inputValue().catch(() => "")).trim() === value.trim();
}

async function completeFourPartySignerSetup(
  page: Page,
  fields: readonly FourPartySignerSetupRow[] = FOUR_PARTY_SIGNER_FIELDS,
): Promise<boolean> {
  const sendReady = page.getByTestId("simple-pro-send-for-review").or(page.getByTestId("simple-pro-send-for-signature"));
  if (!(await sendReady.first().isVisible({ timeout: 4_000 }).catch(() => false))) {
    const openSetup = page
      .getByTestId("paid-pro-forced-add-signer-details")
      .or(page.getByTestId("pro-review-add-signer-details"))
      .or(
        page.getByRole("button", {
          name: /Add signer details|Complete signer details|Finalize signer details|Prepare for signing|Manage recipients/i,
        }),
      )
      .first();
    if (await openSetup.isVisible().catch(() => false)) {
      await openSetup.click();
    }
  }
  for (const row of fields) {
    await fillVisibleField(page, row.nameField, row.party.legalEntity);
    await fillVisibleField(page, row.signerField, row.party.signerName);
    for (const emailField of row.emailFields) {
      if (await fillVisibleField(page, emailField, row.party.email)) break;
    }
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
  fields: readonly FourPartySignerSetupRow[] = FOUR_PARTY_SIGNER_FIELDS,
): Promise<boolean> {
  const enabledSend = page.locator(`[data-testid="${testId}"]:not([disabled])`).first();
  if (!(await enabledSend.isVisible({ timeout: 8_000 }).catch(() => false))) {
    if (!(await completeFourPartySignerSetup(page, fields))) return false;
  }
  if (!(await enabledSend.isVisible({ timeout: 8_000 }).catch(() => false))) return false;
  await enabledSend.click({ timeout: 12_000, force: true });
  if (testId === "simple-pro-send-for-signature") {
    const confirm = page.getByRole("button", {
      name: /Finalize signer details and continue to signing|Create signing links|Save signer details/i,
    }).first();
    if (!(await confirm.isVisible({ timeout: 8_000 }).catch(() => false))) {
      await completeFourPartySignerSetup(page, fields);
    }
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
): Promise<Array<{ id?: string; name?: string; email?: string; signer_name?: string; signerName?: string }>> {
  const api = configuredLiveApiBase();
  const res = await page.request.get(`${api}/api/agreements/${encodeURIComponent(agreementId)}`, {
    headers: ownerHeaders(),
  });
  expect(res.ok(), `owner GET failed ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as {
    draft?: { parties?: Array<{ id?: string; name?: string; email?: string; signer_name?: string; signerName?: string }> };
  };
  return Array.isArray(body.draft?.parties) ? body.draft.parties : [];
}

async function fetchOwnerSigningHandoff(
  page: Page,
  agreementId: string,
): Promise<{
  acceptedSnapshotId: string;
  acceptedDigest: string;
  lockSnapshotId: string;
  lockDigest: string;
  packetSnapshotId: string;
  packetDigest: string;
  packetCorpus: string;
  packetRoles: Array<{
    entityName?: string;
    partyId?: string;
    signerName?: string;
    signerEmail?: string;
    requiresSignature?: boolean;
  }>;
}> {
  const api = configuredLiveApiBase();
  const res = await page.request.get(`${api}/api/agreements/${encodeURIComponent(agreementId)}`, {
    headers: ownerHeaders(),
  });
  expect(res.ok(), `owner GET for signing handoff failed ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as {
    draft?: {
      accepted_review_snapshot_v1?: { snapshotId?: string; corpusSha256?: string; corpusPlain?: string };
      vs01_signing_packet_v1?: {
        accepted_review_snapshot_id?: string;
        accepted_review_snapshot_digest?: string;
        frozen_corpus_hash?: string;
        portable?: {
          seed?: { corpusPlain?: string; corpusHash?: string };
          roles?: Array<{
            entityName?: string;
            partyName?: string;
            partyId?: string;
            vs01CounterpartyId?: string;
            signerName?: string;
            signerEmail?: string;
            requiresSignature?: boolean;
          }>;
          envelopeProvenance?: { acceptedSoTDigest?: string };
        };
      };
    };
    signing_lock?: { accepted_snapshot_id?: string; accepted_snapshot_digest?: string };
  };
  const accepted = body.draft?.accepted_review_snapshot_v1 || {};
  const lock = body.signing_lock || {};
  const packet = body.draft?.vs01_signing_packet_v1 || {};
  const portable = packet.portable || {};
  const seed = portable.seed || {};
  const roles = Array.isArray(portable.roles) ? portable.roles : [];
  return {
    acceptedSnapshotId: String(accepted.snapshotId || "").trim(),
    acceptedDigest: String(accepted.corpusSha256 || "").trim().toLowerCase(),
    lockSnapshotId: String(lock.accepted_snapshot_id || "").trim(),
    lockDigest: String(lock.accepted_snapshot_digest || "").trim().toLowerCase(),
    packetSnapshotId: String(packet.accepted_review_snapshot_id || "").trim(),
    packetDigest: String(
      packet.accepted_review_snapshot_digest || portable.envelopeProvenance?.acceptedSoTDigest || "",
    )
      .trim()
      .toLowerCase(),
    packetCorpus: String(seed.corpusPlain || ""),
    packetRoles: roles.map((role) => ({
      entityName: String(role.entityName || role.partyName || "").trim(),
      partyId: String(role.partyId || role.vs01CounterpartyId || "").trim(),
      signerName: String(role.signerName || "").trim(),
      signerEmail: String(role.signerEmail || "").trim(),
      requiresSignature: role.requiresSignature !== false,
    })),
  };
}

async function silverMesaSigningViewText(page: Page): Promise<string> {
  const canonical = page.getByTestId("vs01-recipient-canonical-render");
  if (await canonical.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await expect(canonical).toContainText(SILVER_MESA, { timeout: 30_000 });
    return canonical.innerText();
  }
  const signRoute = page.getByTestId("recipient-public-sign-route");
  if (await signRoute.isVisible({ timeout: 8_000 }).catch(() => false)) {
    const shell = page.getByTestId("recipient-document-shell");
    if (await shell.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(shell).toContainText(SILVER_MESA, { timeout: 30_000 });
      return shell.innerText();
    }
    return signRoute.innerText();
  }
  const shell = page.getByTestId("recipient-document-shell");
  await expect(shell).toBeVisible({ timeout: 45_000 });
  await expect(shell).toContainText(SILVER_MESA, { timeout: 30_000 });
  return shell.innerText();
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

const SILVER_MESA = "Silver Mesa Analytics LP";
const ORIGINAL_SILVER_NOTICE = "olivia.hart@silvermesaanalytics.com";
const PROPOSED_SILVER_NOTICE = "notices@silvermesaanalytics.com";

const SILVER_MESA_FOUR_PARTY = [
  {
    legalEntity: "Ironclad Systems Group LLC",
    role: "Sponsor",
    signerName: "Ethan Cole",
    email: "ethan.cole@ironcladsg.com",
  },
  {
    legalEntity: "Harborline Data Solutions Inc.",
    role: "Vendor",
    signerName: "Maya Bennett",
    email: "maya.bennett@harborlinedata.com",
  },
  {
    legalEntity: "Northwind Automation Partners LLC",
    role: "Integrator",
    signerName: "Lucas Reed",
    email: "lucas.reed@northwindap.io",
  },
  {
    legalEntity: SILVER_MESA,
    role: "Analyst",
    signerName: "Olivia Hart",
    email: ORIGINAL_SILVER_NOTICE,
  },
] as const;

const SILVER_MESA_SIGNER_FIELDS: FourPartySignerSetupRow[] = SILVER_MESA_FOUR_PARTY.map((party, idx) => ({
  party,
  nameField: idx === 0 ? "r1-name" : idx === 1 ? "r2-name" : `party-${idx}-legal-name`,
  signerField: idx === 0 ? "r1-signer-name" : idx === 1 ? "r2-signer-name" : `party-${idx}-signer-name`,
  emailFields:
    idx === 0
      ? ["r1-email"]
      : idx === 1
        ? ["r2-email"]
        : idx === 2
          ? ["r3-email", "party-2-email"]
          : ["r4-email", "party-3-email"],
}));

async function assertSilverMesaVisibleSignerIdentities(page: Page, label: string): Promise<void> {
  for (const row of SILVER_MESA_SIGNER_FIELDS) {
    const company = await readVisibleField(page, [row.nameField]);
    const person = await readVisibleField(page, [row.signerField]);
    const email = await readVisibleField(page, row.emailFields);
    expect(company?.value, `${label}: ${row.party.legalEntity} company slot`).toContain(row.party.legalEntity);
    expect(person?.value, `${label}: ${row.party.legalEntity} signer`).toBe(row.party.signerName);
    expect(email?.value, `${label}: ${row.party.legalEntity} access email`).toBe(row.party.email);
  }
}

async function readCreateResumeClientEvidence(page: Page): Promise<{
  hrefAgreementId: string | null;
  displayAgreementId: string;
  displaySnapshotId: string;
  displayDigest: string;
  displayStatus: string;
  displayCorpusLength: number;
  articleCount: number;
  articleHasAcceptedNotice: boolean;
  articleHasOriginalNoticeLine: boolean;
}> {
  return page.evaluate(() => {
    const parse = (key: string): Record<string, unknown> | null => {
      try {
        const raw = sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };
    const display = parse("claw_display_review_snapshot_v1");
    const corpus = parse("claw_display_review_corpus_v1");
    const hrefAgreementId = new URL(window.location.href).searchParams.get("agreementId");
    const nodes = Array.from(
      document.querySelectorAll(
        '[data-testid="simple-pro-final-review-document"], [data-testid="paid-pro-visible-document-shell"], article[aria-label="Agreement document preview"]',
      ),
    );
    const article =
      nodes
        .map((node) => ((node as HTMLElement).innerText || "").trim())
        .sort((a, b) => b.length - a.length)[0] || "";
    return {
      hrefAgreementId,
      displayAgreementId: String(display?.agreementId || ""),
      displaySnapshotId: String(display?.snapshotId || ""),
      displayDigest: String(display?.corpusSha256 || "").toLowerCase(),
      displayStatus: String(display?.status || ""),
      displayCorpusLength: Number(corpus?.corpusLength || String(corpus?.corpusPlain || "").length || 0),
      articleCount: nodes.length,
      articleHasAcceptedNotice: article.includes("notices@silvermesaanalytics.com"),
      articleHasOriginalNoticeLine: /Email:\s*olivia\.hart@silvermesaanalytics\.com/.test(article),
    };
  });
}

function silverMesaNoticeAddress(text: string): string {
  const stanza =
    text
      .split(/(?=If to )/i)
      .find((part) => /If to Silver Mesa Analytics LP:/i.test(part))
      ?.slice(0, 1200) || "";
  if (!stanza) return "";
  const labeled = stanza.match(/Email:\s*([^\s]+@[^\s]+)/i);
  if (labeled?.[1]) return labeled[1].replace(/[.,;:>]+$/g, "");
  const any = stanza.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return any?.[0] ? any[0].replace(/[.,;:>]+$/g, "") : "";
}

function assertSilverMesaFourPartyPaper(text: string, label: string): void {
  expect(text.length, `${label} must be operative paper`).toBeGreaterThan(400);
  expect(text, `${label}: Silver Mesa Analytics LP LP must fail identity`).not.toMatch(
    /Silver Mesa Analytics LP\s+LP\b/,
  );
  expect(text, `${label} must not add VertexGrid`).not.toMatch(/VertexGrid/);
  for (const party of SILVER_MESA_FOUR_PARTY) {
    expect(text, `${label} missing ${party.legalEntity}`).toContain(party.legalEntity);
    expect(
      text,
      `${label} must keep ${party.legalEntity} as ${party.role}`,
    ).toMatch(new RegExp(`${party.legalEntity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]{0,160}\\("${party.role}"\\)`));
  }
  expect(text, `${label} Ethan Cole`).toContain("Ethan Cole");
  expect(text, `${label} Maya Bennett`).toContain("Maya Bennett");
  expect(text, `${label} Lucas Reed`).toContain("Lucas Reed");
  expect(text, `${label} Olivia Hart`).toContain("Olivia Hart");
  expect(text, `${label} Ironclad postal`).toContain("3 Ironclad Way, Austin, TX 78701");
  expect(text, `${label} payment`).toContain("$187,500");
  expect(text, `${label} term`).toMatch(/24 months/);
  expect(text, `${label} Texas law`).toMatch(/Texas/);
  expect(text, `${label} ownership`).toMatch(/Foreground IP developed solely by a party remains that party's property/i);
  expect(text, `${label} must not invent an Effective Date definition`).not.toMatch(
    /The "Effective Date" is the date on which the Agreement has been fully executed/,
  );
  expect(silverMesaNoticeAddress(text), `${label} notice must stay on Silver Mesa`).toBeTruthy();
}

type ProposalPostEvent = { ok: boolean; status: number; url: string; proposalId: string };

function captureProposalPosts(page: Page): ProposalPostEvent[] {
  const events: ProposalPostEvent[] = [];
  page.on("response", (res) => {
    if (res.request().method() !== "POST" || !res.url().includes("/recipient-proposal")) return;
    void res
      .json()
      .then((body) => {
        let requestId = "";
        try {
          const posted = res.request().postDataJSON() as { proposal_id?: string } | null;
          requestId = String(posted?.proposal_id || "").trim();
        } catch {
          requestId = "";
        }
        const proposalId = String(
          (body && typeof body === "object" ? (body as { proposal_id?: unknown }).proposal_id : "") || requestId,
        ).trim();
        events.push({ ok: res.ok(), status: res.status(), url: res.url(), proposalId });
      })
      .catch(() => {
        events.push({ ok: res.ok(), status: res.status(), url: res.url(), proposalId: "" });
      });
  });
  return events;
}

function captureApplyPosts(page: Page): { ok: boolean; status: number; url: string }[] {
  const events: { ok: boolean; status: number; url: string }[] = [];
  page.on("response", (res) => {
    if (res.request().method() !== "POST" || !res.url().includes("/recipient-proposal")) return;
    events.push({ ok: res.ok(), status: res.status(), url: res.url() });
  });
  return events;
}

async function visibleRecipientInput(page: Page, field: string) {
  return page.locator(`[data-claw-recipient-field="${field}"]`).first();
}

async function readVisibleField(page: Page, fields: readonly string[]): Promise<{ field: string; value: string } | null> {
  for (const field of fields) {
    const input = await visibleRecipientInput(page, field);
    if (!(await input.isVisible({ timeout: 1_500 }).catch(() => false))) continue;
    return { field, value: (await input.inputValue()).trim() };
  }
  return null;
}

async function fillEmptyRecipientField(page: Page, fields: readonly string[], value: string): Promise<boolean> {
  const visible = await readVisibleField(page, fields);
  if (!visible) return false;
  if (visible.value === value) return true;
  if (visible.value) {
    throw new Error(
      `Refusing to overwrite ${visible.field} prefill ${JSON.stringify(visible.value)} with ${JSON.stringify(value)}`,
    );
  }
  const input = await visibleRecipientInput(page, visible.field);
  await input.fill(value);
  const written = (await input.inputValue()).trim();
  if (written !== value) {
    throw new Error(`Failed to fill ${visible.field}: got ${JSON.stringify(written)}`);
  }
  return true;
}

async function assertSilverMesaRecipientEmails(page: Page, label: string): Promise<void> {
  for (const row of SILVER_MESA_SIGNER_FIELDS) {
    const visible = await readVisibleField(page, row.emailFields);
    expect(visible, `${label}: ${row.party.legalEntity} reviewer email field must be visible`).toBeTruthy();
    expect(
      visible?.value,
      `${label}: ${row.party.legalEntity} must keep ${row.party.email}`,
    ).toBe(row.party.email);
  }
}

async function readSilverMesaCompanyEmailAssignments(
  page: Page,
): Promise<Array<{ company: string; email: string }>> {
  const rows: Array<{ company: string; email: string }> = [];
  for (const row of SILVER_MESA_SIGNER_FIELDS) {
    rows.push({
      company: row.party.legalEntity,
      email: (await readVisibleField(page, row.emailFields))?.value ?? "",
    });
  }
  return rows;
}

const SILVER_MESA_REVIEW_FIRST_CONSOLE =
  /\[review-first-|\[send-flow-|\[guided-review-|\[review-email-party-roles|\[review-link-|\[review-first-persist/;

type SilverMesaNetworkEvent = {
  kind: "request" | "requestfailed" | "response";
  at: number;
  method: string;
  path: string;
  status?: number;
  ok?: boolean;
  failure?: string;
  partyId?: string;
  email?: string;
  mode?: string;
  revisionHint?: string;
};

type SilverMesaConsoleEvent = { at: number; type: string; text: string };

type SilverMesaHandoffTrace = {
  mint: Array<{ status: number; ok: boolean; partyId: string; email: string; mode: string }>;
  saves: Array<{ status: number; ok: boolean; method: string; path: string }>;
  network: SilverMesaNetworkEvent[];
  console: SilverMesaConsoleEvent[];
  pageErrors: Array<{ at: number; message: string }>;
};

function silverMesaPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.replace(/\?.*$/, "");
  }
}

function redactSilverMesaTraceText(text: string): string {
  return text
    .replace(/([?&]t=)[^&\s"'\\]+/gi, "$1[redacted]")
    .replace(/("token"\s*:\s*")[^"]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)\S+/gi, "$1[redacted]");
}

function sanitizeSilverMesaPostData(raw: string | null): {
  partyId: string;
  email: string;
  mode: string;
  revisionHint: string;
} {
  let req: Record<string, unknown> = {};
  if (raw) {
    try {
      req = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      req = {};
    }
  }
  const partyId = String(req.recipient_party_id || req.party_id || "").trim();
  const revisionHint = String(
    req.revision_id || req.snapshot_id || req.canonical_hash || req.claimed_digest || "",
  )
    .trim()
    .slice(0, 16);
  return {
    partyId,
    email: String(req.email || req.recipient_email || "").trim(),
    mode: String(req.mode || "").trim() || (String(req.recipient_party_id || "").trim() ? "review" : ""),
    revisionHint,
  };
}

function isSilverMesaHandoffNetwork(url: string, method: string): boolean {
  if (url.includes("/recipient-access-token") && method === "POST") return true;
  if (!/\/api\/agreements\//.test(url)) return false;
  if (method === "GET" && /\/api\/agreements\/[0-9a-f-]{36}\/?$/i.test(silverMesaPathname(url))) return true;
  if (method !== "POST" && method !== "PUT" && method !== "PATCH") return false;
  if (url.includes("/recipient-proposal")) return false;
  return true;
}

function captureSilverMesaHandoffTrace(page: Page): SilverMesaHandoffTrace {
  const trace: SilverMesaHandoffTrace = { mint: [], saves: [], network: [], console: [], pageErrors: [] };
  page.on("console", (msg) => {
    const text = redactSilverMesaTraceText(msg.text());
    if (!SILVER_MESA_REVIEW_FIRST_CONSOLE.test(text) && !/handoff_exception|create_links/.test(text)) return;
    trace.console.push({ at: Date.now(), type: msg.type(), text: text.slice(0, 1200) });
  });
  page.on("pageerror", (err) => {
    trace.pageErrors.push({
      at: Date.now(),
      message: redactSilverMesaTraceText(String(err?.message || err)).slice(0, 400),
    });
  });
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (!isSilverMesaHandoffNetwork(url, method)) return;
    const sanitized = sanitizeSilverMesaPostData(req.postData());
    trace.network.push({
      kind: "request",
      at: Date.now(),
      method,
      path: silverMesaPathname(url),
      ...sanitized,
    });
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    const method = req.method();
    if (!isSilverMesaHandoffNetwork(url, method)) return;
    const sanitized = sanitizeSilverMesaPostData(req.postData());
    trace.network.push({
      kind: "requestfailed",
      at: Date.now(),
      method,
      path: silverMesaPathname(url),
      failure: req.failure()?.errorText || "requestfailed",
      ...sanitized,
    });
  });
  page.on("response", (res) => {
    const url = res.url();
    const method = res.request().method();
    if (!isSilverMesaHandoffNetwork(url, method)) return;
    const sanitized = sanitizeSilverMesaPostData(res.request().postData());
    const path = silverMesaPathname(url);
    trace.network.push({
      kind: "response",
      at: Date.now(),
      method,
      path,
      status: res.status(),
      ok: res.ok(),
      ...sanitized,
    });
    if (url.includes("/recipient-access-token") && method === "POST") {
      trace.mint.push({
        status: res.status(),
        ok: res.ok(),
        partyId: sanitized.partyId,
        email: sanitized.email,
        mode: sanitized.mode || "review",
      });
      return;
    }
    if (url.includes("/recipient-access-token")) return;
    trace.saves.push({ status: res.status(), ok: res.ok(), method, path });
  });
  return trace;
}

function summarizeHandoffTrace(trace: SilverMesaHandoffTrace): string {
  return JSON.stringify({
    mint: trace.mint.map((row) => ({
      status: row.status,
      ok: row.ok,
      partyId: row.partyId ? `${row.partyId.slice(0, 8)}…` : "",
      email: row.email,
      mode: row.mode,
    })),
    saves: trace.saves,
    network: trace.network.map((row) => ({
      kind: row.kind,
      method: row.method,
      path: row.path,
      status: row.status ?? null,
      ok: row.ok ?? null,
      failure: row.failure ?? null,
      partyId: row.partyId ? `${row.partyId.slice(0, 8)}…` : "",
      email: row.email || "",
      mode: row.mode || "",
      revisionHint: row.revisionHint || "",
    })),
    console: trace.console,
    pageErrors: trace.pageErrors,
  });
}

function writeSilverMesaHandoffEvidence(trace: SilverMesaHandoffTrace, label: string): void {
  const dir =
    process.env.FOUR_PARTY_PERSIST_OUTPUT ||
    join("evals/commercial-readiness/results/four-party-email-reopen", "local");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `silver-mesa-handoff-trace-${label}.json`), summarizeHandoffTrace(trace), "utf8");
}

function silverMesaCurrentAttemptOutcome(args: {
  startedAt: number;
  copyLinksVisible: boolean;
  creatingVisible: boolean;
  failedVisible: boolean;
  console: SilverMesaConsoleEvent[];
  network: SilverMesaNetworkEvent[];
  pageErrors: Array<{ at: number; message: string }>;
}): "pending" | "links" | "failed" {
  const after = {
    console: args.console.filter((row) => row.at >= args.startedAt),
    network: args.network.filter((row) => row.at >= args.startedAt),
    pageErrors: args.pageErrors.filter((row) => row.at >= args.startedAt),
  };
  const handoffStart = after.console.some((row) => row.text.includes("[review-first-handoff-start]"));
  const mintStart = after.console.some((row) => row.text.includes("[review-first-mint-start]"));
  const mintSuccess = after.console.some(
    (row) => row.text.includes("[review-first-mint-success]") || row.text.includes("[review-first-link-created]"),
  );
  const handoffFailure = after.console.some(
    (row) =>
      row.text.includes("[review-first-error]") ||
      row.text.includes("[review-first-mint-error]") ||
      row.text.includes("[review-first-inline-error-rendered]"),
  );
  const mintRequestFailed = after.network.some(
    (row) => row.kind === "requestfailed" && row.path.includes("recipient-access-token"),
  );
  if (args.copyLinksVisible || mintSuccess) return "links";
  if (args.creatingVisible) return "pending";
  const attemptStarted = handoffStart || mintStart;
  if (attemptStarted && (handoffFailure || mintRequestFailed || after.pageErrors.length > 0)) return "failed";
  if (attemptStarted && args.failedVisible && !args.creatingVisible) return "failed";
  return "pending";
}

function silverMesaSendForReviewControl(page: Page) {
  return page
    .getByTestId("paid-pro-forced-share-for-review")
    .or(page.getByRole("button", { name: /^Send for review$/i }))
    .or(page.getByTestId("simple-pro-send-for-review"))
    .first();
}

function silverMesaCreateReviewLinksControl(page: Page) {
  return page
    .getByRole("button", { name: /Create review links?|Continue to review links?/i })
    .first();
}

function silverMesaCopyReviewLinkControl(page: Page) {
  return page.getByRole("button", { name: /Copy review link/i }).first();
}

function silverMesaLinksFailedBanner(page: Page) {
  return page.getByText(/Links were not created|Review links were not created/i).first();
}

function silverMesaCreatingLinksBanner(page: Page) {
  return page
    .getByTestId("journey-action-banner")
    .filter({ has: page.locator('[data-journey-action-kind="working"][data-journey-action-id="create_links"]') })
    .or(page.getByText(/^Creating links$/i))
    .first();
}

async function waitForSilverMesaReviewOutcome(
  page: Page,
): Promise<"setup" | "links" | "failed" | "none"> {
  let outcome: "setup" | "links" | "failed" | "none" = "none";
  await expect
    .poll(
      async () => {
        if (await silverMesaCopyReviewLinkControl(page).isVisible().catch(() => false)) {
          outcome = "links";
          return "links";
        }
        if (await readVisibleField(page, SILVER_MESA_SIGNER_FIELDS[0]!.emailFields)) {
          outcome = "setup";
          return "setup";
        }
        if (await silverMesaCreatingLinksBanner(page).isVisible().catch(() => false)) {
          return "pending";
        }
        if (await silverMesaLinksFailedBanner(page).isVisible().catch(() => false)) {
          outcome = "failed";
          return "failed";
        }
        if (
          (await silverMesaCreateReviewLinksControl(page).isVisible().catch(() => false)) &&
          !(await silverMesaCreateReviewLinksControl(page).isDisabled().catch(() => true))
        ) {
          outcome = "setup";
          return "setup";
        }
        return "pending";
      },
      { timeout: 20_000 },
    )
    .not.toBe("pending")
    .catch(() => undefined);
  return outcome;
}

async function waitForCurrentSilverMesaReviewAttempt(
  page: Page,
  trace: SilverMesaHandoffTrace,
  startedAt: number,
): Promise<"links" | "failed" | "timeout"> {
  let outcome: "links" | "failed" | "timeout" = "timeout";
  await expect
    .poll(
      async () => {
        const copyLinksVisible = await silverMesaCopyReviewLinkControl(page).isVisible().catch(() => false);
        const creatingVisible = await silverMesaCreatingLinksBanner(page).isVisible().catch(() => false);
        const failedVisible = await silverMesaLinksFailedBanner(page).isVisible().catch(() => false);
        const next = silverMesaCurrentAttemptOutcome({
          startedAt,
          copyLinksVisible,
          creatingVisible,
          failedVisible,
          console: trace.console,
          network: trace.network,
          pageErrors: trace.pageErrors,
        });
        if (next !== "pending") {
          outcome = next;
          return next;
        }
        return "pending";
      },
      { timeout: 20_000 },
    )
    .not.toBe("pending")
    .catch(() => undefined);
  return outcome;
}

function legalNamesAlreadyConfirmed(current: string, expected: string): boolean {
  const normalize = (value: string) =>
    value
      .replace(/[.,]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  return Boolean(current) && normalize(current) === normalize(expected);
}

function assertSilverMesaInitialAssignments(initial: Array<{ company: string; email: string }>): void {
  expect(
    initial.map((row) => row.company),
    "visible recipient companies before confirmation fills",
  ).toEqual(SILVER_MESA_FOUR_PARTY.map((party) => party.legalEntity));
  expect(initial[0]?.email, "Ironclad must not start on Northwind's reviewer email").not.toBe(
    "lucas.reed@northwindap.io",
  );
  for (const [idx, row] of initial.entries()) {
    const expected = SILVER_MESA_FOUR_PARTY[idx]!.email;
    if (!row.email) continue;
    expect(row.email, `${row.company} prefill before confirmation`).toBe(expected);
  }
}

async function completeSilverMesaReviewerSetup(page: Page): Promise<"setup" | "handoff" | "missing"> {
  if (await silverMesaCopyReviewLinkControl(page).isVisible().catch(() => false)) return "handoff";
  if (await readVisibleField(page, SILVER_MESA_SIGNER_FIELDS[0]!.emailFields)) {
    const initial = await readSilverMesaCompanyEmailAssignments(page);
    assertSilverMesaInitialAssignments(initial);
  } else {
    const sendForReview = silverMesaSendForReviewControl(page);
    if (!(await sendForReview.isVisible({ timeout: 12_000 }).catch(() => false))) return "missing";
    if (await sendForReview.isDisabled().catch(() => false)) return "missing";
    await sendForReview.click();
    const outcome = await waitForSilverMesaReviewOutcome(page);
    if (outcome === "links") return "handoff";
    if (outcome === "failed") {
      if (!(await readVisibleField(page, SILVER_MESA_SIGNER_FIELDS[0]!.emailFields))) return "handoff";
    } else if (outcome !== "setup") {
      return "missing";
    }
    const setupRoot = page.locator("[data-claw-recipient-setup]").first();
    if (await setupRoot.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await setupRoot.scrollIntoViewIfNeeded();
    }
    const initial = await readSilverMesaCompanyEmailAssignments(page);
    assertSilverMesaInitialAssignments(initial);
  }
  for (const row of SILVER_MESA_SIGNER_FIELDS) {
    const nameInput = page.locator(`[data-claw-recipient-field="${row.nameField}"]`).first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.scrollIntoViewIfNeeded();
      const currentName = (await nameInput.inputValue()).trim();
      if (!currentName) {
        await nameInput.fill(row.party.legalEntity);
        if ((await nameInput.inputValue()).trim() !== row.party.legalEntity) return "missing";
      } else if (!legalNamesAlreadyConfirmed(currentName, row.party.legalEntity)) {
        throw new Error(
          `Refusing to overwrite ${row.nameField} prefill ${JSON.stringify(currentName)} with ${JSON.stringify(row.party.legalEntity)}`,
        );
      }
    }
    const emailInput = page
      .locator(row.emailFields.map((field) => `[data-claw-recipient-field="${field}"]`).join(", "))
      .first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.scrollIntoViewIfNeeded();
    }
    await fillEmptyRecipientField(page, row.emailFields, row.party.email);
  }
  await assertSilverMesaRecipientEmails(page, "after completing visible recipient setup");
  return "setup";
}

async function throwSilverMesaLinksNotCreated(page: Page, trace: SilverMesaHandoffTrace, label: string): Promise<never> {
  writeSilverMesaHandoffEvidence(trace, label);
  const visiblePairs = await readSilverMesaCompanyEmailAssignments(page).catch(() => []);
  throw new Error(
    `review_links_not_created label=${label} visible=${JSON.stringify(visiblePairs)} ${summarizeHandoffTrace(trace)}`,
  );
}

async function clickSilverMesaCreateOrRetry(page: Page): Promise<boolean> {
  const createLinks = silverMesaCreateReviewLinksControl(page);
  if ((await createLinks.isVisible().catch(() => false)) && !(await createLinks.isDisabled().catch(() => true))) {
    await createLinks.click();
    return true;
  }
  const screenRetry = page
    .getByTestId("simple-pro-review-first-retry")
    .or(page.getByRole("button", { name: /^Retry$/i }))
    .first();
  if ((await screenRetry.isVisible().catch(() => false)) && !(await screenRetry.isDisabled().catch(() => true))) {
    await screenRetry.click();
    return true;
  }
  const bannerRetry = page.getByTestId("journey-action-remedy").first();
  if ((await bannerRetry.isVisible().catch(() => false)) && !(await bannerRetry.isDisabled().catch(() => true))) {
    await bannerRetry.click();
    return true;
  }
  return false;
}

async function clickSilverMesaSendForReview(page: Page, trace: SilverMesaHandoffTrace): Promise<boolean> {
  const setupState = await completeSilverMesaReviewerSetup(page);
  if (setupState === "missing") return false;
  if (setupState === "handoff" && (await silverMesaCopyReviewLinkControl(page).isVisible().catch(() => false))) {
    writeSilverMesaHandoffEvidence(trace, "already-ready");
    return true;
  }
  const sendForReview = silverMesaSendForReviewControl(page);
  const startedAt = Date.now();
  const createClicked = await clickSilverMesaCreateOrRetry(page);
  if (
    !createClicked &&
    setupState === "setup" &&
    (await sendForReview.isVisible().catch(() => false)) &&
    !(await sendForReview.isDisabled().catch(() => true))
  ) {
    await sendForReview.click();
  }
  let outcome = await waitForCurrentSilverMesaReviewAttempt(page, trace, startedAt);
  if (outcome === "links") {
    writeSilverMesaHandoffEvidence(trace, "first-attempt-links");
    return true;
  }
  if (outcome === "failed" || outcome === "timeout") {
    const retryStartedAt = Date.now();
    const retried = await clickSilverMesaCreateOrRetry(page);
    if (!retried) {
      await throwSilverMesaLinksNotCreated(
        page,
        trace,
        outcome === "timeout" ? "first-attempt-no-completion" : "first-attempt-failed-no-retry",
      );
    }
    outcome = await waitForCurrentSilverMesaReviewAttempt(page, trace, retryStartedAt);
    if (outcome === "links") {
      writeSilverMesaHandoffEvidence(trace, "retry-links");
      return true;
    }
    await throwSilverMesaLinksNotCreated(page, trace, outcome === "timeout" ? "retry-no-completion" : "retry-failed");
  }
  return true;
}

test("four-party Silver Mesa creates four identity-bound review links", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const minted = captureRecipientMints(page);
  const handoffTrace = captureSilverMesaHandoffTrace(page);
  const capturedIds = captureServerAgreementIds(page);
  await seedCorePaidJourneyOwner(page);
  await installQualityEvalPageGuards(page);
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  await submitIntake(page, IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE);
  await expect(page.getByTestId("agreement-intake-clarification")).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByTestId("milestone-payer-clarification-question")).toHaveCount(0, { timeout: 8_000 });

  let ownerPaper = "";
  await expect
    .poll(
      async () => {
        ownerPaper = await articleText(page, SILVER_MESA);
        return ownerPaper.includes("Ironclad Systems Group LLC") && ownerPaper.includes("Texas") ? ownerPaper.length : 0;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(ownerPaper, "author first draft");
  expect(silverMesaNoticeAddress(ownerPaper), "author first draft notice").toBe(ORIGINAL_SILVER_NOTICE);

  const agreementId = await waitForServerAgreementId(page, capturedIds);
  expect(agreementId.length).toBeGreaterThan(8);
  const firstSnap = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(firstSnap.ok, "canonical GET after create").toBeTruthy();
  assertSilverMesaFourPartyPaper(firstSnap.corpus, "persisted first draft");
  expect(silverMesaNoticeAddress(firstSnap.corpus)).toBe(ORIGINAL_SILVER_NOTICE);

  const sent = await clickSilverMesaSendForReview(page, handoffTrace);
  expect(sent, "send-for-review must mint through visible customer controls").toBeTruthy();
  const copyReviewLinks = page.getByRole("button", { name: /Copy review link/i });
  if ((await copyReviewLinks.count()) === 0) {
    const manageRecipients = page.getByRole("button", { name: /^Manage recipients$/i }).first();
    if (await manageRecipients.isVisible().catch(() => false)) {
      await manageRecipients.click();
    }
  }
  if ((await copyReviewLinks.count()) > 0) {
    await expect(copyReviewLinks, "visible copy chrome must show four usable review links").toHaveCount(4);
  }
  await expect
    .poll(async () => {
      const rows = await fetchOwnerParties(page, agreementId);
      return SILVER_MESA_FOUR_PARTY.every((expected) => {
        const row = rows.find((candidate) => String(candidate.name || "").includes(expected.legalEntity));
        return Boolean(row?.id) && String(row?.email || "").toLowerCase() === expected.email.toLowerCase();
      })
        ? rows.length
        : 0;
    }, { timeout: 45_000 })
    .toBe(4);
  const parties = await fetchOwnerParties(page, agreementId);
  for (const expected of SILVER_MESA_FOUR_PARTY) {
    const row = parties.find((candidate) => String(candidate.name || "").includes(expected.legalEntity));
    expect(row?.id, `${expected.legalEntity} participant id`).toBeTruthy();
    expect(String(row?.email || "").toLowerCase(), `${expected.legalEntity} review email`).toBe(
      expected.email.toLowerCase(),
    );
    const partyMinted = await expect
      .poll(() => mintedTokenForParticipant(minted, "review", String(row?.id || "")), { timeout: 45_000 })
      .toBeTruthy()
      .then(() => mintedTokenForParticipant(minted, "review", String(row?.id || "")));
    const partyToken = String((partyMinted?.body as Record<string, unknown> | undefined)?.token || "");
    expect(partyToken.length, `${expected.legalEntity} identity-bound review token`).toBeGreaterThan(12);
    expect(String((partyMinted?.request as { recipient_party_id?: string } | undefined)?.recipient_party_id || "")).toBe(
      String(row?.id || ""),
    );
  }
  const authorityGets = handoffTrace.network.filter(
    (row) => row.method === "GET" && /\/api\/agreements\/[0-9a-f-]{36}$/i.test(row.path),
  );
  expect(authorityGets.some((row) => row.kind === "response" && row.ok === true), "authority GET must be an HTTP success").toBe(
    true,
  );
  expect(
    handoffTrace.console.some((row) => row.text.includes("abortKind: local_validation")),
    "mint must not abort on synthesized recipient_party_id_required",
  ).toBe(false);
  const silverRow = parties.find((candidate) => String(candidate.name || "").includes(SILVER_MESA));
  expect(silverRow?.id, "Silver Mesa participant id").toBeTruthy();
  const reviewMinted = mintedTokenForParticipant(minted, "review", String(silverRow?.id || ""));
  const token = String((reviewMinted?.body as Record<string, unknown> | undefined)?.token || "");
  expect(token.length, "Silver Mesa review token").toBeGreaterThan(12);

  const recipient = await openRecipientHref(
    browser,
    `/agreements/${agreementId}/review?t=${encodeURIComponent(token)}`,
  );
  const recipientShell = recipient.getByTestId("recipient-document-shell");
  await expect(recipientShell).toBeVisible({ timeout: 45_000 });
  await expect(recipientShell).toContainText(SILVER_MESA, { timeout: 30_000 });
  const recipientPaper = await recipientShell.innerText();
  assertSilverMesaFourPartyPaper(recipientPaper, "recipient review after handoff");
  expect(silverMesaNoticeAddress(recipientPaper)).toBe(ORIGINAL_SILVER_NOTICE);
  await recipient.context().close();
});

test("four-party Silver Mesa notice email persists through recipient proposal, accept, and fresh reopen", async ({
  page,
  browser,
}) => {
  test.setTimeout(540_000);
  const minted = captureRecipientMints(page);
  const handoffTrace = captureSilverMesaHandoffTrace(page);
  const capturedIds = captureServerAgreementIds(page);
  await seedCorePaidJourneyOwner(page);
  await installQualityEvalPageGuards(page);
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  await submitIntake(page, IRONCLAD_FOUR_PARTY_SILVER_MESA_INTAKE);
  await expect(page.getByTestId("agreement-intake-clarification")).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByTestId("milestone-payer-clarification-question")).toHaveCount(0, { timeout: 8_000 });

  let ownerPaper = "";
  await expect
    .poll(
      async () => {
        ownerPaper = await articleText(page, SILVER_MESA);
        return ownerPaper.includes("Ironclad Systems Group LLC") && ownerPaper.includes("Texas") ? ownerPaper.length : 0;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(ownerPaper, "author first draft");
  expect(silverMesaNoticeAddress(ownerPaper), "author first draft notice").toBe(ORIGINAL_SILVER_NOTICE);

  const agreementId = await waitForServerAgreementId(page, capturedIds);
  expect(agreementId.length).toBeGreaterThan(8);
  const firstSnap = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(firstSnap.ok, "canonical GET after create").toBeTruthy();
  assertSilverMesaFourPartyPaper(firstSnap.corpus, "persisted first draft");
  expect(silverMesaNoticeAddress(firstSnap.corpus)).toBe(ORIGINAL_SILVER_NOTICE);
  expect(silverMesaNoticeAddress(firstSnap.corpus), "persisted and displayed notice must agree").toBe(
    silverMesaNoticeAddress(ownerPaper),
  );

  const sent = await clickSilverMesaSendForReview(page, handoffTrace);
  expect(sent, "send-for-review must mount on the Silver Mesa four-party draft").toBeTruthy();
  const copyReviewLinks = page.getByRole("button", { name: /Copy review link/i });
  if ((await copyReviewLinks.count()) > 0) {
    await expect(copyReviewLinks, "success chrome must show four usable review links").toHaveCount(4);
  }
  await expect
    .poll(async () => {
      const rows = await fetchOwnerParties(page, agreementId);
      return SILVER_MESA_FOUR_PARTY.every((expected) => {
        const row = rows.find((candidate) => String(candidate.name || "").includes(expected.legalEntity));
        return Boolean(row?.id) && String(row?.email || "").toLowerCase() === expected.email.toLowerCase();
      })
        ? rows.length
        : 0;
    }, { timeout: 45_000 })
    .toBe(4);
  const parties = await fetchOwnerParties(page, agreementId);
  for (const expected of SILVER_MESA_FOUR_PARTY) {
    const row = parties.find((candidate) => String(candidate.name || "").includes(expected.legalEntity));
    expect(row?.id, `${expected.legalEntity} participant id`).toBeTruthy();
    expect(String(row?.email || "").toLowerCase(), `${expected.legalEntity} review email`).toBe(
      expected.email.toLowerCase(),
    );
    const partyMinted = await expect
      .poll(() => mintedTokenForParticipant(minted, "review", String(row?.id || "")), { timeout: 45_000 })
      .toBeTruthy()
      .then(() => mintedTokenForParticipant(minted, "review", String(row?.id || "")));
    const partyToken = String((partyMinted?.body as Record<string, unknown> | undefined)?.token || "");
    expect(partyToken.length, `${expected.legalEntity} identity-bound review token`).toBeGreaterThan(12);
  }
  const silverRow = parties.find((candidate) => String(candidate.name || "").includes(SILVER_MESA));
  expect(silverRow?.id, "Silver Mesa participant id").toBeTruthy();
  const reviewMinted = mintedTokenForParticipant(minted, "review", String(silverRow?.id || ""));
  const token = String((reviewMinted?.body as Record<string, unknown> | undefined)?.token || "");
  expect(token.length, "Silver Mesa review token").toBeGreaterThan(12);

  const recipient = await openRecipientHref(
    browser,
    `/agreements/${agreementId}/review?t=${encodeURIComponent(token)}`,
  );
  const recipientShell = recipient.getByTestId("recipient-document-shell");
  await expect(recipientShell).toBeVisible({ timeout: 45_000 });
  await expect(recipientShell).toContainText(SILVER_MESA, { timeout: 30_000 });
  const recipientPaper = await recipientShell.innerText();
  assertSilverMesaFourPartyPaper(recipientPaper, "recipient review before proposal");
  expect(silverMesaNoticeAddress(recipientPaper)).toBe(ORIGINAL_SILVER_NOTICE);

  const proposalEvents = captureProposalPosts(recipient);
  const propose = recipient
    .getByTestId("recipient-review-propose-updated-draft")
    .or(recipient.getByRole("button", { name: /Suggest revision/i }));
  await expect(propose.first()).toBeVisible({ timeout: 20_000 });
  await propose.first().click();
  const editor = recipient.getByTestId("recipient-edit-draft-textarea");
  await expect(editor).toBeVisible({ timeout: 15_000 });
  const proposedPaper = recipientPaper.split(ORIGINAL_SILVER_NOTICE).join(PROPOSED_SILVER_NOTICE);
  expect(proposedPaper, "proposal must actually change the notice").toContain(PROPOSED_SILVER_NOTICE);
  expect(proposedPaper).not.toContain(ORIGINAL_SILVER_NOTICE);
  await editor.fill(proposedPaper);
  expect(await editor.inputValue()).toContain(PROPOSED_SILVER_NOTICE);
  expect(await editor.inputValue()).not.toContain(ORIGINAL_SILVER_NOTICE);
  const compare = recipient.getByTestId("recipient-compare-versions-button");
  if (await compare.isVisible().catch(() => false)) await compare.click();
  const openSend = recipient
    .getByTestId("recipient-open-send-suggested-edits-modal")
    .or(recipient.getByRole("button", { name: /^Submit proposed update$/i }));
  await expect(openSend.first()).toBeVisible({ timeout: 20_000 });
  await openSend.first().click();
  const confirm = recipient.getByTestId("recipient-send-suggested-edits-confirm");
  await expect(confirm).toBeVisible({ timeout: 15_000 });
  await confirm.click();
  await expect
    .poll(async () => /pending owner review/i.test(await recipient.locator("body").innerText()), { timeout: 20_000 })
    .toBeTruthy();
  await expect
    .poll(() => proposalEvents.some((event) => event.ok && event.proposalId && event.url.endsWith("/recipient-proposal")), {
      timeout: 15_000,
    })
    .toBeTruthy();
  await recipient.context().close();

  await page.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  let ownerBeforeAccept = "";
  await expect
    .poll(
      async () => {
        ownerBeforeAccept = await articleText(page, SILVER_MESA);
        return ownerBeforeAccept.includes("Ironclad Systems Group LLC") ? ownerBeforeAccept.length : 0;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  expect(silverMesaNoticeAddress(ownerBeforeAccept), "current accepted draft must keep the original notice").toBe(
    ORIGINAL_SILVER_NOTICE,
  );
  expect(ownerBeforeAccept, "current accepted draft must not show the proposed notice yet").not.toContain(
    PROPOSED_SILVER_NOTICE,
  );
  const pendingSnap = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(silverMesaNoticeAddress(pendingSnap.corpus)).toBe(ORIGINAL_SILVER_NOTICE);
  expect(pendingSnap.corpus).not.toContain(PROPOSED_SILVER_NOTICE);

  const applyEvents = captureApplyPosts(page);
  await page.goto(`/app/review-changes/${encodeURIComponent(agreementId)}`, { waitUntil: "domcontentloaded" });
  const loadError = page.getByTestId("owner-proposal-review-load-error");
  expect(await loadError.isVisible({ timeout: 4_000 }).catch(() => false), "owner review must load").toBeFalsy();
  const accept = page.getByTestId("owner-proposal-review-accept");
  await expect(accept).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await page.locator("body").innerText()).includes(PROPOSED_SILVER_NOTICE), { timeout: 20_000 })
    .toBeTruthy();
  await accept.scrollIntoViewIfNeeded();
  await accept.click();
  await expect
    .poll(
      () => applyEvents.some((event) => event.ok && event.url.includes("/apply")),
      { timeout: 20_000 },
    )
    .toBeTruthy();
  await expect(page.getByTestId("owner-proposal-accept-success")).toBeVisible({ timeout: 20_000 });

  const acceptedGet = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(acceptedGet.agreementId, "authorized GET agreement id after accept").toBe(agreementId);
  expect(acceptedGet.snapshotId, "accepted snapshot id from authorized GET").toBeTruthy();
  expect(acceptedGet.digest, "accepted digest from authorized GET").toBeTruthy();
  expect(acceptedGet.status, "accepted snapshot status from authorized GET").toBe("accepted");
  expect(acceptedGet.length, "accepted corpus length from authorized GET").toBeGreaterThan(400);
  expect(silverMesaNoticeAddress(acceptedGet.corpus), "accepted GET notice").toBe(PROPOSED_SILVER_NOTICE);

  await page.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  await waitForOwnerWorkspaceReady(page, agreementId);
  await expect.poll(async () => readCreateResumeClientEvidence(page).then((row) => row.hrefAgreementId), {
    timeout: 20_000,
  }).toBe(agreementId);
  let ownerAfterAccept = "";
  await expect
    .poll(
      async () => {
        ownerAfterAccept = await articleText(page, SILVER_MESA);
        if (!ownerAfterAccept.includes("Ironclad Systems Group LLC")) return 0;
        if (silverMesaNoticeAddress(ownerAfterAccept) !== PROPOSED_SILVER_NOTICE) return 0;
        return ownerAfterAccept.length;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  const afterAcceptClient = await readCreateResumeClientEvidence(page);
  expect(afterAcceptClient.hrefAgreementId, "create route agreement id").toBe(agreementId);
  expect(afterAcceptClient.displayAgreementId, "display authority agreement id").toBe(agreementId);
  expect(afterAcceptClient.displaySnapshotId, "display authority snapshot id").toBe(acceptedGet.snapshotId);
  expect(afterAcceptClient.displayDigest, "display authority digest").toBe(acceptedGet.digest);
  expect(afterAcceptClient.displayStatus, "display authority status").toBe("accepted");
  expect(afterAcceptClient.articleHasAcceptedNotice, "article uses accepted notice").toBe(true);
  expect(afterAcceptClient.articleHasOriginalNoticeLine, "article must not restore original notice line").toBe(false);
  assertSilverMesaFourPartyPaper(ownerAfterAccept, "author after accept");
  expect(silverMesaNoticeAddress(ownerAfterAccept)).toBe(PROPOSED_SILVER_NOTICE);
  expect(ownerAfterAccept, "displayed paper must not restore the original notice").not.toContain(ORIGINAL_SILVER_NOTICE);
  const acceptedSnap = await fetchOwnerCanonicalSnapshot(page, agreementId);
  assertSilverMesaFourPartyPaper(acceptedSnap.corpus, "persisted after accept");
  expect(silverMesaNoticeAddress(acceptedSnap.corpus)).toBe(PROPOSED_SILVER_NOTICE);
  expect(acceptedSnap.corpus).not.toContain(ORIGINAL_SILVER_NOTICE);

  const freshAuthorCtx = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1280, height: 800 },
  });
  const freshAuthor = await freshAuthorCtx.newPage();
  await seedCorePaidJourneyOwner(freshAuthor);
  await installQualityEvalPageGuards(freshAuthor);
  await freshAuthor.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  await waitForOwnerWorkspaceReady(freshAuthor, agreementId);
  let reopenedAuthor = "";
  await expect
    .poll(
      async () => {
        reopenedAuthor = await articleText(freshAuthor, SILVER_MESA);
        return reopenedAuthor.includes("Ironclad Systems Group LLC") ? reopenedAuthor.length : 0;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(reopenedAuthor, "fresh author session");
  expect(silverMesaNoticeAddress(reopenedAuthor), "fresh author must keep accepted notice").toBe(PROPOSED_SILVER_NOTICE);
  expect(reopenedAuthor, "fresh author must not restore original notice").not.toContain(ORIGINAL_SILVER_NOTICE);
  const freshGet = await fetchOwnerCanonicalSnapshot(freshAuthor, agreementId);
  expect(silverMesaNoticeAddress(freshGet.corpus)).toBe(PROPOSED_SILVER_NOTICE);
  expect(freshGet.corpus).not.toContain(ORIGINAL_SILVER_NOTICE);
  await freshAuthorCtx.close();

  const freshRecipient = await openRecipientHref(
    browser,
    `/agreements/${agreementId}/review?t=${encodeURIComponent(token)}`,
  );
  const freshShell = freshRecipient.getByTestId("recipient-document-shell");
  await expect(freshShell).toBeVisible({ timeout: 45_000 });
  const reopenedRecipient = await freshShell.innerText();
  assertSilverMesaFourPartyPaper(reopenedRecipient, "fresh recipient session");
  expect(silverMesaNoticeAddress(reopenedRecipient), "fresh recipient must keep accepted notice").toBe(
    PROPOSED_SILVER_NOTICE,
  );
  expect(reopenedRecipient, "fresh recipient must not restore original notice").not.toContain(ORIGINAL_SILVER_NOTICE);
  await freshRecipient.context().close();

  const acceptedRevision = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(acceptedRevision.snapshotId, "accepted snapshot id after reopen").toBeTruthy();
  expect(acceptedRevision.digest, "accepted snapshot digest after reopen").toBeTruthy();
  expect(acceptedRevision.snapshotId).toBe(freshGet.snapshotId);
  expect(acceptedRevision.digest).toBe(freshGet.digest);
  expect(silverMesaNoticeAddress(acceptedRevision.corpus)).toBe(PROPOSED_SILVER_NOTICE);
  expect(acceptedRevision.corpus).not.toContain(`Email: ${ORIGINAL_SILVER_NOTICE}`);
  expect(acceptedRevision.status).toBe("accepted");
  expect(acceptedRevision.snapshotId).toBe(acceptedGet.snapshotId);
  expect(acceptedRevision.digest).toBe(acceptedGet.digest);
  return;

  await page.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  await waitForOwnerWorkspaceReady(page, agreementId);
  await expect
    .poll(
      async () => {
        const paper = await articleText(page, SILVER_MESA);
        return paper.includes("Ironclad Systems Group LLC") && silverMesaNoticeAddress(paper) === PROPOSED_SILVER_NOTICE
          ? paper.length
          : 0;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  await expect
    .poll(async () => {
      if (await page.locator('[data-claw-recipient-field="r1-signer-name"]').first().isVisible().catch(() => false)) {
        return 1;
      }
      if (
        await page
          .getByTestId("paid-pro-forced-add-signer-details")
          .or(page.getByTestId("pro-review-add-signer-details"))
          .or(page.getByTestId("simple-pro-send-for-signature"))
          .or(page.getByRole("button", { name: /Add signer details|Complete signer details|Finalize signer details|Prepare for signing/i }))
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        return 1;
      }
      return 0;
    }, { timeout: 45_000 })
    .toBe(1);
  await completeSignerDetailsThroughVisibleCustomerUi(
    page,
    agreementId,
    SILVER_MESA_FOUR_PARTY.map((party) => ({
      legalEntity: party.legalEntity,
      signerName: party.signerName,
      signerEmail: party.email,
    })),
    { bindSignerNamesIntoAcceptedPaper: false },
  );
  const afterSignerSetup = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(afterSignerSetup.snapshotId, "signer setup must not mint a new accepted snapshot").toBe(
    acceptedRevision.snapshotId,
  );
  expect(afterSignerSetup.digest, "signer setup must not rewrite accepted digest").toBe(acceptedRevision.digest);
  await assertSilverMesaVisibleSignerIdentities(page, "immediately before signing preparation");
  expect(
    (await readVisibleField(page, SILVER_MESA_SIGNER_FIELDS[3]!.emailFields))?.value,
    "Olivia remains reviewer/signer email",
  ).toBe(ORIGINAL_SILVER_NOTICE);

  const sentSigning = await clickOwnerSend(page, "simple-pro-send-for-signature", SILVER_MESA_SIGNER_FIELDS);
  expect(sentSigning, "prepare-for-signing must mount after accepted notice").toBeTruthy();
  await expect
    .poll(async () => {
      const handoffNow = await fetchOwnerSigningHandoff(page, agreementId);
      const requiredRoles = handoffNow.packetRoles.filter((row) => row.requiresSignature !== false && row.partyId);
      if (requiredRoles.length !== SILVER_MESA_FOUR_PARTY.length) return 0;
      return requiredRoles.every((role) => mintedTokenForParticipant(minted, "sign", String(role.partyId))) ? 1 : 0;
    }, { timeout: 45_000 })
    .toBe(1);

  const freezeSnap = await fetchOwnerCanonicalSnapshot(page, agreementId);
  expect(freezeSnap.snapshotId, "signing freeze must keep the accepted snapshot id").toBe(acceptedRevision.snapshotId);
  expect(freezeSnap.digest, "signing freeze must keep the accepted digest").toBe(acceptedRevision.digest);
  expect(silverMesaNoticeAddress(freezeSnap.corpus), "signing freeze corpus notice").toBe(PROPOSED_SILVER_NOTICE);
  expect(freezeSnap.corpus).not.toContain(`Email: ${ORIGINAL_SILVER_NOTICE}`);
  assertSilverMesaFourPartyPaper(freezeSnap.corpus, "signing freeze snapshot");

  const handoff = await fetchOwnerSigningHandoff(page, agreementId);
  expect(handoff.acceptedSnapshotId, "draft accepted snapshot id").toBe(acceptedRevision.snapshotId);
  expect(handoff.acceptedDigest, "draft accepted digest").toBe(acceptedRevision.digest);
  expect(handoff.lockSnapshotId, "signing lock snapshot").toBe(acceptedRevision.snapshotId);
  expect(handoff.lockDigest, "signing lock digest").toBe(acceptedRevision.digest);
  expect(handoff.packetSnapshotId, "packet accepted snapshot provenance").toBe(acceptedRevision.snapshotId);
  expect(handoff.packetDigest, "packet accepted digest provenance").toBe(acceptedRevision.digest);
  expect(handoff.packetCorpus.length, "signing packet corpus must come from the packet, not accepted snapshot fallback").toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(handoff.packetCorpus, "signing packet");
  expect(silverMesaNoticeAddress(handoff.packetCorpus)).toBe(PROPOSED_SILVER_NOTICE);
  expect(handoff.packetCorpus).not.toContain(`Email: ${ORIGINAL_SILVER_NOTICE}`);
  const requiredPacketRoles = handoff.packetRoles.filter((row) => row.requiresSignature !== false);
  expect(requiredPacketRoles.length, "required signing participants come from packet roles").toBe(
    SILVER_MESA_FOUR_PARTY.length,
  );
  for (const expected of SILVER_MESA_FOUR_PARTY) {
    const role = requiredPacketRoles.find((row) =>
      String(row.entityName || "").includes(expected.legalEntity),
    );
    expect(role?.partyId, `${expected.legalEntity} packet party id`).toBeTruthy();
    expect(role?.signerName, `${expected.legalEntity} packet signer`).toBe(expected.signerName);
    expect(String(role?.signerEmail || "").toLowerCase(), `${expected.legalEntity} packet email`).toBe(
      expected.email.toLowerCase(),
    );
  }

  const persistDir =
    process.env.FOUR_PARTY_PERSIST_OUTPUT ||
    join("..", "evals", "commercial-readiness", "results", "four-party-applied-revision-persist", "local");
  mkdirSync(persistDir, { recursive: true });
  writeFileSync(
    join(persistDir, "silver-mesa-accepted-to-signing-binding.json"),
    JSON.stringify(
      {
        agreementId,
        acceptedSnapshotId: acceptedRevision.snapshotId,
        acceptedDigest: acceptedRevision.digest,
        freezeSnapshotId: freezeSnap.snapshotId,
        freezeDigest: freezeSnap.digest,
        lockSnapshotId: handoff.lockSnapshotId,
        lockDigest: handoff.lockDigest,
        packetSnapshotId: handoff.packetSnapshotId,
        packetDigest: handoff.packetDigest,
      },
      null,
      2,
    ),
    "utf8",
  );

  const silverSignRole = requiredPacketRoles.find((row) =>
    String(row.entityName || "").includes(SILVER_MESA),
  );
  expect(silverSignRole?.partyId, "Silver Mesa sign participant from packet roles").toBeTruthy();
  expect(silverSignRole?.signerName).toBe("Olivia Hart");
  expect(String(silverSignRole?.signerEmail || "").toLowerCase()).toBe(ORIGINAL_SILVER_NOTICE);
  const signMinted = mintedTokenForParticipant(minted, "sign", String(silverSignRole?.partyId || ""));
  const signToken = String((signMinted?.body as Record<string, unknown> | undefined)?.token || "");
  expect(signToken.length, "Silver Mesa signing token").toBeGreaterThan(12);

  const signerSession = await openRecipientHref(
    browser,
    `/agreements/${agreementId}/sign?t=${encodeURIComponent(signToken)}`,
  );
  const identity = signerSession
    .locator(".vs01-recipient-signing-name, .vs01-recipient-signing-email, [data-testid='recipient-public-sign-route']")
    .first();
  await expect(identity).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
  const chrome = await signerSession.locator("body").innerText();
  expect(chrome, "fresh signer chrome must identify Olivia").toMatch(/Olivia Hart/i);
  expect(chrome, "fresh signer chrome must keep Olivia access email").toContain(ORIGINAL_SILVER_NOTICE);
  expect(chrome, "fresh signer chrome must identify Silver Mesa").toContain(SILVER_MESA);

  let signerPaper = "";
  await expect
    .poll(
      async () => {
        signerPaper = await silverMesaSigningViewText(signerSession);
        if (!signerPaper.includes(SILVER_MESA)) return 0;
        if (silverMesaNoticeAddress(signerPaper) !== PROPOSED_SILVER_NOTICE) return 0;
        return signerPaper.length;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(signerPaper, "fresh Silver Mesa signer session");
  expect(silverMesaNoticeAddress(signerPaper), "signer view must keep accepted notice").toBe(PROPOSED_SILVER_NOTICE);
  expect(signerPaper, "signer view must not restore original notice as Email line").not.toContain(
    `Email: ${ORIGINAL_SILVER_NOTICE}`,
  );
  expect(signerPaper).toContain("Olivia Hart");
  expect(signerPaper).toContain("Analyst");
  await signerSession.context().close();
});
