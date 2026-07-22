import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared E2E mocks for anonymous free-starter create → review journeys.
 *
 * Root cause (RC): direct /app/create without hero handoff + anonymous-session bootstrap
 * minting user-* org triggers shouldFailClosedBypassForAuthenticatedWorkspaceCreate → paid_pro shell.
 */
export const PROD_QA_FREELANCE_PROMPT =
  "I need a freelance software development agreement. Anthem Blanchard hires Sarah Collins to redesign and optimize the CryptoSpaces.net website for $7,500 total. $3,000 due upfront, $4,500 due on final delivery. Work includes homepage redesign, mobile optimization, analytics setup, email capture funnel, and performance improvements. Project starts May 1, 2026 and final delivery is due within 30 days. Two revision rounds included. Client owns final deliverables after full payment. Developer keeps pre-existing tools and code libraries. Both parties keep confidential information private. Oklahoma law governs. Notices by email are acceptable.";

export const UNPAID_ECONOMICS = {
  tier: "free",
  watermark_required: false,
  free_draft_expired: false,
  free_draft_expires_at: null as string | null,
};

export type DraftRecord = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: Array<{ name: string; role: string; email?: string }>;
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  created_at: string;
  updated_at: string;
};

const FREE_USAGE_SUMMARY = {
  tier: "free",
  agreements_created: 0,
  agreements_completed: 0,
  drafts_active: 0,
  agreements_remaining: 1,
  drafts_remaining: 1,
  watermark_required: false,
  storage_persistent: false,
  paywall_required: false,
  soft_throttle: false,
};

const ANON_ORG_ID = "anon-e2e-starter-org";

/** Seed anonymous starter session — avoids user-* org fail-closed paid bypass. */
export async function seedAnonymousStarterBrowserState(page: Page): Promise<void> {
  await page.addInitScript((orgId: string) => {
    try {
      localStorage.setItem("claw_org_id", orgId);
      localStorage.setItem("lawdog_mock_is_authenticated", "false");
      localStorage.removeItem("claw_subscription_entitlement_v1");
      localStorage.removeItem("claw_workspace_usage_tier_v1");
      localStorage.removeItem("claw_dev_access_tier");
      sessionStorage.removeItem("claw_authenticated_workspace_session");
      sessionStorage.removeItem("claw_paid_dashboard_create_context_v1");
      sessionStorage.removeItem("claw_direct_create_bootstrap_attempted_v1");
      sessionStorage.removeItem("claw_anon_session_token_v1");
      sessionStorage.removeItem("claw_anon_session_id_v1");
    } catch {
      /* ignore */
    }
  }, ANON_ORG_ID);
}

export function installFreeStarterApiRoutes(
  page: Page,
  drafts: Map<string, DraftRecord>,
  draftId = "ag_free_starter_e2e",
  parseProfile: "freelance" | "vendor" = "freelance",
) {
  return page.route("**/*", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/health") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (url.includes("/v1/workspace/anonymous-session") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          org_id: ANON_ORG_ID,
          session_id: "e2e-anon-session",
          token: "e2e-anon-token",
          expires_in_seconds: 86400,
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/usage") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FREE_USAGE_SUMMARY),
      });
      return;
    }

    if (!url.includes("/api/agreements/")) {
      await route.continue();
      return;
    }

    if (url.includes("/api/agreements/parse")) {
      let intakeText = "";
      try {
        const body = route.request().postDataJSON() as { text?: string; intake?: string };
        intakeText = String(body?.text ?? body?.intake ?? "");
      } catch {
        intakeText = "";
      }
      const vendor =
        parseProfile === "vendor" || /cedar ridge|northwind/i.test(intakeText);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: vendor
            ? {
                title: "Vendor Maintenance Agreement",
                jurisdiction: "Texas",
                parties: [
                  { name: "Cedar Ridge Holdings LLC", role: "party" },
                  { name: "Northwind Analytics Inc.", role: "party" },
                ],
                purpose: "Quarterly reporting support.",
                payment_terms: "$4,200 per quarter",
                duration: "12 months",
                due_date: null,
                effective_date: "2026-01-01",
                agreement_family: "services_agreement",
              }
            : {
                title: "Software Development Agreement",
                jurisdiction: "Oklahoma",
                parties: [
                  { name: "Anthem Blanchard", role: "party" },
                  { name: "Sarah Collins", role: "party" },
                ],
                purpose: "Redesign and optimize the CryptoSpaces.net website.",
                payment_terms: "$7,500 total; $3,000 upfront, $4,500 on final delivery.",
                duration: "30 days from May 1, 2026",
                due_date: null,
                effective_date: "2026-05-01",
                agreement_family: "independent_contractor_agreement",
              },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = draftId;
      const now = new Date().toISOString();
      const rec: DraftRecord = {
        id,
        title: String(body.title || "Untitled agreement"),
        jurisdiction: String(body.jurisdiction || "Oklahoma"),
        parties: (Array.isArray(body.parties) ? body.parties : []) as DraftRecord["parties"],
        purpose: String(body.purpose || ""),
        payment_terms: String(body.payment_terms || ""),
        duration: body.duration == null ? null : String(body.duration),
        due_date: body.due_date == null ? null : String(body.due_date),
        effective_date: body.effective_date == null ? null : String(body.effective_date),
        versions: [{ version: 1, created_at: now, note: "created" }],
        audit_log: [],
        created_at: now,
        updated_at: now,
      };
      drafts.set(id, rec);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id, draft: rec, economics: UNPAID_ECONOMICS }),
      });
      return;
    }

    if (url.includes("/render")) {
      const rec = drafts.get(draftId);
      const parties = rec?.parties?.map((p) => p.name).join(" and ") ?? "Parties";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rendered_html: `<p>${parties} — starter agreement preview for ${rec?.title ?? "draft"}.</p>`,
        }),
      });
      return;
    }

    if (method !== "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const segment = m?.[1] ? decodeURIComponent(m[1]) : "";
    if (segment === "usage") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FREE_USAGE_SUMMARY),
      });
      return;
    }
    const rec = drafts.get(segment);
    await route.fulfill({
      status: rec ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(rec ? { draft: rec, economics: UNPAID_ECONOMICS } : { detail: "not_found" }),
    });
  });
}

/** Homepage → create with hero handoff (mirrors LaunchHomePage.startDrafting). */
export async function submitHomepageHeroToCreate(page: Page, prompt = PROD_QA_FREELANCE_PROMPT): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#claw-hero-intake").fill(prompt);
  await page.getByRole("button", { name: "Create free draft" }).click();
  await expect(page).toHaveURL(/\/app\/create/, { timeout: 30_000 });
}

/**
 * Stable free-starter review preview locator.
 * Production may render either the starter document article ("Agreement document preview")
 * or the text preview region ("Agreement text preview"). Prefer the article when both are
 * visible so the create-flow intake region does not win via DOM order.
 */
export function freeStarterReviewPreviewLocator(page: Page): Locator {
  return page
    .getByRole("article", { name: "Agreement document preview" })
    .or(page.getByRole("region", { name: "Agreement text preview" }))
    .first();
}

/** Free-starter post-generation chrome: summary card and/or "Review your draft" heading. */
export function freeStarterReviewChromeLocator(page: Page): Locator {
  return page
    .getByTestId("agreement-ready-summary-card")
    .or(page.getByRole("heading", { name: "Review your draft" }))
    .first();
}

/**
 * AgreementReadySummaryCard gates the readonly review surface — advance when present.
 * No-op when already on the draft review / invite path.
 */
export async function advancePastFreeStarterReadySummaryIfPresent(page: Page): Promise<void> {
  const summary = page.getByTestId("agreement-ready-summary-card");
  if (!(await summary.isVisible().catch(() => false))) return;
  const reviewBtn = page.getByRole("button", { name: "Review agreement" });
  await expect(reviewBtn).toBeVisible({ timeout: 15_000 });
  await reviewBtn.click();
  await expect(summary).toBeHidden({ timeout: 30_000 });
}

/** Wait until anonymous free-starter post-generation review surface is ready (summary + document preview). */
export async function waitForFreeStarterReviewReady(page: Page): Promise<void> {
  await expect(freeStarterReviewChromeLocator(page)).toBeVisible({ timeout: 60_000 });
  await advancePastFreeStarterReadySummaryIfPresent(page);
  await expect(freeStarterReviewPreviewLocator(page)).toBeVisible({ timeout: 60_000 });
}

/** @deprecated Prefer waitForFreeStarterReviewReady — legacy alias for rc-journeys imports. */
export async function advanceToFreeStarterReviewSurface(page: Page): Promise<void> {
  await waitForFreeStarterReviewReady(page);
}

export async function goToFreeStarterReview(page: Page, drafts: Map<string, DraftRecord>, draftId?: string) {
  await seedAnonymousStarterBrowserState(page);
  await installFreeStarterApiRoutes(page, drafts, draftId);
  await submitHomepageHeroToCreate(page);
  await waitForFreeStarterReviewReady(page);
  const preview = freeStarterReviewPreviewLocator(page);
  await expect(preview).toBeVisible({ timeout: 60_000 });
  return preview;
}
