/**
 * Recipient review export: browser races, layout, retry, and download naming.
 * Depends on mocked agreements API + PDF route (no real backend).
 */
import { expect, test, type Page } from "@playwright/test";

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
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  created_at: string;
  updated_at: string;
};

function minimalPdfBody(): Buffer {
  const b = Buffer.alloc(120);
  b[0] = 0x25;
  b[1] = 0x50;
  b[2] = 0x44;
  b[3] = 0x46;
  return b;
}

function installIsolatedAgreementsApi(page: Page, state: { drafts: Map<string, DraftRec> }) {
  return page.route("**/api/agreements/**", async (route) => {
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

    if (url.includes("/api/agreements/access/validate")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (url.includes("/render") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rendered_html: "<p>LawDog <strong>preview</strong> — E2E</p>" }),
      });
      return;
    }

    if (url.includes("/revise") && method === "POST") {
      const body = route.request().postDataJSON() as { instruction?: string } | null;
      const inst = (body?.instruction || "").toLowerCase();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            id: (url.match(/\/agreements\/([^/]+)\//)?.[1] as string) || "ag",
            title: "E2E Services Agreement",
            jurisdiction: "California",
            parties: [
              { name: "Studio LLC", role: "party" },
              { name: "Client LLC", role: "party" },
            ],
            purpose: "Professional services and deliverables (preview merge).",
            payment_terms: inst.includes("e2e") || inst.includes("net 30")
              ? "Revised: Net 30 per E2E preview (do not use as legal advice)."
              : "Net 15.",
            duration: "12 months",
            due_date: null,
            effective_date: "2026-01-01",
            versions: [{ version: 1, created_at: new Date().toISOString(), note: "e2e" }],
            audit_log: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment<br/>Net 15.</p><p>IN WITNESS WHEREOF</p><p>Parties agree.</p>",
        }),
      });
      return;
    }

    if (method !== "GET" && (url.match(/\/api\/agreements\/[^/]+(\/[^?]*)?$/) || url.includes("/update-field"))) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    const rec = state.drafts.get(id);
    if (!rec) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not_found" }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ draft: rec, economics: { tier: "paid", watermark_required: false } }),
    });
  });
}

/** Register after `installIsolatedAgreementsApi` so this handler wins over the generic POST stub. */
function installRecipientPreviewPdfOk(page: Page) {
  return page.route("**/recipient-preview-export-pdf**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: minimalPdfBody(),
    });
  });
}

async function openRecipientReviewReviseTab(page: Page, agreementId: string) {
  await page.goto(`/agreements/${agreementId}/review`, { waitUntil: "domcontentloaded" });
  const requestChangesLanding = page.getByRole("button", { name: "Request changes" });
  if (await requestChangesLanding.isVisible().catch(() => false)) {
    await requestChangesLanding.first().click();
  } else {
    const reviewCta = page.getByRole("button", { name: "Review agreement" });
    await expect(reviewCta.first()).toBeVisible({ timeout: 30_000 });
    await reviewCta.first().click();
    await expect(page.getByRole("button", { name: "Request changes" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Request changes" }).first().click();
  }
  await expect(page.getByText("Describe changes", { exact: true })).toBeVisible({ timeout: 20_000 });
}

test.describe("recipient review export hardening", () => {
  test.describe.configure({ mode: "serial" });

  test("rapid preview toggle + export stress (no duplicate strips, no console errors)", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });

    const id = "ag_e2e_export_stress";
    const now = new Date().toISOString();
    const draft: DraftRec = {
      id,
      title: "E2E Services Agreement",
      jurisdiction: "California",
      parties: [
        { name: "Studio LLC", role: "owner" },
        { name: "Client LLC", role: "party" },
      ],
      purpose: "Professional services (E2E).",
      payment_terms: "Net 15.",
      duration: "6 months",
      due_date: null,
      effective_date: "2026-02-01",
      versions: [{ version: 1, created_at: now, note: "created" }],
      audit_log: [],
      created_at: now,
      updated_at: now,
    };
    const state = { drafts: new Map<string, DraftRec>([[id, draft]]) };
    await installIsolatedAgreementsApi(page, state);
    await installRecipientPreviewPdfOk(page);
    await openRecipientReviewReviseTab(page, id);

    const ta = page.getByTestId("recipient-revision-voice-field");
    await ta.fill("E2E stress: Net 30 and clarify payment.");

    for (let i = 0; i < 14; i++) {
      await page.getByRole("button", { name: "Preview changes" }).click();
      await page.getByTestId("recipient-preview-download-original-pdf").click({ timeout: 8000 }).catch(() => {});
      if (await page.getByRole("button", { name: "Keep reviewing" }).isVisible().catch(() => false)) {
        await page.getByRole("button", { name: "Keep reviewing" }).first().click();
      }
      if (i % 3 === 0) {
        await page.getByRole("button", { name: "← Back to agreement" }).click({ timeout: 5000 }).catch(() => {});
        await expect(page.getByTestId("recipient-read-download-agreement")).toBeVisible({ timeout: 10_000 });
        await page.getByRole("button", { name: "Request changes" }).first().click();
        await expect(page.getByText("Describe changes", { exact: true })).toBeVisible({ timeout: 15_000 });
      }
    }

    const onRevise = await page.getByRole("button", { name: "← Back to agreement" }).isVisible().catch(() => false);
    if (!onRevise) {
      await page.getByRole("button", { name: "Request changes" }).first().click();
      await expect(page.getByText("Describe changes", { exact: true })).toBeVisible({ timeout: 15_000 });
    }
    while (await page.getByRole("button", { name: "Keep reviewing" }).isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Keep reviewing" }).first().click();
    }

    await expect(page.getByTestId("recipient-preview-versions-export")).toHaveCount(0);
    await page.getByRole("button", { name: "Preview changes" }).click();
    await expect(page.getByTestId("recipient-preview-versions-export")).toHaveCount(1);
    await expect(page.getByTestId("recipient-read-download-agreement")).toHaveCount(0);

    const readBlocks = await page.getByTestId("recipient-read-download-agreement").count();
    const previewBlocks = await page.getByTestId("recipient-preview-versions-export").count();
    expect(readBlocks + previewBlocks).toBe(1);

    const originalBtn = page.getByTestId("recipient-preview-download-original-pdf");
    await expect(originalBtn).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("recipient-preview-download-proposed-pdf")).toBeEnabled();
    await expect(page.getByTestId("recipient-preview-download-redline-pdf")).toBeEnabled();

    expect(
      consoleErrors.filter((x) => !x.includes("ResizeObserver") && !x.includes("favicon")),
      `console errors: ${consoleErrors.join("\n")}`,
    ).toEqual([]);
  });

  test("PDF export retry: first 503 then success clears error and recovers controls", async ({ page }) => {
    test.setTimeout(90_000);
    const id = "ag_e2e_export_retry";
    const now = new Date().toISOString();
    const draft: DraftRec = {
      id,
      title: "E2E Services Agreement",
      jurisdiction: "California",
      parties: [
        { name: "Studio LLC", role: "owner" },
        { name: "Client LLC", role: "party" },
      ],
      purpose: "Professional services (E2E).",
      payment_terms: "Net 15.",
      duration: "6 months",
      due_date: null,
      effective_date: "2026-02-01",
      versions: [{ version: 1, created_at: now, note: "created" }],
      audit_log: [],
      created_at: now,
      updated_at: now,
    };
    const state = { drafts: new Map<string, DraftRec>([[id, draft]]) };
    await installIsolatedAgreementsApi(page, state);

    let pdfAttempts = 0;
    await page.route("**/recipient-preview-export-pdf**", async (route) => {
      pdfAttempts += 1;
      if (pdfAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: { message: "PDF export is temporarily unavailable." } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: minimalPdfBody(),
      });
    });

    await openRecipientReviewReviseTab(page, id);
    await page.getByTestId("recipient-revision-voice-field").fill("E2E retry: Net 30.");
    await page.getByRole("button", { name: "Preview changes" }).click();
    await expect(page.getByTestId("recipient-preview-versions-export")).toBeVisible({ timeout: 25_000 });

    const proposed = page.getByTestId("recipient-preview-download-proposed-pdf");
    await proposed.click();
    await expect(page.getByTestId("recipient-pdf-export-error")).toBeVisible({ timeout: 15_000 });
    await expect(proposed).toBeEnabled();

    const download = page.waitForEvent("download", { timeout: 20_000 });
    await proposed.click();
    const dl = await download;
    expect(dl.suggestedFilename()).toMatch(/^e2e-services-agreement-proposed-(?:[a-z0-9-]+-)?\d{4}-\d{2}-\d{2}T\d{4}\.pdf$/);

    await expect(page.getByTestId("recipient-pdf-export-error")).toHaveCount(0, { timeout: 8000 });
    await expect(proposed).toBeEnabled();
  });

  for (const vp of [
    { label: "320", width: 320, height: 720 },
    { label: "375", width: 375, height: 800 },
    { label: "390", width: 390, height: 844 },
  ] as const) {
    test(`export region has no horizontal overflow @ ${vp.label}px`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const id = `ag_e2e_export_mob_${vp.label}`;
      const now = new Date().toISOString();
      const draft: DraftRec = {
        id,
        title: "E2E Services Agreement",
        jurisdiction: "California",
        parties: [
          { name: "Studio LLC", role: "owner" },
          { name: "Client LLC", role: "party" },
        ],
        purpose: "Professional services (E2E).",
        payment_terms: "Net 15.",
        duration: "6 months",
        due_date: null,
        effective_date: "2026-02-01",
        versions: [{ version: 1, created_at: now, note: "created" }],
        audit_log: [],
        created_at: now,
        updated_at: now,
      };
      const state = { drafts: new Map<string, DraftRec>([[id, draft]]) };
      await installIsolatedAgreementsApi(page, state);
      await installRecipientPreviewPdfOk(page);
      await openRecipientReviewReviseTab(page, id);
      await page.getByTestId("recipient-revision-voice-field").fill("E2E mobile layout: Net 30.");
      await page.getByRole("button", { name: "Preview changes" }).click();
      const exportBox = page.getByTestId("recipient-preview-versions-export");
      await expect(exportBox).toBeVisible({ timeout: 25_000 });
      const overflows = await exportBox.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
      expect(overflows, "export strip should not scroll horizontally").toBe(false);
      await expect(page.getByTestId("recipient-preview-download-redline-pdf")).toBeVisible();
      await expect(page.getByTestId("recipient-preview-download-redline-pdf")).toBeEnabled();
    });
  }
});
