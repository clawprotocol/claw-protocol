import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configuredLiveApiBase, installQualityEvalPageGuards } from "./qualityEvalJourney";
import { loadCorePaidJourneyRuntime } from "./corePaidJourneyLiveAuth";

const enabled =
  process.env.QUALITY_EVAL_OFFLINE_JOURNEY === "1" || process.env.CLAW_QUALITY_EVAL_LIVE === "1";
test.skip(!enabled, "Isolated completed Harbor artifact only");

const RESULT_DIR = process.env.QUALITY_EVAL_RESULT_DIR || "";
const seed = RESULT_DIR
  ? (JSON.parse(readFileSync(join(RESULT_DIR, "seeded-agreement.json"), "utf8")) as {
      agreement_id: string;
      snapshot_id: string;
      digest: string;
    })
  : null;

const requiredPaperTerms = [
  "Harbor Peak",
  "Ironvale",
  "$48,000",
  "notices@harborpeak.test",
  "notices@ironvale.test",
  "Maya Chen",
  "Jordan Hale",
];

test("completed Harbor owner record and PDF preserve accepted paper", async ({ page }) => {
  test.setTimeout(120_000);
  expect(seed, "seeded accepted Harbor agreement").toBeTruthy();
  await installQualityEvalPageGuards(page);
  await page.goto(`/app/agreements/${seed!.agreement_id}/view-signed`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  const completed = page.getByTestId("owner-signed-agreement-page");
  await expect(completed).toBeVisible({ timeout: 30_000 });
  await expect(completed).toHaveAttribute("data-corpus-source", "accepted_snapshot");
  const document = page.getByTestId("owner-signed-agreement-document");
  await expect(document).toContainText("Harbor Peak", { timeout: 30_000 });
  const finalText = await document.innerText();
  for (const term of requiredPaperTerms) expect(finalText, `owner final record: ${term}`).toContain(term);
  await expect(page.getByTestId("owner-signed-agreement-signatures")).toContainText("Fully signed (2 of 2)");

  const runtime = loadCorePaidJourneyRuntime();
  const proof = await page.request.get(
    `${configuredLiveApiBase()}/api/agreements/${encodeURIComponent(seed!.agreement_id)}/proof-status`,
    {
      headers: {
        Authorization: `Bearer ${runtime.access_token}`,
        "X-Claw-Org-Id": runtime.org_id,
      },
    },
  );
  expect(proof.ok(), `proof-status failed ${proof.status()}`).toBeTruthy();
  const receipt = ((await proof.json()) as {
    finalized_receipt?: {
      bound?: boolean;
      accepted_snapshot_id?: string;
      accepted_snapshot_digest?: string;
    };
  }).finalized_receipt;
  expect(receipt?.bound).toBe(true);
  expect(receipt?.accepted_snapshot_id).toBe(seed!.snapshot_id);
  expect(String(receipt?.accepted_snapshot_digest || "").toLowerCase()).toBe(seed!.digest);

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("owner-signed-agreement-download-pdf").click();
  const download = await downloadPromise;
  const pdfPath = join(RESULT_DIR, `${seed!.agreement_id}-completed-reopen.pdf`);
  await download.saveAs(pdfPath);
  const pdfText = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
  for (const term of requiredPaperTerms) expect(pdfText, `completed PDF: ${term}`).toContain(term);
});
