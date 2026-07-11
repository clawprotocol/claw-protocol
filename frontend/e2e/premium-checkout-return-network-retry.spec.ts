/**
 * Pro checkout return: first premium-full-draft network failure → one retry → authoritative commit.
 * Ironclad 5-party AI rollout prompt; dev checkout bypass; mocked API except controlled network retry.
 */
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import {
  buildIroncladPremiumFullDraftBody,
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
} from "./fixtures/ironcladFivePartyRollout";

const TIMEOUT_MS = 600_000;
const PERF_WARN_MS = 90_000;

type RetryStage =
  | "page_load"
  | "checkout_return"
  | "attempt_a"
  | "failure_degradation"
  | "retry_trigger"
  | "attempt_b"
  | "response"
  | "validation"
  | "freeze"
  | "review_render";

function logRetryStage(stage: RetryStage, detail?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.info(`[e2e-retry-stage] ${stage}`, detail ?? {});
}

type ConsoleEntry = { type: string; text: string; ts: number };

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
  audit_log: Array<{ event_type: string; at: string }>;
  created_at: string;
  updated_at: string;
};

const UNPAID = {
  tier: "free" as const,
  watermark_required: false,
  free_draft_expired: false,
  free_draft_expires_at: null as string | null,
};

const ALLOWED_CONSOLE_ERROR_RE =
  /failed to fetch|network|ERR_NETWORK|premium-network|aborted|load failed|net::ERR_|404 \(Not Found\)|Failed to load resource/i;

const POLISH_LOG_MARKERS = [
  "[premium-structure-repair]",
  "[paid-pro-recital-polish]",
  "[paid-pro-enterprise-polish]",
  "[paid-pro-email-mutation-guard]",
  "[pro-operational-synthesis]",
] as const;

function trackConsole(page: Page, sink: ConsoleEntry[]): void {
  page.on("console", (msg: ConsoleMessage) => {
    sink.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
  });
}

function isAllowedConsoleError(text: string): boolean {
  return ALLOWED_CONSOLE_ERROR_RE.test(text);
}

function installIroncladApiMocks(
  page: Page,
  drafts: Map<string, DraftRec>,
  opts: { onPremiumAttempt?: (attempt: number, intake: string) => void },
): { getPremiumAttempts: () => number } {
  let premiumAttempts = 0;
  const proBody = buildIroncladPremiumFullDraftBody();

  const fulfillPremiumSuccess = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    const data = (await route.request().postData()) || "";
    let intakeText = "";
    try {
      const j = JSON.parse(data) as { intake_text?: string };
      intakeText = String(j?.intake_text || "");
    } catch {
      intakeText = data;
    }
    opts.onPremiumAttempt?.(premiumAttempts, intakeText);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        title: "Multi-Party Technology Services and Implementation Agreement",
        agreement_family: "services_agreement",
        document_text: proBody,
        server_full_document_text: proBody,
        key_terms_found: ["Parties", "Fees", "Texas", "Milestones"],
        missing_material_info: [],
        generation_outcome: "ok",
      }),
    });
  };

  page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/premium-full-draft") && method === "POST") {
      premiumAttempts += 1;
      if (premiumAttempts === 1) {
        await route.abort("failed");
        return;
      }
      await fulfillPremiumSuccess(route);
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
            title: "Multi-Party Technology Services and Implementation Agreement",
            jurisdiction: "Texas",
            parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
            purpose: "Joint AI software and infrastructure rollout.",
            payment_terms: "$187,500 across six milestone payments.",
            duration: "24 months",
            due_date: null,
            effective_date: "2026-06-01",
            agreement_family: "services_agreement",
          },
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/draft") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = "ag_e2e_ironclad_checkout_return";
      const now = new Date().toISOString();
      const rec: DraftRec = {
        id,
        title: String(body.title || "Multi-Party Technology Services and Implementation Agreement"),
        jurisdiction: String(body.jurisdiction || "Texas"),
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

  return { getPremiumAttempts: () => premiumAttempts };
}

async function waitForConsoleSubstring(
  page: Page,
  entries: ConsoleEntry[],
  substring: string,
  timeoutMs: number,
): Promise<ConsoleEntry> {
  const found = entries.find((e) => e.text.includes(substring));
  if (found) return found;
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const onConsole = (msg: ConsoleMessage) => {
      const entry = { type: msg.type(), text: msg.text(), ts: Date.now() };
      entries.push(entry);
      if (entry.text.includes(substring)) {
        page.off("console", onConsole);
        resolve(entry);
      }
    };
    page.on("console", onConsole);
    const poll = () => {
      const hit = entries.find((e) => e.text.includes(substring));
      if (hit) {
        page.off("console", onConsole);
        resolve(hit);
        return;
      }
      if (Date.now() > deadline) {
        page.off("console", onConsole);
        reject(new Error(`Timed out waiting for console: ${substring}`));
        return;
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

test("Ironclad checkout return: network retry → authoritative Pro review (no post-commit draft regen)", async ({
  page,
}) => {
  test.setTimeout(TIMEOUT_MS);
  const drafts = new Map<string, DraftRec>();
  const consoleEntries: ConsoleEntry[] = [];
  trackConsole(page, consoleEntries);

  const premiumIntakes: string[] = [];
  const mocks = installIroncladApiMocks(page, drafts, {
    onPremiumAttempt: (attempt, intake) => {
      if (attempt >= 1) premiumIntakes.push(intake);
    },
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("claw_org_id", "e2e-ironclad-org");
      localStorage.setItem("claw_dev_access_tier", "free");
    } catch {
      /* ignore */
    }
  });

  await page.goto("/app/ops/paid-funnel", { waitUntil: "domcontentloaded" });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /clear local funnel data/i }).click().catch(() => {
    /* optional */
  });

  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("claw_premium_completion_snapshot_v1");
      localStorage.removeItem("claw_premium_completed");
    } catch {
      /* ignore */
    }
  });

  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  logRetryStage("page_load", { url: page.url() });
  const main = page.getByRole("textbox").first();
  await main.waitFor({ state: "visible", timeout: 30_000 });
  await main.fill(IRONCLAD_JOINT_ROLLOUT_INTAKE);

  await page
    .getByRole("button", { name: /Create draft|Create agreement|Draft now|Review draft|Review full draft/i })
    .first()
    .click();

  const agreementBody = page
    .getByLabel("Agreement document")
    .or(page.getByRole("article", { name: /Agreement document/i }));
  await expect(agreementBody.first()).toBeVisible({ timeout: 120_000 });

  const proCheckoutCta = page.getByRole("button", {
    name: /Continue with Pro|Upgrade to improve draft|Send with LawDog Pro/i,
  });
  await expect(proCheckoutCta.first()).toBeVisible({ timeout: 60_000 });
  await proCheckoutCta.first().click();
  await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 30_000 });

  const completeCheckout = page.getByRole("button", {
    name: /Pay & continue|Continue with Pro|Complete checkout|Subscribe/i,
  });
  await expect(completeCheckout.first()).toBeVisible({ timeout: 30_000 });
  await completeCheckout.first().click();

  await expect(page).toHaveURL(/\/app\/create/, { timeout: 60_000 });
  const premiumReturnDetectedAt = Date.now();
  logRetryStage("checkout_return", { url: page.url() });

  const gap = page.getByRole("dialog", { name: /finish your agreement/i });
  if (await gap.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^use defaults$/i }).click();
  }

  const waitTitle = page.getByRole("heading", { name: /Preparing final agreement|Preparing signature-ready version/i });
  await expect(waitTitle.first()).toBeVisible({ timeout: 120_000 });
  logRetryStage("attempt_a", { premiumAttempts: mocks.getPremiumAttempts() });

  await expect(page.getByText("We couldn't safely finalize the Pro version.")).toHaveCount(0);

  logRetryStage("retry_trigger", {
    premiumAttempts: mocks.getPremiumAttempts(),
    consoleErrors: consoleEntries.filter((e) => e.type === "error").slice(-3).map((e) => e.text.slice(0, 120)),
  });

  const authoritativeEntry = await waitForConsoleSubstring(
    page,
    consoleEntries,
    "[premium-authoritative-commit]",
    TIMEOUT_MS - 60_000,
  );

  const returnToCommitMs = authoritativeEntry.ts - premiumReturnDetectedAt;
  logRetryStage("freeze", {
    premiumAttempts: mocks.getPremiumAttempts(),
    returnToCommitMs,
  });
  // eslint-disable-next-line no-console
  console.info(`[e2e-premium-perf] return_to_authoritative_commit_ms=${returnToCommitMs}`);
  if (returnToCommitMs > PERF_WARN_MS) {
    // eslint-disable-next-line no-console
    console.warn(
      `[e2e-premium-perf] WARN: premium return → authoritative commit exceeded ${PERF_WARN_MS}ms (actual ${returnToCommitMs}ms)`,
    );
  }

  await expect(page.getByRole("heading", { name: "Review your Pro agreement" })).toBeVisible({
    timeout: 120_000,
  });

  await expect(waitTitle.first()).toBeHidden({ timeout: 30_000 }).catch(() => {
    /* success flash may already hide modal */
  });

  expect(mocks.getPremiumAttempts(), "premium-full-draft attempts (1 fail + 1 success)").toBe(2);
  expect(premiumIntakes.length, "second attempt sends intake").toBeGreaterThanOrEqual(1);
  const richIntake = premiumIntakes[premiumIntakes.length - 1] || "";
  expect(richIntake.length).toBeGreaterThan(400);
  expect(richIntake).toContain("Ironclad Systems Group LLC");
  expect(richIntake).toMatch(/187,?500|infrastructure rollout/i);

  const doc =
    (await agreementBody.first().textContent()) ||
    (await page.getByRole("article", { name: /Agreement document/i }).first().textContent()) ||
    "";
  expect(doc.length, "Pro document preview has substantive body").toBeGreaterThan(8_000);
  for (const party of IRONCLAD_PARTIES) {
    expect(doc, `document contains ${party}`).toContain(party);
  }
  expect(doc).not.toMatch(/designated operational contacts through designated operational contacts/i);

  const termBlock = doc.match(/4\.\s*TERM[\s\S]*?(?=\n\s*5\.|\n\s*6\.)/i)?.[0] ?? "";
  expect(termBlock).not.toMatch(/IMPLEMENTATION MILESTONES/i);

  expect(doc).not.toMatch(/5\.3 Invoicing and Payment Timing\.\s*\n\s*5\.4/i);

  const commitIdx = consoleEntries.findIndex((e) => e.text.includes("[premium-authoritative-commit]"));
  expect(commitIdx).toBeGreaterThanOrEqual(0);
  const draftApiAfterCommit = consoleEntries
    .slice(commitIdx + 1)
    .filter((e) => e.text.includes("[AgreementIntake] generate: draft API request"));
  expect(draftApiAfterCommit, "no post-commit draft POST").toHaveLength(0);

  const postCommit = consoleEntries.slice(commitIdx);
  const structureRepairs = postCommit.filter((e) => e.text.includes("[premium-structure-repair]"));
  expect(structureRepairs.length, "structure repair runs after commit (bounded)").toBeGreaterThanOrEqual(1);
  expect(structureRepairs.length).toBeLessThanOrEqual(6);

  const totalPolishLogs = POLISH_LOG_MARKERS.reduce(
    (n, marker) => n + postCommit.filter((e) => e.text.includes(marker)).length,
    0,
  );
  expect(totalPolishLogs, "no runaway polish loop after authoritative commit").toBeLessThan(30);

  const allStructureRepairs = consoleEntries.filter((e) => e.text.includes("[premium-structure-repair]"));
  expect(allStructureRepairs.length, "structure repair total (no infinite loop)").toBeLessThan(40);

  const unexpectedErrors = consoleEntries.filter(
    (e) => e.type === "error" && !isAllowedConsoleError(e.text),
  );
  expect(unexpectedErrors.map((e) => e.text), "no unexpected console errors").toEqual([]);
  expect(
    consoleEntries.some((e) => e.text.includes("[premium-authoritative-visible-commit-failed]")),
    "authoritative visible surfaces aligned after commit",
  ).toBe(false);

  await expect(page.getByRole("button", { name: "Edit wording" })).toBeEnabled();
  const sendReview = page.getByRole("button", { name: "Send for review" }).first();
  const sendSignature = page.getByRole("button", { name: "Send for signature" }).first();
  await expect(sendReview).toBeVisible({ timeout: 30_000 });
  await expect(sendSignature).toBeVisible();
  await expect(sendReview).toBeEnabled();
  await expect(sendSignature).toBeEnabled();

  await expect(page.getByText("Pro — finish draft first")).toHaveCount(0);
  await expect(page.getByText(/Retry Pro draft/i)).toHaveCount(0);
  logRetryStage("review_render", { url: page.url(), docLen: doc.length });
});
