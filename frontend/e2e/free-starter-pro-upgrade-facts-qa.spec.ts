import { expect, test, type Page } from "@playwright/test";

/**
 * Same QA path as free-starter review + Pro upgrade: after checkout, premium-full-draft must
 * receive the original commercial prompt (not a short starter restyle) so Pro output can preserve
 * real party names, jurisdiction, and economics.
 *
 * Mocks: parse, draft, render, premium-missing-facts, premium-full-draft. Other Pro auxiliary
 * calls may 404; pipeline tolerates and continues.
 */
const PROD_QA_FREELANCE_PROMPT =
  "I need a freelance software development agreement. Anthem Blanchard hires Sarah Collins to redesign and optimize the CryptoSpaces.net website for $7,500 total. $3,000 due upfront, $4,500 due on final delivery. Work includes homepage redesign, mobile optimization, analytics setup, email capture funnel, and performance improvements. Project starts May 1, 2026 and final delivery is due within 30 days. Two revision rounds included. Client owns final deliverables after full payment. Developer keeps pre-existing tools and code libraries. Both parties keep confidential information private. Oklahoma law governs. Notices by email are acceptable.";

const TIMEOUT_MS = 300_000;

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

const UNPAID = {
  tier: "free" as const,
  watermark_required: false,
  free_draft_expired: false,
  free_draft_expires_at: null as string | null,
};

function buildQaProDocumentText(): string {
  const pad = (s: string) => `${s} `.repeat(90);
  return [
    "FREELANCE SOFTWARE DEVELOPMENT AGREEMENT",
    "",
    "1. PARTIES. Anthem Blanchard and Sarah Collins agree as follows.",
    "2. SCOPE. Redesign and optimization of the CryptoSpaces.net website including homepage, mobile, analytics, email capture, and performance.",
    "3. COMPENSATION. $7,500 total: $3,000 due on commencement, $4,500 due on final delivery.",
    "4. TIMELINE. Commencement May 1, 2026. Final deliverables within 30 days.",
    "5. REVISIONS. Two (2) revision rounds included in the agreed fee.",
    "6. OWNERSHIP. Client receives ownership of final deliverables upon full payment. Developer retains pre-existing tools, libraries, and generic code not created solely for the client.",
    "7. CONFIDENTIALITY. The parties will hold confidential information in strict confidence.",
    "8. GOVERNING LAW. The laws of the State of Oklahoma govern.",
    "9. NOTICES. Email notices to addresses designated in writing are acceptable and effective when sent.",
    pad("Operative detail to satisfy minimum length and acceptance heuristics in E2E."),
  ].join("\n");
}

function installProUpgradeQaRoutes(page: Page, drafts: Map<string, DraftRec>, intakeAssertion: (intake: string) => void) {
  return page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/premium-full-draft") && method === "POST") {
      const data = (await route.request().postData()) || "";
      let intakeText = "";
      try {
        const j = JSON.parse(data) as { intake_text?: string };
        intakeText = String(j?.intake_text || "");
      } catch {
        intakeText = data;
      }
      intakeAssertion(intakeText);
      const body = buildQaProDocumentText();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          title: "Software Development Services Agreement",
          agreement_family: "independent_contractor",
          document_text: body,
          server_full_document_text: body,
          key_terms_found: ["Parties", "Fee", "Jurisdiction"],
          missing_material_info: [],
          generation_outcome: "ok",
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/premium-missing-facts") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ questions: [] }),
      });
      return;
    }

    if (url.includes("/api/agreements/parse") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            title: "Software Development Agreement",
            jurisdiction: "Oklahoma",
            parties: [
              { name: "Anthem Blanchard", role: "Client" },
              { name: "Sarah Collins", role: "Contractor" },
            ],
            purpose: "Redesign and optimize the CryptoSpaces.net website.",
            payment_terms: "$7,500 total; $3,000 due upfront, $4,500 due on final delivery.",
            duration: "30 days from May 1, 2026",
            due_date: null,
            effective_date: "2026-05-01",
            agreement_family: "independent_contractor",
          },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = "ag_e2e_pro_source_qa";
      const now = new Date().toISOString();
      const rec: DraftRec = {
        id,
        title: String(body.title || "Software Development Agreement"),
        jurisdiction: String(body.jurisdiction || "Oklahoma"),
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
        body: JSON.stringify({ id, draft: rec, economics: UNPAID }),
      });
      return;
    }

    if (url.includes("/render") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rendered_html: "<p>Starter preview (e2e)</p>" }),
      });
      return;
    }

    if (method !== "GET" && url.includes("/api/agreements/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    const rec = id ? drafts.get(id) : undefined;
    await route.fulfill({
      status: rec ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(rec ? { draft: rec, economics: UNPAID } : { detail: "not_found" }),
    });
  });
}

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

test("free starter → Pro upgrade: request carries full deal; Pro body keeps facts (no Party A / Delaware)", async ({ page }) => {
  test.setTimeout(TIMEOUT_MS);
  const drafts = new Map<string, DraftRec>();
  const assertRichIntake = (intake: string) => {
    const t = intake.replace(/\r\n/g, "\n");
    expect(t.length, "premium full-draft should receive a long, rich intake string").toBeGreaterThan(400);
    expect(t, "intake should include the principal names").toContain("Anthem Blanchard");
    expect(t, "intake should include the domain").toMatch(/CryptoSpaces\.net/i);
    expect(t, "intake should include Oklahoma").toMatch(/Oklahoma/i);
    expect(t, "intake should include economics").toMatch(/7,500|7500/);
    expect(t, "intake should not collapse to a generic one-line request").toMatch(/revision|revisions|30\s*day/i);
  };
  await installProUpgradeQaRoutes(page, drafts, assertRichIntake);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("claw_org_id", "e2e-org");
      localStorage.setItem("claw_dev_access_tier", "free");
    } catch {
      /* ignore */
    }
  });
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("claw_premium_completion_snapshot_v1");
      localStorage.removeItem("claw_premium_completed");
    } catch {
      /* ignore */
    }
  });

  await page.goto("/app/ops/paid-funnel", { waitUntil: "domcontentloaded" });
  const clearBtn = page.getByRole("button", { name: /clear local funnel data/i });
  if (await clearBtn.isVisible().catch(() => false)) {
    page.once("dialog", (d) => d.accept());
    await clearBtn.click().catch(() => {
      /* optional */
    });
  }

  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  const main = page.getByRole("textbox").first();
  await main.waitFor({ state: "visible", timeout: 30_000 });
  await main.fill(PROD_QA_FREELANCE_PROMPT);
  const createCta = page.getByRole("button", { name: /Create draft|Create agreement|Draft now|Review draft|Review full draft/i });
  await createCta.first().click();
  const agreementBody = page.getByLabel("Agreement document");
  await expect(agreementBody).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Want LawDog to improve this draft?" })).toBeVisible();
  await expect(page.getByText("Refine this draft", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upgrade to improve draft" })).toBeVisible();

  await page.getByRole("button", { name: "Upgrade to improve draft" }).click();
  await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 30_000 });
  const payCta = page.getByRole("button", { name: /Pay & continue/i });
  if (await payCta.isVisible().catch(() => false)) {
    await payCta.click();
  } else {
    await page.getByRole("button", { name: /subscribe|continue|complete checkout|upgrade/i }).first().click();
  }
  await expect(page).toHaveURL(/\/app\/create/, { timeout: 90_000 });
  const gap = page.getByRole("dialog", { name: /finish your agreement/i });
  if (await gap.isVisible().catch(() => false)) {
    const useDefaults = page.getByRole("button", { name: /^use defaults$/i });
    if (await useDefaults.isVisible().catch(() => false)) await useDefaults.click();
  }
  await expect(
    page.getByText("Your complete agreement is ready.", { exact: true }).or(page.getByText(/LawDog Pro ready/i)),
  ).toBeVisible({ timeout: 180_000 });
  const doc = await agreementBody.textContent();
  expect(String(doc), "pro document (mock) must include Anthems deal facts").toContain("Anthem Blanchard");
  expect(String(doc)).toMatch(/7,500|7500/);
  expect(String(doc)).toMatch(/3,000|3000/);
  expect(String(doc)).toMatch(/4,500|4500/);
  expect(String(doc)).toMatch(/May|2026/);
  expect(String(doc)).toMatch(/Oklahoma|OK\b/i);
  expect(String(doc)).toMatch(/revision|rounds?/i);
  expect(String(doc).toLowerCase(), "pro document must not restyle to Party A / Party B").not.toMatch(/party\s+a\b/);
  expect(String(doc), "Oklahoma was chosen — must not show Delaware in error").not.toMatch(/Delaware/);
});
