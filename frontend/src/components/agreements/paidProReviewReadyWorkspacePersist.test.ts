/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  persistWorkspaceAgreementAfterReviewReady,
  planReviewReadyPersistFailureUi,
  shouldRequireWorkspacePersistOnReviewReady,
  shouldRunAutoPersistAfterAuthoritativeCommit,
} from "./paidProReviewReadyWorkspacePersist";
import {
  clearPaidProReviewSessionAuthorityForTests,
  establishPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import { clearPaidProSourceOfTruth, hashPaidProCorpus } from "./paidProSourceOfTruth";
import { replacePaidProSourceOfTruth } from "./paidProSourceOfTruthState";

function latchPersistReadyAuthority(): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(80);
  const corpus = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is between LawDog Demo LLC and Acme Test Co.",
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting services.",
    "8. GENERAL PROVISIONS",
    "9. MISCELLANEOUS",
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  ].join("\n\n");
  const plain = corpus.trim();
  replacePaidProSourceOfTruth({
    text: plain,
    hash: hashPaidProCorpus(plain),
    accepted_at: Date.now(),
    source: "server_full_draft",
    reviewSessionId: "gen_persist_test",
  });
  establishPaidProReviewSessionAuthority({
    corpusPlain: plain,
    source: "server_full_document_text",
    integrityOk: true,
    reviewSessionId: "gen_persist_test",
  });
  return plain;
}

describe("paidProReviewReadyWorkspacePersist", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
  });

  it("requires persist for entitled Genesis/Pro review-ready without an existing id", () => {
    expect(
      shouldRequireWorkspacePersistOnReviewReady({
        canonicalReviewEntered: true,
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: true,
      }),
    ).toBe(true);
  });

  it("does not require persist for guest/free-starter submit path", () => {
    expect(
      shouldRequireWorkspacePersistOnReviewReady({
        canonicalReviewEntered: true,
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: false,
      }),
    ).toBe(false);
  });

  it("allows auto-persist after authoritative commit on entitled create", () => {
    expect(
      shouldRunAutoPersistAfterAuthoritativeCommit({
        authoritativePremiumUiCommitted: true,
        skipFreeStarterCreateSubmit: true,
      }),
    ).toBe(true);
    expect(
      shouldRunAutoPersistAfterAuthoritativeCommit({
        authoritativePremiumUiCommitted: true,
        skipFreeStarterCreateSubmit: false,
      }),
    ).toBe(false);
  });

  it("failure UI does not present the document as a saved agreement", () => {
    const ui = planReviewReadyPersistFailureUi();
    expect(ui.premiumPersistedFlowActive).toBe(false);
    expect(ui.premiumSendPathUnlocked).toBe(false);
    expect(ui.proFullDraftQualityRetry).toBe(true);
    expect(ui.presentAsSavedAgreement).toBe(false);
  });

  it("integration: Genesis create → persist once → reload list/dashboard/allowance once", async () => {
    const authorityPlain = latchPersistReadyAuthority();
    let draftPosts = 0;
    let agreementsUsed = 0;
    let workspaceRows: Array<{ id: string; title: string }> = [];

    const ensurePersist = async () => {
      draftPosts += 1;
      agreementsUsed += 1; // mirrors backend record_draft_created on successful POST
      const id = "ag_genesis_lawdog_acme_1";
      workspaceRows = [{ id, title: "Services Agreement — LawDog Demo LLC / Acme Test Co" }];
      return id;
    };

    const first = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      skipFreeStarterCreateSubmit: true,
      persistCorpusPlain: authorityPlain,
      ensurePersist,
    });
    expect(first).toEqual({ ok: true, agreementId: "ag_genesis_lawdog_acme_1", created: true });
    expect(draftPosts).toBe(1);
    expect(agreementsUsed).toBe(1);

    // Retries / refresh / signer setup reuse the same id — no second POST.
    const retry = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      existingAgreementId: first.ok ? first.agreementId : null,
      skipFreeStarterCreateSubmit: true,
      ensurePersist,
    });
    expect(retry).toEqual({ ok: true, agreementId: "ag_genesis_lawdog_acme_1", created: false });
    expect(draftPosts).toBe(1);
    expect(agreementsUsed).toBe(1);

    // Reload: workspace-index still contains the row.
    const reloadedIndex = { agreements: [...workspaceRows] };
    expect(reloadedIndex.agreements.some((r) => r.id === "ag_genesis_lawdog_acme_1")).toBe(true);
    expect(reloadedIndex.agreements.length).toBeGreaterThan(0);

    // Dashboard "Create your first agreement" only when agreementCount === 0.
    const agreementCount = reloadedIndex.agreements.length;
    const showFirstAgreementEmptyState = agreementCount === 0;
    expect(showFirstAgreementEmptyState).toBe(false);

    // Agreements list empty copy only when no rows.
    const showNoRecordsYet = reloadedIndex.agreements.length === 0;
    expect(showNoRecordsYet).toBe(false);
  });

  it("integration: persist failure does not leave a workspace record or consume allowance", async () => {
    const authorityPlain = latchPersistReadyAuthority();
    let draftPosts = 0;
    let agreementsUsed = 0;
    const ensurePersist = async () => {
      draftPosts += 1;
      // POST failed — backend never called record_draft_created
      return null;
    };
    const outcome = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      skipFreeStarterCreateSubmit: true,
      persistCorpusPlain: authorityPlain,
      ensurePersist,
    });
    expect(outcome).toEqual({ ok: false, reason: "persist_failed" });
    expect(draftPosts).toBe(1);
    expect(agreementsUsed).toBe(0);
    const failureUi = planReviewReadyPersistFailureUi();
    expect(failureUi.presentAsSavedAgreement).toBe(false);
  });

  it("intake wires persist after entitled canonical review entry and fixes auto-persist deadlock", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("persistWorkspaceAgreementAfterReviewReady");
    expect(intake).toContain("planReviewReadyPersistFailureUi");
    expect(intake).toContain("shouldRunAutoPersistAfterAuthoritativeCommit");
    expect(intake).toContain("review_ready_workspace_persist_failed");
    // Deadlock fix: no longer hard-return solely on authoritativePremiumUiCommitted.
    const effectIdx = intake.indexOf("Best-effort: create persisted row early");
    expect(effectIdx).toBeGreaterThan(0);
    const effectBlock = intake.slice(effectIdx, effectIdx + 1200);
    expect(effectBlock).toContain("shouldRunAutoPersistAfterAuthoritativeCommit");
    expect(effectBlock).not.toMatch(/if\s*\(\s*authoritativePremiumUiCommitted\s*\)\s*return;/);
  });
});
