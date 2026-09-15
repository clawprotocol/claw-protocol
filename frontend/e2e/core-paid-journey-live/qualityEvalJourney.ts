/**
 * Shared helpers for the quality-eval Harbor + SaaS production journey.
 * Reuses snapshot-observation helpers. Does not invent empty JSON on failure.
 */
import { expect, test, type Browser, type Page, type Response } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CORE_PAID_JOURNEY_FILLED_INTAKE,
  CORE_PAID_JOURNEY_SPARSE_INTAKE,
  describeOperativeArticleCompare,
} from "../../src/launch/corePaidJourneyAcceptanceMatrix";
import {
  formatObservedJsonFailure,
  isCanonicalSnapshotCreatePost,
  parseObservedJsonPayload,
  snapshotFieldsFromObservedPayload,
} from "../../src/launch/corePaidJourneySnapshotObserve";
import {
  unconfirmedCompletionCriteriaQuestion,
  unconfirmedEffectiveDateQuestion,
} from "../../src/components/agreements/proAgreementCompleteness";
import {
  captureRecipientMints,
  loadCorePaidJourneyRuntime,
  seedCorePaidJourneyOwner,
  type RecipientTokenEvent,
} from "./corePaidJourneyLiveAuth";
import {
  applyChangesExplainedByAnswers,
  assertCheck,
  checkFourPartyCustomerMeaning,
  checkHarborAppliedMeaning,
  checkHarborFirstDraftMeaning,
  checkSaasCustomerMeaning,
  checkThreePartyCustomerMeaning,
  consultingPaperReady as consultingPaperReadyCheck,
  fourPartyFirstDraftReady as fourPartyFirstDraftReadyCheck,
  fourPartyPaperReady as fourPartyPaperReadyCheck,
  saasPaperReady as saasPaperReadyCheck,
  threePartyPaperReady as threePartyPaperReadyCheck,
} from "../../src/launch/qualityEvalCustomerPaper";
import { UNCONFIRMED_MILESTONE_PAYER_QUESTION } from "../../src/components/agreements/paidProMilestonePayer";
import { extractTitleFromCorpusPlain } from "../../src/components/agreements/paidProUniversalDisplayTitle";
import {
  RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE,
  RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
  RELEASE_SCOPE_SAAS_FILLED_INTAKE,
  RELEASE_SCOPE_SAAS_SPARSE_INTAKE,
  RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE,
  releaseScopeSample,
  selectReleaseScopeCaseIds,
  type ReleaseScopeCaseId,
} from "../../src/launch/releaseScopeQualificationCampaign";

export const QUALITY_EVAL_SAAS_SPARSE_INTAKE = RELEASE_SCOPE_SAAS_SPARSE_INTAKE;

export const QUALITY_EVAL_SAAS_FILLED_INTAKE = RELEASE_SCOPE_SAAS_FILLED_INTAKE;

export type QualityEvalCaseId = ReleaseScopeCaseId;

export type QualityEvalCase = {
  id: QualityEvalCaseId;
  sparse: string;
  filled: string;
  parties: readonly string[];
  terms: readonly string[];
  partyCue: string;
  track: "review" | "signature";
};

export const QUALITY_EVAL_CASES: readonly QualityEvalCase[] = [
  {
    id: "consulting",
    sparse: CORE_PAID_JOURNEY_SPARSE_INTAKE,
    filled: CORE_PAID_JOURNEY_FILLED_INTAKE,
    parties: ["Harbor Peak Analytics LLC", "Ironvale Manufacturing Inc."],
    terms: ["$48,000", "Delaware"],
    partyCue: "Harbor Peak Analytics LLC",
    track: "review",
  },
  {
    id: "saas",
    sparse: QUALITY_EVAL_SAAS_SPARSE_INTAKE,
    filled: QUALITY_EVAL_SAAS_FILLED_INTAKE,
    parties: ["Orion Harbor LLC", "Northwind Retail Inc"],
    terms: ["$48,000", "New York"],
    partyCue: "Orion Harbor LLC",
    track: "signature",
  },
];

export const QUALITY_EVAL_MULTIPARTY_CASES: readonly QualityEvalCase[] = [
  {
    id: "three_party",
    sparse: RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE,
    filled: RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE,
    parties: releaseScopeSample("three_party").parties.map((party) => party.legalEntity),
    terms: ["45%", "Oklahoma"],
    partyCue: "Stonebridge Wellness LLC",
    track: "review",
  },
  {
    id: "four_party",
    sparse: RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE,
    filled: RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE,
    parties: releaseScopeSample("four_party").parties.map((party) => party.legalEntity),
    terms: ["$250,000", "Massachusetts"],
    partyCue: "Lumen Bioinformatics Inc.",
    track: "review",
  },
];

export const QUALITY_EVAL_ALL_CASES: readonly QualityEvalCase[] = [
  ...QUALITY_EVAL_CASES,
  ...QUALITY_EVAL_MULTIPARTY_CASES,
];

export function selectQualityEvalCases(caseId: string | undefined): QualityEvalCase[] {
  const selected = new Set(selectReleaseScopeCaseIds(caseId));
  return QUALITY_EVAL_ALL_CASES.filter((row) => selected.has(row.id));
}

export const HARBOR_DATE_QUESTION = unconfirmedEffectiveDateQuestion("October 1, 2026");
export const HARBOR_COMPLETION_QUESTION = unconfirmedCompletionCriteriaQuestion(
  CORE_PAID_JOURNEY_FILLED_INTAKE,
);
export const HARBOR_CONTENT_ANSWERS = [
  "The agreement effective date is the same as the October 1, 2026 service start.",
  "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
].join("\n");

export function qualityEvalResultDir(): string {
  const out = process.env.QUALITY_EVAL_RESULT_DIR;
  if (!out) throw new Error("QUALITY_EVAL_RESULT_DIR is required");
  return out;
}

export function qualityEvalViewportName(): string {
  try {
    return test.info().project.name || "unknown-viewport";
  } catch {
    return "unknown-viewport";
  }
}

export function writeQualityEvalArtifact(stage: string, body: string, caseId = "shared"): void {
  const viewport = qualityEvalViewportName();
  const safeStage = stage.replace(/[^a-zA-Z0-9._-]+/g, "-");
  writeFileSync(join(qualityEvalResultDir(), `${caseId}-${viewport}-${safeStage}`), body);
}

export function writeQualityEvalSample(row: {
  caseId: string;
  agreementId: string;
  snapshotId: string;
  digest: string;
  length: number;
}): void {
  const path = join(qualityEvalResultDir(), "samples.json");
  const all = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) : {};
  const viewport = qualityEvalViewportName();
  const key = `${row.caseId}-${viewport}`;
  all[key] = { ...row, viewport, stage: "independent_sample" };
  writeFileSync(path, JSON.stringify(all, null, 2) + "\n");
}

export function readQualityEvalSamples(): Record<
  string,
  { caseId: string; agreementId: string; snapshotId: string; digest: string; length: number }
> {
  const path = join(qualityEvalResultDir(), "samples.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    { caseId: string; agreementId: string; snapshotId: string; digest: string; length: number }
  >;
}

export function configuredLiveApiBase(): string {
  return String(process.env.CORE_PAID_JOURNEY_LIVE_API || "").replace(/\/$/, "");
}

export async function installQualityEvalPageGuards(page: Page): Promise<void> {
  const runtime = loadCorePaidJourneyRuntime();
  const api = process.env.CORE_PAID_JOURNEY_LIVE_API!;
  const origin = process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN!;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (![api, origin].includes(url.origin)) return route.abort("blockedbyclient");
    if (url.pathname.startsWith("/__supabase/auth/v1/")) {
      return route.fulfill({
        json: {
          id: runtime.owner_id,
          email: runtime.email,
          aud: "authenticated",
          role: "authenticated",
        },
      });
    }
    if (route.request().method() !== "GET" && /billing|checkout|\/send-email|\/email\//.test(url.pathname)) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  await page.addInitScript(
    ({ runtime: seeded, api: apiOrigin }) => {
      localStorage.setItem(
        `sb-${new URL(apiOrigin).hostname.split(".")[0]}-auth-token`,
        JSON.stringify({
          access_token: seeded.access_token,
          refresh_token: "synthetic-local-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user: {
            id: seeded.owner_id,
            email: seeded.email,
            role: "authenticated",
            aud: "authenticated",
            app_metadata: { provider: "email" },
            user_metadata: { full_name: "Core Paid Owner" },
            identities: [{ provider: "email", id: `${seeded.owner_id}-id` }],
          },
        }),
      );
      localStorage.setItem("claw_org_id", seeded.org_id);
      sessionStorage.setItem("claw_authenticated_workspace_session", "1");
    },
    { runtime, api },
  );
}

export async function openSavedCreate(page: Page, agreementId: string, partyCue: string): Promise<void> {
  const current = page.url();
  if (!current.includes(`agreementId=${agreementId}`)) {
    await page.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  }
  await expect(page).toHaveURL(new RegExp(`/app/create\\?agreementId=${agreementId}`));
  await expect
    .poll(async () => {
      const text = await articleText(page, partyCue);
      return text.includes(partyCue) ? text.length : 0;
    }, { timeout: 90_000 })
    .toBeGreaterThan(400);
}

export async function articleText(page: Page, partyCue: string): Promise<string> {
  return page.evaluate((cue) => {
    const readable = (el: Element | null): string => ((el as HTMLElement | null)?.innerText || "").trim();
    const nodes = Array.from(
      document.querySelectorAll(
        '[data-testid="simple-pro-final-review-document"], [data-testid="paid-pro-visible-document-shell"]',
      ),
    );
    let best = "";
    for (const node of nodes) {
      const text = readable(node);
      if (text.includes(cue) && text.length > best.length) best = text;
    }
    return best;
  }, partyCue);
}

export async function waitForPaintedArticle(page: Page, scenario: QualityEvalCase): Promise<string> {
  await expect(page.locator("body")).toContainText(scenario.partyCue, { timeout: 90_000 });
  await expect
    .poll(
      async () => {
        const text = await articleText(page, scenario.partyCue);
        return scenario.parties.every((party) => text.includes(party)) &&
          scenario.terms.every((term) => text.includes(term))
          ? text.length
          : 0;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  return articleText(page, scenario.partyCue);
}

export function captureServerAgreementIds(page: Page): string[] {
  const ids: string[] = [];
  page.on("response", async (res) => {
    if (!res.ok()) return;
    if (!res.url().includes("/api/agreements") && !res.url().includes("/v1/agreements")) return;
    try {
      const raw = await res.text();
      const parsed = parseObservedJsonPayload({
        raw,
        endpoint: res.url(),
        method: res.request().method(),
        status: res.status(),
        stage: "agreement_id_capture",
      });
      if (!parsed.ok) return;
      const body = parsed.value && typeof parsed.value === "object" ? (parsed.value as Record<string, unknown>) : {};
      for (const key of ["agreement_id", "id"]) {
        const value = body[key];
        if (typeof value === "string" && value.length > 8 && !value.startsWith("local")) {
          ids.push(value);
        }
      }
    } catch {
      /* ignore non-JSON capture misses; never invent an id */
    }
  });
  return ids;
}

export function captureCanonicalSnapshotCreates(page: Page): Response[] {
  const posts: Response[] = [];
  page.on("response", (res) => {
    if (res.request().method() !== "POST") return;
    let pathname = "";
    try {
      pathname = new URL(res.url()).pathname.replace(/\/$/, "");
    } catch {
      return;
    }
    if (/^\/api\/agreements\/[^/]+\/canonical-review-snapshot$/.test(pathname)) {
      posts.push(res);
    }
  });
  return posts;
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

export async function waitForServerAgreementId(page: Page, captured: string[]): Promise<string> {
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

export async function submitIntake(page: Page, text: string): Promise<void> {
  const intake = await waitForPaidCreateIntake(page);
  await intake.fill(text);
  await page.getByRole("button", { name: /Create agreement|Create draft|Review|Next/i }).first().click();
}

export async function readObservedJson(res: Response, stage: string, startedAt: number): Promise<unknown> {
  const raw = await res.text();
  const parsed = parseObservedJsonPayload({
    raw,
    endpoint: res.url(),
    method: res.request().method(),
    status: res.status(),
    stage,
    elapsedMs: Date.now() - startedAt,
  });
  if (!parsed.ok) {
    throw new Error(formatObservedJsonFailure(parsed.error));
  }
  return parsed.value;
}

export async function fetchOwnerCanonicalSnapshot(
  page: Page,
  agreementId: string,
): Promise<{
  ok: boolean;
  snapshotId: string;
  digest: string;
  corpus: string;
  agreementId: string;
  length: number;
}> {
  const api = configuredLiveApiBase();
  const runtime = loadCorePaidJourneyRuntime();
  const startedAt = Date.now();
  const endpoint = `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot`;
  const res = await page.request.get(endpoint, {
    timeout: 20_000,
    headers: {
      Authorization: `Bearer ${runtime.access_token}`,
      "X-Claw-Org-Id": runtime.org_id,
    },
  });
  const raw = await res.text();
  const parsed = parseObservedJsonPayload({
    raw,
    endpoint,
    method: "GET",
    status: res.status(),
    stage: `canonical_get+${Date.now() - startedAt}ms`,
    elapsedMs: Date.now() - startedAt,
  });
  if (!parsed.ok) {
    throw new Error(formatObservedJsonFailure(parsed.error));
  }
  if (!res.ok()) {
    throw new Error(
      formatObservedJsonFailure({
        kind: "http_failed",
        endpoint,
        method: "GET",
        status: res.status(),
        stage: `canonical_get+${Date.now() - startedAt}ms`,
        elapsedMs: Date.now() - startedAt,
        message: "authorized canonical GET failed",
      }),
    );
  }
  const fields = snapshotFieldsFromObservedPayload(parsed.value);
  return {
    ok: true,
    snapshotId: fields.snapshotId,
    digest: fields.digest,
    corpus: fields.corpus,
    agreementId: fields.agreementId || agreementId,
    length: fields.length,
  };
}

function captureNewAgreementPosts(page: Page): string[] {
  const minted: string[] = [];
  page.on("response", (res) => {
    if (res.request().method() !== "POST") return;
    let path = "";
    try {
      path = new URL(res.url()).pathname.replace(/\/$/, "");
    } catch {
      return;
    }
    if (path === "/api/agreements" || path === "/v1/agreements") {
      minted.push(res.url());
    }
  });
  return minted;
}

async function readCreateSessionState(page: Page): Promise<{
  resume: string | null;
  premium: string | null;
  payment: string | null;
}> {
  return page.evaluate(() => ({
    resume: sessionStorage.getItem("claw_agreement_create_review_resume_v1"),
    premium: sessionStorage.getItem("claw_premium_completion_snapshot_v1"),
    payment: sessionStorage.getItem("claw_payment_clarification_v1"),
  }));
}

export function consultingPaperReady(article: string): boolean {
  return consultingPaperReadyCheck(article);
}

export function saasPaperReady(article: string): boolean {
  return saasPaperReadyCheck(article);
}

export function threePartyPaperReady(article: string): boolean {
  return threePartyPaperReadyCheck(article);
}

export function fourPartyPaperReady(article: string): boolean {
  return fourPartyPaperReadyCheck(article);
}

export function fourPartyFirstDraftReady(article: string): boolean {
  return fourPartyFirstDraftReadyCheck(article);
}

export function paperReadyForCase(id: QualityEvalCaseId, stage: "first" | "applied" = "applied"): (article: string) => boolean {
  if (id === "consulting") return consultingPaperReady;
  if (id === "saas") return saasPaperReady;
  if (id === "three_party") return threePartyPaperReady;
  return stage === "first" ? fourPartyFirstDraftReady : fourPartyPaperReady;
}

export function assertHarborCustomerMeaning(article: string): void {
  assertCheck(checkHarborAppliedMeaning(article), "harbor_applied_meaning");
}

export function assertHarborFirstDraftMeaning(article: string): void {
  assertCheck(checkHarborFirstDraftMeaning(article), "harbor_first_draft_meaning");
}

export function assertSaasCustomerMeaning(article: string): void {
  assertCheck(checkSaasCustomerMeaning(article), "saas_customer_meaning");
}

export function assertThreePartyCustomerMeaning(article: string): void {
  assertCheck(checkThreePartyCustomerMeaning(article), "three_party_customer_meaning");
}

export function assertFourPartyCustomerMeaning(article: string, stage: "first" | "applied" = "first"): void {
  assertCheck(checkFourPartyCustomerMeaning(article, stage), "four_party_customer_meaning");
}

export function assertReleaseScopePaper(id: QualityEvalCaseId, article: string, stage: "first" | "applied"): void {
  if (id === "consulting") {
    if (stage === "first") assertHarborFirstDraftMeaning(article);
    else assertHarborCustomerMeaning(article);
    return;
  }
  if (id === "saas") {
    assertSaasCustomerMeaning(article);
    return;
  }
  if (id === "three_party") {
    assertThreePartyCustomerMeaning(article);
    return;
  }
  assertCheck(checkFourPartyCustomerMeaning(article, stage === "applied" ? "applied" : "first"), "four_party_customer_meaning");
}

export function assertApplyExplainedByAnswers(before: string, after: string, answers: string): void {
  assertCheck(applyChangesExplainedByAnswers(before, after, answers), "apply_explained_by_answers");
}

export async function observeSnapshotCreateResponse(
  snapshotRes: Response,
  agreementId: string,
  stage: string,
  startedAt: number,
): Promise<{ snapshotId: string; digest: string; corpus: string; length: number; agreementId: string }> {
  if (
    !isCanonicalSnapshotCreatePost({
      url: snapshotRes.url(),
      method: snapshotRes.request().method(),
      agreementId,
    })
  ) {
    throw new Error(
      formatObservedJsonFailure({
        kind: "http_failed",
        endpoint: snapshotRes.url(),
        method: snapshotRes.request().method(),
        status: snapshotRes.status(),
        stage,
        elapsedMs: Date.now() - startedAt,
        message: "response was not the exact canonical snapshot-create POST",
      }),
    );
  }
  if (!snapshotRes.ok()) {
    throw new Error(
      formatObservedJsonFailure({
        kind: "http_failed",
        endpoint: snapshotRes.url(),
        method: snapshotRes.request().method(),
        status: snapshotRes.status(),
        stage,
        elapsedMs: Date.now() - startedAt,
        message: "snapshot-create POST failed",
      }),
    );
  }
  const postedValue = await readObservedJson(snapshotRes, stage, startedAt);
  const posted = snapshotFieldsFromObservedPayload(postedValue);
  expect(posted.snapshotId.length, "snapshot-create must return a snapshot id").toBeGreaterThan(4);
  expect(posted.digest).toMatch(/^[0-9a-f]{64}$/);
  expect(posted.corpus.length, "snapshot-create corpus must be complete operative paper").toBeGreaterThan(400);
  return { ...posted, agreementId: posted.agreementId || agreementId };
}

export async function applyHarborContentAnswers(
  page: Page,
  agreementId: string,
): Promise<{ snapshotId: string; digest: string; corpus: string; length: number; agreementId: string }> {
  const panel = page.getByTestId("paid-draft-content-clarification-panel");
  await expect(panel, "date and completion questions must be visible after the Harbor draft").toBeVisible({
    timeout: 20_000,
  });
  await expect(panel.getByTestId("date-meaning-clarification-question")).toContainText(HARBOR_DATE_QUESTION);
  await expect(panel.getByTestId("completion-criteria-clarification-question")).toContainText(
    HARBOR_COMPLETION_QUESTION,
  );
  await expect(panel).toContainText(/Optional — you can review or sign without answering/i);
  await page.getByTestId("paid-draft-content-clarification-answer").fill(HARBOR_CONTENT_ANSWERS);
  const startedAt = Date.now();
  const snapshotPostDone = page.waitForResponse(
    (res) =>
      isCanonicalSnapshotCreatePost({
        url: res.url(),
        method: res.request().method(),
        agreementId,
      }),
    { timeout: 90_000 },
  );
  await page.getByTestId("paid-draft-content-clarification-apply").click();
  const applyAlert = page.getByTestId("paid-draft-content-clarification-panel").locator("[role='alert']");
  const snapshotOrError = await Promise.race([
    snapshotPostDone.then((res) => ({ kind: "snapshot" as const, res })),
    applyAlert
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(async () => ({ kind: "error" as const, message: (await applyAlert.innerText()).trim() }))
      .catch(() => ({ kind: "none" as const })),
  ]);
  if (snapshotOrError.kind === "error" && snapshotOrError.message) {
    throw new Error(`content_apply_failed ${snapshotOrError.message}`);
  }
  const snapshotRes = snapshotOrError.kind === "snapshot" ? snapshotOrError.res : await snapshotPostDone;
  return observeSnapshotCreateResponse(snapshotRes, agreementId, "content_apply_snapshot_create", startedAt);
}

export async function applyFourPartyPayerAnswer(
  page: Page,
  agreementId: string,
): Promise<{ snapshotId: string; digest: string; corpus: string; length: number; agreementId: string }> {
  const panel = page.getByTestId("paid-draft-content-clarification-panel");
  await expect(panel, "milestone payer question must be visible after the four-party draft").toBeVisible({
    timeout: 20_000,
  });
  await expect(panel.getByTestId("milestone-payer-clarification-question")).toContainText(
    UNCONFIRMED_MILESTONE_PAYER_QUESTION,
  );
  await expect(panel).toContainText(/Optional — you can review or sign without answering/i);
  await page.getByTestId("paid-draft-content-clarification-answer").fill(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA);
  const startedAt = Date.now();
  const snapshotPostDone = page.waitForResponse(
    (res) =>
      isCanonicalSnapshotCreatePost({
        url: res.url(),
        method: res.request().method(),
        agreementId,
      }),
    { timeout: 90_000 },
  );
  await page.getByTestId("paid-draft-content-clarification-apply").click();
  const applyAlert = page.getByTestId("paid-draft-content-clarification-panel").locator("[role='alert']");
  const snapshotOrError = await Promise.race([
    snapshotPostDone.then((res) => ({ kind: "snapshot" as const, res })),
    applyAlert
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(async () => ({ kind: "error" as const, message: (await applyAlert.innerText()).trim() }))
      .catch(() => ({ kind: "none" as const })),
  ]);
  if (snapshotOrError.kind === "error" && snapshotOrError.message) {
    throw new Error(`payer_apply_failed ${snapshotOrError.message}`);
  }
  const snapshotRes = snapshotOrError.kind === "snapshot" ? snapshotOrError.res : await snapshotPostDone;
  return observeSnapshotCreateResponse(snapshotRes, agreementId, "payer_apply_snapshot_create", startedAt);
}

export async function waitForCapturedSnapshotCreate(
  posts: Response[],
  agreementId: string,
): Promise<{ snapshotId: string; digest: string; corpus: string; length: number; agreementId: string }> {
  const startedAt = Date.now();
  let match: Response | undefined;
  await expect
    .poll(() => {
      match = [...posts]
        .reverse()
        .find((res) =>
          isCanonicalSnapshotCreatePost({
            url: res.url(),
            method: res.request().method(),
            agreementId,
          }),
        );
      return match ? 1 : 0;
    }, { timeout: 90_000 })
    .toBe(1);
  if (!match) {
    throw new Error(
      formatObservedJsonFailure({
        kind: "empty_body",
        endpoint: `/api/agreements/${agreementId}/canonical-review-snapshot`,
        method: "POST",
        status: 0,
        stage: "first_draft_snapshot_create",
        elapsedMs: Date.now() - startedAt,
        message: "no exact snapshot-create POST was observed",
      }),
    );
  }
  return observeSnapshotCreateResponse(match, agreementId, "first_draft_snapshot_create", startedAt);
}

export async function assertFreshEditableReopen(
  browser: Browser,
  page: Page,
  agreementId: string,
  expected: { snapshotId: string; digest: string; corpus: string },
  partyCue: string,
  paperReady: (article: string) => boolean,
): Promise<{ article: string; reopenId: string }> {
  const freshContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1280, height: 720 },
  });
  const freshPage = await freshContext.newPage();
  const mintedNew = captureNewAgreementPosts(freshPage);
  await seedCorePaidJourneyOwner(freshPage);
  await installQualityEvalPageGuards(freshPage);
  await freshPage.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  await waitForOwnerWorkspaceReady(freshPage, agreementId);
  const leaked = await readCreateSessionState(freshPage);
  expect(leaked.payment, "fresh context must not inherit payment sessionStorage").toBeNull();
  expect(leaked.premium, "fresh context must not inherit premium completion snapshot").toBeNull();
  let article = "";
  await expect
    .poll(
      async () => {
        article = await articleText(freshPage, partyCue);
        return paperReady(article) ? article.length : 0;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  const reopenId = await durableAgreementId(freshPage);
  expect(reopenId, "fresh editable reopen must stay on the saved agreement").toBe(agreementId);
  await expect(freshPage).toHaveURL(new RegExp(`/app/create\\?agreementId=${agreementId}`));
  await expect(freshPage.getByTestId("date-meaning-clarification-question")).toHaveCount(0);
  await expect(freshPage.getByTestId("completion-criteria-clarification-question")).toHaveCount(0);
  await expect(freshPage.getByTestId("milestone-payer-clarification-question")).toHaveCount(0);
  const freshGet = await fetchOwnerCanonicalSnapshot(freshPage, agreementId);
  expect(freshGet.snapshotId).toBe(expected.snapshotId);
  expect(freshGet.digest).toBe(expected.digest);
  const freshCompare = describeOperativeArticleCompare("fresh_visible", article, "fresh_get", freshGet.corpus);
  expect(freshCompare.sameOperative, freshCompare.diff).toBe(true);
  expect(mintedNew, "opening the saved agreement must not mint a replacement").toEqual([]);
  await freshContext.close();
  return { article, reopenId };
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

type OwnerPartyRow = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  signer_name?: string;
  signerName?: string;
};

type OwnerAuditEvent = {
  event_type?: string;
  value?: { participant_id?: string; snapshot_id?: string; corpus_sha256?: string };
};

type OwnerDraftAuthority = {
  parties: OwnerPartyRow[];
  audit: OwnerAuditEvent[];
};

type RecipientApprovePostEvent = {
  status: number;
  path: string;
  ok: boolean;
  code?: string;
  participantId?: string;
  snapshotId?: string;
  digest?: string;
};

async function fetchOwnerDraftAuthority(page: Page, agreementId: string): Promise<OwnerDraftAuthority> {
  const api = configuredLiveApiBase();
  const runtime = loadCorePaidJourneyRuntime();
  const res = await page.request.get(`${api}/api/agreements/${encodeURIComponent(agreementId)}`, {
    headers: {
      Authorization: `Bearer ${runtime.access_token}`,
      "X-Claw-Org-Id": runtime.org_id,
    },
  });
  expect(res.ok(), `owner GET failed ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as {
    draft?: { parties?: OwnerPartyRow[]; audit_log?: OwnerAuditEvent[] };
  };
  return {
    parties: Array.isArray(body.draft?.parties) ? body.draft.parties : [],
    audit: Array.isArray(body.draft?.audit_log) ? body.draft.audit_log : [],
  };
}

async function fetchOwnerParties(page: Page, agreementId: string): Promise<OwnerPartyRow[]> {
  return (await fetchOwnerDraftAuthority(page, agreementId)).parties;
}

function partySignerName(row: OwnerPartyRow | undefined): string {
  return String(row?.signerName || row?.signer_name || "").trim();
}

function approvalOnIntendedRevision(
  audit: OwnerAuditEvent[],
  participantId: string,
  snapshotId: string,
  digest: string,
): boolean {
  const want = participantId.trim();
  const snap = snapshotId.trim();
  const dig = digest.trim().toLowerCase();
  return audit.some((event) => {
    const t = String(event.event_type || "").trim();
    if (t !== "participant_approved" && t !== "recipient_approved") return false;
    const value = event.value || {};
    return (
      String(value.participant_id || "").trim() === want &&
      String(value.snapshot_id || "").trim() === snap &&
      String(value.corpus_sha256 || "").trim().toLowerCase() === dig
    );
  });
}

function signatureCompletedForParticipant(audit: OwnerAuditEvent[], participantId: string): boolean {
  const want = participantId.trim();
  return audit.some((event) => {
    if (String(event.event_type || "").trim() !== "signature_completed") return false;
    return String(event.value?.participant_id || "").trim() === want;
  });
}

function captureRecipientApprovePosts(page: Page): RecipientApprovePostEvent[] {
  const events: RecipientApprovePostEvent[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "POST") return;
    let path = "";
    try {
      path = new URL(response.url()).pathname;
    } catch {
      return;
    }
    if (!path.endsWith("/recipient-approve")) return;
    const posted = (request.postDataJSON() || {}) as {
      participant_id?: string;
      snapshot_id?: string;
      expected_digest?: string;
    };
    void response
      .json()
      .then((body) => {
        const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : undefined;
        const code =
          typeof detail === "string"
            ? detail
            : detail && typeof detail === "object"
              ? String((detail as { code?: string }).code || "")
              : "";
        events.push({
          status: response.status(),
          path,
          ok: response.ok(),
          code: code || undefined,
          participantId: String(posted.participant_id || ""),
          snapshotId: String(posted.snapshot_id || ""),
          digest: String(posted.expected_digest || ""),
        });
      })
      .catch(() => {
        events.push({
          status: response.status(),
          path,
          ok: response.ok(),
          participantId: String(posted.participant_id || ""),
          snapshotId: String(posted.snapshot_id || ""),
          digest: String(posted.expected_digest || ""),
        });
      });
  });
  return events;
}

async function waitForOwnerWorkspaceReady(page: Page, agreementId: string): Promise<void> {
  const settling = page.getByTestId("create-auth-workspace-settling");
  try {
    await expect(settling).toHaveCount(0, { timeout: 60_000 });
  } catch {
    const copy = await page.locator("body").innerText().catch(() => "");
    throw new Error(
      `owner_workspace_restore_failed agreementId=${agreementId} still showing create-auth-workspace-settling: ${copy.slice(0, 400)}`,
    );
  }
}

async function recipientPaperText(page: Page, partyCue: string): Promise<string> {
  const shell = page.getByTestId("recipient-document-shell");
  await expect(shell).toBeVisible({ timeout: 45_000 });
  await expect(shell).toContainText(partyCue, { timeout: 30_000 });
  return shell.innerText();
}

function acceptNativeDialogs(page: Page): void {
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
}

function ownerOrigin(page: Page): string {
  try {
    return new URL(page.url()).origin;
  } catch {
    return "";
  }
}

async function assertSignerFormHoldsIntakeOrFillOnlyOmitted(
  page: Page,
  signers: readonly { legalEntity: string; signerName: string; signerEmail?: string }[],
): Promise<void> {
  const sendReady = page.getByTestId("simple-pro-send-for-review").or(page.getByTestId("simple-pro-send-for-signature"));
  if (await sendReady.first().isVisible({ timeout: 4_000 }).catch(() => false)) return;
  const openSetup = page.getByRole("button", { name: /Complete signer details|Finalize signer details/i }).first();
  if (await openSetup.isVisible().catch(() => false)) await openSetup.click();
  let filledOmitted = false;
  for (const [idx, signer] of signers.entries()) {
    const nameField = idx === 0 ? "r1-name" : idx === 1 ? "r2-name" : `party-${idx}-legal-name`;
    const signerField = idx === 0 ? "r1-signer-name" : idx === 1 ? "r2-signer-name" : `party-${idx}-signer-name`;
    const emailField = idx === 0 ? "r1-email" : idx === 1 ? "r2-email" : idx === 2 ? "r3-email" : "r4-email";
    const nameInput = page.locator(`[data-claw-recipient-field="${nameField}"]`).first();
    const signerInput = page.locator(`[data-claw-recipient-field="${signerField}"]`).first();
    const emailInput = page.locator(`[data-claw-recipient-field="${emailField}"]`).first();
    if (await nameInput.isVisible({ timeout: 1_500 }).catch(() => false)) {
      const value = (await nameInput.inputValue()).trim();
      if (!value && signer.legalEntity) {
        throw new Error(`intake_legal_entity_lost ${signer.legalEntity}`);
      }
    }
    if (await signerInput.isVisible({ timeout: 1_500 }).catch(() => false)) {
      const value = (await signerInput.inputValue()).trim();
      if (!value && signer.signerName) {
        throw new Error(`intake_signer_name_lost ${signer.legalEntity} expected=${signer.signerName}`);
      }
      if (!value && !signer.signerName) {
        await signerInput.fill(`Omitted Signer ${idx + 1}`);
        filledOmitted = true;
      }
    }
    if (await emailInput.isVisible({ timeout: 1_500 }).catch(() => false)) {
      const value = (await emailInput.inputValue()).trim();
      if (!value && signer.signerEmail) {
        throw new Error(`intake_signer_email_lost ${signer.legalEntity} expected=${signer.signerEmail}`);
      }
      if (!value && !signer.signerEmail) {
        await emailInput.fill(`omitted.signer.${idx + 1}@example.com`);
        filledOmitted = true;
      }
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
  if (filledOmitted) {
    // Genuinely omitted fields were entered on the form; persist is asserted by the later owner GET.
  }
}

async function clickOwnerSend(
  page: Page,
  testId: "simple-pro-send-for-review" | "simple-pro-send-for-signature",
): Promise<boolean> {
  const button = page.getByTestId(testId);
  if (!(await button.isVisible({ timeout: 12_000 }).catch(() => false))) {
    const openSetup = page.getByRole("button", { name: /Complete signer details|Finalize signer details/i }).first();
    if (await openSetup.isVisible().catch(() => false)) await openSetup.click();
  }
  if (!(await button.isVisible({ timeout: 12_000 }).catch(() => false))) return false;
  if (await button.isDisabled().catch(() => false)) return false;
  await button.click();
  if (testId === "simple-pro-send-for-signature") {
    const finalize = page
      .locator("button:visible")
      .filter({ hasText: /Finalize signer details and continue to signing|Create signing links/i })
      .first();
    await expect(finalize, "signing confirmation must mount after Send for signature").toBeVisible({
      timeout: 20_000,
    });
    await finalize.scrollIntoViewIfNeeded();
    await expect(finalize).toBeEnabled({ timeout: 20_000 });
    await finalize.click();
    const linksFailed = page.getByText(/Links were not created/i);
    if (await linksFailed.isVisible({ timeout: 20_000 }).catch(() => false)) {
      const copy = await page.locator("body").innerText().catch(() => "");
      throw new Error(`signing_links_not_created ${copy.slice(0, 600)}`);
    }
  }
  return true;
}

export async function completeLocalReviewSignAndFinal(args: {
  page: Page;
  browser: Browser;
  agreementId: string;
  snapshotId: string;
  digest: string;
  partyCue: string;
  paperReady: (article: string) => boolean;
  signers: readonly { legalEntity: string; signerName: string; signerEmail?: string }[];
}): Promise<{ receiptId: string; signedCount: number }> {
  acceptNativeDialogs(args.page);
  const minted = captureRecipientMints(args.page);
  await waitForOwnerWorkspaceReady(args.page, args.agreementId);
  await expect
    .poll(async () => {
      const text = await articleText(args.page, args.partyCue);
      return args.paperReady(text) ? text.length : 0;
    }, { timeout: 90_000 })
    .toBeGreaterThan(400);
  for (const signer of args.signers) {
    await expect(args.page.locator("body")).toContainText(signer.signerName);
  }
  const parsedParties = await fetchOwnerParties(args.page, args.agreementId);
  for (const signer of args.signers) {
    const row = parsedParties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity));
    expect(row, `saved party missing for ${signer.legalEntity}`).toBeTruthy();
    if (signer.signerEmail) {
      expect(String(row?.email || "").toLowerCase(), `intake_signer_email_lost ${signer.legalEntity}`).toBe(
        signer.signerEmail.toLowerCase(),
      );
    }
  }
  await assertSignerFormHoldsIntakeOrFillOnlyOmitted(args.page, args.signers);
  expect(await clickOwnerSend(args.page, "simple-pro-send-for-review"), "send-for-review must mount").toBeTruthy();
  await expect.poll(async () => (await fetchOwnerParties(args.page, args.agreementId)).length, { timeout: 30_000 }).toBe(
    args.signers.length,
  );
  const parties = await fetchOwnerParties(args.page, args.agreementId);
  for (const signer of args.signers) {
    const row = parties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity));
    expect(row?.id, `participant id missing for ${signer.legalEntity}`).toBeTruthy();
    if (signer.signerEmail) {
      expect(String(row?.email || "").toLowerCase(), `intake_signer_email_lost_after_send ${signer.legalEntity}`).toBe(
        signer.signerEmail.toLowerCase(),
      );
    }
    if (signer.signerName) {
      expect(partySignerName(row), `intake_signer_name_lost_after_send ${signer.legalEntity}`).toMatch(
        new RegExp(signer.signerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      );
    }
  }
  await expect
    .poll(() => {
      return args.signers.every((signer) => {
        const row = parties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity));
        return Boolean(row?.id && mintedTokenForParticipant(minted, "review", String(row.id)));
      })
        ? 1
        : 0;
    }, { timeout: 45_000 })
    .toBe(1);
  for (const signer of args.signers) {
    const row = parties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity))!;
    const token = String(
      (mintedTokenForParticipant(minted, "review", String(row.id))?.body as { token?: string } | undefined)?.token || "",
    );
    const context = await args.browser.newContext({ viewport: { width: 1280, height: 800 } });
    const recipient = await context.newPage();
    acceptNativeDialogs(recipient);
    const approvePosts = captureRecipientApprovePosts(recipient);
    const reviewOrigin = ownerOrigin(args.page);
    await recipient.goto(
      `${reviewOrigin}/agreements/${args.agreementId}/review?t=${encodeURIComponent(token)}`,
      { waitUntil: "domcontentloaded" },
    );
    const paper = await recipientPaperText(recipient, args.partyCue);
    expect(args.paperReady(paper), `${signer.legalEntity} review paper`).toBeTruthy();
    const authority = recipient.getByTestId("recipient-review-authority-meta");
    await expect(authority).toBeVisible({ timeout: 20_000 });
    expect(await authority.getAttribute("data-snapshot-id")).toBe(args.snapshotId);
    expect((await authority.getAttribute("data-corpus-sha256") || "").toLowerCase()).toBe(args.digest);
    const approve = recipient.getByRole("button", { name: /^Approve draft$/i });
    const fallback = recipient.getByTestId("recipient-review-approve-draft");
    if (await approve.isVisible().catch(() => false)) await approve.click();
    else await fallback.click();
    await expect
      .poll(() => approvePosts.filter((event) => event.participantId === String(row.id)).length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const posted = [...approvePosts].reverse().find((event) => event.participantId === String(row.id));
    expect(posted, `${signer.legalEntity} approve POST missing`).toBeTruthy();
    const ownerAfterPost = await fetchOwnerDraftAuthority(args.page, args.agreementId);
    const recordedAfterPost = approvalOnIntendedRevision(
      ownerAfterPost.audit,
      String(row.id),
      args.snapshotId,
      args.digest,
    );
    if (!posted?.ok) {
      const ambiguous = (posted?.status ?? 0) >= 500 || (posted?.status ?? 0) === 0;
      expect(
        ambiguous && recordedAfterPost,
        `${signer.legalEntity} recipient-approve rejected method=POST path=${posted?.path} status=${posted?.status} code=${posted?.code || ""} participant=${row.id} agreement=${args.agreementId} snapshot=${args.snapshotId} digest=${args.digest}`,
      ).toBeTruthy();
    }
    expect(
      recordedAfterPost,
      `${signer.legalEntity} approval missing on intended revision after POST status=${posted?.status}`,
    ).toBeTruthy();
    await recipient.reload({ waitUntil: "domcontentloaded" });
    const ownerAfterReload = await fetchOwnerDraftAuthority(args.page, args.agreementId);
    expect(
      approvalOnIntendedRevision(ownerAfterReload.audit, String(row.id), args.snapshotId, args.digest),
      `${signer.legalEntity} approval did not persist after recipient reload`,
    ).toBeTruthy();
    const persistedApproved = recipient
      .getByTestId("recipient-accepted-awaiting-lock-root")
      .or(recipient.getByTestId("recipient-approved-waiting-header"))
      .or(recipient.getByTestId("recipient-approved-draft-collapsed"))
      .or(recipient.getByTestId("recipient-review-approved-status"))
      .or(recipient.getByText(/Review submitted|Your review has been recorded/i));
    await expect(persistedApproved.first()).toBeVisible({ timeout: 20_000 });
    const expandApproved = recipient.getByText(/tap to expand|Approved draft/i).first();
    if (await expandApproved.isVisible().catch(() => false)) {
      await expandApproved.click();
    }
    if (await recipient.getByTestId("recipient-document-shell").isVisible({ timeout: 3_000 }).catch(() => false)) {
      expect(args.paperReady(await recipientPaperText(recipient, args.partyCue)), `${signer.legalEntity} reloaded paper`).toBeTruthy();
    }
    await context.close();
  }

  await expect
    .poll(async () => {
      const authority = await fetchOwnerDraftAuthority(args.page, args.agreementId);
      const approved = args.signers.filter((signer) => {
        const row = parties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity));
        return row?.id && approvalOnIntendedRevision(authority.audit, String(row.id), args.snapshotId, args.digest);
      });
      return approved.length;
    }, { timeout: 30_000 })
    .toBe(args.signers.length);

  await seedCorePaidJourneyOwner(args.page);
  await args.page.goto(`/app/create?agreementId=${args.agreementId}`, { waitUntil: "domcontentloaded" });
  await waitForOwnerWorkspaceReady(args.page, args.agreementId);
  await expect
    .poll(async () => {
      const text = await articleText(args.page, args.partyCue);
      return args.paperReady(text) ? text.length : 0;
    }, { timeout: 90_000 })
    .toBeGreaterThan(400);
  const restoredParties = await fetchOwnerParties(args.page, args.agreementId);
  for (const signer of args.signers) {
    const row = restoredParties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity));
    expect(row, `restored party missing for ${signer.legalEntity}`).toBeTruthy();
    if (signer.signerName) {
      expect(partySignerName(row), `intake_signer_name_lost_after_restore ${signer.legalEntity}`).toMatch(
        new RegExp(signer.signerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      );
    }
    if (signer.signerEmail) {
      expect(String(row?.email || "").toLowerCase(), `intake_signer_email_lost_after_restore ${signer.legalEntity}`).toBe(
        signer.signerEmail.toLowerCase(),
      );
    }
  }
  await assertSignerFormHoldsIntakeOrFillOnlyOmitted(args.page, args.signers);
  expect(await clickOwnerSend(args.page, "simple-pro-send-for-signature"), "send-for-signature must mount").toBeTruthy();
  await expect
    .poll(() => {
      return args.signers.every((signer) => {
        const row = parties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity));
        return Boolean(row?.id && mintedTokenForParticipant(minted, "sign", String(row.id)));
      })
        ? 1
        : 0;
    }, { timeout: 45_000 })
    .toBe(1);
  for (const signer of args.signers) {
    const row = parties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity))!;
    const token = String(
      (mintedTokenForParticipant(minted, "sign", String(row.id))?.body as { token?: string } | undefined)?.token || "",
    );
    const viewport = args.page.viewportSize() ?? { width: 1280, height: 800 };
    const context = await args.browser.newContext({ viewport });
    const recipient = await context.newPage();
    acceptNativeDialogs(recipient);
    const signOrigin = ownerOrigin(args.page);
    await recipient.goto(
      `${signOrigin}/agreements/${args.agreementId}/sign?t=${encodeURIComponent(token)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(
      recipient.getByTestId("recipient-public-sign-route"),
      `${signer.legalEntity} sign route`,
    ).toBeVisible({ timeout: 30_000 });
    const paper = await recipientPaperText(recipient, args.partyCue);
    expect(args.paperReady(paper), `${signer.legalEntity} sign paper`).toBeTruthy();
    await recipient.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
    const typed = recipient.getByTestId("recipient-sign-typed-name");
    await typed.scrollIntoViewIfNeeded().catch(() => undefined);
    if (await typed.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await typed.fill(signer.signerName);
    }
    const consent = recipient.getByTestId("recipient-sign-consent");
    await consent.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(consent, `${signer.legalEntity} sign consent`).toBeVisible({ timeout: 15_000 });
    await consent.check();
    await expect(consent).toBeChecked();
    const action = recipient.locator('[data-testid="recipient-sign-action"]:visible');
    await action.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(action, `${signer.legalEntity} sign action must enable`).toBeEnabled({ timeout: 20_000 });
    await action.click();
    await expect(
      recipient
        .getByTestId("recipient-sign-complete-status")
        .or(recipient.getByText(/Signed\. Confirmation saved\.|Your signature has been recorded\./i))
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    const afterSign = await fetchOwnerDraftAuthority(args.page, args.agreementId);
    expect(
      signatureCompletedForParticipant(afterSign.audit, String(row.id)),
      `${signer.legalEntity} signature_completed missing for participant ${row.id}`,
    ).toBeTruthy();
    await context.close();
  }

  await seedCorePaidJourneyOwner(args.page);
  await args.page.goto(`/app/agreements/${args.agreementId}/view-signed`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(args.page.getByTestId("owner-signed-agreement-page")).toBeVisible({ timeout: 30_000 });
  const finalDoc = args.page.getByTestId("owner-signed-agreement-document");
  await expect(finalDoc).toContainText(args.partyCue, { timeout: 30_000 });
  const finalText = await finalDoc.innerText();
  expect(args.paperReady(finalText), "owner final record").toBeTruthy();
  for (const signer of args.signers) expect(finalText).toContain(signer.signerName);
  const expectedTitle = (extractTitleFromCorpusPlain(finalText)?.title || "").trim();
  expect(expectedTitle, "corpus heading for chrome title").toBeTruthy();
  expect(expectedTitle.toLowerCase(), "corpus heading for chrome title").not.toBe("untitled agreement");
  await expect(args.page.getByTestId("owner-signed-agreement-chrome-title")).toHaveText(expectedTitle);
  const requiredSigners = args.signers.length;
  expect(requiredSigners, "journey required signers").toBeGreaterThanOrEqual(2);
  await expect(args.page.getByTestId("owner-signed-agreement-signatures")).toContainText(
    `Fully signed (${requiredSigners} of ${requiredSigners})`,
  );
  const api = configuredLiveApiBase();
  const runtime = loadCorePaidJourneyRuntime();
  const receiptRes = await args.page.request.get(
    `${api}/api/agreements/${encodeURIComponent(args.agreementId)}/proof-status`,
    {
      headers: {
        Authorization: `Bearer ${runtime.access_token}`,
        "X-Claw-Org-Id": runtime.org_id,
      },
    },
  );
  expect(receiptRes.ok(), `proof-status failed ${receiptRes.status()}`).toBeTruthy();
  const receipt = ((await receiptRes.json()) as { finalized_receipt?: { receipt_id?: string; bound?: boolean; accepted_snapshot_id?: string; accepted_snapshot_digest?: string } }).finalized_receipt || {};
  expect(receipt.bound).toBe(true);
  expect(String(receipt.accepted_snapshot_id || "")).toBe(args.snapshotId);
  expect(String(receipt.accepted_snapshot_digest || "").toLowerCase()).toBe(args.digest);
  return { receiptId: String(receipt.receipt_id || ""), signedCount: args.signers.length };
}
