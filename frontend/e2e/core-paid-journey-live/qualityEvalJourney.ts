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
import { loadCorePaidJourneyRuntime, seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";
import {
  applyChangesExplainedByAnswers,
  assertCheck,
  checkFourPartyCustomerMeaning,
  checkHarborAppliedMeaning,
  checkHarborFirstDraftMeaning,
  checkSaasCustomerMeaning,
  checkThreePartyCustomerMeaning,
  consultingPaperReady as consultingPaperReadyCheck,
  fourPartyPaperReady as fourPartyPaperReadyCheck,
  saasPaperReady as saasPaperReadyCheck,
  threePartyPaperReady as threePartyPaperReadyCheck,
} from "../../src/launch/qualityEvalCustomerPaper";
import {
  RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE,
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

export function paperReadyForCase(id: QualityEvalCaseId): (article: string) => boolean {
  if (id === "consulting") return consultingPaperReady;
  if (id === "saas") return saasPaperReady;
  if (id === "three_party") return threePartyPaperReady;
  return fourPartyPaperReady;
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

export function assertFourPartyCustomerMeaning(article: string): void {
  assertCheck(checkFourPartyCustomerMeaning(article), "four_party_customer_meaning");
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
  assertFourPartyCustomerMeaning(article);
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
  const freshGet = await fetchOwnerCanonicalSnapshot(freshPage, agreementId);
  expect(freshGet.snapshotId).toBe(expected.snapshotId);
  expect(freshGet.digest).toBe(expected.digest);
  const freshCompare = describeOperativeArticleCompare("fresh_visible", article, "fresh_get", freshGet.corpus);
  expect(freshCompare.sameOperative, freshCompare.diff).toBe(true);
  expect(mintedNew, "opening the saved agreement must not mint a replacement").toEqual([]);
  await freshContext.close();
  return { article, reopenId };
}
