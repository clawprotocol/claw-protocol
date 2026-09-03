/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  clearDisplayReviewSnapshotAuthority,
  readDisplayReviewSnapshotAuthority,
  readVerifiedCommercialDisplayCorpus,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  clearAcceptedProCorpusSafeDisplayCacheForTests,
  readAcceptedProCorpusSafeDisplayCacheSizeForTests,
} from "./paidProAcceptedCorpusSafeDisplayCache";
import {
  invalidatePaidProDisplayCachesAfterSuccessfulRefine,
  PAID_PRO_ASK_LAWDOG_REFINE_REVISION_REASON,
  shouldMountPaidProForcedFirstReviewAskLawDog,
  shouldPersistPaidProRefineToDisplayAuthority,
  shouldUsePaidProPremiumRefinePath,
} from "./paidProAskLawDogForcedFirstReview";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import { PaidProForcedFirstReviewChrome } from "./paidProForcedFirstReviewChrome";
import {
  clearPaidProReviewSessionAuthorityForTests,
  establishPaidProReviewSessionAuthority,
  readPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

const AGREEMENT_ID = "4e18814c-c8fe-4eb9-85ae-a3e694cb596e";
const CERT_MARKER =
  "CERT_AI_REVISE_MARKER_CEDAR_NOTICES_0902 — Notices for this agreement may also be delivered by confirmed electronic mail to the addresses on file.";

function buildReviewCorpus(extra = ""): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(80);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is entered into as of the Effective Date by and between Cedar Notices LLC and Harbor Peak Automation LLC.",
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting and implementation services.",
    "8. GENERAL PROVISIONS",
    "8.1 Notices shall be delivered as set forth herein.",
    extra,
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Cedar Notices LLC",
    "By: __________________________",
    "SERVICE PROVIDER:",
    "Harbor Peak Automation LLC",
    "By: __________________________",
  ]
    .filter((line) => line !== "")
    .join("\n\n");
}

async function seedVerifiedDisplay(corpus: string, snapshotId: string): Promise<void> {
  const sha = await sha256CorpusDigest(corpus);
  storeVerifiedCommercialDisplayCorpus({
    agreementId: AGREEMENT_ID,
    snapshotId,
    corpusSha256: sha,
    corpusLength: corpus.length,
    status: "pending",
    corpusPlain: corpus,
  });
}

describe("Ask LawDog on forced first-review chrome", () => {
  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
    clearDisplayReviewSnapshotAuthority();
    clearAcceptedProCorpusSafeDisplayCacheForTests();
    vi.restoreAllMocks();
  });

  it("mounts Ask LawDog to revise + Apply on decision_1 without signer finalize", () => {
    const onApply = vi.fn();
    const onDraftChange = vi.fn();
    render(
      <PaidProForcedFirstReviewChrome
        signersReady={false}
        signerMetadataFinalized={false}
        getCopyPlainText={() => "body"}
        onEditAgreement={vi.fn()}
        onEditSignerDetails={vi.fn()}
        onExportAgreement={vi.fn()}
        onShareForReview={vi.fn()}
        onPrepareSignatures={vi.fn()}
        suggestEditsDraft="Add notes for review before I send."
        onSuggestEditsDraftChange={onDraftChange}
        onApplySuggestEdits={onApply}
      />,
    );

    expect(screen.getByTestId("simple-pro-edit-agreement-text-toggle").textContent).toMatch(
      /Edit agreement text/i,
    );
    const toggle = screen.getByTestId("paid-pro-forced-ask-lawdog-toggle");
    expect(toggle.textContent).toMatch(/Ask LawDog to revise/i);
    expect(screen.queryByTestId("simple-pro-suggest-edits-input")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByTestId("paid-pro-forced-ask-lawdog-card")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-suggest-edits-input")).toBeTruthy();
    const apply = screen.getByTestId("simple-pro-apply-suggest-edits");
    expect(apply.textContent).toMatch(/Apply changes/i);
    expect(apply).toHaveProperty("disabled", false);
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("does not require signer finalize to show Ask LawDog when handlers are wired", () => {
    expect(
      shouldMountPaidProForcedFirstReviewAskLawDog({
        onApplySuggestEdits: () => {},
        onSuggestEditsDraftChange: () => {},
      }),
    ).toBe(true);
    expect(shouldMountPaidProForcedFirstReviewAskLawDog({})).toBe(false);
  });

  it("uses premium-refine on paid first-review even when persist-flow flag is false", () => {
    expect(
      shouldUsePaidProPremiumRefinePath({
        premiumPersistedFlowActive: false,
        paidDocumentSurface: true,
      }),
    ).toBe(true);
    expect(
      shouldUsePaidProPremiumRefinePath({
        premiumPersistedFlowActive: true,
        paidDocumentSurface: false,
      }),
    ).toBe(true);
    expect(
      shouldUsePaidProPremiumRefinePath({
        premiumPersistedFlowActive: false,
        paidDocumentSurface: false,
      }),
    ).toBe(false);
  });

  it("persists non-bulk refine to display authority when agreement_id exists", () => {
    expect(
      shouldPersistPaidProRefineToDisplayAuthority({
        guidedBulkActive: false,
        agreementId: AGREEMENT_ID,
      }),
    ).toBe(true);
    expect(
      shouldPersistPaidProRefineToDisplayAuthority({
        guidedBulkActive: true,
        agreementId: AGREEMENT_ID,
      }),
    ).toBe(false);
    expect(
      shouldPersistPaidProRefineToDisplayAuthority({
        guidedBulkActive: false,
        agreementId: "",
      }),
    ).toBe(false);
  });

  it("Apply-equivalent CRS + SoT revision paints the reviewer note on the visible Review corpus", async () => {
    const original = buildReviewCorpus();
    establishPaidProSourceOfTruth({
      text: original,
      source: "server_full_draft",
    });
    await seedVerifiedDisplay(original, "crs_before_refine");

    const before = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
      acceptedCanonicalPlain: original,
    });
    expect(before.plain).toContain("Cedar Notices LLC");
    expect(before.plain).not.toContain("CERT_AI_REVISE_MARKER_CEDAR_NOTICES_0902");

    const refined = buildReviewCorpus(`## REVIEWER NOTE\n${CERT_MARKER}`);
    await seedVerifiedDisplay(refined, "crs_after_refine");
    establishPaidProSourceOfTruth({
      text: refined,
      source: "server_full_draft",
      allowShorterOverwrite: true,
    });

    const after = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
      acceptedCanonicalPlain: refined,
    });
    expect(after.plain).toContain("CERT_AI_REVISE_MARKER_CEDAR_NOTICES_0902");
    expect(after.plain).toContain("confirmed electronic mail");
    const displayCorpus = readVerifiedCommercialDisplayCorpus(AGREEMENT_ID);
    expect(displayCorpus?.corpusPlain).toContain("CERT_AI_REVISE_MARKER_CEDAR_NOTICES_0902");
    expect(displayCorpus?.snapshotId).toBe("crs_after_refine");
  });

  it("successful refine replaces stale CRS and session authority used by the forced shell", async () => {
    const original = buildReviewCorpus();
    establishPaidProReviewSessionAuthority({
      corpusPlain: original,
      source: "server_full_document_text",
      agreementId: AGREEMENT_ID,
    });
    establishPaidProSourceOfTruth({
      text: original,
      source: "server_full_draft",
    });
    await seedVerifiedDisplay(original, "crs_56c6f3109e51461092e0945cad8384f1");
    applyAcceptedProCorpusSafeDisplay(original, { surface: "forced_review_pre_refine" });
    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBeGreaterThan(0);
    expect(readDisplayReviewSnapshotAuthority(AGREEMENT_ID)?.snapshotId).toBe(
      "crs_56c6f3109e51461092e0945cad8384f1",
    );

    const refined = buildReviewCorpus(`## REVIEWER NOTE\n${CERT_MARKER}`);
    invalidatePaidProDisplayCachesAfterSuccessfulRefine();
    await seedVerifiedDisplay(refined, "crs_after_refine");
    establishPaidProSourceOfTruth({
      text: refined,
      source: "server_full_draft",
      allowShorterOverwrite: true,
    });

    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBe(0);
    expect(readPaidProReviewSessionAuthority()?.corpusPlain).toContain(
      "CERT_AI_REVISE_MARKER_CEDAR_NOTICES_0902",
    );
    expect(readDisplayReviewSnapshotAuthority(AGREEMENT_ID)?.snapshotId).toBe("crs_after_refine");
    expect(readDisplayReviewSnapshotAuthority(AGREEMENT_ID)?.snapshotId).not.toBe(
      "crs_56c6f3109e51461092e0945cad8384f1",
    );

    const after = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
      acceptedCanonicalPlain: refined,
    });
    expect(after.plain).toContain("CERT_AI_REVISE_MARKER_CEDAR_NOTICES_0902");
    expect(after.plain).toContain("confirmed electronic mail");
    const displayCorpus = readVerifiedCommercialDisplayCorpus(AGREEMENT_ID);
    expect(displayCorpus?.snapshotId).toBe("crs_after_refine");
    expect(displayCorpus?.corpusPlain).toContain("CERT_AI_REVISE_MARKER_CEDAR_NOTICES_0902");
  });

  it("intake wires Ask LawDog on forced chrome and persists refine via Save-edits CRS commit", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const chrome = readFileSync(join(__dirname, "paidProForcedFirstReviewChrome.tsx"), "utf8");
    expect(chrome).toContain("Ask LawDog to revise");
    expect(chrome).toContain("simple-pro-apply-suggest-edits");
    expect(chrome).toContain("simple-pro-suggest-edits-input");
    expect(intake).toContain("onApplySuggestEdits={() => void handleProReviewApplySuggestEdits()}");
    expect(intake).toContain("suggestEditsDraft={proReviewSuggestEditsDraft}");
    expect(intake).toContain("PAID_PRO_ASK_LAWDOG_REFINE_REVISION_REASON");
    expect(intake).toContain("shouldPersistPaidProRefineToDisplayAuthority");
    expect(intake).toContain("shouldUsePaidProPremiumRefinePath");
    expect(intake).toContain("invalidatePaidProDisplayCachesAfterSuccessfulRefine");
    expect(intake).toContain("commitPaidProUserApprovedRevisionRef.current");

    const refineStart = intake.indexOf("const runPersistedRefineFromStepBuffer =");
    const refineEnd = intake.indexOf("const resolveComplexityChoice =", refineStart);
    const refineBlock = intake.slice(refineStart, refineEnd);
    expect(refineBlock).toContain("commitPaidProUserApprovedRevisionRef.current");
    expect(refineBlock).toContain("PAID_PRO_ASK_LAWDOG_REFINE_REVISION_REASON");
    expect(refineBlock).toContain("shouldPersistPaidProRefineToDisplayAuthority");
    expect(refineBlock).toContain("shouldUsePaidProPremiumRefinePath");
    expect(refineBlock).toContain("paidDocumentSurface: premiumPaidDocumentSurfaceRef.current");
    expect(refineBlock).toContain("invalidatePaidProDisplayCachesAfterSuccessfulRefine");
    expect(refineBlock).not.toMatch(/\/api\/agreements["'`].*POST/);

    expect(intake).toContain('commitPaidProUserApprovedRevision(finalText, "paid_pro_card_edit_revision")');
    expect(intake).toContain('commitPaidProUserApprovedRevision(raw, "pro_final_review_plain_edit_revision")');
    expect(PAID_PRO_ASK_LAWDOG_REFINE_REVISION_REASON).toBe("pro_ask_lawdog_refine_revision");
  });
});
