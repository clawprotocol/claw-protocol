import { expect, test } from "@playwright/test";
import {
  IDENTITY_AMBIGUOUS_INTAKE,
  IDENTITY_EXTRACTION_ONLY_INTAKE,
  IDENTITY_INDIVIDUAL_ANSWER,
  IDENTITY_NEGATIVE_ANSWER,
  IDENTITY_QUESTION,
  IDENTITY_REPRESENTATIVE_ANSWER,
  applyIdentityClarificationAnswer,
  articleText,
  captureCanonicalSnapshotCreates,
  captureServerAgreementIds,
  completeLocalReviewSignAndFinal,
  completeSignerDetailsThroughVisibleCustomerUi,
  fetchOwnerCanonicalSnapshot,
  fetchOwnerIdentityState,
  installQualityEvalPageGuards,
  qualityEvalViewportName,
  submitIntake,
  waitForOwnerWorkspaceReady,
  waitForPaintedArticle,
  waitForServerAgreementId,
  writeQualityEvalArtifact,
} from "./qualityEvalJourney";
import { seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";

const enabled = process.env.QUALITY_EVAL_OFFLINE_JOURNEY === "1" || process.env.QUALITY_EVAL_CASE === "identity";
test.skip(!enabled, "Identity journey runs on the existing offline quality-eval runner");

const IDENTITY_SCENARIO = {
  id: "consulting",
  parties: ["Harbor Peak Analytics LLC", "Ironvale Manufacturing Inc."],
  terms: ["$48,000", "Delaware"],
  partyCue: "Harbor Peak Analytics LLC",
  filled: IDENTITY_AMBIGUOUS_INTAKE,
} as const;

function legalPartyNames(rows: Array<{ name?: string | null }>): string[] {
  return rows
    .map((row) => String(row.name || "").replace(/\.$/, "").replace(/^\d+\s+/, "").trim())
    .filter((name, index, all) => name && all.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index);
}

function paperReady(article: string, extra: string[] = []): boolean {
  return (
    IDENTITY_SCENARIO.parties.every(
      (party) => article.includes(party) || article.includes(party.replace(/\.$/, "")),
    ) &&
    IDENTITY_SCENARIO.terms.every((term) => article.includes(term)) &&
    extra.every((fact) => article.includes(fact)) &&
    article.length > 400
  );
}

async function startFromIntake(page: import("@playwright/test").Page, intake: string) {
  const capturedIds = captureServerAgreementIds(page);
  const snapshotPosts = captureCanonicalSnapshotCreates(page);
  await installQualityEvalPageGuards(page);
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  const premiumResponse = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/agreements/premium-full-draft"),
    { timeout: 240_000 },
  );
  const parseResponse = page.waitForResponse((r) => {
    if (r.request().method() !== "POST") return false;
    try {
      return new URL(r.url()).pathname.endsWith("/agreements/parse");
    } catch {
      return false;
    }
  }, { timeout: 120_000 });
  await submitIntake(page, intake);
  const parsed = await parseResponse;
  const parseBody = (await parsed.json()) as { draft?: { parties?: Array<{ name?: string }> } };
  writeQualityEvalArtifact("parse-response.json", JSON.stringify(parseBody, null, 2), "identity");
  const parsedNames = (parseBody.draft?.parties || []).map((row) => String(row.name || ""));
  expect(parsedNames).toHaveLength(2);
  expect(parsedNames[0]).toMatch(/Harbor Peak Analytics LLC/);
  expect(parsedNames[1]).toMatch(/Ironvale Manufacturing Inc/);
  const generated = await premiumResponse;
  expect(generated.ok()).toBeTruthy();
  const firstPaper = await waitForPaintedArticle(page, IDENTITY_SCENARIO);
  const agreementId = await waitForServerAgreementId(page, capturedIds);
  return { page, firstPaper, agreementId, snapshotPosts, parseBody };
}

async function freshReopenWithoutIdentityQuestion(
  browser: import("@playwright/test").Browser,
  page: import("@playwright/test").Page,
  agreementId: string,
  extras: string[] = [],
  opts?: { keepOpen?: boolean },
) {
  const origin = process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN || new URL(page.url()).origin;
  const freshContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1280, height: 720 },
    baseURL: origin,
  });
  const freshPage = await freshContext.newPage();
  await seedCorePaidJourneyOwner(freshPage);
  await installQualityEvalPageGuards(freshPage);
  await freshPage.goto(`/app/create?agreementId=${agreementId}`, { waitUntil: "domcontentloaded" });
  try {
    await waitForOwnerWorkspaceReady(freshPage, agreementId);
    await expect
      .poll(async () => {
        const text = await articleText(freshPage, IDENTITY_SCENARIO.partyCue);
        return paperReady(text, extras) ? text.length : 0;
      }, { timeout: 90_000 })
      .toBeGreaterThan(400);
  } catch (err) {
    const body = await freshPage.locator("body").innerText().catch(() => "");
    writeQualityEvalArtifact("fresh-reopen-body.txt", body, "identity_reopen");
    try {
      const failedGet = await fetchOwnerCanonicalSnapshot(freshPage, agreementId);
      writeQualityEvalArtifact("fresh-reopen-get.json", JSON.stringify(failedGet, null, 2), "identity_reopen");
    } catch (getErr) {
      writeQualityEvalArtifact(
        "fresh-reopen-get.json",
        JSON.stringify({ error: String(getErr) }, null, 2),
        "identity_reopen",
      );
    }
    throw err;
  }
  await expect(freshPage.getByTestId("identity-clarification-question")).toHaveCount(0);
  const get = await fetchOwnerCanonicalSnapshot(freshPage, agreementId);
  if (!opts?.keepOpen) {
    await freshContext.close();
    return { get };
  }
  return { get, page: freshPage, context: freshContext };
}

test.describe("identity-resolution customer flow", () => {
  test("representative assignment persists from normalized parse", async ({ page, browser }) => {
    // Existing waits already sum past 300s (parse + premium + paint + apply + 90s reopen).
    test.setTimeout(540_000);
    const started = await startFromIntake(page, IDENTITY_AMBIGUOUS_INTAKE);
    await expect(page.getByTestId("identity-clarification-question")).toContainText(IDENTITY_QUESTION, {
      timeout: 20_000,
    });
    const posted = await applyIdentityClarificationAnswer(
      page,
      started.agreementId,
      IDENTITY_REPRESENTATIVE_ANSWER,
    );
    expect(posted, "valid representative Apply must persist a revision").toBeTruthy();
    await expect
      .poll(async () => {
        const row = await fetchOwnerIdentityState(page, started.agreementId);
        return row.parties.some((party) =>
          /Harbor Peak Analytics LLC/i.test(String(party.name || "")) &&
          !/^\d+\s+/.test(String(party.name || "")) &&
          /Alex Rivera/i.test(String(party.signerName || party.signer_name || "")),
        );
      }, { timeout: 20_000 })
      .toBe(true);
    const saved = await fetchOwnerIdentityState(page, started.agreementId);
    expect(legalPartyNames(saved.parties)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc",
    ]);
    expect(saved.parties.filter((row) => /^\d+\s+/.test(String(row.name || "")))).toEqual([]);
    expect(saved.parties.some((row) => /Alex Rivera/i.test(String(row.name || "")))).toBe(false);
    expect(saved.unresolved.some((row) => /Alex Rivera/i.test(String(row.name || "")))).toBe(false);
    await expect(page.getByTestId("identity-clarification-question")).toHaveCount(0, { timeout: 20_000 });
    const independent = await fetchOwnerIdentityState(page, started.agreementId);
    expect(
      independent.parties.some((row) =>
        /Harbor Peak Analytics LLC/i.test(String(row.name || "")) &&
        /Alex Rivera/i.test(String(row.signerName || row.signer_name || "")),
      ),
    ).toBe(true);
    await freshReopenWithoutIdentityQuestion(browser, page, started.agreementId, ["Alex Rivera"]);
    writeQualityEvalArtifact(
      "continuation.json",
      JSON.stringify({
        case_id: "identity_representative",
        viewport: qualityEvalViewportName(),
        agreement_id: started.agreementId,
        recipient_path: "not_required",
      }),
      "identity_representative",
    );
  });

  test("individual party is added and remains through local signing", async ({ page, browser }) => {
    test.setTimeout(540_000);
    const started = await startFromIntake(page, IDENTITY_AMBIGUOUS_INTAKE);
    await expect(page.getByTestId("identity-clarification-question")).toContainText(IDENTITY_QUESTION, {
      timeout: 20_000,
    });
    const posted = await applyIdentityClarificationAnswer(page, started.agreementId, IDENTITY_INDIVIDUAL_ANSWER);
    expect(posted, "valid individual Apply must persist a revision").toBeTruthy();
    await expect
      .poll(async () => {
        const row = await fetchOwnerIdentityState(page, started.agreementId);
        return legalPartyNames(row.parties);
      }, { timeout: 20_000 })
      .toEqual(["Harbor Peak Analytics LLC", "Ironvale Manufacturing Inc", "Alex Rivera"]);
    const saved = await fetchOwnerIdentityState(page, started.agreementId);
    const added = saved.parties.find((row) => /Alex Rivera/i.test(String(row.name || "")));
    const harbor = saved.parties.find((row) => /Harbor Peak Analytics LLC/i.test(String(row.name || "")));
    const ironvale = saved.parties.find((row) => /Ironvale Manufacturing Inc/i.test(String(row.name || "")));
    expect(added).toMatchObject({ name: "Alex Rivera" });
    expect(String(added?.email || "")).toMatch(/alex\.rivera@advisor\.test/i);
    expect(String(added?.role || "")).toMatch(/Advisor/i);
    expect(String(harbor?.role || "")).toMatch(/Consultant/i);
    expect(String(ironvale?.role || "")).toMatch(/Client/i);
    expect(String(harbor?.signerName || harbor?.signer_name || "")).not.toMatch(/Alex Rivera/i);
    await expect(page.getByTestId("identity-clarification-question")).toHaveCount(0, { timeout: 20_000 });
    const after = await articleText(page, IDENTITY_SCENARIO.partyCue);
    expect(after).toContain("Alex Rivera");
    expect(after).not.toContain("Riley Chen");
    expect(after).toMatch(/Consultant, Client, and Advisor may be referred to/i);
    expect(after).toMatch(/If to Alex Rivera:[\s\S]{0,160}alex\.rivera@advisor\.test/i);
    expect(after).not.toMatch(
      /If to Harbor Peak Analytics LLC:\s*\nHarbor Peak Analytics LLC\s*\nEmail:\s*alex\.rivera@advisor\.test/i,
    );
    expect(after).not.toMatch(/If to Harbor Peak Analytics LLC:[\s\S]{0,240}Attn:\s*Alex Rivera/i);
    expect(after).not.toMatch(/CLIENT:[\s\S]{0,220}Name:\s*Harbor Peak Analytics LLC/i);
    expect(after).not.toMatch(/CLIENT:\s*\n\s*Harbor Peak Analytics LLC/i);
    expect(after).not.toMatch(/SERVICE PROVIDER:\s*\n\s*Ironvale Manufacturing Inc/i);
    const appliedSnapshot = await fetchOwnerCanonicalSnapshot(page, started.agreementId);
    expect(appliedSnapshot.corpus).toContain("Alex Rivera");
    expect(appliedSnapshot.corpus).not.toMatch(/If to Harbor Peak Analytics LLC:[\s\S]{0,240}Attn:\s*Alex Rivera/i);
    expect(appliedSnapshot.corpus).not.toMatch(/CLIENT:[\s\S]{0,220}Name:\s*Harbor Peak Analytics LLC/i);
    const firstReopen = await freshReopenWithoutIdentityQuestion(browser, page, started.agreementId, ["Alex Rivera"], {
      keepOpen: true,
    });
    if (!firstReopen.page || !firstReopen.context) throw new Error("fresh reopen page was not kept open");
    await expect(firstReopen.page.getByTestId("simple-pro-send-for-review")).toBeVisible({ timeout: 20_000 });
    await expect(firstReopen.page.getByTestId("simple-pro-send-for-signature")).toBeVisible();
    await expect(firstReopen.page.locator("body")).toContainText(/one authorized signer.*each contracting party/i);
    const reopenState = await fetchOwnerIdentityState(firstReopen.page, started.agreementId);
    expect(legalPartyNames(reopenState.parties)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc",
      "Alex Rivera",
    ]);
    const signers = [
      { legalEntity: "Harbor Peak Analytics LLC", signerName: "Pat Harbor", signerEmail: "pat.harbor@harbor.test" },
      { legalEntity: "Ironvale Manufacturing Inc", signerName: "Sam Ironvale", signerEmail: "sam.ironvale@ironvale.test" },
      { legalEntity: "Alex Rivera", signerName: "Alex Rivera", signerEmail: "alex.rivera@advisor.test" },
    ] as const;
    await completeSignerDetailsThroughVisibleCustomerUi(firstReopen.page, started.agreementId, signers);
    await firstReopen.context.close();
    const reopened = await freshReopenWithoutIdentityQuestion(browser, page, started.agreementId, ["Alex Rivera"], {
      keepOpen: true,
    });
    if (!reopened.page || !reopened.context) throw new Error("signer-details reopen page was not kept open");
    const persistedParties = await fetchOwnerIdentityState(reopened.page, started.agreementId);
    for (const signer of signers) {
      const row = persistedParties.parties.find((candidate) => String(candidate.name || "").includes(signer.legalEntity));
      expect(row, `persisted party missing after reopen ${signer.legalEntity}`).toBeTruthy();
      expect(String(row?.signerName || row?.signer_name || ""), `signer re-entry required ${signer.legalEntity}`).toMatch(
        new RegExp(signer.signerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      );
      expect(String(row?.email || "").toLowerCase(), `email re-entry required ${signer.legalEntity}`).toBe(
        signer.signerEmail.toLowerCase(),
      );
    }
    const persisted = await fetchOwnerCanonicalSnapshot(reopened.page, started.agreementId);
    expect(persisted.corpus).not.toMatch(/If to Harbor Peak Analytics LLC:[\s\S]{0,240}Attn:\s*Alex Rivera/i);
    expect(persisted.corpus).not.toMatch(/CLIENT:[\s\S]{0,220}Name:\s*Harbor Peak Analytics LLC/i);
    expect(persisted.corpus).toMatch(/CONSULTANT:[\s\S]{0,220}Name:\s*Pat Harbor/i);
    expect(persisted.corpus).toMatch(/CLIENT:[\s\S]{0,220}Name:\s*Sam Ironvale/i);
    await expect(reopened.page.getByTestId("identity-clarification-question")).toHaveCount(0);
    const finished = await completeLocalReviewSignAndFinal({
      page: reopened.page,
      browser,
      agreementId: started.agreementId,
      snapshotId: persisted.snapshotId,
      digest: persisted.digest,
      partyCue: IDENTITY_SCENARIO.partyCue,
      paperReady: (article) => paperReady(article, ["Alex Rivera"]),
      signers,
    });
    expect(finished.signedCount).toBe(3);
    expect(finished.receiptId.length).toBeGreaterThan(8);
    const accepted = await fetchOwnerCanonicalSnapshot(reopened.page, started.agreementId);
    expect(accepted.digest).toBe(persisted.digest);
    expect(accepted.corpus).not.toMatch(/If to Harbor Peak Analytics LLC:[\s\S]{0,240}Attn:\s*Alex Rivera/i);
    expect(accepted.corpus).not.toMatch(/CLIENT:[\s\S]{0,220}Name:\s*Harbor Peak Analytics LLC/i);
    expect(accepted.corpus).toMatch(/CONSULTANT:[\s\S]{0,220}Name:\s*Pat Harbor/i);
    expect(accepted.corpus).toMatch(/CLIENT:[\s\S]{0,220}Name:\s*Sam Ironvale/i);
    expect(accepted.corpus).toMatch(/ADVISOR:[\s\S]{0,160}Alex Rivera/i);
    const finalState = await fetchOwnerIdentityState(page, started.agreementId);
    expect(legalPartyNames(finalState.parties)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc",
      "Alex Rivera",
    ]);
    writeQualityEvalArtifact(
      "continuation.json",
      JSON.stringify({
        case_id: "identity_individual",
        viewport: qualityEvalViewportName(),
        agreement_id: started.agreementId,
        snapshot_id: persisted.snapshotId,
        digest: persisted.digest,
        receipt_id: finished.receiptId,
        recipient_path: "local_review_sign_final",
        signer_details_path: "visible_customer_ui_then_reopen",
      }),
      "identity_individual",
    );
    await reopened.context.close();
  });

  test("negative answer is not marked resolved", async ({ page }) => {
    test.setTimeout(540_000);
    const started = await startFromIntake(page, IDENTITY_AMBIGUOUS_INTAKE);
    await applyIdentityClarificationAnswer(page, started.agreementId, IDENTITY_NEGATIVE_ANSWER, {
      expectUnresolved: true,
    });
    await expect(page.getByTestId("identity-clarification-question")).toContainText(IDENTITY_QUESTION, {
      timeout: 20_000,
    });
    const saved = await fetchOwnerIdentityState(page, started.agreementId);
    expect(legalPartyNames(saved.parties)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc",
    ]);
    expect(saved.unresolved.some((row) => /Alex Rivera/i.test(String(row.name || "")))).toBe(true);
    writeQualityEvalArtifact(
      "continuation.json",
      JSON.stringify({
        case_id: "identity_negative",
        viewport: qualityEvalViewportName(),
        agreement_id: started.agreementId,
        recipient_path: "not_required",
      }),
      "identity_negative",
    );
  });

  test("extraction-only invented person is not a confirmed party", async ({ page }) => {
    test.setTimeout(540_000);
    const started = await startFromIntake(page, IDENTITY_EXTRACTION_ONLY_INTAKE);
    await expect(page.getByTestId("identity-clarification-question")).toHaveCount(0);
    const saved = await fetchOwnerIdentityState(page, started.agreementId);
    expect(legalPartyNames(saved.parties)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc",
    ]);
    expect(saved.parties.some((row) => /Riley Chen|Alex Rivera/i.test(String(row.name || "")))).toBe(false);
    const article = await articleText(page, IDENTITY_SCENARIO.partyCue);
    expect(article).not.toContain("Riley Chen");
    writeQualityEvalArtifact(
      "continuation.json",
      JSON.stringify({
        case_id: "identity_extraction_only",
        viewport: qualityEvalViewportName(),
        agreement_id: started.agreementId,
        recipient_path: "not_required",
      }),
      "identity_extraction_only",
    );
  });
});
