import { expect, test } from "@playwright/test";
import { authorizedPaidProRevisionId } from "../../src/components/agreements/paidProSourceOfTruthState";
import { describeOperativeArticleCompare, normalizeArticleWhitespace } from "../../src/launch/corePaidJourneyAcceptanceMatrix";
import {
  HARBOR_CONTENT_ANSWERS,
  QUALITY_EVAL_CASES,
  applyHarborContentAnswers,
  articleText,
  assertApplyExplainedByAnswers,
  assertFreshEditableReopen,
  assertHarborCustomerMeaning,
  assertHarborFirstDraftMeaning,
  assertSaasCustomerMeaning,
  captureCanonicalSnapshotCreates,
  captureServerAgreementIds,
  consultingPaperReady,
  fetchOwnerCanonicalSnapshot,
  installQualityEvalPageGuards,
  qualityEvalViewportName,
  readQualityEvalSamples,
  saasPaperReady,
  submitIntake,
  waitForCapturedSnapshotCreate,
  waitForPaintedArticle,
  waitForServerAgreementId,
  writeQualityEvalArtifact,
  writeQualityEvalSample,
} from "./qualityEvalJourney";

const enabled =
  process.env.CLAW_QUALITY_EVAL_LIVE === "1" || process.env.QUALITY_EVAL_OFFLINE_JOURNEY === "1";
test.skip(!enabled, "Authorized live runner or offline journey runner required");
const filledOnly =
  process.env.QUALITY_EVAL_FILLED_ONLY === "1" || process.env.CLAW_QUALITY_EVAL_LIVE === "1";
const reopenOnly = process.env.QUALITY_EVAL_REOPEN_ONLY === "1";

const selected = QUALITY_EVAL_CASES.filter((scenario) => {
  const only = process.env.QUALITY_EVAL_CASE;
  return !only || only === "all" || only === scenario.id;
});

for (const scenario of selected) {
  test(`real drafting: ${scenario.id}`, async ({ page, browser }) => {
    test.skip(reopenOnly, "Reopen-only mode does not regenerate samples");
    test.setTimeout(300_000);
    const modelResponses: object[] = [];
    const pending: Promise<void>[] = [];
    const capturedIds = captureServerAgreementIds(page);
    const snapshotPosts = captureCanonicalSnapshotCreates(page);
    page.on("response", (response) => {
      if (response.request().method() !== "POST" || !/\/agreements\/(parse|premium-)/.test(response.url())) return;
      pending.push(
        (async () => {
          const raw = await response.text();
          let body: unknown = { non_json: true, raw };
          try {
            body = JSON.parse(raw);
          } catch {
            body = { parse_failed: true, status: response.status(), raw };
          }
          modelResponses.push({
            path: new URL(response.url()).pathname,
            status: response.status(),
            request: response.request().postDataJSON(),
            body,
          });
        })(),
      );
    });
    await installQualityEvalPageGuards(page);
    const startedAt = Date.now();
    let firstUsableDraftMs: number | null = null;
    let clarificationEventsObserved = 0;
    let repeatedQuestionEventsObserved = 0;
    const seenClarificationKeys = new Set<string>();
    const scriptedActions: string[] = [];
    const noteClarificationEvent = (text: string) => {
      const key = text.replace(/\s+/g, " ").trim();
      if (!key) return;
      clarificationEventsObserved += 1;
      if (seenClarificationKeys.has(key)) repeatedQuestionEventsObserved += 1;
      seenClarificationKeys.add(key);
    };
    try {
      await page.goto("/app/create", { waitUntil: "domcontentloaded" });
      if (!filledOnly) {
        await submitIntake(page, scenario.sparse);
        const clarification = page.getByTestId("agreement-intake-clarification");
        await expect(clarification).toBeVisible({ timeout: 30_000 });
        noteClarificationEvent(await clarification.innerText());
        writeQualityEvalArtifact("sparse-clarifications.txt", await clarification.innerText(), scenario.id);
        scriptedActions.push("submit_sparse_intake");
        for (const party of scenario.parties) await expect(clarification).not.toContainText(party);
        const edit = page.getByRole("button", { name: /edit myself|revise|i.?ll edit/i }).first();
        if (await edit.isVisible()) await edit.click();
      }

      const premiumResponse = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).pathname.endsWith("/agreements/premium-full-draft"),
        { timeout: 240_000 },
      );
      scriptedActions.push("submit_filled_intake");
      await submitIntake(page, scenario.filled);
      const generatedResponse = await premiumResponse;
      const generatedRaw = await generatedResponse.text();
      let generated: Record<string, unknown>;
      try {
        generated = JSON.parse(generatedRaw) as Record<string, unknown>;
      } catch (err) {
        writeQualityEvalArtifact("premium-result.json", generatedRaw, scenario.id);
        throw new Error(
          `premium_full_draft_parse_failed status=${generatedResponse.status()} ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      writeQualityEvalArtifact("premium-result.json", JSON.stringify(generated, null, 2), scenario.id);
      const premiumRequest = generatedResponse.request().postDataJSON() as {
        context?: { purpose?: string; additional_terms?: string; effective_date?: string; termination_summary?: string };
      };
      writeQualityEvalArtifact("premium-request.json", JSON.stringify(premiumRequest, null, 2), scenario.id);
      if (scenario.id === "consulting") {
        expect(premiumRequest.context?.purpose || "").toMatch(/AI workflow implementation/i);
        expect(premiumRequest.context?.purpose || "").not.toMatch(/Biotech, manufacturing/i);
        expect(premiumRequest.context?.additional_terms || "").not.toMatch(/\bCRM\b/i);
        expect(premiumRequest.context?.additional_terms || "").not.toMatch(/sales representative/i);
        expect(premiumRequest.context?.effective_date || "").not.toMatch(/October 1, 2026/);
        expect(premiumRequest.context?.termination_summary || "").not.toMatch(/for convenience/i);
      }
      expect(generatedResponse.ok(), "Premium handler must finish successfully").toBeTruthy();
      expect(generated.generation_ok, "A degraded response is not an accepted premium draft").toBe(true);
      expect(
        generated.generation_outcome,
        "A degraded draft is not an accepted quality-eval paper",
      ).not.toBe("degraded");
      if (generated.generation_outcome === "needs_details") {
        const missing = Array.isArray(generated.missing_material_info) ? generated.missing_material_info : [];
        expect(missing.length, "needs_details must keep visible questions, not an empty success").toBeGreaterThan(0);
      }

      const firstPaper = await waitForPaintedArticle(page, scenario);
      firstUsableDraftMs = Date.now() - startedAt;
      writeQualityEvalArtifact("first-draft.txt", firstPaper, scenario.id);
      for (const fact of [...scenario.parties, ...scenario.terms]) expect(firstPaper).toContain(fact);
      expect(firstPaper).not.toMatch(/\[insert[^\]]*\]|lorem ipsum|\bTBD\b|Orion Labs|Contoso Retail/);
      if (scenario.id === "consulting") {
        expect(normalizeArticleWhitespace(firstPaper)).toMatch(/October 1, 2026/);
        assertHarborFirstDraftMeaning(firstPaper);
      } else {
        assertSaasCustomerMeaning(firstPaper);
      }

      const agreementId = await waitForServerAgreementId(page, capturedIds);
      expect(agreementId.length, "server agreement id must be durable").toBeGreaterThan(8);

      let posted;
      if (scenario.id === "consulting") {
        const panel = page.getByTestId("paid-draft-content-clarification-panel");
        await expect(panel).toBeVisible({ timeout: 20_000 });
        noteClarificationEvent(await panel.innerText());
        scriptedActions.push("apply_date_completion");
        posted = await applyHarborContentAnswers(page, agreementId);
      } else {
        await expect(page.getByTestId("paid-draft-content-clarification-panel")).toHaveCount(0);
        await expect(page.getByTestId("date-meaning-clarification-question")).toHaveCount(0);
        await expect(page.getByTestId("completion-criteria-clarification-question")).toHaveCount(0);
        posted = await waitForCapturedSnapshotCreate(snapshotPosts, agreementId);
      }

      let afterApply = "";
      const paperReady = scenario.id === "consulting" ? consultingPaperReady : saasPaperReady;
      await expect
        .poll(async () => {
          afterApply = await articleText(page, scenario.partyCue);
          return paperReady(afterApply) ? afterApply.length : 0;
        }, { timeout: 90_000 })
        .toBeGreaterThan(400);
      if (scenario.id === "consulting") {
        await expect(page.getByTestId("date-meaning-clarification-question")).toHaveCount(0, { timeout: 20_000 });
        await expect(page.getByTestId("completion-criteria-clarification-question")).toHaveCount(0, {
          timeout: 20_000,
        });
        assertHarborCustomerMeaning(afterApply);
        assertApplyExplainedByAnswers(firstPaper, afterApply, HARBOR_CONTENT_ANSWERS);
      } else {
        assertSaasCustomerMeaning(afterApply);
        const applyVsFirst = describeOperativeArticleCompare("first_draft", firstPaper, "after_apply", afterApply);
        expect(applyVsFirst.sameOperative, applyVsFirst.diff).toBe(true);
      }
      writeQualityEvalArtifact("after-apply.txt", afterApply, scenario.id);

      const persisted = await fetchOwnerCanonicalSnapshot(page, agreementId);
      expect(persisted.ok, "authorized canonical GET must succeed independently of the POST").toBeTruthy();
      expect(persisted.agreementId || agreementId).toBe(agreementId);
      expect(persisted.snapshotId, "GET snapshot id must match the snapshot-create response").toBe(posted.snapshotId);
      expect(persisted.digest, "GET digest must match the snapshot-create response").toBe(posted.digest);
      expect(persisted.length, "GET length must match the snapshot-create response").toBe(
        posted.length || persisted.corpus.length,
      );
      expect(paperReady(persisted.corpus)).toBeTruthy();
      if (scenario.id === "consulting") {
        assertHarborCustomerMeaning(persisted.corpus);
      } else {
        assertSaasCustomerMeaning(persisted.corpus);
      }
      const getVsPost = describeOperativeArticleCompare(
        "canonical_get",
        persisted.corpus,
        "snapshot_create_post",
        posted.corpus,
      );
      expect(getVsPost.sameOperative, getVsPost.diff).toBe(true);
      const visibleVsGet = describeOperativeArticleCompare(
        "visible_document",
        afterApply,
        "canonical_get",
        persisted.corpus,
      );
      expect(visibleVsGet.sameOperative, visibleVsGet.diff).toBe(true);

      await page.reload({ waitUntil: "domcontentloaded" });
      const article = page
        .locator(
          '[data-testid="simple-pro-final-review-document"]:visible, [data-testid="paid-pro-visible-document-shell"]:visible',
        )
        .first();
      await expect(article).toBeVisible({ timeout: 20_000 });
      for (const party of scenario.parties) await expect(article).toContainText(party);
      writeQualityEvalArtifact("after-refresh.txt", await article.innerText(), scenario.id);

      const reopened = await assertFreshEditableReopen(
        browser,
        page,
        agreementId,
        persisted,
        scenario.partyCue,
        paperReady,
      );
      if (scenario.id === "consulting") {
        await expect(page.getByTestId("date-meaning-clarification-question")).toHaveCount(0);
        assertHarborCustomerMeaning(reopened.article);
      } else {
        assertSaasCustomerMeaning(reopened.article);
      }
      writeQualityEvalArtifact("fresh-reopen.txt", reopened.article, scenario.id);
      writeQualityEvalSample({
        caseId: scenario.id,
        agreementId,
        snapshotId: persisted.snapshotId,
        digest: persisted.digest,
        length: persisted.length,
      });

      writeQualityEvalArtifact(
        "continuation.json",
        JSON.stringify(
          {
            case_id: scenario.id,
            viewport: qualityEvalViewportName(),
            stage: "draft_apply_get_reopen",
            url: page.url(),
            intended_track: scenario.track,
            agreement_id: agreementId,
            snapshot_id: persisted.snapshotId,
            digest: persisted.digest,
            length: persisted.length,
            reopen_id: reopened.reopenId,
            revision_identities: {
              first_draft: {
                paper_revision_id: authorizedPaidProRevisionId(firstPaper),
                snapshot_id: null,
              },
              after_apply: {
                paper_revision_id: authorizedPaidProRevisionId(afterApply),
                snapshot_id: posted.snapshotId,
                digest: posted.digest,
              },
            },
            convenience: {
              first_usable_draft_ms: firstUsableDraftMs,
              complete_journey_ms: Date.now() - startedAt,
              clarification_events_observed: clarificationEventsObserved,
              repeated_question_events_observed: repeatedQuestionEventsObserved,
              scripted_actions: scriptedActions,
              customer_manual_corrections: "not_assessed",
              customer_effort: "not_assessed",
              environment:
                process.env.CLAW_QUALITY_EVAL_LIVE === "1"
                  ? "live-model"
                  : process.env.QUALITY_EVAL_REPLAY_LIVE_DIR
                    ? "live-replay"
                    : "acceptance-stub",
            },
            quality: process.env.CLAW_QUALITY_EVAL_LIVE === "1" ? "human_review_required" : "offline_stub_workflow",
            live_quality: "not_claimed",
            sample_limitation: "two filled cases only; not arbitrary-input proof",
            complete_paper_review: "required_for_live_quality",
            recipient_path: "not_yet_exercised",
            manual_edit_recovery: "unverified",
          },
          null,
          2,
        ),
        scenario.id,
      );
    } finally {
      await Promise.all(pending);
      writeQualityEvalArtifact("model-endpoints.json", JSON.stringify(modelResponses, null, 2), scenario.id);
      writeQualityEvalArtifact(
        "last-page.txt",
        await page.locator("body").innerText().catch(() => "unavailable"),
        scenario.id,
      );
    }
  });
}

test("reopen saved samples without regeneration", async ({ page, browser }) => {
  test.skip(!reopenOnly, "Generation run writes samples; reopen-only reads them");
  test.setTimeout(180_000);
  const samples = Object.values(readQualityEvalSamples());
  expect(samples.length, "reopen-only requires previously generated independent samples").toBeGreaterThan(0);
  for (const sample of samples) {
    const scenario = QUALITY_EVAL_CASES.find((row) => row.id === sample.caseId);
    expect(scenario, `unknown sample case ${sample.caseId}`).toBeTruthy();
    if (!scenario) continue;
    await installQualityEvalPageGuards(page);
    const paperReady = scenario.id === "consulting" ? consultingPaperReady : saasPaperReady;
    const reopened = await assertFreshEditableReopen(
      browser,
      page,
      sample.agreementId,
      sample,
      scenario.partyCue,
      paperReady,
    );
    if (scenario.id === "consulting") assertHarborCustomerMeaning(reopened.article);
    else assertSaasCustomerMeaning(reopened.article);
    writeQualityEvalArtifact("reopen-only.txt", reopened.article, scenario.id);
  }
});
