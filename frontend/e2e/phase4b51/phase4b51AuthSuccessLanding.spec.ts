import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4b51SuccessLandingContracts } from "../../src/launch/phase4b51AuthSuccessLandingCoverage";
import {
  PHASE4B51_AGREEMENT_ID,
  PHASE4B51_AUTH_CODE,
  PHASE4B51_CONTINUATION_ID,
  PHASE4B51_CREATE_AGREEMENT_ID,
  PHASE4B51_CREATE_CONTINUATION_ID,
  PHASE4B51_DONE_DEST,
  PHASE4B51_OTHER_TITLE,
  PHASE4B51_OWNER,
  PHASE4B51_PAPER,
  PHASE4B51_RECIPIENT_TOKEN,
  PHASE4B51_TITLE,
  createPhase4b51CreateState,
  createPhase4b51DoneState,
  installPhase4b51ApiMocks,
  phase4b51CallbackPath,
  seedPhase4b51ProviderSessionOnly,
} from "./phase4b51AuthSuccessLandingFixtures";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;
const RECOVERED_CONCURRENT_RENDER =
  /There was an error during concurrent rendering but React was able to recover/;
const SENSITIVE = [PHASE4B51_CONTINUATION_ID, PHASE4B51_CREATE_CONTINUATION_ID, PHASE4B51_AUTH_CODE, PHASE4B51_RECIPIENT_TOKEN];

function attachGuards(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const leaked: string[] = [];
  const noteLeak = (text: string) => {
    for (const token of SENSITIVE) {
      if (token && text.includes(token)) leaked.push(text.slice(0, 240));
    }
  };
  page.on("pageerror", (err) => {
    const text = String(err);
    noteLeak(text);
    if (RECOVERED_CONCURRENT_RENDER.test(text)) return;
    pageErrors.push(text);
  });
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    noteLeak(text);
    if (msg.type() !== "error") return;
    if (CONSOLE_NOISE.test(text) || RECOVERED_CONCURRENT_RENDER.test(text)) return;
    consoleErrors.push(text);
  });
  return {
    assertClean() {
      expect(pageErrors, pageErrors.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
      expect(leaked, leaked.join("\n")).toEqual([]);
    },
  };
}

async function readOrgId(page: Page): Promise<string> {
  return page.evaluate(() => window.localStorage.getItem("claw_org_id") || "");
}

async function assertNoSecretsOnSurface(page: Page) {
  const href = page.url();
  expect(href).not.toMatch(/continuation_id=/);
  expect(href).not.toMatch(/[?&]code=/);
  expect(href).not.toMatch(/access_token=/);
  expect(href).not.toContain(PHASE4B51_RECIPIENT_TOKEN);
  expect(href).not.toMatch(/app\.evil/);
  await expect(page.locator("body")).not.toContainText(PHASE4B51_OTHER_TITLE);
  await expect(page.locator("body")).not.toContainText(PHASE4B51_RECIPIENT_TOKEN);
  await expect(page.locator("body")).not.toContainText(PHASE4B51_CONTINUATION_ID);
  await expect(page.locator("body")).not.toContainText(PHASE4B51_AUTH_CODE);
}

test.describe("Phase 4B.5.1 authenticated callback success landing", () => {
  test("fails closed if server-org success landing contracts are lost", () => {
    expect(() => assertPhase4b51SuccessLandingContracts()).not.toThrow();
  });

  test("new-context callback lands on exact server /app/done/:agreementId over forged next", async ({
    browser,
  }) => {
    const state = createPhase4b51DoneState();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const guards = attachGuards(page);
    await installPhase4b51ApiMocks(page, state);
    await seedPhase4b51ProviderSessionOnly(page);
    await page.goto(
      phase4b51CallbackPath({
        continuationId: PHASE4B51_CONTINUATION_ID,
        next: "/app.evil",
      }),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page).toHaveURL(new RegExp(`/app/done/${PHASE4B51_AGREEMENT_ID}$`));
    expect(new URL(page.url()).pathname).toBe(PHASE4B51_DONE_DEST);
    expect(state.finalizeHits).toEqual([
      { continuationId: PHASE4B51_CONTINUATION_ID, userId: PHASE4B51_OWNER.id },
    ]);
    expect(await readOrgId(page)).toBe(PHASE4B51_OWNER.orgId);
    expect(await readOrgId(page)).not.toMatch(/^anon-/);
    await expect(page.locator("body")).toContainText(new RegExp(`${PHASE4B51_TITLE}|${PHASE4B51_AGREEMENT_ID}|Next step|Agreement complete`));
    await assertNoSecretsOnSurface(page);

    const hitsAfterLand = state.finalizeHits.length;
    await page.reload({ waitUntil: "commit" });
    await expect(page).toHaveURL(new RegExp(`/app/done/${PHASE4B51_AGREEMENT_ID}$`));
    expect(state.finalizeHits.length).toBe(hitsAfterLand);
    expect(await readOrgId(page)).toBe(PHASE4B51_OWNER.orgId);
    await assertNoSecretsOnSurface(page);
    guards.assertClean();
    await ctx.close();
  });

  test("paid-resume /app/create?agreementId= mounts verified server paper after callback", async ({
    browser,
  }) => {
    const state = createPhase4b51CreateState();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const guards = attachGuards(page);
    await installPhase4b51ApiMocks(page, state);
    await seedPhase4b51ProviderSessionOnly(page);
    await page.goto(
      phase4b51CallbackPath({
        continuationId: PHASE4B51_CREATE_CONTINUATION_ID,
        next: "/app/evil",
      }),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page).toHaveURL(new RegExp(`/app/create\\?agreementId=${PHASE4B51_CREATE_AGREEMENT_ID}`));
    expect(state.finalizeHits).toEqual([
      { continuationId: PHASE4B51_CREATE_CONTINUATION_ID, userId: PHASE4B51_OWNER.id },
    ]);
    expect(await readOrgId(page)).toBe(PHASE4B51_OWNER.orgId);
    await expect(page.locator("h1").first()).toHaveText(/Review your agreement draft/i);
    await expect(page.getByText(PHASE4B51_TITLE).first()).toBeVisible();
    const paper = page.getByRole("article", { name: /Agreement document preview/i });
    await expect(paper).toBeVisible();
    await expect(paper).toContainText("Orion Harbor LLC");
    await expect(paper).toContainText(PHASE4B51_PAPER.slice(0, 40));
    await expect(page.getByText(/Free Starter|five tenets|starter question/i)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(PHASE4B51_OTHER_TITLE);
    const href = page.url();
    expect(new URL(href).searchParams.get("agreementId")).toBe(PHASE4B51_CREATE_AGREEMENT_ID);
    expect(href).not.toMatch(/continuation_id=/);
    expect(href).not.toMatch(/app\.evil|\/app\/evil/);
    guards.assertClean();
    await ctx.close();
  });
});
