import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { RECIPIENT_ROLE_ID } from "../../src/launch/simpleProduct/quickPdfEnvelope";
import {
  LIVE_CONSENT,
  liveJson,
  liveOwnerHeaders,
  recipientCompleteBody,
  seedDraftedCeremony,
  seedQuickRecipient,
} from "./phase4c23LiveApi";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource|\[vs01-recipient-identity-authority\]/i;
const RECOVERED = /There was an error during concurrent rendering but React was able to recover/;

function attachGuards(page: Page, secrets: string[]) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const leaked: string[] = [];
  const note = (text: string) => {
    for (const secret of secrets) {
      if (secret && text.includes(secret)) leaked.push(text.slice(0, 240));
    }
  };
  page.on("pageerror", (err) => {
    const text = String(err);
    if (RECOVERED.test(text)) return;
    pageErrors.push(text);
    note(text);
  });
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    note(text);
    if (msg.type() !== "error") return;
    if (CONSOLE_NOISE.test(text) || RECOVERED.test(text)) return;
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

test.describe("Phase 4C.2.3 live signing acceptance", () => {
  test("Quick recipient signs against production handlers and refreshes completed status", async ({ page }) => {
    const seeded = await seedQuickRecipient();
    const guards = attachGuards(page, [seeded.token, "riley.recipient@lawdog.test"]);

    const forged = await liveJson(
      "POST",
      `/api/agreements/${seeded.agreementId}/vs01-signer-complete`,
      {
        headers: { ...liveOwnerHeaders(), "X-Claw-Recipient-Access-Token": seeded.token },
        body: recipientCompleteBody({ ...seeded, pageIndex: 999 }),
      },
    );
    expect(forged.status, JSON.stringify(forged.body)).toBe(400);
    expect((forged.body.detail as { code?: string } | undefined)?.code).toBe("field_page_mismatch");

    const impersonate = await liveJson(
      "POST",
      `/api/agreements/${seeded.agreementId}/vs01-signer-complete`,
      {
        body: {
          signer_role_id: RECIPIENT_ROLE_ID,
          participant_id: seeded.recipientPartyId,
          document_id: seeded.documentId,
        },
      },
    );
    expect(impersonate.status, JSON.stringify(impersonate.body)).toBe(403);
    expect((impersonate.body.detail as { code?: string } | undefined)?.code).toBe(
      "owner_cannot_complete_other_signer",
    );

    await page.goto(seeded.recipientHref, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-recipient-shell")).toBeVisible({ timeout: 30_000 });
    const field = page.getByTestId("esign-assigned-field").locator("input").first();
    await expect(field).toBeVisible({ timeout: 20_000 });
    await field.fill("Riley Recipient");
    await page.getByTestId("esign-recipient-consent").check();
    await expect(page.getByTestId("esign-finish-signing")).toBeEnabled();
    await page.getByTestId("esign-finish-signing").click();
    await expect(page.getByTestId("esign-recipient-complete")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/You're all set/i)).toBeVisible();

    const validated = await liveJson("GET", "/api/agreements/access/validate", {
      headers: { Accept: "application/json" },
      query: { token: seeded.token, agreement_id: seeded.agreementId },
    });
    expect(validated.status, JSON.stringify(validated.body)).toBe(200);
    expect(validated.body.signer_already_completed).toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-recipient-complete")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("esign-finish-signing")).toHaveCount(0);

    const receipt = await liveJson("GET", "/api/agreements/quick-pdf-envelope/receipt", {
      query: { document_id: seeded.documentId },
    });
    expect(receipt.status).toBe(200);
    const firstId = ((receipt.body.receipt as { receipt_id?: string } | null) || {}).receipt_id;
    expect(firstId).toBeTruthy();
    const again = await liveJson("GET", "/api/agreements/quick-pdf-envelope/receipt", {
      query: { document_id: seeded.documentId },
    });
    expect(((again.body.receipt as { receipt_id?: string } | null) || {}).receipt_id).toBe(firstId);
    guards.assertClean();
  });

  test("drafted recipient ceremony uses the token, not owner headers", async ({ page }) => {
    const seeded = await seedDraftedCeremony();
    const impersonate = await liveJson("POST", `/api/agreements/${seeded.agreementId}/signing-ceremony/complete`, {
      body: {
        participant_id: "p-acme",
        typed_name: "Acme Growth LLC",
        locked_version_id: seeded.lockedVersionId,
        consent: LIVE_CONSENT,
      },
    });
    expect(impersonate.status, JSON.stringify(impersonate.body)).toBe(403);

    const start = await liveJson("POST", `/api/agreements/${seeded.agreementId}/signing-ceremony/start`, {
      headers: {
        "Content-Type": "application/json",
        "X-Claw-Recipient-Access-Token": seeded.token,
      },
      body: { participant_id: "p-acme" },
    });
    expect(start.status, JSON.stringify(start.body)).toBe(200);

    const done = await liveJson("POST", `/api/agreements/${seeded.agreementId}/signing-ceremony/complete`, {
      headers: {
        "Content-Type": "application/json",
        "X-Claw-Recipient-Access-Token": seeded.token,
      },
      body: {
        participant_id: "p-acme",
        typed_name: "Acme Growth LLC",
        locked_version_id: seeded.lockedVersionId,
        consent: LIVE_CONSENT,
      },
    });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.agreement_id).toBe(seeded.agreementId);
    expect(done.body.participant_id).toBe("p-acme");
    expect(done.body.status).toMatch(/completed|fully_executed/);

    const validated = await liveJson("GET", "/api/agreements/access/validate", {
      headers: { Accept: "application/json" },
      query: { token: seeded.token, agreement_id: seeded.agreementId },
    });
    expect(validated.status, JSON.stringify(validated.body)).toBe(200);
    expect(validated.body.signer_already_completed).toBe(true);

    const guards = attachGuards(page, [seeded.token]);
    await page.goto(seeded.signHref, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("recipient-public-sign-route").or(page.getByTestId("recipient-document-shell")).or(page.getByText(/signed|all set|already/i)),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/invalid or expired/i)).toHaveCount(0);
    guards.assertClean();
  });
});
