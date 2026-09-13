import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  assertCorePaidJourneyAcceptanceContracts,
} from "../../src/launch/corePaidJourneyAcceptanceCoverage";
import {
  CORE_PAID_JOURNEY_EXPECTED_FACTS as FACTS,
  CORE_PAID_JOURNEY_FILLED_INTAKE,
  CORE_PAID_JOURNEY_SPARSE_INTAKE,
  articleContainsExpectedFacts,
  articlePresentationIssues,
  articleQualityDefects,
  describeOperativeArticleCompare,
  operativeArticleFingerprint,
  type CorePaidJourneyRowId,
} from "../../src/launch/corePaidJourneyAcceptanceMatrix";
import {
  persistCorePaidJourneyArticle,
  persistCorePaidJourneyArticleCompare,
  persistCorePaidJourneyNetwork,
  persistCorePaidJourneyRow,
  writeAggregatedMatrix,
} from "./corePaidJourneyRowPersist";
import {
  captureRecipientMints,
  loadCorePaidJourneyRuntime,
  seedCorePaidJourneyOwner,
  type RecipientTokenEvent,
} from "./corePaidJourneyLiveAuth";

const CLARIFICATION = "agreement-intake-clarification";
const PROPOSAL_MARKER = "PROPOSED-IRONVALE-STEERING-CADENCE-WEEKLY";

type SignerSetupStatus = "success" | "failure" | "blocked";
type SignerSetupResult = { status: SignerSetupStatus; detail: string };

function ctx() {
  const info = test.info();
  return { project: info.project.name, test: info.title };
}

function record(
  id: CorePaidJourneyRowId,
  status: "pass" | "fail" | "blocked",
  detail: string,
): void {
  persistCorePaidJourneyRow({ ...ctx(), id, status, detail });
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
    .toBeGreaterThan(400);
  return articleText(page);
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

async function fillVisibleField(
  page: Page,
  selectors: string[],
  value: string,
): Promise<"filled" | "missing" | "failed"> {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    const count = await field.count().catch(() => 0);
    if (count === 0) continue;
    const visible = await field.isVisible().catch(() => false);
    if (!visible) continue;
    try {
      await field.fill(value, { timeout: 1_500 });
      const current = await field.inputValue();
      return current.trim() === value.trim() ? "filled" : "failed";
    } catch {
      return "failed";
    }
  }
  return "missing";
}

async function completeSignerSetup(page: Page): Promise<SignerSetupResult> {
  const deadline = Date.now() + 12_000;
  const sendReady = page.getByTestId("simple-pro-send-for-review").or(page.getByTestId("simple-pro-send-for-signature"));
  if (await sendReady.first().isVisible().catch(() => false)) {
    const body = await page.locator("body").innerText();
    const participantsPresent = FACTS.signers.every((signer) => body.includes(signer.name) || body.includes(signer.email));
    if (participantsPresent) {
      return { status: "success", detail: "send CTAs already mounted; intake names/emails visible" };
    }
    return {
      status: "blocked",
      detail: "send CTAs visible but required participant names/emails were not proven on screen",
    };
  }
  await page.getByRole("button", { name: /Complete signer details|Finalize signer details/i }).first().scrollIntoViewIfNeeded().catch(() => undefined);
  const emailField = page.locator('[data-claw-recipient-field="r1-email"], [data-testid="signer-email-input-0"]').first();
  const openSetup = page.getByRole("button", { name: /Complete signer details|Finalize signer details/i }).first();
  if (!(await emailField.isVisible().catch(() => false))) {
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

  const required: { label: string; result: "filled" | "missing" | "failed" }[] = [];
  required.push({
    label: "r1-name",
    result: await fillVisibleField(page, ['[data-claw-recipient-field="r1-name"]'], FACTS.parties[0].name),
  });
  required.push({
    label: "r2-name",
    result: await fillVisibleField(page, ['[data-claw-recipient-field="r2-name"]'], FACTS.parties[1].name),
  });
  required.push({
    label: "r1-signer",
    result: await fillVisibleField(
      page,
      ['[data-claw-recipient-field="r1-signer-name"]', '[data-testid="signer-name-input-0"]'],
      FACTS.signers[0].name,
    ),
  });
  required.push({
    label: "r2-signer",
    result: await fillVisibleField(
      page,
      ['[data-claw-recipient-field="r2-signer-name"]', '[data-testid="signer-name-input-1"]'],
      FACTS.signers[1].name,
    ),
  });
  required.push({
    label: "r1-email",
    result: await fillVisibleField(
      page,
      ['[data-claw-recipient-field="r1-email"]', '[data-testid="signer-email-input-0"]'],
      FACTS.signers[0].email,
    ),
  });
  required.push({
    label: "r2-email",
    result: await fillVisibleField(
      page,
      ['[data-claw-recipient-field="r2-email"]', '[data-testid="signer-email-input-1"]'],
      FACTS.signers[1].email,
    ),
  });
  const failed = required.filter((row) => row.result === "failed").map((row) => row.label);
  const missing = required.filter((row) => row.result === "missing").map((row) => row.label);
  const filled = required.filter((row) => row.result === "filled").map((row) => row.label);

  const advance = page
    .getByRole("button", {
      name: /Finalize signer details and continue to review decision|Complete signer details|Save signer details|Continue to review/i,
    })
    .first();
  if (Date.now() < deadline && await advance.isVisible().catch(() => false) && !(await advance.isDisabled().catch(() => true))) {
    await advance.click();
  }

  const sendVisible = await sendReady.first().isVisible({ timeout: 3_000 }).catch(() => false);
  const body = await page.locator("body").innerText();
  const participantsPresent = FACTS.signers.every((signer) => body.includes(signer.name) || body.includes(signer.email));
  if (failed.length > 0) {
    return { status: "failure", detail: `required field fill failed: ${failed.join(",")}` };
  }
  if (sendVisible && participantsPresent && missing.length === 0) {
    return { status: "success", detail: `filled ${filled.join(",") || "existing"}` };
  }
  if (missing.length > 0) {
    return { status: "blocked", detail: `required fields absent: ${missing.join(",")}` };
  }
  return {
    status: sendVisible ? "blocked" : "blocked",
    detail: sendVisible
      ? "send CTA mounted but intake names/emails did not appear on the durable participant surface"
      : "signer setup deadline reached without send CTA",
  };
}

async function draftThroughVisiblePaper(
  page: Page,
  opts?: { recordInterview?: boolean; skipSignerSetup?: boolean; skipSparse?: boolean },
): Promise<{ agreementId: string; article: string; minted: RecipientTokenEvent[]; setup: SignerSetupResult }> {
  const minted = captureRecipientMints(page);
  const capturedIds = captureServerAgreementIds(page);
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  if (opts?.skipSparse) {
    await submitIntake(page, CORE_PAID_JOURNEY_FILLED_INTAKE);
    await expect(page.getByTestId(CLARIFICATION)).toHaveCount(0, { timeout: 30_000 });
    const article = await waitForPaintedArticle(page);
    const agreementId = await waitForServerAgreementId(page, capturedIds);
    persistCorePaidJourneyArticle({ ...ctx(), agreementId, article });
    const setup = opts?.skipSignerSetup
      ? { status: "blocked" as const, detail: "signer setup omitted for pre-setup continuity" }
      : await completeSignerSetup(page);
    return { agreementId, article, minted, setup };
  }
  await submitIntake(page, CORE_PAID_JOURNEY_SPARSE_INTAKE);
  const clarification = page.getByTestId(CLARIFICATION);
  await expect(clarification).toBeVisible({ timeout: 20_000 });
  const sparseBody = await page.locator("body").innerText();
  if (opts?.recordInterview) {
    record(
      "I1_sparse_asks_targeted_questions",
      /name the parties|legal names|consultant|client/i.test(await clarification.innerText()) ? "pass" : "fail",
      "clarification panel after sparse intake",
    );
    record(
      "I3_missing_facts_are_not_invented",
      !FACTS.parties.some((party) => sparseBody.includes(party.name)) &&
        (await page.getByRole("button", { name: /^(Send|Sign|Freeze)$/i }).count()) === 0
        ? "pass"
        : "fail",
      "sparse path must not invent Harbor/Ironvale or offer send/sign",
    );
  }

  const editMyself = page.getByRole("button", { name: /edit myself|revise|i.?ll edit/i }).first();
  if (await editMyself.isVisible().catch(() => false)) {
    await editMyself.click();
  }
  await submitIntake(page, CORE_PAID_JOURNEY_FILLED_INTAKE);
  await expect(page.getByTestId(CLARIFICATION)).toHaveCount(0, { timeout: 30_000 });

  const article = await waitForPaintedArticle(page);
  const missing = articleContainsExpectedFacts(article);
  const defects = articleQualityDefects(article);
  const presentation = articlePresentationIssues(article);
  if (opts?.recordInterview) {
    const answersRetained =
      article.includes(FACTS.parties[0].name) &&
      article.includes(FACTS.parties[1].name) &&
      article.includes(FACTS.economics);
    record(
      "I2_retains_answers_does_not_reask",
      answersRetained ? "pass" : "fail",
      answersRetained
        ? "same-session clarification answers appear on the painted paper"
        : "filled answers were not retained on the painted paper",
    );
    record(
      "Q1_article_matches_expected_facts",
      missing.length === 0 ? "pass" : "fail",
      missing.join(",") || `facts present; presentation=${presentation.map((p) => p.code).join(",") || "ok"}`,
    );
    record(
      "Q2_article_rejects_placeholders_and_filler",
      defects.length === 0 ? "pass" : "fail",
      defects.join(",") || "no quality defects",
    );
  }
  const agreementId = await waitForServerAgreementId(page, capturedIds);
  persistCorePaidJourneyArticle({ ...ctx(), agreementId, article });
  const setup = opts?.skipSignerSetup
    ? { status: "blocked" as const, detail: "signer setup omitted for pre-setup continuity" }
    : await completeSignerSetup(page);
  return { agreementId, article, minted, setup };
}

function mintedToken(events: RecipientTokenEvent[], mode: "review" | "sign"): RecipientTokenEvent | undefined {
  return events.find((row) => {
    const body = row.body && typeof row.body === "object" ? row.body : {};
    const req = row.request || {};
    return row.ok && (String(body.mode || req.mode || "") === mode) && String(body.token || "").length > 12;
  });
}

function configuredLiveApiBase(): string {
  return String(process.env.CORE_PAID_JOURNEY_LIVE_API || "").replace(/\/$/, "");
}

type OwnerAgreementParty = {
  id?: string;
  name?: string;
  role?: string;
  email?: string;
  signerName?: string;
  signer_name?: string;
  signerEmail?: string;
  signer_email?: string;
};

async function fetchOwnerAgreementState(
  page: Page,
  agreementId: string,
): Promise<{ parties: OwnerAgreementParty[]; lockedVersionId: string; signedParticipantIds: string[] }> {
  const api = configuredLiveApiBase();
  expect(api, "CORE_PAID_JOURNEY_LIVE_API must configure the production API origin").toBeTruthy();
  const runtime = loadCorePaidJourneyRuntime();
  const res = await page.request.get(`${api}/api/agreements/${encodeURIComponent(agreementId)}`, {
    headers: {
      Authorization: `Bearer ${runtime.access_token}`,
      "X-Claw-Org-Id": runtime.org_id,
    },
  });
  expect(res.ok(), `authenticated owner GET failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as {
    draft?: {
      parties?: OwnerAgreementParty[];
      audit_log?: Array<{ event_type?: string; value?: { participant_id?: string } }>;
    };
    signing_lock?: { locked_version_id?: string } | null;
  };
  const signedParticipantIds = (body.draft?.audit_log || [])
    .filter((row) => String(row.event_type || "") === "signature_completed")
    .map((row) => String(row.value?.participant_id || "").trim())
    .filter(Boolean);
  return {
    parties: Array.isArray(body.draft?.parties) ? body.draft.parties : [],
    lockedVersionId: String(body.signing_lock?.locked_version_id || "").trim(),
    signedParticipantIds,
  };
}

function verifiedParticipantId(
  parties: OwnerAgreementParty[],
  partyName: string,
  signerName: string,
): string {
  const matches = parties.filter((party) => String(party.name || "").includes(partyName));
  if (matches.length !== 1) return "";
  const party = matches[0];
  const id = String(party.id || "").trim();
  if (!id) return "";
  const signer = String(party.signerName || party.signer_name || "").trim();
  if (signer && !signer.includes(signerName)) return "";
  return id;
}

async function openRecipientPage(browser: Browser, href: string): Promise<Page> {
  const viewport = requiredRecipientViewport();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const size = page.viewportSize();
  expect(size, "recipient context must expose an explicit viewport").toEqual(viewport);
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.goto(href, { waitUntil: "domcontentloaded" });
  const afterNav = page.viewportSize();
  expect(afterNav, "recipient viewport must survive navigation").toEqual(viewport);
  return page;
}

async function recipientPaperText(page: Page): Promise<string> {
  const shell = page.getByTestId("recipient-document-shell");
  await expect(shell).toBeVisible({ timeout: 45_000 });
  await expect(shell).toContainText(FACTS.parties[0].name, { timeout: 30_000 });
  return shell.innerText();
}

function captureRecipientApprove(page: Page): { ok: boolean; status: number }[] {
  return captureServerPosts(page, "/recipient-approve");
}

function captureServerPosts(page: Page, needle: string): { ok: boolean; status: number; url: string }[] {
  const events: { ok: boolean; status: number; url: string }[] = [];
  page.on("response", (res) => {
    if (res.request().method() !== "POST" || !res.url().includes(needle)) return;
    events.push({ ok: res.ok(), status: res.status(), url: res.url() });
  });
  return events;
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
          (body && typeof body === "object" ? (body as { proposal_id?: unknown }).proposal_id : "") ||
            requestId,
        ).trim();
        events.push({ ok: res.ok(), status: res.status(), url: res.url(), proposalId });
      })
      .catch(() => {
        events.push({ ok: res.ok(), status: res.status(), url: res.url(), proposalId: "" });
      });
  });
  return events;
}

async function fetchOwnerPersistedProposalIds(page: Page, agreementId: string): Promise<string[]> {
  const api = configuredLiveApiBase();
  const runtime = loadCorePaidJourneyRuntime();
  const res = await page.request.get(`${api}/api/agreements/${encodeURIComponent(agreementId)}`, {
    headers: {
      Authorization: `Bearer ${runtime.access_token}`,
      "X-Claw-Org-Id": runtime.org_id,
    },
  });
  if (!res.ok()) return [];
  const body = (await res.json()) as {
    draft?: { audit_log?: Array<{ event_type?: string; value?: { proposal_id?: string } }> };
  };
  return (body.draft?.audit_log || [])
    .filter((row) => String(row.event_type || "").includes("recipient_proposal"))
    .map((row) => String(row.value?.proposal_id || "").trim())
    .filter(Boolean);
}

async function completeRequiredSignerCeremony(args: {
  browser: Browser;
  agreementId: string;
  minted: RecipientTokenEvent;
  signerName: string;
  ownerArticle: string;
  lockId: string;
  existingInvitationPage?: Page;
}): Promise<{ ok: boolean; stillComplete: boolean; detail: string; paper: string }> {
  const token = String((args.minted.body as Record<string, unknown>).token || "");
  const version = String((args.minted.body as Record<string, unknown>).locked_version_id || args.lockId);
  const existing = args.existingInvitationPage;
  const openedFresh = !existing;
  let recipient: Page;
  let completeEvents: { ok: boolean; status: number; url: string }[];
  if (existing) {
    recipient = existing;
    completeEvents = captureServerPosts(recipient, "/signing-ceremony/complete");
  } else {
    const viewport = requiredRecipientViewport();
    const context = await args.browser.newContext({ viewport });
    recipient = await context.newPage();
    completeEvents = captureServerPosts(recipient, "/signing-ceremony/complete");
    recipient.on("dialog", (dialog) => {
      void dialog.accept();
    });
    await recipient.goto(`/agreements/${args.agreementId}/sign?t=${encodeURIComponent(token)}`, {
      waitUntil: "domcontentloaded",
    });
  }
  try {
    const paper = await recipientPaperText(recipient);
    const authority = recipient.getByTestId("recipient-review-authority-meta");
    const versionAttr = (await authority.getAttribute("data-locked-version-id").catch(() => "")) || "";
    const sameVersion = Boolean(version) && Boolean(versionAttr) && version === versionAttr;
    const ownerHash = operativeArticleFingerprint(args.ownerArticle);
    const recipientHash = operativeArticleFingerprint(paper);
    const sameOperative = ownerHash === recipientHash && ownerHash.length > 4;
    const paperRoleGaps = articleContainsExpectedFacts(paper).filter((m) => m.startsWith("party_role:"));
    const readsLockedPaper =
      sameVersion &&
      FACTS.parties.every((party) => paper.includes(party.name)) &&
      FACTS.signers.every((signer) => paper.includes(signer.name)) &&
      paper.includes(FACTS.economics) &&
      paperRoleGaps.length === 0;
    const complete = recipient.getByTestId("recipient-sign-complete-status");
    const action = recipient.locator('[data-testid="recipient-sign-action"]:visible');
    const signedCopy = recipient.getByText(/Signed\. Confirmation saved\.|Your signature has been recorded\./i);
    const signedUiVisible = async () =>
      (await complete.isVisible().catch(() => false)) ||
      (await signedCopy.first().isVisible().catch(() => false));
    await expect(complete.or(action).or(signedCopy.first())).toBeVisible({ timeout: 30_000 });
    if (!(await signedUiVisible())) {
      const typed = recipient.getByTestId("recipient-sign-typed-name");
      if (await typed.isVisible().catch(() => false)) {
        await typed.fill(args.signerName);
      }
      const consent = recipient.getByTestId("recipient-sign-consent");
      if (await consent.isVisible().catch(() => false)) {
        await consent.click();
      }
      if (await action.isEnabled().catch(() => false)) {
        await action.click({ timeout: 8_000 }).catch(() => undefined);
      }
      await expect(complete.or(signedCopy.first())).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
    }
    const completed = await signedUiVisible();
    const completeText = completed
      ? (await complete.innerText().catch(() => "")) || (await signedCopy.first().innerText().catch(() => ""))
      : "";
    const participantId = mintPartyId(args.minted);
    const signedIds = (await fetchOwnerAgreementState(recipient, args.agreementId).catch(() => ({
      parties: [],
      lockedVersionId: "",
      signedParticipantIds: [] as string[],
    }))).signedParticipantIds;
    const auditComplete = Boolean(participantId && signedIds.includes(participantId));
    const serverComplete = completeEvents.some((event) => event.ok) || auditComplete;
    if (!existing) {
      await recipient.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    }
    const stillComplete = await signedUiVisible();
    const durable = stillComplete || (completed && auditComplete && sameVersion);
    const ceremonyOk =
      completed &&
      serverComplete &&
      /signed|complete|recorded/i.test(completeText) &&
      readsLockedPaper &&
      sameOperative &&
      durable;
    persistCorePaidJourneyArticle({
      ...ctx(),
      agreementId: `${args.agreementId}-${args.signerName.replace(/\s+/g, "-").toLowerCase()}`,
      article: paper,
    });
    return {
      ok: Boolean(ceremonyOk),
      stillComplete: durable,
      paper,
      detail: `signer=${args.signerName} completed=${completed} durable=${durable} audit=${auditComplete} sameVersion=${sameVersion} readsLockedPaper=${readsLockedPaper} sameOperative=${sameOperative} displayCompare=${sameOperative ? `${ownerHash}==${recipientHash}` : `${ownerHash}!=${recipientHash}`} server=${JSON.stringify(completeEvents)} signedIds=${JSON.stringify(signedIds)} version=${version || "unset"} recipientVersion=${versionAttr || "unset"} existingInvite=${Boolean(existing)}`,
    };
  } catch (error) {
    const body = await recipient.locator("body").innerText().catch(() => "");
    return {
      ok: false,
      stillComplete: false,
      paper: "",
      detail: `signer=${args.signerName} ceremony_error=${error instanceof Error ? error.message : String(error)} existingInvite=${Boolean(existing)} body=${body.slice(0, 240)}`,
    };
  } finally {
    if (openedFresh) {
      await recipient.context().close().catch(() => undefined);
    }
  }
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

const CORE_PAID_RECIPIENT_VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;

function requiredRecipientViewport(): { width: number; height: number } {
  const name = test.info().project.name;
  return name.includes("mobile") ? CORE_PAID_RECIPIENT_VIEWPORTS.mobile : CORE_PAID_RECIPIENT_VIEWPORTS.desktop;
}

async function clickOwnerSend(page: Page, testId: "simple-pro-send-for-review" | "simple-pro-send-for-signature"): Promise<boolean> {
  const button = page.getByTestId(testId);
  if (!(await button.isVisible({ timeout: 20_000 }).catch(() => false))) {
    const setup = await completeSignerSetup(page);
    if (setup.status !== "success") return false;
  }
  if (!(await button.isVisible({ timeout: 10_000 }).catch(() => false))) return false;
  if (await button.isDisabled().catch(() => false)) return false;
  await button.click();
  if (testId === "simple-pro-send-for-signature") {
    const confirmSigning = page.getByRole("button", {
      name: /Finalize signer details and continue to signing|Create signing links/i,
    }).first();
    try {
      await expect(confirmSigning).toBeVisible({ timeout: 45_000 });
      await confirmSigning.click();
    } catch {
      // Confirmation never mounted; lock polling classifies the unmet step.
    }
  }
  return true;
}

async function ownerSigningLockId(page: Page, agreementId: string): Promise<string> {
  const state = await fetchOwnerAgreementState(page, agreementId);
  return state.lockedVersionId;
}

function classifyDirectSignUnmet(args: {
  sent: boolean;
  lockId: string;
  ownerPartyId: string;
  ownerToken: RecipientTokenEvent | undefined;
  counterparty: RecipientTokenEvent | undefined;
  bodyText: string;
}): string {
  if (!args.sent) return "missing_handler_or_unmet_setup";
  if (/Server acceptance of the reviewed agreement is required|Server review snapshot is required|Displayed review snapshot does not match/i.test(args.bodyText)) {
    return "rejected_acceptance";
  }
  if (/Finalize signer details and continue|Create signing links/i.test(args.bodyText) && !args.lockId) return "unmet_setup";
  if (!args.lockId) return "missing_lock";
  if (!args.counterparty) return "counterparty_token_not_minted";
  if (!args.ownerToken) return "owner_sign_token_not_minted";
  return "request_captured";
}

test.describe("Core paid journey acceptance", () => {
  test.setTimeout(600_000);
  test.afterAll(() => writeAggregatedMatrix());

  test("coverage contracts stay closed", () => {
    expect(() => assertCorePaidJourneyAcceptanceContracts()).not.toThrow();
  });

  test("interview, visible paper, and continuity", async ({ page }) => {
    await seedCorePaidJourneyOwner(page);
    const drafted = await draftThroughVisiblePaper(page, { recordInterview: true, skipSignerSetup: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    const afterRefresh = await waitForPaintedArticle(page).catch(() => "");
    const refreshId = await durableAgreementId(page);
    const preSetupOk =
      refreshId === drafted.agreementId &&
      afterRefresh.includes(FACTS.parties[0].name) &&
      afterRefresh.includes(FACTS.parties[1].name) &&
      afterRefresh.includes(FACTS.economics) &&
      articleContainsExpectedFacts(afterRefresh).filter((m) => m.startsWith("party_role:")).length === 0;
    const setup = await completeSignerSetup(page);
    let postSetupOk = setup.status === "blocked";
    let postSetupDetail = `post_setup=${setup.status}:${setup.detail}`;
    if (setup.status === "success") {
      await page.reload({ waitUntil: "domcontentloaded" });
      const afterSetup = await waitForPaintedArticle(page).catch(() => "");
      const afterSetupId = await durableAgreementId(page);
      postSetupOk =
        afterSetupId === drafted.agreementId &&
        afterSetup.includes(FACTS.parties[0].name) &&
        afterSetup.includes(FACTS.signers[0].name) &&
        afterSetup.includes(FACTS.signers[1].email) &&
        articleContainsExpectedFacts(afterSetup).filter((m) => m.startsWith("party_role:")).length === 0;
      postSetupDetail = `post_setup=${postSetupOk} id=${afterSetupId}`;
    } else if (setup.status === "failure") {
      postSetupOk = false;
    }
    const refreshOk = preSetupOk && postSetupOk;
    record(
      "C1_refresh_preserves_paper_version_path",
      refreshOk ? "pass" : "fail",
      `pre_setup=${preSetupOk} id ${refreshId}; answers retained on refresh=${afterRefresh.includes(FACTS.parties[0].name)}; ${postSetupDetail}`,
    );

    let dashOk = false;
    let viewOk = false;
    let dashDetail = "dashboard not reached";
    try {
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      const retry = page.getByRole("button", { name: /^Retry$/i });
      if (await retry.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await retry.click();
      }
      await expect(page.locator("body")).toContainText(/Consulting|Harbor Peak|Ironvale/i, { timeout: 20_000 });
      const dash = await page.locator("body").innerText();
      const listed = /Harbor Peak|Ironvale|Consulting Services/i.test(dash);
      const reset = /Free Starter/i.test(dash) && !listed;
      dashOk = listed && !reset;
      dashDetail = `listed=${listed} reset=${reset}`;
      await page.goto(`/app/agreements/${drafted.agreementId}/view`, { waitUntil: "domcontentloaded" });
      const reopened = await page.locator("body").innerText();
      viewOk =
        reopened.includes(FACTS.parties[0].name) &&
        reopened.includes(FACTS.economics) &&
        !/Free Starter/i.test(reopened);
    } catch (error) {
      dashDetail = `dashboard load failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    record(
      "C2_dashboard_reopen_same_agreement",
      dashOk && viewOk ? "pass" : "fail",
      `dashboard=${dashOk} view=${viewOk} id=${drafted.agreementId} ${dashDetail}`,
    );
    expect(dashOk && viewOk, "dashboard reopen must keep the same commercial paper").toBeTruthy();
  });

  test("review approval uses a recipient context", async ({ page, browser }) => {
    await seedCorePaidJourneyOwner(page);
    const drafted = await draftThroughVisiblePaper(page, { skipSparse: true });
    persistCorePaidJourneyNetwork({ ...ctx(), events: drafted.minted });
    if (drafted.setup.status !== "success") {
      record("A1_review_recipient_reads_correct_version", drafted.setup.status === "blocked" ? "blocked" : "fail", drafted.setup.detail);
      record("A2_review_recipient_can_approve", "blocked", `signer setup ${drafted.setup.status}`);
      expect(false, `signer setup ${drafted.setup.status}: ${drafted.setup.detail}`).toBeTruthy();
      return;
    }
    const sent = await clickOwnerSend(page, "simple-pro-send-for-review");
    if (!sent) {
      record("A1_review_recipient_reads_correct_version", "blocked", "send-for-review CTA never mounted");
      record("A2_review_recipient_can_approve", "blocked", "review path not reached");
      expect(false, "simple-pro-send-for-review never mounted").toBeTruthy();
      return;
    }
    const ownerState = await fetchOwnerAgreementState(page, drafted.agreementId);
    const ownerPartyId = verifiedParticipantId(ownerState.parties, FACTS.parties[0].name, FACTS.signers[0].name);
    const reviewerPartyId = verifiedParticipantId(ownerState.parties, FACTS.parties[1].name, FACTS.signers[1].name);
    if (!reviewerPartyId) {
      record("A1_review_recipient_reads_correct_version", "fail", "Ironvale/Jordan participant id unresolved on authenticated owner GET");
      record("A2_review_recipient_can_approve", "blocked", "reviewer participant unresolved");
      expect(false, "Ironvale/Jordan participant id must resolve from the owner agreement").toBeTruthy();
      return;
    }
    const reviewMinted = await expect
      .poll(() => mintedTokenForParticipant(drafted.minted, "review", reviewerPartyId), { timeout: 45_000 })
      .toBeTruthy()
      .then(() => mintedTokenForParticipant(drafted.minted, "review", reviewerPartyId))
      .catch(() => undefined);
    const ownerReviewMinted = mintedTokenForParticipant(drafted.minted, "review", ownerPartyId);
    if (ownerReviewMinted && ownerPartyId) {
      const ownerRecipient = await openRecipientPage(
        browser,
        `/agreements/${drafted.agreementId}/review?t=${encodeURIComponent(String((ownerReviewMinted.body as Record<string, unknown>).token || ""))}`,
      );
      const ownerApproveEvents = captureRecipientApprove(ownerRecipient);
      await ownerRecipient.getByRole("button", { name: /^Approve draft$/i }).click({ timeout: 8_000 }).catch(async () => {
        await ownerRecipient.getByTestId("recipient-review-approve-draft").click();
      });
      await expect.poll(() => ownerApproveEvents.length, { timeout: 10_000 }).toBeGreaterThan(0);
      const ownerRejected = ownerApproveEvents.some((event) => event.status === 403);
      await ownerRecipient.context().close();
      expect(ownerRejected, "owner review token must not approve").toBeTruthy();
    }
    persistCorePaidJourneyNetwork({ ...ctx(), events: drafted.minted });
    if (!reviewMinted) {
      record("A1_review_recipient_reads_correct_version", "fail", `Ironvale/Jordan review token was not minted; reviewerParty=${reviewerPartyId}`);
      record("A2_review_recipient_can_approve", "blocked", "no Ironvale/Jordan review token");
      expect(false, "do not open review with the owner token").toBeTruthy();
      return;
    }
    const token = String((reviewMinted.body as Record<string, unknown>).token || "");
    const lockFromMint = String((reviewMinted.body as Record<string, unknown>).locked_version_id || "");
    const reviewPartyId = mintPartyId(reviewMinted);
    const recipient = await openRecipientPage(
      browser,
      `/agreements/${drafted.agreementId}/review?t=${encodeURIComponent(token)}`,
    );
    const recipientPaper = await recipientPaperText(recipient);
    persistCorePaidJourneyArticle({
      ...ctx(),
      agreementId: `${drafted.agreementId}-recipient`,
      article: recipientPaper,
    });
    const authority = recipient.getByTestId("recipient-review-authority-meta");
    await expect(authority).toBeVisible({ timeout: 20_000 });
    const snapshotId = (await authority.getAttribute("data-snapshot-id").catch(() => "")) || "";
    const digestAttr = (await authority.getAttribute("data-corpus-sha256").catch(() => "")) || "";
    const participantAttr = (await authority.getAttribute("data-participant-id").catch(() => "")) || "";
    const versionAttr = (await authority.getAttribute("data-locked-version-id").catch(() => "")) || "";
    const recipientUrlId = recipient.url().match(/\/agreements\/([^/?#]+)/)?.[1] || "";
    const ownerHash = operativeArticleFingerprint(drafted.article);
    const recipientHash = operativeArticleFingerprint(recipientPaper);
    const roleGaps = articleContainsExpectedFacts(recipientPaper).filter((m) => m.startsWith("party_role:"));
    const sameAgreement = recipientUrlId === drafted.agreementId;
    const boundRevision =
      Boolean(snapshotId) &&
      /^[0-9a-f]{64}$/.test(digestAttr) &&
      Boolean(participantAttr) &&
      (!reviewPartyId || participantAttr === reviewPartyId);
    const displayCompare = ownerHash === recipientHash && ownerHash.length > 4;
    const a1Compare = describeOperativeArticleCompare(
      "owner-approved",
      drafted.article,
      "review-recipient",
      recipientPaper,
    );
    persistCorePaidJourneyArticleCompare({
      ...ctx(),
      agreementId: drafted.agreementId,
      label: "a1-review",
      diff: a1Compare.diff,
    });
    const samePaper = sameAgreement && boundRevision && displayCompare && a1Compare.sameOperative && roleGaps.length === 0;
    record(
      "A1_review_recipient_reads_correct_version",
      samePaper ? "pass" : "fail",
      `reviewer=Ironvale/Jordan party=${reviewerPartyId} agreement=${sameAgreement ? drafted.agreementId : `owner=${drafted.agreementId},recipient=${recipientUrlId}`} snapshot=${snapshotId || "unset"} digest=${digestAttr || "unset"} participant=${participantAttr || "unset"} mintParty=${reviewPartyId || "unset"} displayCompare=${displayCompare ? `${ownerHash}==${recipientHash}` : `${ownerHash}!=${recipientHash}`} documentIntegrity=${displayCompare ? "companion" : "mismatch"} lockField=${lockFromMint || versionAttr || "empty-ok-at-review"} priorOwnerTokenA1=partial_document_integrity_only roles=${roleGaps.join(",") || "ok"}`,
    );
    const stages: { label: string; atMs: number }[] = [];
    const t0 = Date.now();
    const mark = (label: string) => {
      stages.push({ label, atMs: Date.now() - t0 });
    };
    mark("document_ready");
    const actions = recipient.getByTestId("recipient-review-first-actions");
    await actions.waitFor({ state: "visible", timeout: 8_000 }).catch(() => undefined);
    const approveEvents = captureRecipientApprove(recipient);
    const approve = recipient.getByRole("button", { name: /^Approve draft$/i });
    const fallback = recipient.getByTestId("recipient-review-approve-draft");
    const paintedHasApprove = /Approve draft/i.test(await recipient.locator("body").innerText());
    const controlVisible =
      (await approve.isVisible({ timeout: 8_000 }).catch(() => false)) ||
      (await fallback.isVisible({ timeout: 2_000 }).catch(() => false));
    mark(controlVisible ? "approve_control_visible" : "approve_control_wait");
    if (!controlVisible) {
      record(
        "A2_review_recipient_can_approve",
        "fail",
        paintedHasApprove
          ? `timed_out_unexercised; Approve draft was painted but click was not reached; stages=${JSON.stringify(stages)}`
          : `approve control not visible; stages=${JSON.stringify(stages)}`,
      );
      await recipient.context().close();
      expect(false, paintedHasApprove ? "approve timed out unexercised" : "recipient approve control missing").toBeTruthy();
      return;
    }
    if (await approve.isVisible().catch(() => false)) {
      await approve.click();
    } else {
      await fallback.click();
    }
    mark("approve_clicked");
    await expect.poll(() => approveEvents.length, { timeout: 15_000 }).toBeGreaterThan(0).catch(() => undefined);
    mark(approveEvents.length ? `post_${approveEvents[approveEvents.length - 1]?.status}` : "post_absent");
    const confirmation = recipient
      .getByTestId("recipient-accepted-awaiting-lock-root")
      .or(recipient.getByTestId("recipient-approved-waiting-header"))
      .or(recipient.getByTestId("recipient-approved-draft-collapsed"));
    const approvedVisible = await confirmation.first().waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
    mark(approvedVisible ? "persisted_confirmation" : "confirmation_wait");
    const confirmationText = approvedVisible ? await confirmation.first().innerText() : "";
    const failedAlert = await recipient.getByRole("alert").filter({ hasText: /Couldn't record approval/i }).isVisible().catch(() => false);
    const durable =
      approvedVisible &&
      /approved|review submitted|review is complete|all reviews complete/i.test(confirmationText) &&
      !failedAlert;
    const serverApproved = approveEvents.some((event) => event.ok);
    mark(serverApproved ? "post_ok" : "post_missing");
    if (durable) {
      await recipient.reload({ waitUntil: "domcontentloaded" });
    }
    const stillApproved = durable
      ? await confirmation.first().waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false)
      : false;
    mark(stillApproved ? "survived_refresh" : "refresh_lost");
    record(
      "A2_review_recipient_can_approve",
      durable && stillApproved && serverApproved ? "pass" : "fail",
      durable && stillApproved && serverApproved
        ? `durable server approval on ${drafted.agreementId} snapshot=${snapshotId} digest=${digestAttr} stages=${JSON.stringify(stages)}`
        : `approval missing durable=${durable} afterReload=${stillApproved} failedAlert=${failedAlert} server=${JSON.stringify(approveEvents)} stages=${JSON.stringify(stages)}`,
    );
    await recipient.context().close();
    expect(durable && stillApproved && serverApproved, "approval must leave a durable server confirmation").toBeTruthy();
  });

  test("review proposal leaves owner paper unchanged until explicit revision", async ({ page, browser }) => {
    await seedCorePaidJourneyOwner(page);
    const drafted = await draftThroughVisiblePaper(page, { skipSparse: true });
    const ownerPaperBefore = drafted.article;
    if (drafted.setup.status !== "success") {
      record("A3_review_propose_cannot_silently_replace", drafted.setup.status === "blocked" ? "blocked" : "fail", drafted.setup.detail);
      record("A4_owner_approved_change_is_explicit_revision", "blocked", `signer setup ${drafted.setup.status}`);
      expect(false, `signer setup ${drafted.setup.status}: ${drafted.setup.detail}`).toBeTruthy();
      return;
    }
    const sent = await clickOwnerSend(page, "simple-pro-send-for-review");
    if (!sent) {
      record("A3_review_propose_cannot_silently_replace", "blocked", "send-for-review CTA never mounted");
      record("A4_owner_approved_change_is_explicit_revision", "blocked", "proposal path not reached");
      expect(false, "simple-pro-send-for-review never mounted").toBeTruthy();
      return;
    }
    const ownerState = await fetchOwnerAgreementState(page, drafted.agreementId);
    const reviewerPartyId = verifiedParticipantId(ownerState.parties, FACTS.parties[1].name, FACTS.signers[1].name);
    if (!reviewerPartyId) {
      record("A3_review_propose_cannot_silently_replace", "fail", "Ironvale/Jordan participant id unresolved on authenticated owner GET");
      record("A4_owner_approved_change_is_explicit_revision", "blocked", "reviewer participant unresolved");
      expect(false, "Ironvale/Jordan participant id must resolve from the owner agreement").toBeTruthy();
      return;
    }
    const reviewMinted = await expect
      .poll(() => mintedTokenForParticipant(drafted.minted, "review", reviewerPartyId), { timeout: 45_000 })
      .toBeTruthy()
      .then(() => mintedTokenForParticipant(drafted.minted, "review", reviewerPartyId))
      .catch(() => undefined);
    persistCorePaidJourneyNetwork({ ...ctx(), events: drafted.minted });
    if (!reviewMinted) {
      record("A3_review_propose_cannot_silently_replace", "fail", `Ironvale/Jordan review token was not minted; reviewerParty=${reviewerPartyId}`);
      record("A4_owner_approved_change_is_explicit_revision", "blocked", "no Ironvale/Jordan review token");
      expect(false, "do not open review with the owner token").toBeTruthy();
      return;
    }
    const token = String((reviewMinted.body as Record<string, unknown>).token || "");
    const recipient = await openRecipientPage(
      browser,
      `/agreements/${drafted.agreementId}/review?t=${encodeURIComponent(token)}`,
    );
    await recipientPaperText(recipient);
    const authority = recipient.getByTestId("recipient-review-authority-meta");
    const snapshotBefore = (await authority.getAttribute("data-snapshot-id").catch(() => "")) || "";
    const digestBefore = (await authority.getAttribute("data-corpus-sha256").catch(() => "")) || "";
    const versionBefore = snapshotBefore || digestBefore;
    const proposalEvents = captureProposalPosts(recipient);
    const propose = recipient
      .getByTestId("recipient-review-propose-updated-draft")
      .or(recipient.getByRole("button", { name: /Suggest revision/i }));
    await expect(propose.first()).toBeVisible({ timeout: 20_000 });
    await propose.first().click();
    const editor = recipient.getByTestId("recipient-edit-draft-textarea");
    if (!(await editor.isVisible({ timeout: 15_000 }).catch(() => false))) {
      record("A3_review_propose_cannot_silently_replace", "fail", "proposal editor did not open");
      record("A4_owner_approved_change_is_explicit_revision", "blocked", "proposal not submitted");
      await recipient.context().close();
      expect(false, "proposal editor missing").toBeTruthy();
      return;
    }
    const proposed = `${ownerPaperBefore}\n\n${PROPOSAL_MARKER}`;
    await editor.fill(proposed);
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
    const awaitingOwner = await expect
      .poll(async () => /pending owner review/i.test(await recipient.locator("body").innerText()), {
        timeout: 20_000,
      })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
    await expect
      .poll(() => proposalEvents.some((event) => event.ok && event.proposalId && event.url.endsWith("/recipient-proposal")), {
        timeout: 15_000,
      })
      .toBeTruthy()
      .catch(() => undefined);
    const finalized = proposalEvents.find(
      (event) => event.ok && event.proposalId && event.url.endsWith("/recipient-proposal"),
    );
    const proposalId = finalized?.proposalId || "";
    await recipient.context().close();

    const persistedIds = proposalId ? await fetchOwnerPersistedProposalIds(page, drafted.agreementId) : [];
    const persisted = Boolean(proposalId) && persistedIds.includes(proposalId);
    await page.goto(`/app/agreements/${drafted.agreementId}/view`, { waitUntil: "domcontentloaded" });
    const ownerAfter = await page.locator("body").innerText();
    const ownerUnchanged = ownerAfter.includes(FACTS.parties[0].name) && !ownerAfter.includes(PROPOSAL_MARKER);
    const submitted = awaitingOwner && persisted && ownerUnchanged;
    record(
      "A3_review_propose_cannot_silently_replace",
      submitted ? "pass" : "fail",
      `awaitingOwner=${awaitingOwner} proposalId=${proposalId || "unset"} persisted=${persisted} persistedIds=${JSON.stringify(persistedIds)} ownerUnchanged=${ownerUnchanged} versionBefore=${versionBefore} server=${JSON.stringify(proposalEvents)}`,
    );

    const applyEvents = captureServerPosts(page, "/recipient-proposal");
    await page.goto(`/app/review-changes/${encodeURIComponent(drafted.agreementId)}`, { waitUntil: "domcontentloaded" });
    const loadError = page.getByTestId("owner-proposal-review-load-error");
    if (await loadError.isVisible({ timeout: 4_000 }).catch(() => false)) {
      const code = (await loadError.getAttribute("data-error-code").catch(() => "")) || "unknown";
      record("A4_owner_approved_change_is_explicit_revision", "fail", `owner review load failed code=${code}`);
      expect(submitted, "proposal must persist without mutating owner paper").toBeTruthy();
      expect(false, `owner review load failed: ${code}`).toBeTruthy();
      return;
    }
    const accept = page.getByTestId("owner-proposal-review-accept");
    try {
      await expect(accept).toBeVisible({ timeout: 20_000 });
    } catch {
      record("A4_owner_approved_change_is_explicit_revision", "fail", "owner accept control not visible");
      expect(submitted, "proposal must persist without mutating owner paper").toBeTruthy();
      expect(false, "owner revision accept missing").toBeTruthy();
      return;
    }
    await accept.scrollIntoViewIfNeeded();
    await accept.click();
    const serverApply = await expect
      .poll(
        () =>
          applyEvents.some(
            (event) => event.ok && event.url.includes("/apply") && (!proposalId || event.url.includes(proposalId)),
          ),
        { timeout: 20_000 },
      )
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
    let acceptOk = false;
    try {
      await expect(page.getByTestId("owner-proposal-accept-success")).toBeVisible({ timeout: 20_000 });
      acceptOk = true;
    } catch {
      acceptOk = false;
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("owner-proposal-review-panel")).toBeVisible({ timeout: 20_000 }).catch(() => undefined);
    await expect(page.getByText("Loading agreement…")).toHaveCount(0, { timeout: 20_000 }).catch(() => undefined);
    const recoveredEmpty =
      (await page.getByTestId("owner-proposal-review-empty").isVisible().catch(() => false)) ||
      (await page.getByTestId("owner-proposal-accept-success").isVisible().catch(() => false));
    const acceptStillOpen = await page.getByTestId("owner-proposal-review-accept").isVisible().catch(() => false);
    const recovered = recoveredEmpty && !acceptStillOpen;
    await page.goto(`/app/agreements/${drafted.agreementId}/view`, { waitUntil: "domcontentloaded" });
    const revisedContainsMarker = await expect(page.locator("body"))
      .toContainText(PROPOSAL_MARKER, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    const ownerRevised = await page.locator("body").innerText();
    const a4Pass =
      acceptOk && serverApply && recovered && revisedContainsMarker && ownerRevised.includes(PROPOSAL_MARKER);
    record(
      "A4_owner_approved_change_is_explicit_revision",
      a4Pass ? "pass" : "fail",
      `acceptOk=${acceptOk} recovered=${recovered} serverApply=${JSON.stringify(applyEvents)} revisedContainsMarker=${ownerRevised.includes(PROPOSAL_MARKER)} proposalId=${proposalId || "unset"} priorVersion=${versionBefore}`,
    );
    expect(submitted, "proposal must leave owner paper unchanged until explicit accept").toBeTruthy();
    expect(a4Pass, "owner accept must apply a new revision and recover after refresh").toBeTruthy();
  });

  test("direct e-signing uses a recipient context", async ({ page, browser }) => {
    await seedCorePaidJourneyOwner(page);
    const drafted = await draftThroughVisiblePaper(page, { skipSparse: true });
    if (drafted.setup.status !== "success") {
      record("B1_direct_sign_skips_mandatory_review", drafted.setup.status === "blocked" ? "blocked" : "fail", drafted.setup.detail);
      record("B2_signer_reads_locked_version_and_completes", "blocked", `signer setup ${drafted.setup.status}`);
      record("B3_owner_final_record_after_direct_sign", "blocked", `signer setup ${drafted.setup.status}`);
      expect(false, `signer setup ${drafted.setup.status}: ${drafted.setup.detail}`).toBeTruthy();
      return;
    }
    const sent = await clickOwnerSend(page, "simple-pro-send-for-signature");
    if (!sent) {
      record("B1_direct_sign_skips_mandatory_review", "blocked", "send-for-signature CTA never mounted");
      record("B2_signer_reads_locked_version_and_completes", "blocked", "direct-sign path not reached");
      record("B3_owner_final_record_after_direct_sign", "blocked", "direct-sign path not reached");
      expect(false, "simple-pro-send-for-signature never mounted").toBeTruthy();
      return;
    }
    const openedReview = await page.getByTestId("recipient-review-approve-draft").count();
    record(
      "B1_direct_sign_skips_mandatory_review",
      openedReview === 0 ? "pass" : "fail",
      "owner chose send for signature without opening recipient review",
    );
    const ownerState = await fetchOwnerAgreementState(page, drafted.agreementId);
    const ownerPartyId = verifiedParticipantId(ownerState.parties, FACTS.parties[0].name, FACTS.signers[0].name);
    const reviewerPartyId = verifiedParticipantId(ownerState.parties, FACTS.parties[1].name, FACTS.signers[1].name);
    if (!reviewerPartyId) {
      record("B2_signer_reads_locked_version_and_completes", "fail", "Ironvale/Jordan participant id unresolved on authenticated owner GET");
      record("B3_owner_final_record_after_direct_sign", "blocked", "reviewer participant unresolved");
      expect(false, "Ironvale/Jordan participant id must resolve from the owner agreement").toBeTruthy();
      return;
    }
    const lockId = await expect
      .poll(() => ownerSigningLockId(page, drafted.agreementId), { timeout: 30_000 })
      .toBeTruthy()
      .then(() => ownerSigningLockId(page, drafted.agreementId))
      .catch(() => "");
    const signMinted = await expect
      .poll(() => mintedTokenForParticipant(drafted.minted, "sign", reviewerPartyId), {
        timeout: lockId ? 20_000 : 5_000,
      })
      .toBeTruthy()
      .then(() => mintedTokenForParticipant(drafted.minted, "sign", reviewerPartyId))
      .catch(() => undefined);
    const ownerSignMinted = ownerPartyId
      ? await expect
          .poll(() => mintedTokenForParticipant(drafted.minted, "sign", ownerPartyId), {
            timeout: lockId && signMinted ? 20_000 : 5_000,
          })
          .toBeTruthy()
          .then(() => mintedTokenForParticipant(drafted.minted, "sign", ownerPartyId))
          .catch(() => undefined)
      : undefined;
    persistCorePaidJourneyNetwork({ ...ctx(), events: drafted.minted });
    const firstUnmet = classifyDirectSignUnmet({
      sent: true,
      lockId,
      ownerPartyId,
      ownerToken: ownerSignMinted,
      counterparty: signMinted,
      bodyText: await page.locator("body").innerText(),
    });
    if (!signMinted || !ownerSignMinted || !lockId) {
      record(
        "B2_signer_reads_locked_version_and_completes",
        "fail",
        `first_unmet=${firstUnmet} lock=${lockId || "unset"} ownerParty=${ownerPartyId || "unset"} events=${JSON.stringify(drafted.minted.map((e) => ({ status: e.status, mode: (e.request as { mode?: string } | undefined)?.mode, party: mintPartyId(e) })))}`,
      );
      record("B3_owner_final_record_after_direct_sign", "blocked", `direct-sign path not reached; first_unmet=${firstUnmet}`);
      expect(false, `direct sign first unmet: ${firstUnmet}`).toBeTruthy();
      return;
    }
    const version = String((signMinted.body as Record<string, unknown>).locked_version_id || lockId);
    const signPartyId = mintPartyId(signMinted);
    if (!signPartyId || signPartyId === ownerPartyId) {
      record(
        "B2_signer_reads_locked_version_and_completes",
        "fail",
        `first_unmet=counterparty_token_not_minted party=${signPartyId || "unset"} ownerParty=${ownerPartyId || "unset"}`,
      );
      record("B3_owner_final_record_after_direct_sign", "blocked", "counterparty sign token not minted");
      expect(false, "do not fall back to an arbitrary minted token").toBeTruthy();
      return;
    }
    const ownerSignPath = `/agreements/${drafted.agreementId}/sign`;
    const ownerAlreadyOnSigningInvite = await expect
      .poll(async () => {
        if (!page.url().includes(ownerSignPath)) return false;
        return page.getByTestId("recipient-document-shell").or(page.getByTestId("recipient-sign-action")).first().isVisible();
      }, { timeout: 20_000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
    const ownerCeremony = await completeRequiredSignerCeremony({
      browser,
      agreementId: drafted.agreementId,
      minted: ownerSignMinted,
      signerName: FACTS.signers[0].name,
      ownerArticle: drafted.article,
      lockId,
      ...(ownerAlreadyOnSigningInvite ? { existingInvitationPage: page } : {}),
    });
    const counterpartyCeremony = await completeRequiredSignerCeremony({
      browser,
      agreementId: drafted.agreementId,
      minted: signMinted,
      signerName: FACTS.signers[1].name,
      ownerArticle: drafted.article,
      lockId,
    });
    persistCorePaidJourneyArticle({
      ...ctx(),
      agreementId: `${drafted.agreementId}-owner`,
      article: drafted.article,
    });
    const mayaCompare = describeOperativeArticleCompare(
      "owner-approved",
      drafted.article,
      "maya-sign",
      ownerCeremony.paper,
    );
    const jordanCompare = describeOperativeArticleCompare(
      "owner-approved",
      drafted.article,
      "jordan-sign",
      counterpartyCeremony.paper,
    );
    persistCorePaidJourneyArticleCompare({
      ...ctx(),
      agreementId: drafted.agreementId,
      label: "maya",
      diff: mayaCompare.diff,
    });
    persistCorePaidJourneyArticleCompare({
      ...ctx(),
      agreementId: drafted.agreementId,
      label: "jordan",
      diff: jordanCompare.diff,
    });
    const ceremonyOk =
      ownerCeremony.ok &&
      counterpartyCeremony.ok &&
      mayaCompare.sameOperative &&
      jordanCompare.sameOperative;
    record(
      "B2_signer_reads_locked_version_and_completes",
      ceremonyOk ? "pass" : "fail",
      `owner=${ownerCeremony.detail} counterparty=${counterpartyCeremony.detail} maya=${mayaCompare.diff} jordan=${jordanCompare.diff} version=${version || "unset"} party=${signPartyId || "unset"}`,
    );

    await seedCorePaidJourneyOwner(page);
    await page.goto(`/app/agreements/${drafted.agreementId}/view-signed`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const completedView = page.getByTestId("owner-signed-agreement-page");
    await expect(completedView).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
    const completedDocNode = page.getByTestId("owner-signed-agreement-document");
    await expect(completedDocNode).toContainText(FACTS.parties[0].name, { timeout: 30_000 }).catch(() => undefined);
    const unavailable = await page.getByTestId("owner-signed-agreement-unavailable").isVisible().catch(() => false);
    const ownerRecord = await page.locator("body").innerText();
    const completedAid = (await completedView.getAttribute("data-agreement-id").catch(() => "")) || "";
    const completedSurface = (await completedView.getAttribute("data-completed-document-view").catch(() => "")) || "";
    const completedDoc = (await completedDocNode.innerText().catch(() => "")) || "";
    persistCorePaidJourneyArticle({
      ...ctx(),
      agreementId: `${drafted.agreementId}-final`,
      article: completedDoc,
    });
    const finalCompare = describeOperativeArticleCompare(
      "owner-approved",
      drafted.article,
      "owner-final",
      completedDoc,
    );
    persistCorePaidJourneyArticleCompare({
      ...ctx(),
      agreementId: drafted.agreementId,
      label: "final",
      diff: finalCompare.diff,
    });
    const lockAfter = await ownerSigningLockId(page, drafted.agreementId).catch(() => "");
    const completedDocOk =
      !unavailable &&
      completedAid === drafted.agreementId &&
      completedSurface === "true" &&
      lockAfter === version &&
      finalCompare.sameOperative &&
      FACTS.signers.every((signer) => completedDoc.includes(signer.name)) &&
      completedDoc.includes(FACTS.economics);

    const api = configuredLiveApiBase();
    const runtime = loadCorePaidJourneyRuntime();
    const ownerDraftRes = await page.request.get(
      `${api}/api/agreements/${encodeURIComponent(drafted.agreementId)}`,
      {
        headers: {
          Authorization: `Bearer ${runtime.access_token}`,
          "X-Claw-Org-Id": runtime.org_id,
        },
      },
    );
    const ownerDraftBody = (await ownerDraftRes.json().catch(() => ({}))) as {
      draft?: {
        parties?: OwnerAgreementParty[];
        accepted_review_snapshot_v1?: { snapshotId?: string; corpusSha256?: string; status?: string };
      };
      signing_lock?: {
        locked_version_id?: string;
        accepted_snapshot_id?: string;
        accepted_snapshot_digest?: string;
      } | null;
    };
    const expectedSnapId = String(
      ownerDraftBody.signing_lock?.accepted_snapshot_id ||
        ownerDraftBody.draft?.accepted_review_snapshot_v1?.snapshotId ||
        "",
    ).trim();
    const expectedSnapDigest = String(
      ownerDraftBody.signing_lock?.accepted_snapshot_digest ||
        ownerDraftBody.draft?.accepted_review_snapshot_v1?.corpusSha256 ||
        "",
    )
      .trim()
      .toLowerCase();
    const expectedRequired = (ownerDraftBody.draft?.parties || [])
      .filter((party) => {
        const role = String(party.role || "").trim().toLowerCase();
        return role === "owner" || role === "signer" || role === "reviewer" || role === "party";
      })
      .map((party) => String(party.id || "").trim())
      .filter(Boolean)
      .sort();
    const proofUrl = `${api}/api/agreements/${encodeURIComponent(drafted.agreementId)}/proof-status`;
    const readReceipt = async () => {
      const res = await page.request.get(proofUrl, {
        headers: {
          Authorization: `Bearer ${runtime.access_token}`,
          "X-Claw-Org-Id": runtime.org_id,
        },
      });
      const body = (await res.json().catch(() => ({}))) as {
        finalized_receipt?: {
          status?: string;
          bound?: boolean;
          receipt_id?: string;
          receipt_hash_sha256?: string;
          agreement_id?: string;
          locked_version_id?: string;
          accepted_snapshot_id?: string;
          accepted_snapshot_digest?: string;
          required_participant_ids?: string[];
          completion_events?: Array<{ participantId?: string; participant_id?: string }>;
        } | null;
      };
      return { ok: res.ok(), status: res.status(), body };
    };
    const firstReceipt = await readReceipt();
    await page.reload({ waitUntil: "domcontentloaded" });
    const refreshedReceipt = await readReceipt();
    const first = firstReceipt.body.finalized_receipt || {};
    const second = refreshedReceipt.body.finalized_receipt || {};
    const firstId = String(first.receipt_id || "").trim();
    const firstHash = String(first.receipt_hash_sha256 || "").trim().toLowerCase();
    const firstSnap = String(first.accepted_snapshot_id || "").trim();
    const firstDigest = String(first.accepted_snapshot_digest || "").trim().toLowerCase();
    const requiredSet = [...new Set((first.required_participant_ids || []).map((id) => String(id || "").trim()).filter(Boolean))].sort();
    const completedIds = (first.completion_events || [])
      .map((row) => String(row.participantId || row.participant_id || "").trim())
      .filter(Boolean);
    const uniqueCompleted = [...new Set(completedIds)].sort();
    const receiptOk =
      firstReceipt.ok &&
      refreshedReceipt.ok &&
      ownerDraftRes.ok() &&
      first.status === "bound" &&
      first.bound === true &&
      second.status === "bound" &&
      firstId.length > 8 &&
      firstId === String(second.receipt_id || "").trim() &&
      /^[0-9a-f]{64}$/.test(firstHash) &&
      firstHash === String(second.receipt_hash_sha256 || "").trim().toLowerCase() &&
      String(first.agreement_id || "") === drafted.agreementId &&
      String(first.locked_version_id || "") === version &&
      firstSnap.length > 4 &&
      firstSnap === expectedSnapId &&
      firstSnap === String(second.accepted_snapshot_id || "").trim() &&
      /^[0-9a-f]{64}$/.test(firstDigest) &&
      firstDigest === expectedSnapDigest &&
      firstDigest === String(second.accepted_snapshot_digest || "").trim().toLowerCase() &&
      requiredSet.length >= 2 &&
      requiredSet.join("|") === expectedRequired.join("|") &&
      uniqueCompleted.join("|") === requiredSet.join("|") &&
      completedIds.length === uniqueCompleted.length;
    record(
      "B3_owner_final_record_after_direct_sign",
      completedDocOk && receiptOk && ceremonyOk ? "pass" : "fail",
      `completedDocument=${completedDocOk} receiptBound=${receiptOk} final=${finalCompare.diff} agreement=${drafted.agreementId} version=${version || "unset"} lockAfter=${lockAfter || "unset"} receiptId=${firstId || "unset"} receiptHash=${firstHash || "unset"} snapshot=${firstSnap || "unset"} recovered=${firstId === String(second.receipt_id || "").trim()}`,
    );
    expect(ceremonyOk, "every required signer ceremony must be durable, version-bound, and operatively identical").toBeTruthy();
    expect(completedDocOk && receiptOk, "completed document and persisted receipt must both bind the locked authority").toBeTruthy();
  });
});
