/**
 * Seeded accepted-author signing preparation only.
 * Does not replay create, review-link minting, proposal, or acceptance UI.
 * Stops before applying any signature.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  captureRecipientMints,
  loadCorePaidJourneyRuntime,
  seedCorePaidJourneyOwner,
  type RecipientTokenEvent,
} from "./corePaidJourneyLiveAuth";
import {
  articleText,
  configuredLiveApiBase,
  fetchOwnerCanonicalSnapshot,
  waitForOwnerWorkspaceReady,
} from "./qualityEvalJourney";

const enabled = Boolean(process.env.CORE_PAID_JOURNEY_LIVE_API && process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN);
test.skip(!enabled, "Local official API/origin required; no provider calls");

const SILVER_MESA = "Silver Mesa Analytics LP";
const ORIGINAL_REVIEWER = "olivia.hart@silvermesaanalytics.com";
const ACCEPTED_NOTICE = "notices@silvermesaanalytics.com";
const STALE_ANON_ORG = "anon-8066d4a6aff6450c969ef2ee62043718";

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

function mintPartyId(event: RecipientTokenEvent | undefined): string {
  const req = event?.request && typeof event.request === "object" ? event.request : {};
  const body = event?.body && typeof event.body === "object" ? event.body : {};
  return String(
    (body as { recipient_party_id?: unknown }).recipient_party_id ||
      (req as { recipient_party_id?: unknown }).recipient_party_id ||
      "",
  ).trim();
}

function mintedTokenForParticipant(
  events: RecipientTokenEvent[],
  mode: "review" | "sign",
  participantId: string,
): RecipientTokenEvent | undefined {
  const pid = participantId.trim();
  if (!pid) return undefined;
  return [...events].reverse().find((row) => {
    const body = row.body && typeof row.body === "object" ? row.body : {};
    const req = row.request || {};
    return (
      row.ok &&
      String((body as { mode?: string }).mode || req.mode || "") === mode &&
      String((body as { token?: string }).token || "").length > 12 &&
      mintPartyId(row) === pid
    );
  });
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

async function fetchOwnerAgreement(page: Page, agreementId: string): Promise<{
  parties: PersistedParty[];
  acceptedSnapshotId: string;
  acceptedDigest: string;
  lockSnapshotId: string;
  lockDigest: string;
  packetSnapshotId: string;
  packetDigest: string;
  packetCorpus: string;
  packetRoles: Array<{
    entityName: string;
    partyId: string;
    signerName: string;
    signerEmail: string;
    requiresSignature: boolean;
  }>;
  auditTypes: string[];
  signed: boolean;
  completedSigned: boolean;
  receiptId: string;
}> {
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
          seed?: { corpusPlain?: string; corpusHash?: string };
          roles?: Array<{
            entityName?: string;
            partyName?: string;
            partyId?: string;
            vs01CounterpartyId?: string;
            signerName?: string;
            signerEmail?: string;
            requiresSignature?: boolean;
          }>;
          envelopeProvenance?: { acceptedSoTDigest?: string };
        };
      };
      audit_log?: Array<{ event_type?: string }>;
      completion_receipt_id?: string;
      receipt_id?: string;
    };
    signing_lock?: { accepted_snapshot_id?: string; accepted_snapshot_digest?: string };
    completed_signed?: boolean;
  };
  const parties = Array.isArray(body.draft?.parties) ? body.draft.parties : [];
  const accepted = body.draft?.accepted_review_snapshot_v1 || {};
  const lock = body.signing_lock || {};
  const packet = body.draft?.vs01_signing_packet_v1 || {};
  const portable = packet.portable || {};
  const seed = portable.seed || {};
  const roles = Array.isArray(portable.roles) ? portable.roles : [];
  const audit = Array.isArray(body.draft?.audit_log) ? body.draft.audit_log : [];
  const auditTypes = audit.map((row) => String(row.event_type || "").trim()).filter(Boolean);
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
    packetSnapshotId: String(packet.accepted_review_snapshot_id || "").trim(),
    packetDigest: String(
      packet.accepted_review_snapshot_digest || portable.envelopeProvenance?.acceptedSoTDigest || "",
    )
      .trim()
      .toLowerCase(),
    packetCorpus: String(seed.corpusPlain || ""),
    packetRoles: roles.map((role) => ({
      entityName: String(role.entityName || role.partyName || "").trim(),
      partyId: String(role.partyId || role.vs01CounterpartyId || "").trim(),
      signerName: String(role.signerName || "").trim(),
      signerEmail: String(role.signerEmail || "").trim(),
      requiresSignature: role.requiresSignature !== false,
    })),
    auditTypes,
    signed: auditTypes.includes("signed"),
    completedSigned: Boolean(body.completed_signed),
    receiptId: String(body.draft?.completion_receipt_id || body.draft?.receipt_id || "").trim(),
  };
}

async function seedAcceptedAgreement(page: Page): Promise<{
  agreementId: string;
  snapshotId: string;
  digest: string;
  corpus: string;
  parties: PersistedParty[];
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
  const createdBody = await created.json();
  const agreementId = String(createdBody.id || "").trim();
  expect(agreementId.length).toBeGreaterThan(8);

  const persisted = await fetchOwnerAgreement(page, agreementId);
  expect(persisted.parties).toHaveLength(4);
  for (const expected of SILVER_MESA_FOUR_PARTY) {
    const row = persisted.parties.find((party) => party.name === expected.legalEntity);
    expect(row, `${expected.legalEntity} must persist`).toBeTruthy();
    expect(isDurablePartyId(row!.id), `${expected.legalEntity} durable id, got ${row!.id}`).toBe(true);
    expect(row!.role).toBe(expected.role);
    expect(row!.signerName).toBe(expected.signerName);
    expect(row!.email.toLowerCase()).toBe(expected.email.toLowerCase());
  }

  const digest = sha256Hex(corpus);
  const posted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot`,
    {
      headers,
      data: {
        corpus_plain: corpus,
        generation_session_id: "accepted-signing-preparation",
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
        accepting_session: "accepted-signing-preparation",
      },
    },
  );
  expect(accepted.ok(), `snapshot-accept failed ${accepted.status()} ${await accepted.text()}`).toBeTruthy();
  return { agreementId, snapshotId, digest, corpus, parties: persisted.parties };
}

async function seedAuthorWithStaleAnonymousOrg(page: Page): Promise<void> {
  await seedCorePaidJourneyOwner(page);
  await page.addInitScript((anonOrg) => {
    try {
      localStorage.setItem("claw_org_id", anonOrg);
    } catch {
      /* ignore */
    }
  }, STALE_ANON_ORG);
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

async function clickPrepareForSigning(page: Page): Promise<void> {
  const prepare = page
    .locator('[data-testid="simple-pro-send-for-signature"]:not([disabled])')
    .or(page.getByRole("button", { name: /^Prepare for signing$/i }));
  await expect(prepare.first(), "Prepare for signing must be the real production CTA").toBeVisible({
    timeout: 45_000,
  });
  expect(
    await page.getByRole("button", { name: /Add signer details|Complete signer details/i }).first().isVisible().catch(() => false),
    "accepted reopen must not remount empty signer setup",
  ).toBeFalsy();
  await prepare.first().click({ timeout: 12_000 });
}

function assertNoSignatureApplied(state: { signed: boolean; completedSigned: boolean; receiptId: string; auditTypes: string[] }, label: string): void {
  expect(state.signed, `${label} must not create a signed audit event`).toBe(false);
  expect(state.completedSigned, `${label} must not mark completed_signed`).toBe(false);
  expect(state.receiptId, `${label} must not mint a completion receipt`).toBe("");
  expect(state.auditTypes, `${label} audit`).not.toContain("signed");
  expect(state.auditTypes, `${label} audit`).not.toContain("completion_receipt");
}

test("seeded accepted author prepare binds the packet and opens Olivia signer view without signing", async ({
  page,
  browser,
}) => {
  const seeded = await seedAcceptedAgreement(page);
  const acceptedGet = await fetchOwnerCanonicalSnapshot(page, seeded.agreementId);
  expect(acceptedGet.status).toBe("accepted");
  expect(acceptedGet.snapshotId).toBe(seeded.snapshotId);
  expect(acceptedGet.digest).toBe(seeded.digest);
  expect(acceptedGet.corpus).toContain(ACCEPTED_NOTICE);
  expect(acceptedGet.corpus).toContain(ORIGINAL_REVIEWER);
  assertSilverMesaFourPartyPaper(acceptedGet.corpus, "accepted GET");

  const minted = captureRecipientMints(page);
  await seedAuthorWithStaleAnonymousOrg(page);
  await page.goto(`/app/create?agreementId=${seeded.agreementId}`, { waitUntil: "domcontentloaded" });
  await waitForOwnerWorkspaceReady(page, seeded.agreementId);

  let painted = "";
  await expect
    .poll(
      async () => {
        painted = await articleText(page, SILVER_MESA);
        return painted.includes(ACCEPTED_NOTICE) && painted.includes(ORIGINAL_REVIEWER) ? painted.length : 0;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(painted, "reopened author article");

  await clickPrepareForSigning(page);

  let prepared: Awaited<ReturnType<typeof fetchOwnerAgreement>> | null = null;
  await expect
    .poll(
      async () => {
        prepared = await fetchOwnerAgreement(page, seeded.agreementId);
        const requiredRoles = prepared.packetRoles.filter((row) => row.requiresSignature !== false && row.partyId);
        if (!prepared.lockSnapshotId || !prepared.packetSnapshotId || requiredRoles.length !== 4) return 0;
        return requiredRoles.every((role) => mintedTokenForParticipant(minted, "sign", role.partyId)) ? 1 : 0;
      },
      { timeout: 60_000 },
    )
    .toBe(1);
  expect(prepared, "prepared signing handoff").toBeTruthy();
  const firstPrep = prepared!;

  expect(firstPrep.lockSnapshotId, "signing lock accepted_snapshot_id").toBe(seeded.snapshotId);
  expect(firstPrep.lockDigest, "signing lock accepted_snapshot_digest").toBe(seeded.digest);
  expect(firstPrep.packetSnapshotId, "packet accepted_review_snapshot_id").toBe(seeded.snapshotId);
  expect(firstPrep.packetDigest, "packet accepted_review_snapshot_digest").toBe(seeded.digest);
  expect(firstPrep.packetCorpus.length, "packet corpus must live in the packet").toBeGreaterThan(400);
  expect(sha256Hex(firstPrep.packetCorpus), "packet corpus hash").toBe(seeded.digest);
  assertSilverMesaFourPartyPaper(firstPrep.packetCorpus, "signing packet");

  const requiredRoles = firstPrep.packetRoles.filter((row) => row.requiresSignature !== false);
  expect(requiredRoles).toHaveLength(4);
  const mapping = SILVER_MESA_FOUR_PARTY.map((expected) => {
    const persisted = seeded.parties.find((party) => party.name === expected.legalEntity)!;
    const role = requiredRoles.find((row) => row.entityName.includes(expected.legalEntity));
    expect(role?.partyId, `${expected.legalEntity} packet party id`).toBe(persisted.id);
    expect(role?.signerName, `${expected.legalEntity} packet signer`).toBe(expected.signerName);
    expect(String(role?.signerEmail || "").toLowerCase(), `${expected.legalEntity} packet email`).toBe(
      expected.email.toLowerCase(),
    );
    const mint = mintedTokenForParticipant(minted, "sign", persisted.id);
    expect(mint, `${expected.legalEntity} usable sign token`).toBeTruthy();
    expect(mintPartyId(mint), `${expected.legalEntity} mint recipient_party_id`).toBe(persisted.id);
    expect(String((mint?.request as { mode?: string } | undefined)?.mode || (mint?.body as { mode?: string }).mode)).toBe(
      "sign",
    );
    return {
      company: expected.legalEntity,
      role: expected.role,
      partyId: persisted.id,
      signer: expected.signerName,
      email: expected.email,
      token: String((mint?.body as { token?: string } | undefined)?.token || ""),
    };
  });
  expect(mapping.every((row) => row.token.length > 12)).toBe(true);

  const signMints = minted.filter((row) => {
    const body = row.body && typeof row.body === "object" ? row.body : {};
    const req = row.request || {};
    return row.ok && String((body as { mode?: string }).mode || req.mode || "") === "sign";
  });
  const mintedPartyIds = [...new Set(signMints.map((row) => mintPartyId(row)).filter(Boolean))];
  expect(mintedPartyIds.sort()).toEqual(mapping.map((row) => row.partyId).sort());

  const prepareAgain = page
    .locator('[data-testid="simple-pro-send-for-signature"]:not([disabled])')
    .or(page.getByRole("button", { name: /^Prepare for signing$/i }));
  if (await prepareAgain.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
    await prepareAgain.first().click({ timeout: 12_000 });
  }
  await expect
    .poll(async () => {
      const again = await fetchOwnerAgreement(page, seeded.agreementId);
      return again.lockSnapshotId === seeded.snapshotId && again.packetSnapshotId === seeded.snapshotId && again.packetDigest === seeded.digest
        ? 1
        : 0;
    }, { timeout: 30_000 })
    .toBe(1);
  const reused = await fetchOwnerAgreement(page, seeded.agreementId);
  expect(reused.lockSnapshotId).toBe(seeded.snapshotId);
  expect(reused.lockDigest).toBe(seeded.digest);
  expect(reused.packetSnapshotId).toBe(seeded.snapshotId);
  expect(reused.packetDigest).toBe(seeded.digest);
  expect(sha256Hex(reused.packetCorpus)).toBe(seeded.digest);

  const olivia = mapping.find((row) => row.company === SILVER_MESA)!;
  expect(olivia.email).toBe(ORIGINAL_REVIEWER);
  const signerSession = await openIsolatedHref(
    browser,
    `/agreements/${seeded.agreementId}/sign?t=${encodeURIComponent(olivia.token)}`,
  );
  let chrome = "";
  await expect
    .poll(
      async () => {
        chrome = await signerSession.locator("body").innerText();
        if (/invalid or expired|cannot be used/i.test(chrome)) return -1;
        return /Olivia Hart/i.test(chrome) && chrome.includes(SILVER_MESA) ? 1 : 0;
      },
      { timeout: 45_000 },
    )
    .toBe(1);
  expect(chrome, "fresh signer chrome must identify Olivia").toMatch(/Olivia Hart/i);
  expect(chrome, "fresh signer chrome must keep Olivia access email").toContain(ORIGINAL_REVIEWER);
  expect(chrome, "fresh signer chrome must identify Silver Mesa").toContain(SILVER_MESA);

  let signerPaper = "";
  await expect
    .poll(
      async () => {
        signerPaper = await silverMesaSigningViewText(signerSession);
        return signerPaper.includes(SILVER_MESA) && signerPaper.includes(ACCEPTED_NOTICE) ? signerPaper.length : 0;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(signerPaper, "fresh Olivia signer view");
  expect(signerPaper).toContain("Olivia Hart");
  expect(signerPaper).toContain("Analyst");

  await signerSession.reload({ waitUntil: "domcontentloaded" });
  let reloaded = "";
  await expect
    .poll(
      async () => {
        reloaded = await silverMesaSigningViewText(signerSession);
        return reloaded.includes(SILVER_MESA) && reloaded.includes(ACCEPTED_NOTICE) ? reloaded.length : 0;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(400);
  assertSilverMesaFourPartyPaper(reloaded, "reloaded Olivia signer view");
  expect(reloaded).toContain("Olivia Hart");

  const adopt = signerSession.getByRole("button", { name: /Adopt|Apply signature|Submit signature|Sign and finish/i });
  expect(await adopt.first().isVisible().catch(() => false), "must stop before adopting a signature").toBeFalsy();
  await signerSession.context().close();

  const afterSigner = await fetchOwnerAgreement(page, seeded.agreementId);
  assertNoSignatureApplied(firstPrep, "after first prepare");
  assertNoSignatureApplied(reused, "after repeated prepare");
  assertNoSignatureApplied(afterSigner, "after Olivia signer view");
  expect(afterSigner.lockSnapshotId).toBe(seeded.snapshotId);
  expect(afterSigner.packetSnapshotId).toBe(seeded.snapshotId);

  const persistDir =
    process.env.ACCEPTED_SIGNING_PREP_OUTPUT ||
    join("..", "evals", "commercial-readiness", "results", "accepted-signing-preparation", "local");
  mkdirSync(persistDir, { recursive: true });
  writeFileSync(
    join(persistDir, "silver-mesa-accepted-signing-preparation.json"),
    JSON.stringify(
      {
        agreementId: seeded.agreementId,
        acceptedSnapshotId: seeded.snapshotId,
        acceptedDigest: seeded.digest,
        lockSnapshotId: afterSigner.lockSnapshotId,
        lockDigest: afterSigner.lockDigest,
        packetSnapshotId: afterSigner.packetSnapshotId,
        packetDigest: afterSigner.packetDigest,
        packetCorpusSha256: sha256Hex(afterSigner.packetCorpus),
        mapping,
        signed: afterSigner.signed,
        receiptId: afterSigner.receiptId,
      },
      null,
      2,
    ),
    "utf8",
  );
});
