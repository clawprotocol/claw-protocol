/**
 * Ownership migration authority — production API boundaries with deterministic mocks.
 */
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { AGREEMENT_CREATE_REVIEW_RESUME_KEY } from "../../src/components/agreements/agreementIntakeStorage";
import { seedE2eAuthSession } from "./rcE2eAuthBridge";
import { RC_PAID_ECONOMICS, type RcDraftRecord } from "./rcPaidProApiMocks";

export type RequestTimelineEntry = {
  at: number;
  method: string;
  url: string;
  body?: unknown;
  tag?: string;
};

export type OwnershipMigrationScenario = {
  id: string;
  label: string;
  anonAgreementId: string;
  ownedAgreementId: string;
  checkoutFirst?: boolean;
  replayAuth?: boolean;
  invalidCheckout?: boolean;
  /** C: auth + checkout settlement concurrent (two tabs). */
  concurrentAuthCheckout?: boolean;
  /** E: reload after checkout return at a given phase. */
  reloadPhase?: "before_verify" | "after_verify_before_auth" | "after_migration_before_review";
  /** F: subscription webhook delayed after verified checkout. */
  delayedWebhook?: boolean;
  /** G: auth without completing checkout. */
  abandonedCheckout?: boolean;
  /** I: checkout session belongs to another user/org. */
  mismatchedCheckout?: boolean;
  /** J: reload after migration before paid review entry. */
  reloadAfterMigration?: boolean;
};

export type OwnershipAuthorityHarness = {
  timeline: RequestTimelineEntry[];
  scenario: OwnershipMigrationScenario;
  drafts: Map<string, RcDraftRecord>;
  subscriptionFetchCount: number;
  webhookDelivered: boolean;
};

export type OwnershipCaseEvidence = {
  agreementIdBefore: string | null;
  agreementIdAfter: string | null;
  orgId: string | null;
  entitlement: string | null;
  finalizeAuthCalls: number;
  checkoutVerifyCalls: number;
  draftPostCount: number;
  premiumFullDraftPosts: number;
  finalUrl: string;
};

export function createOwnershipAuthorityHarness(scenario: OwnershipMigrationScenario): OwnershipAuthorityHarness {
  return { timeline: [], scenario, drafts: new Map(), subscriptionFetchCount: 0, webhookDelivered: false };
}

function resolveAuthDestinationPath(scenario: OwnershipMigrationScenario): string {
  if (scenario.checkoutFirst || scenario.concurrentAuthCheckout || scenario.reloadPhase) {
    return "/app/create?premiumCompletion=1";
  }
  if (scenario.reloadAfterMigration) return "/app/dashboard";
  return "/app/dashboard";
}

function seedDraftRecord(harness: OwnershipAuthorityHarness): RcDraftRecord {
  const now = new Date().toISOString();
  const rec: RcDraftRecord = {
    id: harness.scenario.ownedAgreementId,
    title: "Professional Services Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "Professional technology and consulting services.",
    payment_terms: "$96,000 milestone installments",
    duration: "12 months",
    due_date: null,
    effective_date: "2026-01-01",
    versions: [{ version: 1, created_at: now, note: "migrated" }],
    audit_log: [],
    created_at: now,
    updated_at: now,
  };
  harness.drafts.set(harness.scenario.ownedAgreementId, rec);
  return rec;
}

export async function installOwnershipMigrationAuthorityRoutes(
  page: Page,
  harness: OwnershipAuthorityHarness,
): Promise<void> {
  const { scenario, timeline } = harness;
  seedDraftRecord(harness);
  const destinationPath = resolveAuthDestinationPath(scenario);
  const scope = page.context();

  let checkoutVerifyDelayMs = 0;
  let finalizeAuthDelayMs = 0;
  if (scenario.concurrentAuthCheckout) {
    checkoutVerifyDelayMs = 300;
    finalizeAuthDelayMs = 300;
  }
  if (scenario.reloadPhase === "before_verify") checkoutVerifyDelayMs = 2_000;
  if (scenario.reloadPhase === "after_verify_before_auth") finalizeAuthDelayMs = 2_000;

  await scope.route("**/v1/workspace/finalize-auth**", async (route) => {
    if (finalizeAuthDelayMs > 0) await new Promise((r) => setTimeout(r, finalizeAuthDelayMs));
    const url = route.request().url();
    const method = route.request().method();
    let body: unknown;
    try {
      body = route.request().postDataJSON();
    } catch {
      body = undefined;
    }
    timeline.push({ at: Date.now(), method, url, body, tag: "finalize-auth" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        org_id: "user-rc-authority-org",
        user_id: "e2e-user-rc-authority",
        destination_path: destinationPath,
        migrated_agreement_count: 1,
        migrated_agreement_ids: [scenario.ownedAgreementId],
        idempotent: timeline.filter((t) => t.tag === "finalize-auth").length > 1,
      }),
    });
  });

  await scope.route("**/v1/workspace/bind-user-org**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    let body: unknown;
    try {
      body = route.request().postDataJSON();
    } catch {
      body = undefined;
    }
    timeline.push({ at: Date.now(), method, url, body, tag: "bind-user-org" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        org_id: "user-rc-authority-org",
        migrated_agreement_count: 1,
        migrated_agreement_ids: [scenario.ownedAgreementId],
      }),
    });
  });

  await scope.route("**/v1/workspace/auth-continuation**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    timeline.push({
      at: Date.now(),
      method: route.request().method(),
      url: route.request().url(),
      tag: "auth-continuation",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        continuation_id: `cont_${scenario.id}`,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        org_id: "anon-rc-authority-org",
      }),
    });
  });

  await scope.route("**/v1/billing/verify-checkout-session**", async (route) => {
    if (checkoutVerifyDelayMs > 0) await new Promise((r) => setTimeout(r, checkoutVerifyDelayMs));
    timeline.push({
      at: Date.now(),
      method: route.request().method(),
      url: route.request().url(),
      tag: "verify-checkout",
    });
    if (scenario.invalidCheckout || scenario.mismatchedCheckout) {
      await route.fulfill({
        status: scenario.mismatchedCheckout ? 403 : 402,
        contentType: "application/json",
        body: JSON.stringify({
          detail: scenario.mismatchedCheckout ? "checkout_session_user_mismatch" : "invalid_session",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, subscription: { plan_code: "pro", status: "active" } }),
    });
  });

  await scope.route("**/v1/subscriptions/**", async (route) => {
    harness.subscriptionFetchCount += 1;
    timeline.push({
      at: Date.now(),
      method: route.request().method(),
      url: route.request().url(),
      tag: "subscription-fetch",
    });
    if (scenario.delayedWebhook && harness.subscriptionFetchCount < 2) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not_found" }) });
      return;
    }
    if (scenario.delayedWebhook && harness.subscriptionFetchCount >= 2) {
      harness.webhookDelivered = true;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "sub_rc_authority",
        org_id: "user-rc-authority-org",
        plan_code: "pro",
        status: "active",
      }),
    });
  });

  await scope.route(/\/api\/agreements\/([^/?]+)/, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const segment = m?.[1] ? decodeURIComponent(m[1]) : "";
    if (!segment.startsWith("ag_")) {
      await route.fallback();
      return;
    }
    if (method === "POST" && url.includes("/draft")) {
      let body: unknown;
      try {
        body = route.request().postDataJSON();
      } catch {
        body = undefined;
      }
      timeline.push({ at: Date.now(), method, url, body, tag: "draft-post" });
      await route.fallback();
      return;
    }
    if (method === "GET") {
      timeline.push({ at: Date.now(), method, url, tag: "draft-get" });
      const rec = harness.drafts.get(segment);
      await route.fulfill({
        status: rec ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(rec ? { draft: rec, economics: RC_PAID_ECONOMICS } : { detail: "not_found" }),
      });
      return;
    }
    await route.fallback();
  });

  await scope.route("**/api/agreements/premium-full-draft**", async (route) => {
    if (route.request().method() === "POST") {
      timeline.push({
        at: Date.now(),
        method: "POST",
        url: route.request().url(),
        tag: "premium-full-draft",
      });
    }
    await route.fallback();
  });
}

export async function seedAnonymousAgreementContext(
  page: Page,
  args: { anonAgreementId: string; intakeText: string },
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ agreementId, intakeText }) => {
      try {
        sessionStorage.setItem("claw_agreement_create_review_resume_v1", agreementId);
        sessionStorage.setItem(
          "claw_create_complexity_resume_v1",
          JSON.stringify({
            version: 1,
            savedAt: Date.now(),
            rawIntake: intakeText,
            agreementId,
            resume_kind: "optional_full_upgrade",
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { agreementId: args.anonAgreementId, intakeText: args.intakeText },
  );
}

export async function runProductionAuthCallback(
  page: Page,
  args: { continuationId: string; destinationPath?: string },
): Promise<void> {
  await seedE2eAuthSession(page);
  const dest = args.destinationPath ?? "/app/dashboard";
  await page.goto(
    `/app/auth/callback?continuation_id=${encodeURIComponent(args.continuationId)}&next=${encodeURIComponent(dest)}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByText(/Finishing sign-in|Restoring your workspace/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Sign-in failed|Could not complete sign-in|Sign-in could not be completed/i)).toHaveCount(0);
  await page.waitForURL(/\/app\/(create|dashboard)/, { timeout: 90_000 });
}

export async function runConcurrentAuthAndCheckout(
  context: BrowserContext,
  args: { continuationId: string; checkoutSessionId: string },
): Promise<{ authPage: Page; checkoutPage: Page }> {
  const authPage = await context.newPage();
  const checkoutPage = await context.newPage();
  await seedE2eAuthSession(authPage);
  await seedE2eAuthSession(checkoutPage);
  await Promise.all([
    authPage.goto(
      `/app/auth/callback?continuation_id=${encodeURIComponent(args.continuationId)}&next=${encodeURIComponent("/app/dashboard")}`,
      { waitUntil: "domcontentloaded" },
    ),
    checkoutPage.goto(
      `/app/create?checkout_session_id=${encodeURIComponent(args.checkoutSessionId)}&premiumCompletion=1`,
      { waitUntil: "domcontentloaded" },
    ),
  ]);
  await authPage.waitForURL(/\/app\/(create|dashboard)/, { timeout: 90_000 }).catch(() => undefined);
  await checkoutPage.waitForLoadState("domcontentloaded");
  return { authPage, checkoutPage };
}

export async function readOwnershipCaseEvidence(
  page: Page,
  harness: OwnershipAuthorityHarness,
): Promise<OwnershipCaseEvidence> {
  const client = await page.evaluate(() => ({
    resume: sessionStorage.getItem("claw_agreement_create_review_resume_v1"),
    org: localStorage.getItem("claw_org_id"),
    entitlement: sessionStorage.getItem("claw_paid_premium_completion_session_v1"),
    url: location.href,
  }));
  return {
    agreementIdBefore: harness.scenario.anonAgreementId,
    agreementIdAfter: client.resume,
    orgId: client.org,
    entitlement: client.entitlement,
    finalizeAuthCalls: harness.timeline.filter((t) => t.tag === "finalize-auth").length,
    checkoutVerifyCalls: harness.timeline.filter((t) => t.tag === "verify-checkout").length,
    draftPostCount: harness.timeline.filter((t) => t.tag === "draft-post").length,
    premiumFullDraftPosts: harness.timeline.filter((t) => t.tag === "premium-full-draft").length,
    finalUrl: client.url,
  };
}

export async function assertOwnershipMigrationInvariants(
  page: Page,
  harness: OwnershipAuthorityHarness,
): Promise<OwnershipCaseEvidence> {
  const evidence = await readOwnershipCaseEvidence(page, harness);
  expect(evidence.agreementIdAfter).toBe(harness.scenario.ownedAgreementId);
  expect(evidence.agreementIdAfter).not.toBe(harness.scenario.anonAgreementId);

  const finalizeCalls = harness.timeline.filter((t) => t.tag === "finalize-auth");
  const bindCalls = harness.timeline.filter((t) => t.tag === "bind-user-org");
  expect(finalizeCalls.length + bindCalls.length).toBeGreaterThan(0);

  if (harness.scenario.replayAuth) {
    expect(finalizeCalls.length).toBeGreaterThanOrEqual(2);
  }

  for (const post of harness.timeline.filter((t) => t.tag === "draft-post")) {
    const body = post.body as { id?: string } | undefined;
    if (body?.id) expect(body.id).not.toBe(harness.scenario.anonAgreementId);
  }

  return evidence;
}

export async function assertNoEntitlementForInvalidCheckout(page: Page): Promise<void> {
  const settled = await page.evaluate(() =>
    sessionStorage.getItem("claw_paid_premium_completion_session_v1"),
  );
  expect(settled).not.toBe("settled_checkout");
}

export async function assertNoEntitlementGranted(page: Page): Promise<void> {
  const marker = await page.evaluate(() => {
    const raw = sessionStorage.getItem("claw_paid_premium_completion_session_v1");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { source?: string };
      return parsed.source ?? raw;
    } catch {
      return raw;
    }
  });
  expect(marker).not.toBe("settled_checkout");
}

export async function assertOwnershipUnchanged(
  page: Page,
  harness: OwnershipAuthorityHarness,
): Promise<void> {
  const resume = await page.evaluate(() => sessionStorage.getItem("claw_agreement_create_review_resume_v1"));
  expect(resume === harness.scenario.anonAgreementId || resume === null).toBeTruthy();
  expect(resume).not.toBe(harness.scenario.ownedAgreementId);
}

export function formatOwnershipTimeline(harness: OwnershipAuthorityHarness): string {
  return harness.timeline
    .map((t, i) => `${i + 1}. [${t.tag ?? "req"}] ${t.method} ${t.url}`)
    .join("\n");
}

export async function enterPaidReviewAfterMigration(
  page: Page,
  harness: OwnershipAuthorityHarness,
  paidDrafts: Map<string, RcDraftRecord>,
  intakeText: string,
  installPaidRoutes: (page: Page, drafts: Map<string, RcDraftRecord>, draftId: string) => Promise<void>,
  seedCheckout: (page: Page, intake: string, draftId: string) => Promise<void>,
): Promise<void> {
  const { ownedAgreementId } = harness.scenario;
  await installPaidRoutes(page, paidDrafts, ownedAgreementId);
  await installOwnershipMigrationAuthorityRoutes(page, harness);
  await seedCheckout(page, intakeText, ownedAgreementId);
  await page.goto(`/app/create?checkout_session_id=rc_${harness.scenario.id}_cs&premiumCompletion=1`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: /Review your Pro agreement/i })).toBeVisible({
    timeout: 180_000,
  });
}
