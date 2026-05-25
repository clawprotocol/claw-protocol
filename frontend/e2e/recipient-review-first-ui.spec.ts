/**
 * Review-first UI: recipient surface + paid Pro review-first must not land on generic /app/send.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

type DraftRec = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: Array<{ name: string; role: string; email?: string }>;
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  premium_render_source?: string;
  server_full_document_text?: string;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  created_at: string;
  updated_at: string;
};

function installReviewFirstApi(page: Page, draft: DraftRec) {
  return page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/access/policy") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recipient_link_token_required: false,
          mint_key_configured: false,
          signing_token_configured: false,
        }),
      });
      return;
    }

    if (url.includes("/render") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rendered_html: `<p>${draft.title}</p><p>${draft.purpose}</p><p>${draft.payment_terms}</p>`,
        }),
      });
      return;
    }

    if (url.includes("/revise") && method === "POST") {
      const revised = {
        ...draft,
        payment_terms: "Net 45.",
        updated_at: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: revised,
          rendered_html: `<p>${draft.title}</p><p>${draft.purpose}</p><p>3. Payment. Net 45.</p>`,
        }),
      });
      return;
    }

    if (url.includes("/recipient-access-token") && method === "POST") {
      const partyIdx = (draft.parties ?? []).findIndex((p) => p.role !== "owner");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: `tok_review_${draft.id}_${partyIdx}`,
          expires_in_seconds: 86400,
          locked_version_id: "v1",
          review_url: `https://example.test/agreements/${draft.id}/review?token=tok_review_${partyIdx}`,
        }),
      });
      return;
    }

    if (url.includes("/recipient-links/mint") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rows: (draft.parties ?? [])
            .filter((p) => p.role !== "owner")
            .map((p, i) => ({
              partyId: `p-${i}`,
              displayName: p.name,
              email: p.email ?? "",
              reviewHref: `https://example.test/review/${draft.id}/${i}`,
            })),
        }),
      });
      return;
    }

    if (method === "GET" && /\/api\/agreements\/[^/?]+$/.test(url.replace(/\?.*$/, ""))) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ draft, economics: { tier: "paid", watermark_required: false } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

function primeE2eApiBase(page: Page) {
  return page.addInitScript("window.__CLAW_PUBLIC_API_BASE__ = window.location.origin;");
}

function paidProAuthoritativeDraft(id: string): DraftRec {
  const now = new Date().toISOString();
  const body = "x".repeat(600);
  return {
    id,
    title: "Review First Services",
    jurisdiction: "California",
    parties: [
      { name: "Studio LLC", role: "owner", email: "owner@example.com" },
      { name: "Client LLC", role: "party", email: "client@example.com" },
    ],
    purpose: "Professional services agreement body for review-first routing tests.",
    payment_terms: "Payment due within 15 days.",
    duration: "6 months",
    due_date: null,
    effective_date: "2026-01-01",
    premium_render_source: "server_full_document_text",
    server_full_document_text: body,
    versions: [{ version: 1, created_at: now, note: "review" }],
    audit_log: [],
    created_at: now,
    updated_at: now,
  };
}

test("review-first simplified UI (desktop + laptop PNGs)", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const artifactDir = join(testInfo.project.outputDir, "..", "artifacts", "recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });

  const agreementId = "ag_review_first_png";
  const draft = paidProAuthoritativeDraft(agreementId);

  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1100 },
    { name: "laptop", width: 1100, height: 900 },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/agreements/${agreementId}/review?role=reviewer`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(page.getByRole("heading", { name: "Review agreement" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("recipient-review-first-actions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Request changes/i })).toHaveCount(0);

    await page.screenshot({
      path: join(artifactDir, `review-first-${viewport.name}.png`),
      fullPage: true,
    });
  }
});

test("paid Pro review-first skips generic /app/send and lands on owner done", async ({ page }) => {
  test.setTimeout(60_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_paid_pro_review_first_direct";
  const draft = paidProAuthoritativeDraft(agreementId);
  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  await page.addInitScript(
    ({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      const handoff = {
        v: 1,
        agreementId: id,
        primedDraft: primed,
        streamlinedSimpleFlow: true,
        premiumSendIntent: "review",
        openFlowPhase: "review",
        savedAt: Date.now(),
      };
      window.history.replaceState({ clawSimpleSendHandoff: handoff }, "", `/app/send/${id}`);
    },
    { id: agreementId, primed: draft },
  );

  const mintResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/recipient-access-token") &&
      res.status() === 200,
    { timeout: 25_000 },
  );
  await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await mintResponse;

  await expect(page).toHaveURL(new RegExp(`/app/done/${agreementId}`), { timeout: 25_000 });
  await expect(page.getByText("Your Agreement")).toHaveCount(0);
  await expect(page.getByText("Review before sending")).toHaveCount(0);
  await expect(page.getByText("Send this as a professional agreement")).toHaveCount(0);
  await expect(page.getByText("Continue with Pro")).toHaveCount(0);
  await expect(page.getByText("Continue with draft version")).toHaveCount(0);

  await page.screenshot({
    path: join(artifactDir, "review-first-direct-desktop.png"),
    fullPage: true,
  });
});

test("proposed changes show before/after blocks for other reviewers", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const artifactDir = join(testInfo.project.outputDir, "..", "artifacts", "recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });

  const agreementId = "ag_review_first_change_vis";
  const draft = paidProAuthoritativeDraft(agreementId);

  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/agreements/${agreementId}/review?role=reviewer`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await expect(page.getByRole("heading", { name: "Review agreement" })).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("recipient-review-edit-draft").click();
  await expect(page.getByTestId("recipient-compose-tablist")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("recipient-workflow-quick").click();
  await expect(page.getByTestId("recipient-revision-voice-field")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("recipient-revision-voice-field").fill("Change payment to Net 45.");
  await page.getByTestId("recipient-compare-versions-button").click();

  await expect(page.getByTestId("recipient-preview-summary-heading")).toHaveText("Changes proposed", {
    timeout: 20_000,
  });
  const changeSummary = page.getByTestId("recipient-review-change-visibility-summary");
  await expect(changeSummary).toBeVisible();
  await expect(changeSummary.getByText("Previous", { exact: true })).toBeVisible();
  await expect(changeSummary.getByText("Proposed", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Summary of proposed changes" })).toContainText(
    /payment terms updated/i,
  );

  await page.screenshot({
    path: join(artifactDir, "review-first-change-before-after.png"),
    fullPage: true,
  });
});

test("paid Pro review-first direct route laptop PNG", async ({ page }) => {
  test.setTimeout(60_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_paid_pro_review_first_laptop";
  const draft = paidProAuthoritativeDraft(agreementId);
  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  await page.addInitScript(
    ({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      window.history.replaceState(
        {
          clawSimpleSendHandoff: {
            v: 1,
            agreementId: id,
            primedDraft: primed,
            premiumSendIntent: "review",
            openFlowPhase: "review",
            savedAt: Date.now(),
          },
        },
        "",
        `/app/send/${id}`,
      );
    },
    { id: agreementId, primed: draft },
  );

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/app/done/${agreementId}`), { timeout: 25_000 });

  await page.screenshot({
    path: join(artifactDir, "review-first-direct-laptop.png"),
    fullPage: true,
  });
});
