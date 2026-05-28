import { expect, test, type Page } from "@playwright/test";

const RED_MESA_PROMPT =
  "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup services. Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.";

const TIMEOUT_MS = 300_000;

function buildRedMesaProBody(): string {
  return [
    "AI WORKFLOW SETUP SERVICES AGREEMENT",
    "",
    "1. Parties. Red Mesa Logistics LLC (Client) and Harbor Peak Automation LLC (Service Provider).",
    "2. Scope. AI workflow setup services for Red Mesa.",
    "3. Payment. $5,000 total fee.",
    "4. Acceptance Review. Client may review deliverables within a reasonable period.",
    "5. Ownership. Client owns work product upon payment.",
    "6. Confidentiality. Mutual confidentiality obligations apply.",
    "7. Termination. Either party may terminate on written notice.",
    "8. Governing Law. Texas law governs.",
    "9. Electronic Signatures. The parties may sign electronically.",
    " ".repeat(4000),
  ].join("\n");
}

function installRedMesaRoutes(page: Page) {
  return page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/premium-full-draft") && method === "POST") {
      const body = buildRedMesaProBody();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          title: "AI Workflow Setup Services Agreement",
          agreement_family: "services",
          document_text: body,
          server_full_document_text: body,
          key_terms_found: ["Parties", "Payment", "Texas"],
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
            title: "AI Workflow Setup Services Agreement",
            jurisdiction: "Texas",
            parties: [
              { name: "Red Mesa Logistics LLC", role: "Client" },
              { name: "Harbor Peak Automation LLC", role: "Service Provider" },
            ],
            purpose: "AI workflow setup services",
            payment_terms: "$5,000",
            agreement_family: "services",
          },
        }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe("Red Mesa Pro visible paper smoke", () => {
  test("visible Pro paper is not the free starter body after upgrade", async ({ page }) => {
    test.setTimeout(TIMEOUT_MS);
    await installRedMesaRoutes(page);
    await page.goto("/");

    const prompt = page.getByPlaceholder(/describe your agreement/i).first();
    await prompt.fill(RED_MESA_PROMPT);
    await page.getByRole("button", { name: /generate|create/i }).first().click();

    const freePaper = page.locator(".premium-readonly-doc .premium-doc-body, .premium-readonly-doc");
    await expect(freePaper.first()).toBeVisible({ timeout: 120_000 });
    const freeText = ((await freePaper.first().textContent()) || "").replace(/\s+/g, " ").trim();
    expect(freeText).toMatch(/Red Mesa Logistics LLC|Red Mesa/i);

    const upgrade = page.getByRole("button", { name: /upgrade|pro|full draft/i }).first();
    await upgrade.click({ timeout: 120_000 });

    await expect(page.getByText(/LawDog Pro|secure agreement version/i).first()).toBeVisible({
      timeout: 180_000,
    });

    const proPaper = page.locator(".premium-readonly-doc .premium-doc-body").last();
    await expect(proPaper).toBeVisible({ timeout: 180_000 });
    const proText = ((await proPaper.textContent()) || "").replace(/\s+/g, " ").trim();

    expect(proText.length).toBeGreaterThan(800);
    expect(proText).not.toEqual(freeText);
    expect(proText).toMatch(/ownership|work product/i);
    expect(proText).toMatch(/confidential/i);
    expect(proText).toMatch(/terminat/i);
    expect(proText).toMatch(/electronic signatures?/i);
    expect(proText).not.toMatch(/^This Agreement is between Red Mesa and Harbor Peak/i);
  });
});
