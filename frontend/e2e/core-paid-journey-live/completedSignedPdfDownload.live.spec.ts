/**
 * Seeded completed Silver Mesa PDF download — author desktop + Olivia mobile.
 * Does not replay create/review/accept/prepare/sign UI. Local stub only.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loadCorePaidJourneyRuntime, seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";
import { configuredLiveApiBase } from "./qualityEvalJourney";

const enabled = Boolean(process.env.CORE_PAID_JOURNEY_LIVE_API && process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN);
test.skip(!enabled, "Local official API/origin required; no provider calls");

const PARTIES = [
  { legalEntity: "Ironclad Systems Group LLC", role: "Sponsor", signerName: "Ethan Cole", email: "ethan.cole@ironcladsg.com" },
  { legalEntity: "Harborline Data Solutions Inc.", role: "Vendor", signerName: "Maya Bennett", email: "maya.bennett@harborlinedata.com" },
  { legalEntity: "Northwind Automation Partners LLC", role: "Integrator", signerName: "Lucas Reed", email: "lucas.reed@northwindap.io" },
  { legalEntity: "Silver Mesa Analytics LP", role: "Analyst", signerName: "Olivia Hart", email: "olivia.hart@silvermesaanalytics.com" },
] as const;

function ownerHeaders() {
  const runtime = loadCorePaidJourneyRuntime();
  return {
    Authorization: `Bearer ${runtime.access_token}`,
    "X-Claw-Org-Id": runtime.org_id,
    "Content-Type": "application/json",
  };
}

function sha256Hex(buf: string | Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function fingerprintAgreementBody(text: string): string {
  const t = (text || "").trim();
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${t.length}:${(h >>> 0).toString(16)}`;
}

function silverMesaPaper(): string {
  const body = [
    "JOINT AI SOFTWARE ROLLOUT AGREEMENT",
    'This Agreement is among Ironclad Systems Group LLC ("Sponsor"), Harborline Data Solutions Inc. ("Vendor"), Northwind Automation Partners LLC ("Integrator"), and Silver Mesa Analytics LP ("Analyst").',
    "Ethan Cole is CEO of Ironclad. Maya Bennett is CTO of Harborline. Lucas Reed is Managing Partner of Northwind. Olivia Hart is Ops Director of Silver Mesa.",
    "Ironclad Systems Group LLC pays $187,500 over six milestone payments. Term is 24 months. Texas law. Austin ZIP 78701.",
    "If to Silver Mesa Analytics LP: Email: notices@silvermesaanalytics.com.",
    "Reviewer access remains olivia.hart@silvermesaanalytics.com and is not the Silver Mesa notice address.",
  ].join("\n");
  const witness = [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "Ironclad Systems Group LLC",
    "By: ______________________",
    "Name: Ethan Cole",
    "Harborline Data Solutions Inc.",
    "By: ______________________",
    "Name: Maya Bennett",
    "Northwind Automation Partners LLC",
    "By: ______________________",
    "Name: Lucas Reed",
    "Silver Mesa Analytics LP",
    "By: ______________________",
    "Name: Olivia Hart",
  ].join("\n");
  return `${body}\n${"Operative commercial paragraph continues the same four-party Texas rollout. ".repeat(80)}\n${witness}`.trim();
}

async function seedPrepared(page: Page) {
  const api = configuredLiveApiBase();
  const headers = ownerHeaders();
  const corpus = silverMesaPaper();
  const created = await page.request.post(`${api}/api/agreements/draft`, {
    headers,
    data: {
      title: "Joint AI Software Rollout Agreement",
      jurisdiction: "Texas",
      parties: PARTIES.map((party) => ({
        name: party.legalEntity,
        role: party.role,
        email: party.email,
        signerName: party.signerName,
      })),
      purpose: "four-party Texas joint AI software rollout",
      payment_terms: "$187,500 over six milestones",
      duration: "24 months",
    },
  });
  expect(created.ok()).toBeTruthy();
  const agreementId = String((await created.json()).id || "").trim();
  const get = await page.request.get(`${api}/api/agreements/${agreementId}`, { headers });
  const draft = (await get.json()).draft || {};
  const parties = (draft.parties || []) as Array<{ id: string; name: string; role: string; email: string; signerName?: string }>;
  const digest = sha256Hex(corpus);
  const posted = await page.request.post(`${api}/api/agreements/${agreementId}/canonical-review-snapshot`, {
    headers,
    data: { corpus_plain: corpus, generation_session_id: "completed-signed-pdf", claimed_digest: digest },
  });
  expect(posted.ok(), await posted.text()).toBeTruthy();
  const snapshotId = String((await posted.json()).snapshot?.snapshot_id || "").trim();
  const accepted = await page.request.post(`${api}/api/agreements/${agreementId}/canonical-review-snapshot/accept`, {
    headers,
    data: { snapshot_id: snapshotId, expected_digest: digest, expected_accepted_snapshot_id: "", accepting_session: "completed-signed-pdf" },
  });
  expect(accepted.ok()).toBeTruthy();
  await page.request.post(`${api}/api/agreements/${agreementId}/update-field`, {
    headers,
    data: { field: "owner_delivery_track", value: "signature" },
  });
  const lockVersionId = `lv_${agreementId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
  const lock = await page.request.put(`${api}/api/agreements/${agreementId}/signing-lock`, {
    headers,
    data: { locked_version_id: lockVersionId, locked_at: new Date().toISOString(), locked_by: "owner" },
  });
  expect(lock.ok()).toBeTruthy();
  const corpusHash = fingerprintAgreementBody(corpus);
  const roles = parties.map((party, index) => ({
    roleId: `role_${party.id}`,
    partyIndex: index,
    partyId: party.id,
    entityName: party.name,
    partyName: party.name,
    roleLabel: party.role,
    signerName: party.signerName,
    signerEmail: party.email,
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: party.id,
    kind: "counterparty",
  }));
  const sent = await page.request.post(`${api}/api/agreements/${agreementId}/signing-links-sent`, {
    headers,
    data: {
      packet_revision: `pdf_${snapshotId}`,
      document_id: `pdf_pkt_${agreementId}`,
      portable_packet: {
        v: 1,
        seed: { v: 1, documentId: `pdf_pkt_${agreementId}`, agreementId, corpusPlain: corpus, corpusHash, savedAt: new Date().toISOString() },
        fields: [],
        roles,
        pageCount: 1,
        witnessPageIndex: 0,
        initialsPolicy: { enabled: false, bodyPagesOnly: true },
        fieldCount: 0,
      },
      frozen_signing_authority: {
        version: 1,
        agreementId,
        agreementSessionId: `pdf_${agreementId}`,
        frozenCorpusHash: corpusHash,
        frozenAt: new Date().toISOString(),
        parties: parties.map((party, index) => ({ agreementPartyId: party.id, legalEntityName: party.name, agreementRole: party.role, canonicalOrder: index })),
        signers: parties.map((party, index) => ({ signerRecordId: `signer_${party.id}`, agreementPartyId: party.id, signerName: party.signerName, signerEmail: party.email, signingOrder: index, requiresSignature: true, requiresInitials: false })),
        recipients: parties.map((party) => ({ recipientRecordId: `rcpt_${party.id}`, agreementPartyId: party.id, signerRecordId: `signer_${party.id}`, recipientType: "signer", email: party.email })),
        execution: { partyOrder: parties.map((p) => p.id), signerOrder: parties.map((p) => `signer_${p.id}`), executionBlockHash: corpusHash },
        packetState: "draft",
        requiredActions: parties.map((party) => ({ actionId: `sign_${party.id}`, signerRecordId: `signer_${party.id}`, agreementPartyId: party.id, type: "signature", fieldId: `sig_${party.id}`, required: true })),
      },
      targets: [],
      accepted_review_snapshot_id: snapshotId,
      accepted_review_snapshot_digest: digest,
    },
  });
  expect(sent.ok(), await sent.text()).toBeTruthy();
  const tokens: Record<string, string> = {};
  const reviewTokens: Record<string, string> = {};
  for (const party of parties) {
    const minted = await page.request.post(`${api}/api/agreements/${agreementId}/recipient-access-token`, {
      headers,
      data: { mode: "sign", role: "signer", recipient_party_id: party.id },
    });
    tokens[party.id] = String((await minted.json()).token || "").trim();
    const review = await page.request.post(`${api}/api/agreements/${agreementId}/recipient-access-token`, {
      headers,
      data: { mode: "review", role: "reviewer", recipient_party_id: party.id },
    });
    reviewTokens[party.id] = String((await review.json()).token || "").trim();
  }
  return { agreementId, snapshotId, digest, lockVersionId, parties, tokens, reviewTokens, corpus };
}

async function completeAllSigners(page: Page, seeded: Awaited<ReturnType<typeof seedPrepared>>) {
  const api = configuredLiveApiBase();
  for (const party of seeded.parties) {
    const expected = PARTIES.find((row) => row.legalEntity === party.name)!;
    const res = await page.request.post(`${api}/api/agreements/${seeded.agreementId}/signing-ceremony/complete`, {
      headers: {
        "Content-Type": "application/json",
        "X-Claw-Recipient-Access-Token": seeded.tokens[party.id],
      },
      data: {
        participant_id: party.id,
        typed_name: `TEST-SIGNATURE ${expected.signerName}`,
        locked_version_id: seeded.lockVersionId,
        consent: {
          accepted: true,
          intent_version: "lawdog_esign_consent.v1",
          intent_statement:
            "I agree to use an electronic signature. By selecting Agree and sign, I adopt the completed assigned signature fields as my electronic signature and affirm my intent to be bound.",
          action: "agree_and_sign",
        },
      },
    });
    expect(res.ok(), `${party.name} ${res.status()} ${await res.text()}`).toBeTruthy();
  }
}

function inspectPdf(pdfPath: string, pngPath: string) {
  const py = [
    "import hashlib, json, sys",
    "import fitz",
    "path, png = sys.argv[1], sys.argv[2]",
    "doc = fitz.open(path)",
    "text = ''.join(page.get_text() for page in doc)",
    "page = doc[-1]",
    "pix = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4))",
    "pix.save(png)",
    "raw = open(path,'rb').read()",
    "print(json.dumps({'pages': doc.page_count, 'text': text, 'sha': hashlib.sha256(raw).hexdigest(), 'size': len(raw)}))",
  ].join("\n");
  const python =
    process.env.COMPLETED_SIGNED_PDF_PYTHON ||
    join("..", ".venv", "bin", "python");
  const out = execFileSync(python, ["-c", py, pdfPath, pngPath], { encoding: "utf8" });
  const jsonLine = out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .at(-1);
  if (!jsonLine) throw new Error(`pdf inspect produced no JSON: ${out}`);
  return JSON.parse(jsonLine) as { pages: number; text: string; sha: string; size: number };
}

function assertSilverPdfText(text: string, label: string) {
  expect(text, `${label} Ironclad`).toContain("Ironclad Systems Group LLC");
  expect(text, `${label} Harborline`).toContain("Harborline Data Solutions Inc.");
  expect(text, `${label} Northwind`).toContain("Northwind Automation Partners LLC");
  expect(text, `${label} Silver Mesa`).toContain("Silver Mesa Analytics LP");
  expect(text).toMatch(/Sponsor/i);
  expect(text).toMatch(/Vendor/i);
  expect(text).toMatch(/Integrator/i);
  expect(text).toMatch(/Analyst/i);
  expect(text).toContain("Texas");
  expect(text).toContain("$187,500");
  expect(text).toMatch(/24 months/i);
  expect(text).toContain("78701");
  expect(text).toContain("notices@silvermesaanalytics.com");
  expect(text).toContain("Olivia Hart");
  expect(text).toContain("Ethan Cole");
  expect(text).toContain("Maya Bennett");
  expect(text).toContain("Lucas Reed");
  expect(text).toMatch(/Fully executed/i);
  expect(text).toMatch(/Completion receipt|receipt/i);
  expect(text).toMatch(/Verification snapshot|Accepted corpus digest/i);
}

test("completed Silver Mesa PDF downloads on author desktop and Olivia mobile", async ({ page, browser }) => {
  const api = configuredLiveApiBase();
  const seeded = await seedPrepared(page);
  const persistDir =
    process.env.COMPLETED_SIGNED_PDF_PERSIST ||
    process.env.COMPLETED_SIGNED_PDF_OUTPUT ||
    join("..", "evals", "commercial-readiness", "results", "completed-signed-pdf", "local");
  mkdirSync(persistDir, { recursive: true });

  const before = await page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`, {
    headers: ownerHeaders(),
  });
  expect(before.status(), "incomplete must fail closed").toBe(403);

  await completeAllSigners(page, seeded);
  const proof = await page.request.get(`${api}/api/agreements/${seeded.agreementId}/proof-status`, {
    headers: ownerHeaders(),
  });
  const receipt = ((await proof.json()) as { finalized_receipt?: { receipt_id?: string; bound?: boolean; accepted_snapshot_id?: string; accepted_snapshot_digest?: string; locked_version_id?: string } }).finalized_receipt;
  expect(receipt?.bound).toBe(true);
  expect(receipt?.accepted_snapshot_id).toBe(seeded.snapshotId);
  expect(receipt?.accepted_snapshot_digest).toBe(seeded.digest);

  const ownerPdf = await page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`, {
    headers: ownerHeaders(),
  });
  if (!ownerPdf.ok()) {
    throw new Error(`owner PDF ${ownerPdf.status()} ${await ownerPdf.text()}`);
  }
  expect(ownerPdf.headers()["content-type"] || "").toContain("application/pdf");
  const ownerBytes = Buffer.from(await ownerPdf.body());
  expect(ownerBytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(ownerBytes.length).toBeGreaterThan(64);
  const filename = ownerPdf.headers()["content-disposition"] || "";
  expect(filename).toMatch(/\.pdf/i);
  expect(filename).not.toMatch(/[/\\]/);
  expect(ownerPdf.headers()["x-lawdog-accepted-snapshot-id"]).toBe(seeded.snapshotId);
  expect(ownerPdf.headers()["x-lawdog-accepted-snapshot-digest"]).toBe(seeded.digest);
  expect(ownerPdf.headers()["x-lawdog-locked-version-id"]).toBe(seeded.lockVersionId);
  expect(ownerPdf.headers()["x-lawdog-receipt-id"]).toBe(receipt?.receipt_id);
  const pdfSha = ownerPdf.headers()["x-lawdog-pdf-sha256"] || sha256Hex(ownerBytes);
  expect(pdfSha).not.toBe(seeded.digest);

  const olivia = seeded.parties.find((party) => party.name === "Silver Mesa Analytics LP")!;
  const ethan = seeded.parties.find((party) => party.name === "Ironclad Systems Group LLC")!;
  const signerPdf = await page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`, {
    headers: { "X-Claw-Recipient-Access-Token": seeded.tokens[olivia.id] },
  });
  expect(signerPdf.ok()).toBeTruthy();
  const signerBytes = Buffer.from(await signerPdf.body());
  const ownerPdf2 = await page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`, {
    headers: ownerHeaders(),
  });
  const ownerBytes2 = Buffer.from(await ownerPdf2.body());
  expect(ownerPdf2.headers()["x-lawdog-pdf-sha256"]).toBe(pdfSha);
  expect(signerPdf.headers()["x-lawdog-receipt-id"]).toBe(receipt?.receipt_id);
  if (ownerBytes.equals(ownerBytes2) && ownerBytes.equals(signerBytes)) {
    expect(sha256Hex(signerBytes)).toBe(pdfSha);
  }

  const otherDraft = await page.request.post(`${api}/api/agreements/draft`, {
    headers: ownerHeaders(),
    data: {
      title: "Other Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Harbor Peak Analytics LLC", role: "Consultant", email: "pat.harbor@harbor.test", signerName: "Pat Harbor" },
        { name: "Ironvale Manufacturing Inc.", role: "Client", email: "sam.ironvale@ironvale.test", signerName: "Sam Ironvale" },
      ],
      purpose: "unrelated two-party consulting",
      payment_terms: "$1",
      duration: "1 month",
    },
  });
  const otherId = String((await otherDraft.json()).id || "").trim();
  const otherGet = await page.request.get(`${api}/api/agreements/${otherId}`, { headers: ownerHeaders() });
  const otherPartyId = String((((await otherGet.json()).draft?.parties || [])[0] || {}).id || "").trim();
  const otherTokenRes = await page.request.post(`${api}/api/agreements/${otherId}/recipient-access-token`, {
    headers: ownerHeaders(),
    data: { mode: "sign", role: "signer", recipient_party_id: otherPartyId },
  });
  const otherToken = String((await otherTokenRes.json()).token || "").trim();

  const negatives = [
    { label: "wrong agreement", req: () => page.request.post(`${api}/api/agreements/00000000-0000-4000-8000-000000000000/completed-signed-export-pdf`, { headers: ownerHeaders() }) },
    { label: "unauthorized", req: () => page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`) },
    { label: "review token", req: () => page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`, { headers: { "X-Claw-Recipient-Access-Token": seeded.reviewTokens[olivia.id] } }) },
    { label: "wrong-party token", req: () => page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`, { headers: { "X-Claw-Recipient-Access-Token": otherToken } }) },
  ];
  const negativeResults: Record<string, number> = {};
  for (const row of negatives) {
    const res = await row.req();
    negativeResults[row.label] = res.status();
    expect(res.status(), row.label).toBeGreaterThanOrEqual(400);
  }
  const otherPdf = await page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`, {
    headers: { "X-Claw-Recipient-Access-Token": seeded.tokens[ethan.id] },
  });
  negativeResults["other-party-same-agreement"] = otherPdf.status();
  expect([200, 403]).toContain(otherPdf.status());

  await seedCorePaidJourneyOwner(page);
  await page.goto(`/app/agreements/${seeded.agreementId}/view-signed`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("owner-signed-agreement-download-pdf")).toBeVisible({ timeout: 30_000 });
  const authorDownload = page.waitForEvent("download");
  await page.getByTestId("owner-signed-agreement-download-pdf").click();
  const authorFile = await authorDownload;
  const authorPath = join(persistDir, "author-desktop.pdf");
  await authorFile.saveAs(authorPath);
  const authorPng = join(persistDir, "author-desktop-last-page.png");
  const authorInspect = inspectPdf(authorPath, authorPng);
  assertSilverPdfText(authorInspect.text, "author desktop PDF");
  expect(authorInspect.pages).toBeGreaterThan(0);

  const oliviaCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const oliviaPage = await oliviaCtx.newPage();
  await oliviaPage.goto(`/agreements/${seeded.agreementId}/sign?t=${encodeURIComponent(seeded.tokens[olivia.id])}`, {
    waitUntil: "domcontentloaded",
  });
  const dl = oliviaPage.locator('[data-testid="recipient-completed-signed-download-pdf"]');
  await expect(dl).toBeVisible({ timeout: 45_000 });
  const box = await dl.boundingBox();
  expect(box).toBeTruthy();
  if (box) expect(box.y + box.height).toBeLessThanOrEqual(844 + 8);
  const oliviaDownload = oliviaPage.waitForEvent("download");
  await dl.click();
  const oliviaFile = await oliviaDownload;
  const oliviaPath = join(persistDir, "olivia-mobile.pdf");
  await oliviaFile.saveAs(oliviaPath);
  const oliviaPng = join(persistDir, "olivia-mobile-last-page.png");
  const oliviaInspect = inspectPdf(oliviaPath, oliviaPng);
  assertSilverPdfText(oliviaInspect.text, "Olivia mobile PDF");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("owner-signed-agreement-download-pdf")).toBeVisible();
  const reloadPdf = await page.request.post(`${api}/api/agreements/${seeded.agreementId}/completed-signed-export-pdf`, {
    headers: ownerHeaders(),
  });
  expect(reloadPdf.headers()["x-lawdog-pdf-sha256"]).toBe(pdfSha);
  await oliviaPage.reload({ waitUntil: "domcontentloaded" });
  await expect(oliviaPage.getByTestId("recipient-completed-signed-download-pdf")).toBeVisible({ timeout: 30_000 });
  await oliviaCtx.close();

  writeFileSync(
    join(persistDir, "completed-signed-pdf.json"),
    JSON.stringify(
      {
        agreementId: seeded.agreementId,
        snapshotId: seeded.snapshotId,
        corpusDigest: seeded.digest,
        lockVersionId: seeded.lockVersionId,
        receiptId: receipt?.receipt_id,
        contentType: ownerPdf.headers()["content-type"],
        filename,
        pageCount: authorInspect.pages,
        pdfSha256: pdfSha,
        corpusDigestDistinct: pdfSha !== seeded.digest,
        negativeResults,
        authorPages: authorInspect.pages,
        oliviaPages: oliviaInspect.pages,
      },
      null,
      2,
    ),
  );
});
