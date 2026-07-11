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
  /failed to fetch|network|ERR_NETWORK|premium-network|aborted|load failed|net::ERR_|404 \(Not Found\)|Failed to load resource|anonymous-session|\[paid-review-session-generation-invariant\]/i;

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

    if (url.includes("/v1/workspace/anonymous-session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session_id: "e2e-anon", org_id: "e2e-ironclad-org" }),
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

/** Poll until premium-full-draft attempt count reaches target (Attempt A fail + Attempt B success). */
async function waitForPremiumAttempts(
  getAttempts: () => number,
  target: number,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const n = getAttempts();
    if (n >= target) return n;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for premium-full-draft attempts >= ${target} (last=${getAttempts()})`);
}

/** Authoritative Pro review is user-visible — do not wait on dev-gated console logs. */
async function waitForAuthoritativeProReview(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/app\/ops\//, { timeout: 5_000 });
  await expect(page.getByText("We couldn't safely finalize the Pro version.")).toHaveCount(0);
  await expect(page.getByText(/Retry Pro draft/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Review your Pro agreement" })).toBeVisible({
    timeout: 180_000,
  });
  const waitTitle = page.getByRole("heading", {
    name: /Preparing final agreement|Preparing signature-ready version/i,
  });
  await expect(waitTitle.first()).toBeHidden({ timeout: 30_000 }).catch(() => {
    /* success flash may already hide modal */
  });
}

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

const IRONCLAD_PENDING_DRAFT = {
  title: "Multi-Party Technology Services and Implementation Agreement",
  jurisdiction: "Texas",
  parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
  purpose: "Joint AI software and infrastructure rollout.",
  payment_terms: "$187,500 across six milestone payments.",
  duration: "24 months",
  due_date: null,
  effective_date: "2026-06-01",
  agreement_family: "services_agreement",
};

/** Seed browser state as if checkout succeeded and the app is resuming post-payment generation. */
async function seedIroncladCheckoutReturn(page: Page): Promise<void> {
  await page.addInitScript(
    ({ intake, pending }) => {
      try {
        localStorage.setItem("claw_org_id", "e2e-ironclad-org");
        localStorage.setItem("claw_dev_access_tier", "free");
        localStorage.removeItem("claw_premium_completed");
        sessionStorage.removeItem("claw_premium_completion_snapshot_v1");
        sessionStorage.removeItem("claw_paid_premium_completion_session_v1");
      } catch {
        /* ignore */
      }
      sessionStorage.setItem("claw_advanced_full_draft_checkout_ok_v1", String(Date.now()));
      sessionStorage.setItem(
        "claw_create_complexity_resume_v1",
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          rawIntake: intake,
          pending,
          awaitingProCheckout: true,
          resume_kind: "optional_full_upgrade",
          originalUserIntakeRaw: intake,
        }),
      );
    },
    { intake: IRONCLAD_JOINT_ROLLOUT_INTAKE, pending: IRONCLAD_PENDING_DRAFT },
  );
}

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

  await seedIroncladCheckoutReturn(page);

  await page.goto("/app/create?premiumCompletion=1", { waitUntil: "domcontentloaded" });
  const premiumReturnDetectedAt = Date.now();
  logRetryStage("checkout_return", { url: page.url() });

  const gap = page.getByRole("dialog", { name: /finish your agreement/i });
  if (await gap.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^use defaults$/i }).click();
  }

  const waitTitle = page.getByRole("heading", {
    name: /Preparing final agreement|Preparing signature-ready version|Generating your final Pro agreement/i,
  });
  await expect(waitTitle.first()).toBeVisible({ timeout: 120_000 });
  logRetryStage("attempt_a", { premiumAttempts: mocks.getPremiumAttempts() });

  await expect(page.getByText("We couldn't safely finalize the Pro version.")).toHaveCount(0);

  logRetryStage("retry_trigger", {
    premiumAttempts: mocks.getPremiumAttempts(),
    consoleErrors: consoleEntries.filter((e) => e.type === "error").slice(-3).map((e) => e.text.slice(0, 120)),
  });

  await waitForPremiumAttempts(mocks.getPremiumAttempts, 2, 180_000);
  logRetryStage("attempt_b", { premiumAttempts: mocks.getPremiumAttempts() });

  await waitForAuthoritativeProReview(page);
  const returnToCommitMs = Date.now() - premiumReturnDetectedAt;
  logRetryStage("freeze", {
    premiumAttempts: mocks.getPremiumAttempts(),
    returnToCommitMs,
  });
  // eslint-disable-next-line no-console
  console.info(`[e2e-premium-perf] return_to_authoritative_commit_ms=${returnToCommitMs}`);
  if (returnToCommitMs > PERF_WARN_MS) {
    // eslint-disable-next-line no-console
    console.warn(
      `[e2e-premium-perf] WARN: premium return → authoritative review exceeded ${PERF_WARN_MS}ms (actual ${returnToCommitMs}ms)`,
    );
  }

  expect(mocks.getPremiumAttempts(), "premium-full-draft attempts (1 fail + 1 success)").toBe(2);
  expect(premiumIntakes.length, "second attempt sends intake").toBeGreaterThanOrEqual(1);
  const richIntake = premiumIntakes[premiumIntakes.length - 1] || "";
  expect(richIntake.length).toBeGreaterThan(400);
  expect(richIntake).toContain("Ironclad Systems Group LLC");
  expect(richIntake).toMatch(/187,?500|infrastructure rollout/i);

  const agreementBody = page
    .getByLabel("Agreement document")
    .or(page.locator('[aria-label="Agreement document preview"]'));
  const doc = (await agreementBody.first().textContent()) || "";
  expect(doc.length, "Pro document preview has substantive visible body").toBeGreaterThan(2_500);
  const snapJson = await page.evaluate(() => sessionStorage.getItem("claw_premium_completion_snapshot_v1"));
  const snapCorpusLen = snapJson
    ? String(
        (JSON.parse(snapJson) as { premiumReadonlyPlainText?: string; premiumWinningBodyText?: string })
          .premiumReadonlyPlainText ||
          (JSON.parse(snapJson) as { premiumWinningBodyText?: string }).premiumWinningBodyText ||
          "",
      ).length
    : 0;
  expect(
    Math.max(snapCorpusLen, doc.length),
    "authoritative Pro corpus (snapshot or preview) meets ironclad length bar",
  ).toBeGreaterThan(8_000);
  for (const party of IRONCLAD_PARTIES) {
    expect(doc, `document contains ${party}`).toContain(party);
  }
  expect(doc).not.toMatch(/designated operational contacts through designated operational contacts/i);

  const termBlock = doc.match(/4\.\s*TERM[\s\S]*?(?=\n\s*5\.|\n\s*6\.)/i)?.[0] ?? "";
  expect(termBlock).not.toMatch(/IMPLEMENTATION MILESTONES/i);

  expect(doc).not.toMatch(/5\.3 Invoicing and Payment Timing\.\s*\n\s*5\.4/i);

  const commitIdx = consoleEntries.findIndex((e) => e.text.includes("[premium-authoritative-commit]"));
  if (commitIdx >= 0) {
    const draftApiAfterCommit = consoleEntries
      .slice(commitIdx + 1)
      .filter((e) => e.text.includes("[AgreementIntake] generate: draft API request"));
    expect(draftApiAfterCommit, "no post-commit draft POST when dev log present").toHaveLength(0);

    const postCommit = consoleEntries.slice(commitIdx);
    const structureRepairs = postCommit.filter((e) => e.text.includes("[premium-structure-repair]"));
    expect(structureRepairs.length, "structure repair total after commit (no infinite loop)").toBeLessThanOrEqual(40);

    const totalPolishLogs = POLISH_LOG_MARKERS.reduce(
      (n, marker) => n + postCommit.filter((e) => e.text.includes(marker)).length,
      0,
    );
    expect(totalPolishLogs, "no runaway polish loop after authoritative commit").toBeLessThan(30);
  }

  const unexpectedErrors = consoleEntries.filter(
    (e) => e.type === "error" && !isAllowedConsoleError(e.text),
  );
  if (unexpectedErrors.length > 0) {
    // eslint-disable-next-line no-console
    console.info(
      "[e2e-retry-unexpected-console]",
      unexpectedErrors.slice(0, 5).map((e) => e.text.slice(0, 200)),
    );
  }
  expect(unexpectedErrors.map((e) => e.text), "no unexpected console errors").toEqual([]);
  expect(
    consoleEntries.some((e) => e.text.includes("[premium-authoritative-visible-commit-failed]")),
    "authoritative visible surfaces aligned after commit",
  ).toBe(false);

  await expect(
    page.getByRole("button", { name: /Edit wording|Edit agreement text/i }).first(),
  ).toBeEnabled();
  const sendReview = page.getByRole("button", { name: /Send for review/i }).first();
  const sendSignature = page
    .getByRole("button", { name: /Send for signature|Prepare for signing/i })
    .first();
  await expect(sendReview).toBeVisible({ timeout: 30_000 });
  await expect(sendSignature).toBeVisible();
  await expect(sendReview).toBeEnabled();
  await expect(sendSignature).toBeEnabled();

  await expect(page.getByText("Pro — finish draft first")).toHaveCount(0);
  await expect(page.getByText(/Retry Pro draft/i)).toHaveCount(0);
  logRetryStage("review_render", { url: page.url(), docLen: doc.length });
});
