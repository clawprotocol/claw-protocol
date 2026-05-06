/**
 * Focused recipient / link user-path QA (API route mocks; no external LLM).
 * For a **live** LawDog Pro checkout + generation + recipients walkthrough, also run
 * `premium-degraded-path-qa.spec.ts` and `paid-funnel-dashboard-qa.spec.ts` against a
 * local API.
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

/**
 * Mocks: access policy (token optional) + full agreements API for isolated flows.
 */
function installIsolatedAgreementsApi(
  page: Page,
  state: { drafts: Map<string, DraftRec> },
) {
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
            payment_terms: inst.includes("e2e")
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
          rendered_html: "<p>LawDog <strong>revised preview</strong> — E2E</p>",
        }),
      });
      return;
    }

    if (url.includes("/recipient-proposal") && url.includes("/apply") && method === "POST") {
      const m = url.match(/\/agreements\/([^/]+)\/recipient-proposal\/([^/]+)\/apply/);
      const id = m?.[1] ? decodeURIComponent(m[1]) : "";
      const d = state.drafts.get(id);
      if (d) {
        const now = new Date().toISOString();
        d.payment_terms = "Revised: Net 30 (applied in E2E).";
        d.audit_log.push({
          event_type: "recipient_proposal_applied",
          at: now,
          field: null,
          value: { proposal_id: m?.[2] || "prop" },
        });
        d.audit_log = d.audit_log.filter((e) => e.event_type !== "recipient_proposal_pending");
        d.updated_at = now;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ draft: d }) });
        return;
      }
    }

    if (url.includes("/recipient-proposal") && method === "POST" && !url.includes("/apply") && !url.includes("/reject")) {
      const m = url.match(/\/agreements\/([^/]+)\/recipient-proposal(?:$|\?)/);
      const id = m?.[1] ? decodeURIComponent(m[1]) : "";
      const d = state.drafts.get(id);
      if (d) {
        const b = (route.request().postDataJSON() as { draft?: { title?: string; payment_terms?: string } } | null) || {};
        const at = new Date().toISOString();
        d.audit_log = [
          ...d.audit_log,
          {
            event_type: "recipient_proposal_pending",
            at,
            field: null,
            value: {
              proposal_id: "prop_e2e_submit",
              instruction: "E2E",
              proposer_id: "p1",
              draft: b.draft,
              rendered_html: "<p>ok</p>",
              submitted_at: at,
            },
          },
        ];
        d.updated_at = at;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ proposal_id: "prop_e2e_submit", ok: d ? true : false }),
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
      if (url.includes("/parse") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            draft: {
              title: "E2E Parse",
              jurisdiction: "DE",
              parties: [
                { name: "A", role: "party" },
                { name: "B", role: "party" },
              ],
              purpose: "E2E",
              payment_terms: "Net 15",
              duration: "1 year",
              due_date: null,
              effective_date: "2026-01-01",
              agreement_family: "operating_agreement",
            },
          }),
        });
        return;
      }
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

async function expectNoMisleadingSentCopy(page: Page) {
  const body = page.locator("body");
  const bad = [
    /Agreement sent/i,
    /recipients have been notified/i,
    /we('ve| have) emailed( them)?/i,
    /emailed your agreement/i,
  ];
  for (const p of bad) {
    await expect(body.getByText(p)).toHaveCount(0);
  }
}

test.describe("recipient + link flow QA", () => {
  test.describe.configure({ mode: "serial" });

  test("1–2) Share copy, no false “sent”, malformed email (mocked create; live Pro in other specs)", async ({ page }) => {
    test.setTimeout(90_000);
    const drafts = new Map<string, DraftRec>();
    await page.route("**/api/agreements/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/parse")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            draft: {
              title: "Consulting Agreement",
              jurisdiction: "y",
              parties: [
                { name: "Acme LLC for 12 months", role: "party" },
                { name: "Beta Inc", role: "party" },
              ],
              purpose: "Consulting.",
              payment_terms: "Monthly retainer.",
              duration: "12 months",
              due_date: null,
              effective_date: "2026-01-01",
              agreement_family: "operating_agreement",
            },
          }),
        });
        return;
      }
      if (url.includes("/draft") && method === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const id = "ag_recipient_qa_e2e";
        const now = new Date().toISOString();
        const rec: DraftRec = {
          id,
          title: String(body.title || "Untitled agreement"),
          jurisdiction: String(body.jurisdiction || "Delaware"),
          parties: (Array.isArray(body.parties) ? body.parties : []) as DraftRec["parties"],
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
          body: JSON.stringify({
            id,
            draft: rec,
            economics: { tier: "free", watermark_required: false, free_draft_expired: false, free_draft_expires_at: null },
          }),
        });
        return;
      }
      if (url.includes("/render")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ rendered_html: "<p>OK</p>" }),
        });
        return;
      }
      if (method !== "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
      const m = url.match(/\/api\/agreements\/([^/?]+)/);
      const id = m?.[1] ? decodeURIComponent(m[1]) : "";
      const rec = drafts.get(id);
      await route.fulfill({
        status: rec ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(
          rec ? { draft: rec, economics: { tier: "free" } } : { detail: "not_found" },
        ),
      });
    });

    await page.goto("/app/create", { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox").first().fill(
      "Need a consulting operating-style agreement between Acme and Beta with custom governance and payment terms.",
    );
    const createOrReview = page.getByRole("button", {
      name: /Create draft|Create agreement|Draft now|Review draft|Review full draft/i,
    });
    await createOrReview.first().click();
    const trySimplified = page.getByRole("button", { name: "Try simplified starting point" });
    if (await trySimplified.isVisible().catch(() => false)) {
      await trySimplified.click();
    }
    const toSend = page.getByRole("button", { name: /Continue to send|Continue to Send|Continue/i });
    await expect(toSend).toBeVisible({ timeout: 90_000 });
    await toSend.first().click();
    await expect(page.getByRole("region", { name: /Invite recipients|Send agreement/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Share this agreement" })).toBeVisible();
    await expectNoMisleadingSentCopy(page);
    const openReviewer = page.getByRole("button", { name: "Continue to confirmation" }).first();
    if (await openReviewer.isVisible().catch(() => false)) {
      await openReviewer.click();
    }
    const r1e = page.getByLabel("Recipient 1 email");
    if (!(await r1e.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /Edit recipients|Hide recipient fields/ }).first().click();
    }
    await r1e.fill("not-an-email");
    await expect(r1e).toBeFocused();
    await expect(page.getByText(/(That email.*look valid|@\.)/i).first()).toBeVisible();
    const reviewOrSend = page.getByRole("button", {
      name: /Create review link|Create signing link|Continue to confirmation|Send agreement/i,
    });
    if (await reviewOrSend.isVisible().catch(() => false)) {
      await expect(reviewOrSend).toBeDisabled();
    }
  });

  test("2) Review (recipient): read → suggest → preview → send suggested edits", async ({ page }) => {
    test.setTimeout(60_000);
    const state: { drafts: Map<string, DraftRec> } = { drafts: new Map() };
    const id = "ag_recv_review_e2e";
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
    state.drafts.set(id, draft);
    await installIsolatedAgreementsApi(page, state);

    await page.goto(`/agreements/${id}/review`, { waitUntil: "domcontentloaded" });
    const requestChangesLanding = page.getByRole("button", { name: "Request changes" });
    if (await requestChangesLanding.isVisible().catch(() => false)) {
      await requestChangesLanding.first().click();
    } else {
      const reviewCta = page.getByRole("button", { name: "Review agreement" });
      await expect(reviewCta.first()).toBeVisible({ timeout: 30_000 });
      await reviewCta.first().click();
      await expect(page.getByRole("button", { name: "Request changes" })).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: "Request changes" }).click();
    }
    await expect(page.getByText("Write request", { exact: true })).toBeVisible({ timeout: 20_000 });
    const ta = page.locator("#recipient-revision-input");
    await ta.fill("E2E: use Net 30 and clarify payment per preview.");
    await page.getByRole("button", { name: "Preview changes" }).click();
    await expect(page.getByText("Send suggestions for review").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("recipient-preview-summary-heading")).toBeVisible();
    await page.getByRole("button", { name: "Send suggestions for review" }).first().click();
    await expect(page.getByTestId("recipient-send-suggested-edits-modal")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("recipient-send-suggested-edits-confirm").click();
    await expect(page.getByTestId("recipient-suggested-edits-sent-ack")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("2b) Recipient preview: single suggested-changes surface (Net 30 + pause gap)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const state: { drafts: Map<string, DraftRec> } = { drafts: new Map() };
    const id = "ag_recv_redline_clause_qa";
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
    state.drafts.set(id, draft);
    await installIsolatedAgreementsApi(page, state);

    const baselineLegalHtml =
      "<p>Services Agreement</p><p>3.2 Payment Schedule<br/>Invoices are due on receipt.</p><p>IN WITNESS WHEREOF</p><p>Parties agree.</p>";
    const proposedLegalHtml =
      "<p>Services Agreement</p><p>3.2 Payment Schedule<br/>Invoices are due <strong>Net 30</strong>.</p><p>IN WITNESS WHEREOF</p><p>Parties agree.</p>";

    await page.route("**/api/agreements/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/render") && method === "POST" && url.includes(id)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ rendered_html: baselineLegalHtml }),
        });
        return;
      }
      if (url.includes("/revise") && method === "POST") {
        const body = route.request().postDataJSON() as { instruction?: string } | null;
        const inst = body?.instruction || "";
        if (inst.includes("Net 30 and pause work after 15 days late")) {
          const draftId = (url.match(/\/agreements\/([^/]+)\//)?.[1] as string) || id;
          const noisySuffix = `<div aria-hidden="true">${"W".repeat(3200)}</div>`;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              draft: {
                id: draftId,
                title: "E2E Services Agreement",
                jurisdiction: "California",
                parties: [
                  { name: "Studio LLC", role: "party" },
                  { name: "Client LLC", role: "party" },
                ],
                purpose: "Professional services and deliverables (preview merge).",
                payment_terms: "Net 30.",
                duration: "12 months",
                due_date: null,
                effective_date: "2026-01-01",
                versions: [{ version: 1, created_at: new Date().toISOString(), note: "e2e" }],
                audit_log: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              rendered_html: `${proposedLegalHtml}${noisySuffix}`,
            }),
          });
          return;
        }
      }
      await route.fallback();
    });

    await page.goto(`/agreements/${id}/review`, { waitUntil: "domcontentloaded" });
    const requestChangesLanding = page.getByRole("button", { name: "Request changes" });
    if (await requestChangesLanding.isVisible().catch(() => false)) {
      await requestChangesLanding.first().click();
    } else {
      const reviewCta = page.getByRole("button", { name: "Review agreement" });
      await expect(reviewCta.first()).toBeVisible({ timeout: 30_000 });
      await reviewCta.first().click();
      await expect(page.getByRole("button", { name: "Request changes" })).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: "Request changes" }).click();
    }
    await expect(page.getByText("Write request", { exact: true })).toBeVisible({ timeout: 20_000 });

    const ta = page.locator("#recipient-revision-input");
    await ta.fill("Net 30 and pause work after 15 days late");
    await page.getByRole("button", { name: "Preview changes" }).click();
    await expect(page.getByText("Send suggestions for review").first()).toBeVisible({ timeout: 25_000 });

    await expect(page.getByTestId("recipient-suggested-changes-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Suggested changes" })).toBeVisible();
    await expect(page.getByTestId("recipient-suggested-changes-document")).toBeVisible();
    const legalDoc = page.getByTestId("recipient-legal-redline-document");
    await expect(legalDoc).toBeVisible();
    await expect(legalDoc).toHaveText(/\S{8,}/);
    await expect(page.getByTestId("recipient-redline-chip-insertions")).toBeVisible();
    await expect(page.getByTestId("recipient-redline-chip-not-reflected")).toHaveCount(0);
    const callout = page.getByTestId("recipient-redline-not-reflected-callout");
    await expect(callout).toBeVisible();
    await expect(page.getByTestId("recipient-intent-coverage-list")).toBeVisible();
    await expect(callout).toContainText(/Your requested changes/i);
    await expect(callout).not.toContainText(/Could not add:/i);
    await expect(legalDoc.locator("section[data-block-kind]")).toHaveCount(4);
    await expect(legalDoc.getByTestId("recipient-redline-changed-block").first()).toBeVisible();
    const docSurface = page.getByTestId("recipient-suggested-changes-document");
    await expect(docSurface.locator('[data-redline="insert"]').first()).toBeVisible({ timeout: 12_000 });
    await expect(docSurface.locator('[data-redline="insert"]').first()).toContainText(/Net\s*30/i);
    await expect(docSurface).toContainText(/Net\s*30/i);
    await expect(docSurface).toContainText(/pause work until all overdue/i);

    await expect(page.getByTestId("recipient-tab-redline")).toHaveCount(0);
    await expect(page.getByTestId("recipient-side-by-side-block-grid")).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Send suggestions for review" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Dismiss preview" }).first()).toBeVisible();
  });

  test("3) Owner: incoming suggestion + material change summary; apply; draft updates", async ({ page }) => {
    const id = "ag_owner_proposal_e2e";
    const now = new Date().toISOString();
    const currentDraft: Record<string, unknown> = {
      id,
      title: "E2E Owner — Services",
      jurisdiction: "California",
      parties: [
        { name: "You LLC", role: "owner" },
        { name: "Them Co", role: "party" },
      ],
      purpose: "E2E baseline purpose.",
      payment_terms: "Net 15 (baseline).",
      duration: "1 year",
      due_date: null,
      effective_date: "2026-03-01",
      versions: [{ version: 1, created_at: now, note: "v1" }],
      audit_log: [
        {
          event_type: "recipient_proposal_pending",
          at: now,
          field: null,
          value: {
            proposal_id: "prop_e2e_1",
            instruction: "Please move to Net 30 for cash flow (E2E).",
            proposer_display_name: "Them Co",
            draft: {
              id,
              title: "E2E Owner — Services",
              jurisdiction: "California",
              parties: [
                { name: "You LLC", role: "owner" },
                { name: "Them Co", role: "party" },
              ],
              purpose: "E2E baseline purpose.",
              payment_terms: "Net 30 (suggested in E2E).",
              duration: "1 year",
              due_date: null,
              effective_date: "2026-03-01",
              versions: [{ version: 1, created_at: now, note: "v1" }],
              audit_log: [],
              created_at: now,
              updated_at: now,
            },
            rendered_html: "<p>Suggested: Net 30 terms — E2E</p>",
            submitted_at: now,
          },
        },
      ],
      created_at: now,
      updated_at: now,
    };
    const d = currentDraft as unknown as DraftRec;
    const state = { drafts: new Map<string, DraftRec>([[id, d]]) };
    await installIsolatedAgreementsApi(page, state);
    await page.goto(`/app/agreements/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recipient-preview-summary-heading")).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByText("Suggested edits", { exact: true }).or(page.getByText(/pending your review/)),
    ).toBeVisible();
    const applyBtn = page.getByRole("button", { name: "Apply changes" });
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();
    await expect(page.getByTestId("recipient-preview-summary-heading")).toHaveCount(0, { timeout: 20_000 });
  });

  test("4) Simple send: signing path copy stresses links, not “already emailed”", async ({ page }) => {
    const id = "ag_sign_copy_e2e";
    await page.addInitScript(
      (aid) => {
        try {
          sessionStorage.setItem(`claw_simple_send_unlocked_${encodeURIComponent(aid)}`, "1");
        } catch {
          /* ignore */
        }
      },
      id,
    );
    const d = new Map<string, DraftRec>();
    await page.route("**/api/agreements/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/render") && route.request().method() === "POST") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rendered_html: "<p>x</p>" }) });
        return;
      }
      if (url.match(/\/api\/agreements\/[^/?]+$/) && route.request().method() === "GET") {
        const now = new Date().toISOString();
        const rec: DraftRec = {
          id,
          title: "Sign path QA",
          jurisdiction: "DE",
          parties: [
            { name: "Owner", role: "owner", email: "o@e.com" },
            { name: "Signer1", role: "signer", email: "s1@e.com" },
          ],
          purpose: "E2E",
          payment_terms: "N/A",
          duration: "1m",
          due_date: null,
          effective_date: "2026-01-01",
          versions: [{ version: 1, created_at: now, note: "c" }],
          audit_log: [],
          created_at: now,
          updated_at: now,
        };
        d.set(id, rec);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            draft: rec,
            economics: { tier: "paid" },
          }),
        });
        return;
      }
      if (route.request().method() !== "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
      await route.continue();
    });
    await page.goto(`/app/send/${encodeURIComponent(id)}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/Prepare review link|Owner workspace|Your agreement|Your Agreement|LawDog Pro active/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    const signPath = page.getByRole("button", { name: "Signing link path" });
    if (await signPath.isVisible().catch(() => false)) {
      await signPath.click();
    }
    await expectNoMisleadingSentCopy(page);
    await expect(
      page
        .getByText(
          /Add recipients, then send your signature request|Add signers|signing link|Copy signing|signature|Nothing reaches/i,
        )
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("5) Mobile: create-flow recipient card + sticky CTA, no horizontal overflow", async ({ page }) => {
    test.setTimeout(120_000);
    const drafts = new Map<string, DraftRec>();
    await page.route("**/api/agreements/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/parse")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            draft: {
              title: "M Agreement",
              jurisdiction: "y",
              parties: [
                { name: "Acme LLC for 12 months", role: "party" },
                { name: "Beta Inc", role: "party" },
              ],
              purpose: "Consulting.",
              payment_terms: "Monthly retainer.",
              duration: "12 months",
              due_date: null,
              effective_date: "2026-01-01",
              agreement_family: "operating_agreement",
            },
          }),
        });
        return;
      }
      if (url.includes("/draft") && method === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const id = "ag_mob_cta_e2e";
        const now = new Date().toISOString();
        const rec: DraftRec = {
          id,
          title: String(body.title || "Untitled agreement"),
          jurisdiction: String(body.jurisdiction || "Delaware"),
          parties: (Array.isArray(body.parties) ? body.parties : []) as DraftRec["parties"],
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
          body: JSON.stringify({
            id,
            draft: rec,
            economics: { tier: "free", watermark_required: false, free_draft_expired: false, free_draft_expires_at: null },
          }),
        });
        return;
      }
      if (url.includes("/render")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ rendered_html: "<p>OK</p>" }),
        });
        return;
      }
      if (method !== "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
      const m = url.match(/\/api\/agreements\/([^/?]+)/);
      const id = m?.[1] ? decodeURIComponent(m[1]) : "";
      const rec = drafts.get(id);
      await route.fulfill({
        status: rec ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(
          rec ? { draft: rec, economics: { tier: "free" } } : { detail: "not_found" },
        ),
      });
    });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/app/create", { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox").first().fill(
      "Need a consulting operating-style agreement between Acme and Beta with custom governance and payment terms.",
    );
    await page.getByRole("button", { name: /Create draft|Create agreement|Draft now|Review draft|Review full draft/i }).first().click();
    const trySimplified = page.getByRole("button", { name: "Try simplified starting point" });
    await expect(trySimplified).toBeVisible({ timeout: 30_000 });
    await trySimplified.click();
    const toSend = page.getByRole("button", { name: /Continue to send|Continue to Send|Continue/i });
    await expect(toSend).toBeVisible({ timeout: 90_000 });
    await toSend.first().click();
    const setup = page.locator("[data-claw-recipient-setup]");
    await expect(setup).toBeVisible({ timeout: 20_000 });
    const box = await setup.boundingBox();
    expect(box && box.width, "card fits mobile viewport width").toBeLessThanOrEqual(420);
    const invite = page.getByRole("region", { name: "Invite recipients" });
    await expect(invite.getByRole("button").last()).toBeVisible();
    const overflowW = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    expect(overflowW, "no horizontal page overflow on mobile width").toBeLessThan(20);
  });
});
