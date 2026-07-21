/**
 * Public verification route contract — canonical /verify/:id must serve SPA in dev and unauthenticated contexts.
 */
import { expect, test } from "@playwright/test";
import { agreementPublicVerifyPath } from "../src/agreement/agreementPublicVerify";

const AGREEMENT_ID = "ag_rc_public_verify_route";

test.describe("RC public verification route contract", () => {
  test("/verify/:id serves SPA AgreementPublicVerify in fresh unauthenticated context", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route(/\/api\/agreements\/public\/.*\/verify/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          agreement_id: AGREEMENT_ID,
          summary: { title: "Route Contract Agreement", status: "fully_executed" },
          participants: [],
          version_history: [],
          signature_status: { fully_executed: true, signatures_recorded: 2, signer_party_count: 2 },
          signature_events: [],
          verification: { agreement_hash: "route_contract_hash", schema: "claw.agreement.public_verify/v1" },
        }),
      });
    });

    const path = agreementPublicVerifyPath(AGREEMENT_ID);
    expect(path).toBe(`/verify/${AGREEMENT_ID}`);

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/\{"detail":"Not Found"\}/)).toHaveCount(0);
    await expect(
      page.getByText(/Fully executed|Loading verification|We couldn't load public verification/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/Fully executed|Loading verification/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    await context.close();
  });

  test("/app/verification/:id is authenticated owner shell (distinct from public /verify)", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route(/\/api\/agreements\/public\/.*\/verify/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          agreement_id: AGREEMENT_ID,
          summary: { title: "Internal Verification", status: "fully_executed" },
          participants: [],
          version_history: [],
          signature_status: { fully_executed: true, signatures_recorded: 2, signer_party_count: 2 },
          signature_events: [],
          verification: { agreement_hash: "internal_hash" },
        }),
      });
    });

    await page.goto(`/app/verification/${AGREEMENT_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Verification" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Status · fully signed/i)).toBeVisible({ timeout: 30_000 });

    await context.close();
  });
});
