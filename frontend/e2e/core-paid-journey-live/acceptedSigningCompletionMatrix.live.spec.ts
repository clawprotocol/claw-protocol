/**
 * Seeded 2-/3-/4-party signing completion matrix.
 * Does not replay create/review/proposal/acceptance UI. Local stub/replay only.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadCorePaidJourneyRuntime, seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";
import {
  articleText,
  configuredLiveApiBase,
  extractCompletedPdfText,
  openFreshAuthorCreatePage,
} from "./qualityEvalJourney";

const enabled = Boolean(process.env.CORE_PAID_JOURNEY_LIVE_API && process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN);
test.skip(!enabled, "Local official API/origin required; no provider calls");

type FixtureParty = {
  legalEntity: string;
  role: string;
  signerName: string;
  email: string;
};

const TWO_PARTY: FixtureParty[] = [
  {
    legalEntity: "Harbor Peak Analytics LLC",
    role: "Consultant",
    signerName: "Pat Harbor",
    email: "pat.harbor@harbor.test",
  },
  {
    legalEntity: "Ironvale Manufacturing Inc.",
    role: "Client",
    signerName: "Sam Ironvale",
    email: "sam.ironvale@ironvale.test",
  },
];

const THREE_PARTY: FixtureParty[] = [
  ...TWO_PARTY,
  {
    legalEntity: "Alex Rivera",
    role: "Advisor",
    signerName: "Alex Rivera",
    email: "alex.rivera@advisor.test",
  },
];

const SILVER_MESA_FOUR_PARTY: FixtureParty[] = [
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
    legalEntity: "Silver Mesa Analytics LP",
    role: "Analyst",
    signerName: "Olivia Hart",
    email: "olivia.hart@silvermesaanalytics.com",
  },
];

const HARBOR_NOTICE = "notices@harborpeak.test";
const SILVER_NOTICE = "notices@silvermesaanalytics.com";
const MOBILE = { width: 390, height: 844 };

function ownerHeaders() {
  const runtime = loadCorePaidJourneyRuntime();
  return {
    Authorization: `Bearer ${runtime.access_token}`,
    "X-Claw-Org-Id": runtime.org_id,
    "Content-Type": "application/json",
  };
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

function isDurablePartyId(id: string): boolean {
  const value = id.trim();
  if (!value || value.startsWith("legacy_")) return false;
  if (/^party_\d+$/i.test(value)) return false;
  if (/^party_[0-9a-f]+:[0-9a-f]+$/i.test(value)) return false;
  return true;
}

function twoPartyPaper(): string {
  const body = [
    "CONSULTING SERVICES AGREEMENT",
    'This Consulting Services Agreement is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
    "Consultant shall perform AI workflow implementation. Client shall pay a fixed fee of $48,000.",
    "The initial term is twelve (12) months beginning October 1, 2026.",
    "This Agreement is governed by the laws of the State of Delaware.",
    "If to Harbor Peak Analytics LLC: Email: notices@harborpeak.test.",
    "Access remains pat.harbor@harbor.test and is not the Harbor notice address.",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "Harbor Peak Analytics LLC",
    "By: ______________________",
    "Name: Pat Harbor",
    "Ironvale Manufacturing Inc.",
    "By: ______________________",
    "Name: Sam Ironvale",
  ].join("\n");
  return `${body}\n${"Operative consulting paragraph continues the Harbor Consultant and Ironvale Client engagement. ".repeat(80)}`.trim();
}

function threePartyPaper(): string {
  const body = [
    "CONSULTING SERVICES AGREEMENT",
    'This Consulting Services Agreement is entered into by and among Harbor Peak Analytics LLC ("Consultant"), Ironvale Manufacturing Inc. ("Client"), and Alex Rivera ("Advisor").',
    "Consultant shall perform AI workflow implementation. Client shall pay a fixed fee of $48,000. Advisor remains a distinct legal party.",
    "The initial term is twelve (12) months beginning October 1, 2026.",
    "This Agreement is governed by the laws of the State of Delaware.",
    "If to Harbor Peak Analytics LLC: Email: notices@harborpeak.test.",
    "Access remains pat.harbor@harbor.test and is not the Harbor notice address.",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "Harbor Peak Analytics LLC",
    "By: ______________________",
    "Name: Pat Harbor",
    "Ironvale Manufacturing Inc.",
    "By: ______________________",
    "Name: Sam Ironvale",
    "Alex Rivera",
    "By: ______________________",
    "Name: Alex Rivera",
  ].join("\n");
  return `${body}\n${"Operative consulting paragraph continues the Harbor, Ironvale, and Advisor engagement. ".repeat(80)}`.trim();
}

function silverMesaPaper(): string {
  const body = [
    "JOINT AI SOFTWARE ROLLOUT AGREEMENT",
    'This Agreement is among Ironclad Systems Group LLC ("Sponsor"), Harborline Data Solutions Inc. ("Vendor"), Northwind Automation Partners LLC ("Integrator"), and Silver Mesa Analytics LP ("Analyst").',
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

function assertHarborPaper(text: string, label: string, partyCount: 2 | 3): void {
  expect(text.length, `${label} operative`).toBeGreaterThan(400);
  expect(text, `${label} Harbor`).toContain("Harbor Peak Analytics LLC");
  expect(text, `${label} Ironvale`).toContain("Ironvale Manufacturing Inc.");
  expect(text, `${label} Consultant`).toMatch(/Consultant/i);
  expect(text, `${label} Client`).toMatch(/Client/i);
  expect(text, `${label} Delaware`).toContain("Delaware");
  expect(text, `${label} fee`).toContain("$48,000");
  expect(text, `${label} notice`).toContain(HARBOR_NOTICE);
  expect(text, `${label} no suffix dup`).not.toMatch(/LLC\s+LLC|Inc\.\s+Inc\./);
  expect(text, `${label} no invented Effective Date`).not.toMatch(
    /The "Effective Date" is the date on which the Agreement has been fully executed/i,
  );
  if (partyCount === 2) {
    expect(text, `${label} no Advisor rewrite`).not.toMatch(/\bAdvisor\b/);
  } else {
    expect(text, `${label} Advisor`).toContain("Alex Rivera");
    expect(text, `${label} Advisor role`).toMatch(/Advisor/i);
  }
}

function assertSilverPaper(text: string, label: string): void {
  expect(text.length, `${label} operative`).toBeGreaterThan(400);
  expect(text).toContain("Ironclad Systems Group LLC");
  expect(text).toContain("Harborline Data Solutions Inc.");
  expect(text).toContain("Northwind Automation Partners LLC");
  expect(text).toContain("Silver Mesa Analytics LP");
  expect(text).toMatch(/Sponsor/i);
  expect(text).toMatch(/Vendor/i);
  expect(text).toMatch(/Integrator/i);
  expect(text).toMatch(/Analyst/i);
  expect(text).toContain("Texas");
  expect(text).toContain("$187,500");
  expect(text).toMatch(/24 months/i);
  expect(text).toContain("78701");
  expect(text).toContain(SILVER_NOTICE);
  expect(text).toContain("olivia.hart@silvermesaanalytics.com");
  expect(text).not.toMatch(/LP\s+LP/i);
  expect(text).not.toMatch(/The "Effective Date" is the date on which the Agreement has been fully executed/i);
  expect(text).not.toMatch(/\b(?:Client|Service Provider|Consultant)\b/i);
}

type OwnerAgreementState = {
  parties: Array<{ id: string; name: string; role: string; email: string; signerName: string }>;
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
  expect(res.ok(), `owner GET ${res.status()} ${await res.text()}`).toBeTruthy();
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

async function seedAcceptedPreparedPacket(
  page: Page,
  args: {
    title: string;
    jurisdiction: string;
    purpose: string;
    payment: string;
    duration: string;
    parties: FixtureParty[];
    corpus: string;
    session: string;
  },
) {
  const api = configuredLiveApiBase();
  const headers = ownerHeaders();
  const created = await page.request.post(`${api}/api/agreements/draft`, {
    headers,
    data: {
      title: args.title,
      jurisdiction: args.jurisdiction,
      parties: args.parties.map((party) => ({
        name: party.legalEntity,
        role: party.role,
        email: party.email,
        signerName: party.signerName,
      })),
      purpose: args.purpose,
      payment_terms: args.payment,
      duration: args.duration,
    },
  });
  expect(created.ok(), `draft ${created.status()} ${await created.text()}`).toBeTruthy();
  const agreementId = String((await created.json()).id || "").trim();
  const persisted = await fetchOwnerAgreement(page, agreementId);
  expect(persisted.parties).toHaveLength(args.parties.length);
  for (const expected of args.parties) {
    const row = persisted.parties.find((party) => party.name === expected.legalEntity);
    expect(row, expected.legalEntity).toBeTruthy();
    expect(isDurablePartyId(row!.id)).toBe(true);
    expect(row!.role).toBe(expected.role);
    expect(row!.signerName).toBe(expected.signerName);
    expect(row!.email).toBe(expected.email);
  }

  const digest = sha256Hex(args.corpus);
  const posted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot`,
    {
      headers,
      data: {
        corpus_plain: args.corpus,
        generation_session_id: args.session,
        claimed_digest: digest,
      },
    },
  );
  expect(posted.ok(), `snapshot ${posted.status()} ${await posted.text()}`).toBeTruthy();
  const snapshotId = String((await posted.json()).snapshot?.snapshot_id || "").trim();
  const accepted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot/accept`,
    {
      headers,
      data: {
        snapshot_id: snapshotId,
        expected_digest: digest,
        expected_accepted_snapshot_id: "",
        accepting_session: args.session,
      },
    },
  );
  expect(accepted.ok(), `accept ${accepted.status()} ${await accepted.text()}`).toBeTruthy();
  await page.request.post(`${api}/api/agreements/${encodeURIComponent(agreementId)}/update-field`, {
    headers,
    data: { field: "owner_delivery_track", value: "signature" },
  });
  const lockVersionId = `lv_${agreementId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
  const lock = await page.request.put(`${api}/api/agreements/${encodeURIComponent(agreementId)}/signing-lock`, {
    headers,
    data: {
      locked_version_id: lockVersionId,
      locked_at: new Date().toISOString(),
      locked_by: "owner",
    },
  });
  expect(lock.ok(), `lock ${lock.status()} ${await lock.text()}`).toBeTruthy();
  const corpusHash = fingerprintAgreementBody(args.corpus);
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
    agreementSessionId: `matrix_${agreementId}`,
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
        packet_revision: `matrix_${snapshotId}`,
        document_id: `matrix_pkt_${agreementId}`,
        portable_packet: {
          v: 1,
          seed: {
            v: 1,
            documentId: `matrix_pkt_${agreementId}`,
            agreementId,
            corpusPlain: args.corpus,
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
  expect(sent.ok(), `packet ${sent.status()} ${await sent.text()}`).toBeTruthy();
  const tokens: Record<string, string> = {};
  for (const party of persisted.parties) {
    const minted = await page.request.post(
      `${api}/api/agreements/${encodeURIComponent(agreementId)}/recipient-access-token`,
      {
        headers,
        data: { mode: "sign", role: "signer", recipient_party_id: party.id },
      },
    );
    expect(minted.ok(), `mint ${party.name} ${minted.status()}`).toBeTruthy();
    tokens[party.id] = String((await minted.json()).token || "").trim();
  }
  const prepared = await fetchOwnerAgreement(page, agreementId);
  expect(prepared.acceptedSnapshotId).toBe(snapshotId);
  expect(prepared.acceptedDigest).toBe(digest);
  expect(prepared.lockSnapshotId).toBe(snapshotId);
  expect(prepared.lockDigest).toBe(digest);
  expect(prepared.packetSnapshotId).toBe(snapshotId);
  expect(prepared.packetDigest).toBe(digest);
  expect(prepared.packetCorpus.length).toBeGreaterThan(400);
  expect(sha256Hex(prepared.packetCorpus)).toBe(digest);
  expect(prepared.signedParticipantIds).toEqual([]);
  expect(prepared.receipt).toBeNull();
  return { agreementId, snapshotId, digest, corpus: args.corpus, lockVersionId, parties: persisted.parties, tokens };
}

async function openIsolatedHref(
  browser: Browser,
  href: string,
  viewport: { width: number; height: number },
): Promise<Page> {
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width < 640,
    hasTouch: viewport.width < 640,
  });
  const recipient = await context.newPage();
  recipient.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await recipient.goto(href, { waitUntil: "domcontentloaded" });
  return recipient;
}

async function packetViewText(page: Page, cue: string): Promise<string> {
  const canonical = page.getByTestId("vs01-recipient-canonical-render");
  if (await canonical.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await expect(canonical).toContainText(cue, { timeout: 30_000 });
    return canonical.innerText();
  }
  const shell = page.getByTestId("recipient-document-shell");
  if (await shell.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await expect(shell).toContainText(cue, { timeout: 30_000 });
    return shell.innerText();
  }
  return page.locator("body").innerText();
}

async function completeMatrixRow(
  page: Page,
  browser: Browser,
  args: {
    name: string;
    parties: FixtureParty[];
    signOrder: string[];
    corpus: string;
    title: string;
    jurisdiction: string;
    purpose: string;
    payment: string;
    duration: string;
    viewport: { width: number; height: number };
    assertPaper: (text: string, label: string) => void;
    cue: string;
  },
) {
  const seeded = await seedAcceptedPreparedPacket(page, {
    title: args.title,
    jurisdiction: args.jurisdiction,
    purpose: args.purpose,
    payment: args.payment,
    duration: args.duration,
    parties: args.parties,
    corpus: args.corpus,
    session: `matrix-${args.name}`,
  });
  const author = await openFreshAuthorCreatePage({
    browser,
    agreementId: seeded.agreementId,
    viewport: args.viewport,
    partyCue: args.cue,
  });
  args.assertPaper(await articleText(author, args.cue), `${args.name} owner reopen`);
  await author.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(async () => ((await articleText(author, args.cue)).includes(args.cue) ? 1 : 0), { timeout: 60_000 })
    .toBe(1);
  args.assertPaper(await articleText(author, args.cue), `${args.name} owner reload`);
  const reloaded = await fetchOwnerAgreement(author, seeded.agreementId);
  expect(reloaded.parties.map((party) => party.id)).toEqual(seeded.parties.map((party) => party.id));
  expect(reloaded.parties.map((party) => party.name)).toEqual(seeded.parties.map((party) => party.name));
  expect(reloaded.parties.map((party) => party.role)).toEqual(seeded.parties.map((party) => party.role));
  expect(reloaded.parties.map((party) => party.email)).toEqual(seeded.parties.map((party) => party.email));
  expect(reloaded.parties.map((party) => party.signerName)).toEqual(seeded.parties.map((party) => party.signerName));
  expect(reloaded.acceptedSnapshotId).toBe(seeded.snapshotId);
  expect(reloaded.acceptedDigest).toBe(seeded.digest);
  await author.context().close();
  const mapping = args.signOrder.map((signerName) => {
    const expected = args.parties.find((party) => party.signerName === signerName)!;
    const persisted = seeded.parties.find((party) => party.name === expected.legalEntity)!;
    return {
      ...expected,
      partyId: persisted.id,
      token: seeded.tokens[persisted.id],
      syntheticSignature: `TEST-SIGNATURE ${signerName}`,
    };
  });
  const steps: Array<{
    signer: string;
    partyId: string;
    signedCount: number;
    receipt: boolean;
    complete: boolean;
  }> = [];

  for (const [index, signer] of mapping.entries()) {
    const session = await openIsolatedHref(
      browser,
      `/agreements/${seeded.agreementId}/sign?t=${encodeURIComponent(signer.token)}`,
      args.viewport,
    );
    if (args.viewport.width < 640) {
      expect(session.viewportSize()).toEqual(MOBILE);
    }
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
    expect(chrome).toMatch(new RegExp(signer.role, "i"));

    let paper = "";
    await expect
      .poll(
        async () => {
          paper = await packetViewText(session, args.cue);
          return paper.includes(args.cue) ? paper.length : 0;
        },
        { timeout: 90_000 },
      )
      .toBeGreaterThan(400);
    args.assertPaper(paper, `${args.name} ${signer.signerName} packet`);

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
    await expect(action).toHaveCount(1);
    await action.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(action, `${signer.signerName} visible sign control`).toBeEnabled({ timeout: 20_000 });
    const box = await action.boundingBox();
    expect(box, `${signer.signerName} sign control on viewport`).toBeTruthy();
    if (box && args.viewport.width < 640) {
      expect(box.y + box.height).toBeLessThanOrEqual(args.viewport.height + 8);
    }
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
      expect(after.signedParticipantIds).toContain(prior.partyId);
    }
    const last = index === mapping.length - 1;
    expect(after.signed).toBe(last);
    expect(after.completedSigned).toBe(last);
    if (!last) expect(after.receiptId).toBe("");
    expect(after.acceptedSnapshotId).toBe(seeded.snapshotId);
    expect(after.packetDigest).toBe(seeded.digest);
    expect(sha256Hex(after.packetCorpus)).toBe(seeded.digest);
    steps.push({
      signer: signer.signerName,
      partyId: signer.partyId,
      signedCount: after.signedParticipantIds.length,
      receipt: Boolean(after.receiptId),
      complete: after.signed,
    });
  }

  const finalState = await fetchOwnerAgreement(page, seeded.agreementId);
  expect(finalState.signedParticipantIds).toHaveLength(args.parties.length);
  expect(finalState.signedParticipantIds.sort()).toEqual(mapping.map((row) => row.partyId).sort());
  expect(finalState.receiptId).toBeTruthy();
  expect(finalState.receipt?.bound).toBe(true);
  expect(finalState.receipt?.acceptedSnapshotId).toBe(seeded.snapshotId);
  expect(finalState.receipt?.acceptedDigest).toBe(seeded.digest);
  expect(finalState.receipt?.lockedVersionId).toBe(finalState.lockVersionId);
  expect(finalState.receipt?.requiredParticipantIds.sort()).toEqual(mapping.map((row) => row.partyId).sort());
  args.assertPaper(finalState.packetCorpus, `${args.name} final packet`);

  await seedCorePaidJourneyOwner(page);
  await page.goto(`/app/agreements/${seeded.agreementId}/view-signed`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(page.getByTestId("owner-signed-agreement-page")).toBeVisible({ timeout: 30_000 });
  const authorText = await page.getByTestId("owner-signed-agreement-document").innerText();
  args.assertPaper(authorText, `${args.name} author reopen`);
  await expect(page.getByTestId("owner-signed-agreement-signatures")).toContainText(
    new RegExp(`Fully signed \\(${args.parties.length} of ${args.parties.length}\\)`),
  );
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("owner-signed-agreement-download-pdf").click();
  const download = await downloadPromise;
  const pdfDir =
    process.env.ACCEPTED_SIGNING_COMPLETION_MATRIX_OUTPUT ||
    join("..", "evals", "commercial-readiness", "results", "accepted-signing-completion-matrix", "local");
  mkdirSync(pdfDir, { recursive: true });
  const pdfPath = join(pdfDir, `${args.name}-completed.pdf`);
  await download.saveAs(pdfPath);
  args.assertPaper(extractCompletedPdfText(pdfPath), `${args.name} completed PDF`);

  const first = mapping[0];
  const reopen = await openIsolatedHref(
    browser,
    `/agreements/${seeded.agreementId}/sign?t=${encodeURIComponent(first.token)}`,
    args.viewport,
  );
  await expect(
    reopen
      .getByText(/Signed\. Confirmation saved\.|Your signature has been recorded\.|Agreement fully executed/i)
      .first(),
  ).toBeVisible({ timeout: 45_000 });
  let reopenPaper = "";
  await expect
    .poll(
      async () => {
        reopenPaper = await packetViewText(reopen, args.cue);
        return reopenPaper.includes(args.cue) ? reopenPaper.length : 0;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(400);
  args.assertPaper(reopenPaper, `${args.name} signer reopen`);
  await reopen.context().close();

  const persistDir =
    process.env.ACCEPTED_SIGNING_COMPLETION_MATRIX_OUTPUT ||
    join("..", "evals", "commercial-readiness", "results", "accepted-signing-completion-matrix", "local");
  mkdirSync(persistDir, { recursive: true });
  writeFileSync(
    join(persistDir, `${args.name}.json`),
    JSON.stringify(
      {
        name: args.name,
        agreementId: seeded.agreementId,
        snapshotId: seeded.snapshotId,
        digest: seeded.digest,
        lockVersionId: finalState.lockVersionId,
        receiptId: finalState.receiptId,
        receipt: finalState.receipt,
        viewport: args.viewport,
        mapping: mapping.map((row) => ({
          partyId: row.partyId,
          signer: row.signerName,
          company: row.legalEntity,
          role: row.role,
        })),
        steps,
      },
      null,
      2,
    ),
  );
  return { seeded, finalState, steps };
}

test("two-party Harbor/Ironvale desktop completes 2/2 with one bound receipt", async ({ page, browser }) => {
  const result = await completeMatrixRow(page, browser, {
    name: "two-party-desktop",
    parties: TWO_PARTY,
    signOrder: ["Pat Harbor", "Sam Ironvale"],
    corpus: twoPartyPaper(),
    title: "Consulting Services Agreement",
    jurisdiction: "Delaware",
    purpose: "Harbor Consultant / Ironvale Client AI workflow implementation",
    payment: "$48,000",
    duration: "12 months",
    viewport: { width: 1280, height: 800 },
    cue: "Harbor Peak Analytics LLC",
    assertPaper: (text, label) => assertHarborPaper(text, label, 2),
  });
  expect(result.steps.map((step) => step.signedCount)).toEqual([1, 2]);
  expect(result.steps.map((step) => step.receipt)).toEqual([false, true]);
});

test("three-party Harbor/Ironvale/Advisor desktop completes 3/3 with one bound receipt", async ({
  page,
  browser,
}) => {
  const result = await completeMatrixRow(page, browser, {
    name: "three-party-desktop",
    parties: THREE_PARTY,
    signOrder: ["Pat Harbor", "Sam Ironvale", "Alex Rivera"],
    corpus: threePartyPaper(),
    title: "Consulting Services Agreement",
    jurisdiction: "Delaware",
    purpose: "Harbor Consultant / Ironvale Client / Alex Rivera Advisor",
    payment: "$48,000",
    duration: "12 months",
    viewport: { width: 1280, height: 800 },
    cue: "Alex Rivera",
    assertPaper: (text, label) => assertHarborPaper(text, label, 3),
  });
  expect(result.steps.map((step) => step.signedCount)).toEqual([1, 2, 3]);
  expect(result.steps.map((step) => step.receipt)).toEqual([false, false, true]);
});

test("Silver Mesa four-party mobile completes 4/4 with one bound receipt", async ({ page, browser }) => {
  const result = await completeMatrixRow(page, browser, {
    name: "four-party-mobile",
    parties: SILVER_MESA_FOUR_PARTY,
    signOrder: ["Olivia Hart", "Ethan Cole", "Maya Bennett", "Lucas Reed"],
    corpus: silverMesaPaper(),
    title: "Joint AI Software Rollout Agreement",
    jurisdiction: "Texas",
    purpose: "four-party Texas joint AI software rollout",
    payment: "$187,500 over six milestones",
    duration: "24 months",
    viewport: MOBILE,
    cue: "Silver Mesa Analytics LP",
    assertPaper: (text, label) => assertSilverPaper(text, label),
  });
  expect(result.steps.map((step) => step.signedCount)).toEqual([1, 2, 3, 4]);
  expect(result.steps.map((step) => step.receipt)).toEqual([false, false, false, true]);
});
