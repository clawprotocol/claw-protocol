/**
 * QA361 manual gate: real React prepare + recipient canonical surfaces.
 * Run: npx playwright test e2e/qa361-canonical-surface-verify.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  buildVs01SigningPacketModel,
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "../src/vs01/buildVs01SigningPacketModel";
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

const BRIDGE_SESSION_KEY = "claw_agreement_vs01_bridge_handoff_v1";
const PAID_PRO_SKIP_KEY = "claw_vs01_paid_pro_agreement_skip_v1";
const DOCUMENT_ID = "doc_qa361";
const AGREEMENT_ID = "ag_qa361";

function qaThirteenSectionProCorpus(): string {
  const clause =
    "Service Provider shall perform commercially reasonable services, maintain documentation, deliver milestones on schedule, and support Client acceptance testing. ";
  const sections = Array.from({ length: 13 }, (_, i) => {
    const n = i + 1;
    return `${n}. SECTION TITLE ${n}\n${n}.1 Scope and deliverables.\n${clause.repeat(3)}\n${n}.2 Operational terms and cooperation.\n${clause.repeat(2)}\n${n}.3 Suspension and cure mechanics when payment or access issues arise.`;
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
  flowStackBottom?: number;
  actualDomContentBottom?: number;
  modelDomStackDelta?: number;
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
  return Buffer.from(
    "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
    "utf8",
  );
}

async function installApiMocks(page: Page, pdf: Buffer) {
  await page.route("**/v1/documents/*/content", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: pdf,
    });
  });
  await page.route("**/v1/sign-sessions**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session_id: "sess_qa361", status: "open" }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/v1/sign-sessions/*/complete**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        receipt_id: "rcpt_qa361",
        receipt_hash_sha256: createHash("sha256").update("qa361").digest("hex"),
      }),
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
        typeof v === "object" &&
        v !== null &&
        "page" in v &&
        typeof (v as DomLog).page === "number",
    );
    if (payload) logs.push(payload);
  });
  return logs;
}

async function collectLiveDomMetrics(page: Page) {
  return page.evaluate(() => {
    const stacks = [...document.querySelectorAll("[data-vs01-sign-page]")] as HTMLElement[];
    return stacks.map((stack) => {
      const pageIndex = Number(stack.getAttribute("data-vs01-sign-page"));
      const surface = stack.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
      const flowBody = surface?.querySelector(".vs01-canonical-flow-body") as HTMLElement | null;
      const texts = flowBody
        ? [...flowBody.querySelectorAll("[data-vs01-canonical-text]")].map((n) =>
            (n.textContent || "").trim(),
          )
        : [];
      const first = texts[0] ?? "";
      const last = texts[texts.length - 1] ?? "";
      let maxBottom = 0;
      if (flowBody) {
        for (const node of flowBody.querySelectorAll("[data-vs01-canonical-text], .vs01-canonical-flow-spacer")) {
          const el = node as HTMLElement;
          maxBottom = Math.max(maxBottom, el.offsetTop + el.offsetHeight);
        }
      }
      const surfaceHeight = surface?.clientHeight ?? 0;
      const flowHeight = flowBody?.clientHeight ?? 0;
      return {
        pageIndex,
        firstText: first.slice(0, 80),
        lastText: last.slice(-80),
        maxChildBottomPx: maxBottom,
        flowBodyHeightPx: flowHeight,
        surfaceHeightPx: surfaceHeight,
        clipped: maxBottom > flowHeight + 2,
        textLineCount: texts.length,
      };
    });
  });
}

function assertDomLogsHealthy(logs: DomLog[], surface: string) {
  const byPage = new Map<number, DomLog>();
  for (const entry of logs) {
    byPage.set(entry.page, entry);
  }
  expect(byPage.size, `${surface}: expected canonical page DOM logs`).toBeGreaterThan(0);
  const failures: string[] = [];
  for (const entry of byPage.values()) {
    if (entry.clipped) failures.push(`page ${entry.page}: clipped=true`);
    if (entry.modelDomMatches === false) {
      failures.push(
        `page ${entry.page}: modelDomMatches=false (model=${entry.flowStackBottom}, dom=${entry.actualDomContentBottom}, delta=${entry.modelDomStackDelta})`,
      );
    }
  }
  expect(failures, `${surface} DOM contract failures:\n${failures.join("\n")}`).toEqual([]);
}

async function seedPrepareBridge(page: Page, corpus: string) {
  const bridge = {
    vs01DocumentId: DOCUMENT_ID,
    agreementId: AGREEMENT_ID,
    agreementTitle: "CONSULTING AND IMPLEMENTATION AGREEMENT",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    creatorSignerName: "Ann Rice",
    creatorSignerTitle: "Author",
    counterparties: [
      {
        id: "cp_harbor",
        name: "Harbor Peak Automation LLC",
        email: "cp@example.com",
        signerName: "Heath Lincoln",
        signerTitle: "Member",
      },
    ],
    targetStep: 2,
    senderFirstLawdogHandoff: true,
    agreementBridgeMode: "prepare_signing_packet",
    ownerIsPreparingPacket: true,
    agreementCorpusText: corpus,
    reviewerApprovedCleanHandoff: true,
  };
  await page.addInitScript(
    ({ bridge, bridgeKey, skipKey, documentId }) => {
      sessionStorage.setItem(bridgeKey, JSON.stringify(bridge));
      sessionStorage.setItem(skipKey, documentId);
    },
    { bridge, bridgeKey: BRIDGE_SESSION_KEY, skipKey: PAID_PRO_SKIP_KEY, documentId: DOCUMENT_ID },
  );
}

async function assertPageOneTitleVisible(page: Page) {
  const page0 = page.locator('[data-vs01-sign-page="0"]');
  await expect(page0).toBeVisible({ timeout: 60_000 });
  await page0.scrollIntoViewIfNeeded();
  const titleLine = page0
    .locator(".vs01-canonical-flow-line")
    .filter({ hasText: /CONSULTING AND IMPLEMENTATION AGREEMENT/i })
    .first();
  await expect(titleLine).toBeVisible();
  const metrics = await page0.evaluate(() => {
    const stack = document.querySelector('[data-vs01-sign-page="0"]') as HTMLElement | null;
    const surface = stack?.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
    const flowBody = surface?.querySelector(".vs01-canonical-flow-body") as HTMLElement | null;
    const title = surface?.querySelector(".vs01-canonical-flow-line--document_title") as HTMLElement | null;
    if (!surface || !flowBody || !title) return null;
    const surfaceRect = surface.getBoundingClientRect();
    const flowRect = flowBody.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      titleTopPx: titleRect.top - surfaceRect.top,
      flowTopPx: flowRect.top - surfaceRect.top,
      surfaceHeight: surfaceRect.height,
    };
  });
  expect(metrics).not.toBeNull();
  expect(metrics!.titleTopPx).toBeLessThan(metrics!.surfaceHeight * 0.2);
  expect(metrics!.titleTopPx - metrics!.flowTopPx).toBeLessThan(24);
}

async function assertNoObviousMidSentencePageEnds(page: Page, pageCount: number) {
  const badEnds: string[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const stack = page.locator(`[data-vs01-sign-page="${i}"]`);
    if (!(await stack.isVisible().catch(() => false))) continue;
    const lastText = await stack.evaluate((el) => {
      const lines = [...el.querySelectorAll("[data-vs01-canonical-text]")] as HTMLElement[];
      const meaningful = lines.map((n) => (n.textContent || "").trim()).filter(Boolean);
      return meaningful[meaningful.length - 1] ?? "";
    });
    if (!lastText) continue;
    if (
      /\b(for|the|and|to|of|in|on|with|a|an|twelve|continues|during)\s*$/i.test(lastText) &&
      !/[.!?:;)"']\s*$/.test(lastText)
    ) {
      badEnds.push(`page ${i + 1}: "${lastText.slice(-72)}"`);
    }
  }
  expect(badEnds, `mid-sentence page ends:\n${badEnds.join("\n")}`).toEqual([]);
}

async function seedRecipientCanonicalPacket(
  page: Page,
  portable: ReturnType<typeof buildVs01CanonicalPacketPortable>,
) {
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

async function seedRecipientSigningStatus(page: Page) {
  const r = roles();
  const ownerRole = r[0]!;
  const counterpartyRole = r[1]!;
  await page.addInitScript(
    ({ agreementId, ownerRoleId, counterpartyRoleId, ownerSigned }) => {
      localStorage.setItem(
        `vs01_signing_packet_status_v1:${agreementId}`,
        JSON.stringify({
          agreementId,
          updatedAt: new Date().toISOString(),
          bySignerKey: {
            [ownerRoleId]: ownerSigned ? "signed" : "opened",
            [counterpartyRoleId]: "opened",
          },
          fullySigned: false,
        }),
      );
    },
    {
      agreementId: AGREEMENT_ID,
      ownerRoleId: ownerRole.roleId,
      counterpartyRoleId: counterpartyRole.roleId,
      ownerSigned: false,
    },
  );
}

function buildRecipientUrl(partyIndex: 0 | 1) {
  const r = roles();
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: qaThirteenSectionProCorpus(),
    roles: r,
    initialsEnabled: true,
  });
  expect(model.allowed).toBe(true);
  const seed = buildVs01CanonicalPacketSeed({
    documentId: DOCUMENT_ID,
    agreementId: AGREEMENT_ID,
    corpusPlain: qaThirteenSectionProCorpus(),
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
  return {
    url: `/app/esign/${DOCUMENT_ID}?${params.toString()}`,
    pageCount: model.pages.length,
    portable,
  };
}

test.describe("QA361 canonical surface verification", () => {
  test("prepare bridge surface: modelDomMatches, no clipping, page 1 title", async ({ page }) => {
    test.setTimeout(180_000);
    const corpus = qaThirteenSectionProCorpus();
    const domLogs = attachDomLogCollector(page);
    await installApiMocks(page, minimalPdfBytes());
    await seedPrepareBridge(page, corpus);

    await page.goto(`/app/esign/${DOCUMENT_ID}?agreement_bridge=1`);
    await expect(page.getByRole("heading", { name: "Prepare signature links" })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByTestId("vs01-canonical-model-render")).toBeVisible({ timeout: 90_000 });

    const pageCount = await page.locator(".vs01-sign-page-stack").count();
    expect(pageCount).toBeGreaterThanOrEqual(8);

    await assertPageOneTitleVisible(page);

    for (let i = 0; i < pageCount; i += 1) {
      const stack = page.locator(`[data-vs01-sign-page="${i}"]`);
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);

    assertDomLogsHealthy(domLogs, "prepare");
    await assertNoObviousMidSentencePageEnds(page, pageCount);

    const surfaces = page.locator(".vs01-sign-page-surface--canonical");
    await expect(surfaces.first()).toHaveCSS("width", `${VS01_PACKET_PAGE_WIDTH_PT}px`);
    await expect(surfaces.first()).toHaveCSS("height", `${VS01_PACKET_PAGE_HEIGHT_PT}px`);
  });

  test("recipient signing surface: modelDomMatches and parity with prepare corpus", async ({ page }) => {
    test.setTimeout(180_000);
    const domLogs = attachDomLogCollector(page);
    await installApiMocks(page, minimalPdfBytes());
    const { url, pageCount, portable } = buildRecipientUrl(1);
    await seedRecipientCanonicalPacket(page, portable);
    await seedRecipientSigningStatus(page);

    await page.goto(url);
    await expect(page.getByTestId("vs01-recipient-canonical-render")).toBeVisible({ timeout: 90_000 });

    await assertPageOneTitleVisible(page);

    for (let i = 0; i < pageCount; i += 1) {
      const stack = page.locator(`[data-vs01-sign-page="${i}"]`);
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);

    assertDomLogsHealthy(domLogs, "recipient");
    await assertNoObviousMidSentencePageEnds(page, pageCount);
    expect(await page.locator(".vs01-sign-page-stack").count()).toBe(pageCount);
  });
});
