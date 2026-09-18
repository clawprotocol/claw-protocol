/**
 * Seeded accepted + already-prepared Silver Mesa packet.
 * Completes four isolated test signatures and a bound completion receipt.
 * Does not replay create, review-link minting, proposal, acceptance, or Prepare UI.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadCorePaidJourneyRuntime, seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";
import { configuredLiveApiBase, fetchOwnerCanonicalSnapshot } from "./qualityEvalJourney";

const enabled = Boolean(process.env.CORE_PAID_JOURNEY_LIVE_API && process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN);
test.skip(!enabled, "Local official API/origin required; no provider calls");

const SILVER_MESA = "Silver Mesa Analytics LP";
const ORIGINAL_REVIEWER = "olivia.hart@silvermesaanalytics.com";
const ACCEPTED_NOTICE = "notices@silvermesaanalytics.com";

const SILVER_MESA_FOUR_PARTY = [
  {
    legalEntity: "Ironclad Systems Group LLC",
    role: "Sponsor",
    signerName: "Ethan Cole",
    email: "ethan.cole@ironcladsg.com",
  },
  {
    legalEntity: "Harborline Data Solutions Inc.",
    role: "Vendor",
    signerName: "Maya Bennett",
    email: "maya.bennett@harborlinedata.com",
  },
  {
    legalEntity: "Northwind Automation Partners LLC",
    role: "Integrator",
    signerName: "Lucas Reed",
    email: "lucas.reed@northwindap.io",
  },
  {
    legalEntity: SILVER_MESA,
    role: "Analyst",
    signerName: "Olivia Hart",
    email: ORIGINAL_REVIEWER,
  },
] as const;

const SIGN_ORDER = ["Olivia Hart", "Ethan Cole", "Maya Bennett", "Lucas Reed"] as const;

function acceptedSilverMesaPaper(): string {
  const body = [
    "JOINT AI SOFTWARE ROLLOUT AGREEMENT",
    "This Agreement is among Ironclad Systems Group LLC (\"Sponsor\"), Harborline Data Solutions Inc. (\"Vendor\"), Northwind Automation Partners LLC (\"Integrator\"), and Silver Mesa Analytics LP (\"Analyst\").",
    "Ethan Cole is CEO of Ironclad. Maya Bennett is CTO of Harborline. Lucas Reed is Managing Partner of Northwind. Olivia Hart is Ops Director of Silver Mesa.",
    "Ironclad Systems Group LLC pays $187,500 over six milestone payments. Term is 24 months. Texas law. Austin ZIP 78701.",
    "If to Silver Mesa Analytics LP: Email: notices@silvermesaanalytics.com.",
    "Reviewer access remains olivia.hart@silvermesaanalytics.com and is not the Silver Mesa notice address.",
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
  return `${body}\n${"Operative commercial paragraph continues the same four-party Texas rollout. ".repeat(80)}`.trim();
}

function ownerHeaders() {
  const runtime = loadCorePaidJourneyRuntime();
  return {
    Authorization: `Bearer ${runtime.access_token}`,
    "X-Claw-Org-Id": runtime.org_id,
    "Content-Type": "application/json",
  };
}

function isDurablePartyId(id: string): boolean {
  const value = id.trim();
  if (!value || value.startsWith("legacy_")) return false;
  if (/^party_\d+$/i.test(value)) return false;
  if (/^party_[0-9a-f]+:[0-9a-f]+$/i.test(value)) return false;
  return true;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function fingerprintAgreementBody(text: string): string {
  const t = (text || "").trim();
  if (!t) return "empty";
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${t.length}:${(h >>> 0).toString(16)}`;
}

function assertSilverMesaFourPartyPaper(text: string, label: string): void {
  expect(text.length, `${label} must be operative paper`).toBeGreaterThan(400);
  expect(text, `${label} Ironclad`).toContain("Ironclad Systems Group LLC");
  expect(text, `${label} Harborline`).toContain("Harborline Data Solutions Inc.");
  expect(text, `${label} Northwind`).toContain("Northwind Automation Partners LLC");
  expect(text, `${label} Silver Mesa`).toContain(SILVER_MESA);
  expect(text, `${label} Sponsor`).toMatch(/Sponsor/i);
  expect(text, `${label} Vendor`).toMatch(/Vendor/i);
  expect(text, `${label} Integrator`).toMatch(/Integrator/i);
  expect(text, `${label} Analyst`).toMatch(/Analyst/i);
  expect(text, `${label} Texas`).toContain("Texas");
  expect(text, `${label} fee`).toContain("$187,500");
  expect(text, `${label} term`).toMatch(/24 months/i);
  expect(text, `${label} ZIP`).toContain("78701");
  expect(text, `${label} notice`).toMatch(
    /If to Silver Mesa Analytics LP:\s*Email:\s*notices@silvermesaanalytics\.com/i,
  );
  expect(text, `${label} must not replace notice with reviewer email`).not.toMatch(
    /If to Silver Mesa Analytics LP:\s*Email:\s*olivia\.hart@silvermesaanalytics\.com/i,
  );
  expect(text, `${label} no LP LP`).not.toMatch(/LP\s+LP/i);
  expect(text, `${label} no invented Effective Date`).not.toMatch(
    /The "Effective Date" is the date on which the Agreement has been fully executed/i,
  );
  expect(text, `${label} no role replacement`).not.toMatch(/\b(?:Client|Service Provider|Consultant)\b/i);
}

type PersistedParty = {
  id: string;
  name: string;
  role: string;
  email: string;
  signerName: string;
};

type OwnerAgreementState = {
  parties: PersistedParty[];
  acceptedSnapshotId: string;
  acceptedDigest: string;
  lockSnapshotId: string;
  lockDigest: string;
  lockVersionId: string;
  packetSnapshotId: string;
  packetDigest: string;
  packetCorpus: string;
  signedParticipantIds: string[];
  signed: boolean;
  completedSigned: boolean;
  receiptId: string;
  receipt: {
    bound: boolean;
    acceptedSnapshotId: string;
    acceptedDigest: string;
    lockedVersionId: string;
    requiredParticipantIds: string[];
  } | null;
};

async function fetchOwnerAgreement(page: Page, agreementId: string): Promise<OwnerAgreementState> {
  const api = configuredLiveApiBase();
  const res = await page.request.get(`${api}/api/agreements/${encodeURIComponent(agreementId)}`, {
    headers: ownerHeaders(),
  });
  expect(res.ok(), `owner GET failed ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as {
    draft?: {
      parties?: Array<{
        id?: string;
        name?: string;
        role?: string;
        email?: string;
        signer_name?: string;
        signerName?: string;
      }>;
      accepted_review_snapshot_v1?: { snapshotId?: string; corpusSha256?: string };
      vs01_signing_packet_v1?: {
        accepted_review_snapshot_id?: string;
        accepted_review_snapshot_digest?: string;
        portable?: {
          seed?: { corpusPlain?: string };
          envelopeProvenance?: { acceptedSoTDigest?: string };
        };
      };
      audit_log?: Array<{ event_type?: string; value?: { participant_id?: string } }>;
      completion_receipt_id?: string;
      receipt_id?: string;
    };
    signing_lock?: {
      accepted_snapshot_id?: string;
      accepted_snapshot_digest?: string;
      locked_version_id?: string;
    };
    completed_signed?: boolean;
  };
  const parties = Array.isArray(body.draft?.parties) ? body.draft.parties : [];
  const accepted = body.draft?.accepted_review_snapshot_v1 || {};
  const lock = body.signing_lock || {};
  const packet = body.draft?.vs01_signing_packet_v1 || {};
  const portable = packet.portable || {};
  const seed = portable.seed || {};
  const audit = Array.isArray(body.draft?.audit_log) ? body.draft.audit_log : [];
  const signedParticipantIds = [
    ...new Set(
      audit
        .filter((row) => row.event_type === "signature_completed")
        .map((row) => String(row.value?.participant_id || "").trim())
        .filter(Boolean),
    ),
  ];
  const proof = await page.request.get(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/proof-status`,
    { headers: ownerHeaders() },
  );
  const proofBody = proof.ok()
    ? ((await proof.json()) as {
        finalized_receipt?: {
          bound?: boolean;
          receipt_id?: string;
          accepted_snapshot_id?: string;
          accepted_snapshot_digest?: string;
          locked_version_id?: string;
          required_participant_ids?: string[];
        } | null;
      })
    : {};
  const receipt = proofBody.finalized_receipt || null;
  return {
    parties: parties.map((party) => ({
      id: String(party.id || "").trim(),
      name: String(party.name || "").trim(),
      role: String(party.role || "").trim(),
      email: String(party.email || "").trim(),
      signerName: String(party.signerName || party.signer_name || "").trim(),
    })),
    acceptedSnapshotId: String(accepted.snapshotId || "").trim(),
    acceptedDigest: String(accepted.corpusSha256 || "").trim().toLowerCase(),
    lockSnapshotId: String(lock.accepted_snapshot_id || "").trim(),
    lockDigest: String(lock.accepted_snapshot_digest || "").trim().toLowerCase(),
    lockVersionId: String(lock.locked_version_id || "").trim(),
    packetSnapshotId: String(packet.accepted_review_snapshot_id || "").trim(),
    packetDigest: String(
      packet.accepted_review_snapshot_digest || portable.envelopeProvenance?.acceptedSoTDigest || "",
    )
      .trim()
      .toLowerCase(),
    packetCorpus: String(seed.corpusPlain || ""),
    signedParticipantIds,
    signed: audit.some((row) => row.event_type === "signed"),
    completedSigned: Boolean(body.completed_signed) || audit.some((row) => row.event_type === "signed"),
    receiptId: String(receipt?.receipt_id || body.draft?.completion_receipt_id || body.draft?.receipt_id || "").trim(),
    receipt: receipt
      ? {
          bound: Boolean(receipt.bound),
          acceptedSnapshotId: String(receipt.accepted_snapshot_id || "").trim(),
          acceptedDigest: String(receipt.accepted_snapshot_digest || "").trim().toLowerCase(),
          lockedVersionId: String(receipt.locked_version_id || "").trim(),
          requiredParticipantIds: Array.isArray(receipt.required_participant_ids)
            ? receipt.required_participant_ids.map((id) => String(id || "").trim()).filter(Boolean)
            : [],
        }
      : null,
  };
}

async function seedAcceptedPreparedPacket(page: Page): Promise<{
  agreementId: string;
  snapshotId: string;
  digest: string;
  corpus: string;
  lockVersionId: string;
  parties: PersistedParty[];
  tokens: Record<string, string>;
}> {
  const api = configuredLiveApiBase();
  const headers = ownerHeaders();
  const corpus = acceptedSilverMesaPaper();
  const created = await page.request.post(`${api}/api/agreements/draft`, {
    headers,
    data: {
      title: "Joint AI Software Rollout Agreement",
      jurisdiction: "Texas",
      parties: SILVER_MESA_FOUR_PARTY.map((party) => ({
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
  expect(created.ok(), `draft create failed ${created.status()} ${await created.text()}`).toBeTruthy();
  const agreementId = String((await created.json()).id || "").trim();
  expect(agreementId.length).toBeGreaterThan(8);

  const persisted = await fetchOwnerAgreement(page, agreementId);
  expect(persisted.parties).toHaveLength(4);
  for (const expected of SILVER_MESA_FOUR_PARTY) {
    const row = persisted.parties.find((party) => party.name === expected.legalEntity);
    expect(row, `${expected.legalEntity} must persist`).toBeTruthy();
    expect(isDurablePartyId(row!.id), `${expected.legalEntity} durable id`).toBe(true);
    expect(row!.role).toBe(expected.role);
    expect(row!.signerName).toBe(expected.signerName);
  }

  const digest = sha256Hex(corpus);
  const posted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot`,
    {
      headers,
      data: {
        corpus_plain: corpus,
        generation_session_id: "accepted-signing-completion",
        claimed_digest: digest,
      },
    },
  );
  expect(posted.ok(), `snapshot-create failed ${posted.status()} ${await posted.text()}`).toBeTruthy();
  const postedSnap = (await posted.json()).snapshot || {};
  const snapshotId = String(postedSnap.snapshot_id || "").trim();
  expect(snapshotId).toBeTruthy();
  expect(String(postedSnap.corpus_sha256 || "")).toBe(digest);

  const accepted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot/accept`,
    {
      headers,
      data: {
        snapshot_id: snapshotId,
        expected_digest: digest,
        expected_accepted_snapshot_id: "",
        accepting_session: "accepted-signing-completion",
      },
    },
  );
  expect(accepted.ok(), `snapshot-accept failed ${accepted.status()} ${await accepted.text()}`).toBeTruthy();

  const track = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/update-field`,
    { headers, data: { field: "owner_delivery_track", value: "signature" } },
  );
  expect(track.ok() || track.status() === 409, `delivery track ${track.status()} ${await track.text()}`).toBeTruthy();

  const lockVersionId = `lv_${agreementId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
  const lock = await page.request.put(`${api}/api/agreements/${encodeURIComponent(agreementId)}/signing-lock`, {
    headers,
    data: {
      locked_version_id: lockVersionId,
      locked_at: new Date().toISOString(),
      locked_by: "owner",
    },
  });
  expect(lock.ok(), `signing-lock failed ${lock.status()} ${await lock.text()}`).toBeTruthy();

  const corpusHash = fingerprintAgreementBody(corpus);
  const roles = persisted.parties.map((party, index) => ({
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
  const frozen = {
    version: 1,
    agreementId,
    agreementSessionId: `accepted_${agreementId}`,
    frozenCorpusHash: corpusHash,
    frozenAt: new Date().toISOString(),
    parties: persisted.parties.map((party, index) => ({
      agreementPartyId: party.id,
      legalEntityName: party.name,
      agreementRole: party.role,
      canonicalOrder: index,
    })),
    signers: persisted.parties.map((party, index) => ({
      signerRecordId: `signer_${party.id}`,
      agreementPartyId: party.id,
      signerName: party.signerName,
      signerEmail: party.email,
      signingOrder: index,
      requiresSignature: true,
      requiresInitials: false,
    })),
    recipients: persisted.parties.map((party) => ({
      recipientRecordId: `rcpt_${party.id}`,
      agreementPartyId: party.id,
      signerRecordId: `signer_${party.id}`,
      recipientType: "signer",
      email: party.email,
    })),
    execution: {
      partyOrder: persisted.parties.map((party) => party.id),
      signerOrder: persisted.parties.map((party) => `signer_${party.id}`),
      executionBlockHash: corpusHash,
    },
    packetState: "draft",
    requiredActions: persisted.parties.map((party) => ({
      actionId: `sign_${party.id}`,
      signerRecordId: `signer_${party.id}`,
      agreementPartyId: party.id,
      type: "signature",
      fieldId: `sig_${party.id}`,
      required: true,
    })),
  };
  const sent = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/signing-links-sent`,
    {
      headers,
      data: {
        packet_revision: `accepted_${snapshotId}`,
        document_id: `accepted_pkt_${agreementId}`,
        portable_packet: {
          v: 1,
          seed: {
            v: 1,
            documentId: `accepted_pkt_${agreementId}`,
            agreementId,
            corpusPlain: corpus,
            corpusHash,
            savedAt: new Date().toISOString(),
          },
          fields: [],
          roles,
          pageCount: 1,
          witnessPageIndex: 0,
          initialsPolicy: { enabled: false, bodyPagesOnly: true },
          fieldCount: 0,
        },
        frozen_signing_authority: frozen,
        targets: [],
        accepted_review_snapshot_id: snapshotId,
        accepted_review_snapshot_digest: digest,
      },
    },
  );
  expect(sent.ok(), `packet persist failed ${sent.status()} ${await sent.text()}`).toBeTruthy();

  const tokens: Record<string, string> = {};
  for (const party of persisted.parties) {
    const minted = await page.request.post(
      `${api}/api/agreements/${encodeURIComponent(agreementId)}/recipient-access-token`,
      {
        headers,
        data: { mode: "sign", role: "signer", recipient_party_id: party.id },
      },
    );
    expect(minted.ok(), `sign mint ${party.name} ${minted.status()} ${await minted.text()}`).toBeTruthy();
    const token = String((await minted.json()).token || "").trim();
    expect(token.length, `${party.name} sign token`).toBeGreaterThan(12);
    tokens[party.id] = token;
  }

  const prepared = await fetchOwnerAgreement(page, agreementId);
  expect(prepared.acceptedSnapshotId).toBe(snapshotId);
  expect(prepared.acceptedDigest).toBe(digest);
  expect(prepared.lockSnapshotId).toBe(snapshotId);
  expect(prepared.lockDigest).toBe(digest);
  expect(prepared.packetSnapshotId).toBe(snapshotId);
  expect(prepared.packetDigest).toBe(digest);
  expect(sha256Hex(prepared.packetCorpus)).toBe(digest);
  expect(prepared.signedParticipantIds).toEqual([]);
  expect(prepared.signed).toBe(false);
  expect(prepared.receipt).toBeNull();

  return { agreementId, snapshotId, digest, corpus, lockVersionId, parties: persisted.parties, tokens };
}

async function openIsolatedHref(browser: Browser, href: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const recipient = await context.newPage();
  recipient.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await recipient.goto(href, { waitUntil: "domcontentloaded" });
  return recipient;
}

async function silverMesaSigningViewText(page: Page): Promise<string> {
  const canonical = page.getByTestId("vs01-recipient-canonical-render");
  if (await canonical.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await expect(canonical).toContainText(SILVER_MESA, { timeout: 30_000 });
    return canonical.innerText();
  }
  const signRoute = page.getByTestId("recipient-public-sign-route");
  if (await signRoute.isVisible({ timeout: 8_000 }).catch(() => false)) {
    const shell = page.getByTestId("recipient-document-shell");
    if (await shell.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(shell).toContainText(SILVER_MESA, { timeout: 30_000 });
      return shell.innerText();
    }
    return signRoute.innerText();
  }
  const shell = page.getByTestId("recipient-document-shell");
  await expect(shell).toBeVisible({ timeout: 45_000 });
  await expect(shell).toContainText(SILVER_MESA, { timeout: 30_000 });
  return shell.innerText();
}

test("seeded prepared packet completes four test signatures and a bound receipt", async ({ page, browser }) => {
  const seeded = await seedAcceptedPreparedPacket(page);
  const acceptedGet = await fetchOwnerCanonicalSnapshot(page, seeded.agreementId);
  expect(acceptedGet.status).toBe("accepted");
  expect(acceptedGet.snapshotId).toBe(seeded.snapshotId);
  expect(acceptedGet.digest).toBe(seeded.digest);
  assertSilverMesaFourPartyPaper(acceptedGet.corpus, "accepted GET");

  const mapping = SIGN_ORDER.map((signerName) => {
    const expected = SILVER_MESA_FOUR_PARTY.find((party) => party.signerName === signerName)!;
    const persisted = seeded.parties.find((party) => party.name === expected.legalEntity)!;
    return {
      ...expected,
      partyId: persisted.id,
      token: seeded.tokens[persisted.id],
      syntheticSignature: `TEST-SIGNATURE ${signerName}`,
    };
  });
  expect(mapping.every((row) => row.token.length > 12)).toBe(true);

  const states: Array<{ signer: string; partyId: string; signedIds: string[]; complete: boolean }> = [];

  for (const [index, signer] of mapping.entries()) {
    const session = await openIsolatedHref(
      browser,
      `/agreements/${seeded.agreementId}/sign?t=${encodeURIComponent(signer.token)}`,
    );
    let chrome = "";
    await expect
      .poll(
        async () => {
          chrome = await session.locator("body").innerText();
          if (/invalid or expired|cannot be used/i.test(chrome)) return -1;
          return chrome.includes(signer.signerName) && chrome.includes(signer.legalEntity) ? 1 : 0;
        },
        { timeout: 45_000 },
      )
      .toBe(1);
    expect(chrome).toContain(signer.signerName);
    expect(chrome).toContain(signer.legalEntity);
    expect(chrome).toMatch(new RegExp(signer.role, "i"));

    let paper = "";
    await expect
      .poll(
        async () => {
          paper = await silverMesaSigningViewText(session);
          return paper.includes(SILVER_MESA) && paper.includes(ACCEPTED_NOTICE) ? paper.length : 0;
        },
        { timeout: 90_000 },
      )
      .toBeGreaterThan(400);
    assertSilverMesaFourPartyPaper(paper, `${signer.signerName} packet article`);
    expect(paper).toContain(signer.signerName);
    expect(paper).toMatch(new RegExp(signer.role, "i"));

    await session.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
    const typed = session.getByTestId("recipient-sign-typed-name");
    await typed.scrollIntoViewIfNeeded().catch(() => undefined);
    if (await typed.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await typed.fill(signer.syntheticSignature);
    }
    const consent = session.getByTestId("recipient-sign-consent");
    await consent.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(consent, `${signer.signerName} consent`).toBeVisible({ timeout: 15_000 });
    await consent.check();
    await expect(consent).toBeChecked();
    const action = session.locator('[data-testid="recipient-sign-action"]:visible');
    await action.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(action, `${signer.signerName} sign action`).toBeEnabled({ timeout: 20_000 });
    await action.click();
    await expect(
      session
        .getByTestId("recipient-sign-complete-status")
        .or(session.getByText(/Signed\. Confirmation saved\.|Your signature has been recorded\./i))
        .first(),
    ).toBeVisible({ timeout: 30_000 });

    await session.reload({ waitUntil: "domcontentloaded" });
    await expect(
      session
        .getByTestId("recipient-sign-complete-status")
        .or(session.getByText(/Signed\. Confirmation saved\.|Your signature has been recorded\./i))
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await session.context().close();

    const after = await fetchOwnerAgreement(page, seeded.agreementId);
    expect(after.signedParticipantIds).toContain(signer.partyId);
    expect(after.signedParticipantIds.filter((id) => id === signer.partyId)).toHaveLength(1);
    for (const prior of mapping.slice(0, index)) {
      expect(after.signedParticipantIds, `prior ${prior.signerName} must remain`).toContain(prior.partyId);
    }
    const last = index === mapping.length - 1;
    expect(after.signed, `${signer.signerName} after-sign complete flag`).toBe(last);
    expect(after.completedSigned, `${signer.signerName} after-sign completed_signed`).toBe(last);
    if (!last) {
      expect(after.receiptId, `${signer.signerName} must not mint a receipt yet`).toBe("");
    }
    expect(after.acceptedSnapshotId).toBe(seeded.snapshotId);
    expect(after.packetDigest).toBe(seeded.digest);
    expect(sha256Hex(after.packetCorpus)).toBe(seeded.digest);
    states.push({
      signer: signer.signerName,
      partyId: signer.partyId,
      signedIds: after.signedParticipantIds,
      complete: after.signed,
    });
  }

  const finalState = await fetchOwnerAgreement(page, seeded.agreementId);
  expect(finalState.signed).toBe(true);
  expect(finalState.completedSigned).toBe(true);
  expect(finalState.signedParticipantIds.sort()).toEqual(mapping.map((row) => row.partyId).sort());
  expect(finalState.signedParticipantIds).toHaveLength(4);
  expect(finalState.receiptId).toBeTruthy();
  expect(finalState.receipt, "completion receipt must exist").toBeTruthy();
  expect(finalState.receipt?.bound).toBe(true);
  expect(finalState.receipt?.acceptedSnapshotId).toBe(seeded.snapshotId);
  expect(finalState.receipt?.acceptedDigest).toBe(seeded.digest);
  expect(finalState.receipt?.lockedVersionId).toBe(finalState.lockVersionId);
  expect(finalState.receipt?.requiredParticipantIds.sort()).toEqual(mapping.map((row) => row.partyId).sort());
  assertSilverMesaFourPartyPaper(finalState.packetCorpus, "final packet article");

  await seedCorePaidJourneyOwner(page);
  await page.goto(`/app/agreements/${seeded.agreementId}/view-signed`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(page.getByTestId("owner-signed-agreement-page")).toBeVisible({ timeout: 30_000 });
  const authorDoc = page.getByTestId("owner-signed-agreement-document");
  await expect(authorDoc).toContainText(SILVER_MESA, { timeout: 30_000 });
  const authorText = await authorDoc.innerText();
  assertSilverMesaFourPartyPaper(authorText, "author reopen");
  await expect(page.getByTestId("owner-signed-agreement-signatures")).toContainText(/Fully signed \(4 of 4\)/);

  const olivia = mapping[0];
  const recipientReopen = await openIsolatedHref(
    browser,
    `/agreements/${seeded.agreementId}/sign?t=${encodeURIComponent(olivia.token)}`,
  );
  await expect(
    recipientReopen
      .getByText(/Signed\. Confirmation saved\.|Your signature has been recorded\.|Agreement fully executed/i)
      .first(),
  ).toBeVisible({ timeout: 45_000 });
  let recipientPaper = "";
  await expect
    .poll(
      async () => {
        recipientPaper = await silverMesaSigningViewText(recipientReopen);
        return recipientPaper.includes(SILVER_MESA) && recipientPaper.includes(ACCEPTED_NOTICE)
          ? recipientPaper.length
          : 0;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(recipientPaper, "recipient reopen");
  await recipientReopen.context().close();

  const persistDir =
    process.env.ACCEPTED_SIGNING_COMPLETION_OUTPUT ||
    join("..", "evals", "commercial-readiness", "results", "accepted-signing-completion", "local");
  mkdirSync(persistDir, { recursive: true });
  writeFileSync(
    join(persistDir, "silver-mesa-accepted-signing-completion.json"),
    JSON.stringify(
      {
        agreementId: seeded.agreementId,
        acceptedSnapshotId: seeded.snapshotId,
        acceptedDigest: seeded.digest,
        lockSnapshotId: finalState.lockSnapshotId,
        lockDigest: finalState.lockDigest,
        lockVersionId: finalState.lockVersionId,
        packetSnapshotId: finalState.packetSnapshotId,
        packetDigest: finalState.packetDigest,
        receiptId: finalState.receiptId,
        receipt: finalState.receipt,
        mapping: mapping.map((row) => ({
          partyId: row.partyId,
          signer: row.signerName,
          company: row.legalEntity,
          role: row.role,
        })),
        states,
      },
      null,
      2,
    ),
    "utf8",
  );
});
