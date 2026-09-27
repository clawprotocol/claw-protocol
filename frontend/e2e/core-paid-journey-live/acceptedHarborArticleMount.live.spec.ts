import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { articleText, HARBOR_STAGE_TIMEOUT_MS, configuredLiveApiBase } from "./qualityEvalJourney";
import { loadCorePaidJourneyRuntime, seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";

const enabled =
  process.env.QUALITY_EVAL_OFFLINE_JOURNEY === "1" || process.env.CLAW_QUALITY_EVAL_LIVE === "1";
test.skip(!enabled, "Isolated stub Harbor article mount only");

const RESULT_DIR = process.env.QUALITY_EVAL_RESULT_DIR || "";
const seed = RESULT_DIR
  ? (JSON.parse(readFileSync(join(RESULT_DIR, "seeded-agreement.json"), "utf8")) as {
      agreement_id: string;
      snapshot_id: string;
      digest: string;
      parties: { id: string; name: string; email: string; signer_name: string }[];
    })
  : null;

test("fresh accepted Harbor resume paints the visible article", async ({ page, context }) => {
  test.setTimeout(120_000);
  expect(seed, "seeded accepted Harbor agreement").toBeTruthy();
  const agreementId = seed!.agreement_id;
  await seedCorePaidJourneyOwner(page);
  await page.addInitScript(() => {
    localStorage.setItem("claw_org_id", "anon-stale-resume");
  });
  let phase: "initial" | "reload" | "fresh_create" = "initial";
  const binds: { phase: string; org: string; auth: boolean; status?: number }[] = [];
  const gets: { phase: string; org: string; auth: boolean; status?: number }[] = [];
  const consoleEvents: { phase: string; type: string; text: string }[] = [];
  const pageErrors: { phase: string; text: string }[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/v1/workspace/bind-user-org")) {
      binds.push({ phase, org: req.headers()["x-claw-org-id"] || "", auth: Boolean(req.headers().authorization) });
    }
    if (url.includes(`/api/agreements/${agreementId}`) && req.method() === "GET" && !url.includes("canonical-review")) {
      gets.push({ phase, org: req.headers()["x-claw-org-id"] || "", auth: Boolean(req.headers().authorization) });
    }
  });
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes(`/api/agreements/${agreementId}`) && res.request().method() === "GET" && !url.includes("canonical-review")) {
      const last = gets[gets.length - 1];
      if (last && last.status == null) last.status = res.status();
    }
  });
  page.on("console", (message) => {
    if (consoleEvents.length >= 200) return;
    const text = message.text();
    if (
      message.type() === "error" ||
      /paid-pro-hydrate-preserve|review-gate|review-branch|signer-count-authority|Maximum update depth|Too many re-renders/.test(text)
    ) {
      consoleEvents.push({ phase, type: message.type(), text: text.slice(0, 800) });
    }
  });
  page.on("pageerror", (error) => {
    if (pageErrors.length < 50) pageErrors.push({ phase, text: error.message });
  });
  await page.goto(`/app/create?agreementId=${encodeURIComponent(agreementId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await expect.poll(async () => page.url().includes(`agreementId=${agreementId}`) ? 1 : 0, {
    timeout: HARBOR_STAGE_TIMEOUT_MS,
  }).toBe(1);
  await expect
    .poll(async () => {
      const text = await articleText(page, "Harbor Peak");
      return text.includes("Harbor Peak") && text.includes("$48,000") ? text.length : 0;
    }, { timeout: HARBOR_STAGE_TIMEOUT_MS })
    .toBeGreaterThan(400);
  const article = await articleText(page, "Harbor Peak");
  expect(article).toContain("Harbor Peak");
  expect(article).toContain("Ironvale");
  expect(article).toMatch(/Consultant/i);
  expect(article).toMatch(/Client/i);
  expect(article).toContain("Delaware");
  expect(article).toContain("$48,000");
  expect(article).toContain("notices@harborpeak.test");
  expect(page.url()).toContain(`agreementId=${agreementId}`);
  expect(gets.some((row) => !row.auth || !row.org)).toBe(false);
  expect(gets.some((row) => row.org.startsWith("user-") && row.auth && row.status === 200)).toBe(true);
  const runtime = loadCorePaidJourneyRuntime();
  const api = configuredLiveApiBase();
  const identity = await page.request.get(`${api}/api/agreements/${agreementId}`, {
    headers: { Authorization: `Bearer ${runtime.access_token}`, "X-Claw-Org-Id": runtime.org_id },
  });
  expect(identity.ok()).toBeTruthy();
  const parties = ((await identity.json()) as { draft?: { parties?: { id: string; name: string; signer_name?: string; email?: string }[] } }).draft?.parties || [];
  const harbor = parties.find((row) => row.name.includes("Harbor Peak"));
  const ironvale = parties.find((row) => row.name.includes("Ironvale"));
  expect(harbor?.id).toBe("1bfa762c-389e-4102-a2e9-19d1663d1ed2");
  expect(harbor?.signer_name).toBe("Maya Chen");
  expect(harbor?.email).toBe("maya.chen@harborpeak.test");
  expect(ironvale?.id).toBe("0a2f35da-973e-4a21-9712-142ed6ecddd6");
  expect(ironvale?.signer_name).toBe("Jordan Hale");
  expect(ironvale?.email).toBe("jordan.hale@ironvale.test");
  phase = "reload";
  await page.reload({ waitUntil: "domcontentloaded" });
  try {
    await expect
      .poll(async () => ((await articleText(page, "Harbor Peak")).includes("notices@harborpeak.test") ? 1 : 0), {
        timeout: HARBOR_STAGE_TIMEOUT_MS,
      })
      .toBe(1);
  } finally {
    const reloadDiagnostics = { binds, gets, consoleEvents, pageErrors };
    console.log(`ACCEPTED_RESUME_RELOAD_DIAGNOSTICS=${JSON.stringify(reloadDiagnostics)}`);
    await test.info().attach("accepted-resume-reload-diagnostics.json", {
      body: Buffer.from(JSON.stringify(reloadDiagnostics, null, 2)),
      contentType: "application/json",
    });
  }
  phase = "fresh_create";
  const fresh = await context.newPage();
  await seedCorePaidJourneyOwner(fresh);
  await fresh.goto("/app/create", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await expect.poll(async () => ((await articleText(fresh, "Harbor Peak")).length > 0 ? 1 : 0), {
    timeout: 15_000,
  }).toBe(0);
  expect(fresh.url()).not.toMatch(/agreementId=/);
  void binds;
});
