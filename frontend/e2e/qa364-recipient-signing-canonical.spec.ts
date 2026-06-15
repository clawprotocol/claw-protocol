/**
 * QA364: recipient /app/esign signing view must match prepare canonical VS01 packet.
 * Run: npx playwright test e2e/qa364-recipient-signing-canonical.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";
import { buildVs01SigningPacketModel } from "../src/vs01/buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "../src/vs01/vs01SignerFieldAssignment";
import {
  buildVs01CanonicalPacketPortable,
  buildVs01CanonicalPacketSeed,
  computeVs01PacketRevision,
  encodeVs01CanonicalPacketPortable,
  VS01_CANONICAL_PACKET_MAX_URL_LEN,
  VS01_CANONICAL_PACKET_STORED_QUERY,
  VS01_PACKET_REVISION_QUERY,
} from "../src/vs01/vs01CanonicalPacketSeed";
import { buildFullPacketManifestFromCanonicalModel } from "../src/vs01/vs01SigningPacketManifest";
import { recipientCounterpartyIdForPrepareRole } from "../src/vs01/vs01SignerFieldAssignment";
import { VS01_RECIPIENT_SIGN_QUERY } from "../src/vs01/StepReceipt";

const DOCUMENT_ID = "doc_qa364";
const AGREEMENT_ID = "ag_qa364";

function qa364Corpus(): string {
  const clause =
    "Provider shall perform commercially reasonable services and maintain documentation for milestone acceptance. ";
  const sections = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return `${n}. SECTION ${n}\n${n}.1 Scope and deliverables.\n${clause.repeat(3)}\n${n}.2 Operational cooperation terms.`;
  }).join("\n\n");
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

${sections}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Ann Rice
Title: Author
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Heath Lincoln
Title: Member
Date: ____________________`;
}

type DomLog = {
  page: number;
  modelDomMatches?: boolean;
  clipped?: boolean;
};

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: AGREEMENT_ID,
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    ownerSignerName: "Ann Rice",
    ownerSignerTitle: "Author",
    counterparties: [
      {
        id: "cp_harbor",
        name: "Harbor Peak Automation LLC",
        email: "cp@example.com",
        signerName: "Heath Lincoln",
        signerTitle: "Member",
      },
    ],
  });
}

function minimalPdfBytes(): Buffer {
  const pages = Array.from({ length: 20 }, (_, i) => `${i + 1} 0 obj<<>>endobj`).join("\n");
  return Buffer.from(`%PDF-1.4\n${pages}\ntrailer<<>>\n%%EOF\n`, "utf8");
}

async function installApiMocks(page: Page, pdf: Buffer) {
  await page.route("**/v1/documents/*/content", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: pdf,
    });
  });
}

function attachDomLogCollector(page: Page): DomLog[] {
  const logs: DomLog[] = [];
  page.on("console", async (msg) => {
    if (!msg.text().includes("[vs01-canonical-pagination-page-dom]")) return;
    const values = await Promise.all(msg.args().map((arg) => arg.jsonValue().catch(() => null)));
    const payload = values.find(
      (v): v is DomLog =>
        typeof v === "object" && v !== null && "page" in v && typeof (v as DomLog).page === "number",
    );
    if (payload) logs.push(payload);
  });
  return logs;
}

function buildRecipientUrl(partyIndex: 0 | 1) {
  const r = roles();
  const corpus = qa364Corpus();
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: corpus,
    roles: r,
    initialsEnabled: true,
  });
  expect(model.allowed).toBe(true);
  const seed = buildVs01CanonicalPacketSeed({
    documentId: DOCUMENT_ID,
    agreementId: AGREEMENT_ID,
    corpusPlain: corpus,
  })!;
  const witnessIdx = model.pages.findIndex((p) =>
    p.flowLines.some((l) => /\bIN WITNESS WHEREOF\b/i.test(l)),
  );
  const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
  const portable = buildVs01CanonicalPacketPortable({
    seed,
    fields: manifest,
    roles: r,
    pageCount: model.pages.length,
    witnessPageIndex: witnessIdx,
  });
  const encoded = encodeVs01CanonicalPacketPortable(portable);
  expect(encoded.length).toBeGreaterThan(VS01_CANONICAL_PACKET_MAX_URL_LEN);
  const packetRevision = computeVs01PacketRevision({
    corpusHash: seed.corpusHash,
    initialsEnabled: portable.initialsPolicy.enabled,
    fieldCount: portable.fieldCount,
  });
  const role = r[partyIndex]!;
  const params = new URLSearchParams();
  params.set(VS01_RECIPIENT_SIGN_QUERY, "1");
  params.set("recipient_index", String(partyIndex));
  params.set("recipient_name", role.signerName || role.partyName);
  params.set("recipient_email", role.signerEmail || "");
  params.set("counterparty_id", recipientCounterpartyIdForPrepareRole(role));
  params.set("document_id", DOCUMENT_ID);
  params.set("receipt_id", `rcpt_${DOCUMENT_ID}`);
  params.set("agreement_id", AGREEMENT_ID);
  params.set("signer_role_id", role.roleId);
  params.set("assigned_party_index", String(partyIndex));
  params.set(VS01_PACKET_REVISION_QUERY, packetRevision);
  params.set(VS01_CANONICAL_PACKET_STORED_QUERY, "1");
  return { url: `/app/esign/${DOCUMENT_ID}?${params.toString()}`, pageCount: model.pages.length, portable };
}

async function seedPortablePacket(page: Page, portable: ReturnType<typeof buildVs01CanonicalPacketPortable>) {
  await page.addInitScript(
    ({ portableJson, documentId }) => {
      const scope = "__canonical_packet__";
      const key = `${documentId.trim()}_${scope}`;
      sessionStorage.setItem(`claw_vs01_canonical_portable_ss_${key}`, portableJson);
      sessionStorage.setItem(`claw_vs01_canonical_seed_ss_${key}`, JSON.stringify(JSON.parse(portableJson).seed));
    },
    { portableJson: JSON.stringify(portable), documentId: DOCUMENT_ID },
  );
}

test.describe("QA364 recipient signing canonical surface", () => {
  test("recipient view uses canonical packet: title page 1, bold headers, no PDF fallback", async ({ page }) => {
    test.setTimeout(180_000);
    const domLogs = attachDomLogCollector(page);
    await installApiMocks(page, minimalPdfBytes());
    const { url, pageCount, portable } = buildRecipientUrl(0);
    await seedPortablePacket(page, portable);

    await page.goto(url);
    await expect(page.getByTestId("vs01-recipient-canonical-render")).toBeVisible({ timeout: 90_000 });

    const stackCount = await page.locator(".vs01-sign-page-stack").count();
    expect(stackCount).toBe(pageCount);
    expect(stackCount).toBeLessThan(16);

    const pageOneText = await page.locator('[data-vs01-sign-page="0"]').textContent();
    expect(pageOneText).toMatch(/CONSULTING AND IMPLEMENTATION AGREEMENT/i);
    expect(pageOneText).not.toMatch(/Draft for Review/i);
    expect(pageOneText).not.toMatch(/Draft Agreement \(non-binding template\)/i);

    const heading = page.locator('[data-vs01-sign-page="0"] .vs01-canonical-flow-line--heading').first();
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS("font-weight", /700|bold/i);

    const bodySignatureInputs = page.locator(
      '[data-vs01-sign-page="0"] .vs01-recipient-signing-field--signature',
    );
    await expect(bodySignatureInputs).toHaveCount(0);

    for (let i = 0; i < pageCount; i += 1) {
      await page.locator(`[data-vs01-sign-page="${i}"]`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(300);

    const byPage = new Map(domLogs.map((e) => [e.page, e]));
    expect(byPage.size).toBeGreaterThan(0);
    for (const entry of byPage.values()) {
      expect(entry.clipped).not.toBe(true);
      expect(entry.modelDomMatches).not.toBe(false);
    }
  });
});
