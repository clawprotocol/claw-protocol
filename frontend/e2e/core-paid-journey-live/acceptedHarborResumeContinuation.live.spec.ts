import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  articleText,
  configuredLiveApiBase,
  continueAcceptedHarborThroughPdf,
  HARBOR_STAGE_TIMEOUT_MS,
  openFreshAuthorCreatePage,
} from "./qualityEvalJourney";
import { loadCorePaidJourneyRuntime } from "./corePaidJourneyLiveAuth";

const enabled =
  process.env.QUALITY_EVAL_OFFLINE_JOURNEY === "1" || process.env.CLAW_QUALITY_EVAL_LIVE === "1";
test.skip(!enabled, "Isolated stub Harbor continuation only");

const RESULT_DIR = process.env.QUALITY_EVAL_RESULT_DIR || "";
type HarborSeed = {
  agreement_id: string;
  snapshot_id: string;
  digest: string;
  corpus_length?: number;
  parties?: Array<Record<string, unknown>>;
};

const seedPath = RESULT_DIR ? join(RESULT_DIR, "seeded-agreement.json") : "";
const persistedSeed = seedPath && existsSync(seedPath)
  ? (JSON.parse(readFileSync(seedPath, "utf8")) as HarborSeed)
  : null;

function ownerHeaders() {
  const runtime = loadCorePaidJourneyRuntime();
  return {
    Authorization: `Bearer ${runtime.access_token}`,
    "X-Claw-Org-Id": runtime.org_id,
    "Content-Type": "application/json",
  };
}

async function seedFreshAcceptedHarbor(page: import("@playwright/test").Page): Promise<HarborSeed> {
  const sourcePath = String(process.env.HARBOR_ACCEPTED_SOURCE_DRAFT || "").trim();
  expect(sourcePath, "HARBOR_ACCEPTED_SOURCE_DRAFT is required for a fresh replay").toBeTruthy();
  const source = JSON.parse(readFileSync(sourcePath, "utf8")) as {
    accepted_review_snapshot_v1?: { corpusPlain?: string; corpusSha256?: string };
  };
  const corpus = String(source.accepted_review_snapshot_v1?.corpusPlain || "");
  const digest = createHash("sha256").update(corpus).digest("hex");
  expect(corpus.length).toBe(3_085);
  expect(digest).toBe(String(source.accepted_review_snapshot_v1?.corpusSha256 || "").toLowerCase());

  const api = configuredLiveApiBase();
  const headers = ownerHeaders();
  const created = await page.request.post(`${api}/api/agreements/draft`, {
    headers,
    data: {
      title: "Consulting Services Agreement",
      jurisdiction: "Delaware",
      purpose: "AI workflow implementation",
      payment_terms: "$48,000 fixed fee",
      duration: "12 months",
      parties: [
        {
          name: "Harbor Peak Analytics LLC",
          role: "owner",
          email: "maya.chen@harborpeak.test",
          signerName: "Maya Chen",
        },
        {
          name: "Ironvale Manufacturing Inc.",
          role: "reviewer",
          email: "jordan.hale@ironvale.test",
          signerName: "Jordan Hale",
        },
      ],
    },
  });
  expect(created.ok(), `fresh Harbor draft create ${created.status()} ${await created.text()}`).toBeTruthy();
  const agreementId = String(((await created.json()) as { id?: string }).id || "").trim();
  expect(agreementId.length).toBeGreaterThan(8);

  const posted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot`,
    {
      headers,
      data: {
        corpus_plain: corpus,
        generation_session_id: "harbor-fresh-lifecycle",
        claimed_digest: digest,
      },
    },
  );
  expect(posted.ok(), `fresh Harbor snapshot create ${posted.status()} ${await posted.text()}`).toBeTruthy();
  const postedBody = (await posted.json()) as {
    snapshot?: { snapshot_id?: string; corpus_sha256?: string };
  };
  const snapshotId = String(postedBody.snapshot?.snapshot_id || "").trim();
  expect(snapshotId).toBeTruthy();
  expect(String(postedBody.snapshot?.corpus_sha256 || "").toLowerCase()).toBe(digest);

  const accepted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot/accept`,
    {
      headers,
      data: {
        snapshot_id: snapshotId,
        expected_digest: digest,
        expected_accepted_snapshot_id: "",
        accepting_session: "harbor-fresh-lifecycle",
      },
    },
  );
  expect(accepted.ok(), `fresh Harbor snapshot accept ${accepted.status()} ${await accepted.text()}`).toBeTruthy();

  const owner = await page.request.get(`${api}/api/agreements/${encodeURIComponent(agreementId)}`, {
    headers,
  });
  expect(owner.ok(), `fresh Harbor owner GET ${owner.status()} ${await owner.text()}`).toBeTruthy();
  const ownerBody = (await owner.json()) as {
    draft?: { parties?: Array<Record<string, unknown>> };
  };
  const parties = ownerBody.draft?.parties || [];
  expect(parties).toHaveLength(2);
  expect(parties.every((party) => String(party.id || "").trim().length > 8)).toBe(true);

  const freshSeed: HarborSeed = {
    agreement_id: agreementId,
    snapshot_id: snapshotId,
    digest,
    corpus_length: corpus.length,
    parties,
  };
  if (seedPath) writeFileSync(seedPath, `${JSON.stringify(freshSeed, null, 2)}\n`, "utf8");
  return freshSeed;
}

test("fresh accepted Harbor resume paints review then completes PDF", async ({ page: seedPage, browser }) => {
  test.setTimeout(180_000);
  const seed = process.env.HARBOR_GATE_FRESH_SEED === "1"
    ? await seedFreshAcceptedHarbor(seedPage)
    : persistedSeed;
  expect(seed, "seeded accepted Harbor agreement").toBeTruthy();
  const agreementId = seed!.agreement_id;
  const page = await openFreshAuthorCreatePage({
    browser,
    agreementId,
    viewport: { width: 1280, height: 800 },
    partyCue: "Harbor Peak",
  });
  expect(page.url()).toContain(`agreementId=${agreementId}`);
  const article = await articleText(page, "Harbor Peak");
  expect(article).toContain("Harbor Peak");
  expect(article).toContain("Ironvale");
  expect(article).toMatch(/Consultant/i);
  expect(article).toMatch(/Client/i);
  expect(article).toContain("Delaware");
  expect(article).toContain("$48,000");
  expect(article).toContain("notices@harborpeak.test");
  expect(article).toContain("maya.chen@harborpeak.test");
  expect(article).toContain("jordan.hale@ironvale.test");
  const finished = await continueAcceptedHarborThroughPdf({
    page,
    browser,
    agreementId,
    snapshotId: seed!.snapshot_id,
    digest: seed!.digest,
    partyCue: "Harbor Peak",
    paperReady: (text) =>
      text.includes("Harbor Peak") &&
      text.includes("Ironvale") &&
      text.includes("$48,000") &&
      text.includes("notices@harborpeak.test"),
    signers: [
      {
        legalEntity: "Harbor Peak Analytics LLC",
        signerName: "Maya Chen",
        signerEmail: "maya.chen@harborpeak.test",
      },
      {
        legalEntity: "Ironvale Manufacturing Inc.",
        signerName: "Jordan Hale",
        signerEmail: "jordan.hale@ironvale.test",
      },
    ],
  });
  expect(finished.snapshotId).toBe(seed!.snapshot_id);
  expect(finished.digest).toBe(seed!.digest);
  expect(finished.signedCount).toBe(2);
  expect(finished.receiptId.length).toBeGreaterThan(4);
  expect(HARBOR_STAGE_TIMEOUT_MS).toBe(60_000);
});
