/** @vitest-environment jsdom */
/**
 * P0 staging regression: first-review chrome unlocked (SoT + Add signer details) while
 * document body stayed on "Confirming your server-locked agreement…" because
 * displayContext.agreementId lagged behind an already-verified canonical snapshot.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  readVerifiedCommercialDisplayCorpus,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { mapPaidProStickyCtaToPrimaryCta, resolvePaidProStickyCta } from "./paidProStickyCta";
import {
  resolvePaidProFirstReviewVisibleDisplayPlain,
} from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  PaidProVisibleDocumentShell,
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  resetPaidProVisibleDocumentShellLogsForTests,
  resolvePaidProVisibleShellRenderBranch,
} from "./paidProVisibleDocumentShell";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";

const AGREEMENT_ID = "c7acd88e-b4a1-4550-b228-82211261980c";
const SNAPSHOT_ID = "crs_p0_display_authority_race";
const STALE_AGREEMENT_ID = "ag_stale_prior_session";

function buildAcceptedCanonicalDocument(marker = "CANONICAL_SERVER_SNAPSHOT_MARKER"): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(80);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is entered into as of the Effective Date by and between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting and implementation services.",
    marker,
    "8. GENERAL PROVISIONS",
    "9. MISCELLANEOUS",
    "10. INDEPENDENT CONTRACTOR AND ACCESS",
    "11. WARRANTIES AND COMPLIANCE",
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "By: __________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc.",
    "By: __________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n\n");
}

async function seedAcceptedCanonical(corpus: string, agreementId = AGREEMENT_ID): Promise<string> {
  const sha = await sha256CorpusDigest(corpus);
  storeVerifiedCommercialDisplayCorpus({
    agreementId,
    snapshotId: SNAPSHOT_ID,
    corpusSha256: sha,
    corpusLength: corpus.length,
    status: "pending",
    corpusPlain: corpus,
  });
  return sha;
}

describe("P0 first-review display-authority race", () => {
  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearDisplayReviewSnapshotAuthority();
    clearAcceptedReviewSnapshotRef();
    resetPaidProVisibleDocumentShellLogsForTests();
  });

  it("1 — accepted canonical server document paints body; never server-locked blank state", async () => {
    const corpus = buildAcceptedCanonicalDocument().trim();
    const sha = await seedAcceptedCanonical(corpus);
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_document_text",
      agreementGenerationId: "gen_p0_race",
      reviewSessionId: "gen_p0_race",
    });

    // Staging race: SoT + verified snapshot exist; displayContext.agreementId still empty.
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "",
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
    });
    expect(resolution.plain).toBe(corpus);
    expect(resolution.source).toBe("verified_server_canonical_review_snapshot");
    expect(resolution.fallbackReason).toBeNull();
    expect(hashPaidProCorpus(resolution.plain)).toBe(hashPaidProCorpus(corpus));
    expect(sha).toHaveLength(64);

    const { container, unmount } = render(
      <PaidProVisibleDocumentShell
        html=""
        displayContext={{
          agreementId: "",
          paidProActive: true,
          premiumCheckoutCompleted: true,
          premiumPaidDocumentSurface: true,
        }}
      />,
    );
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(container.querySelector('[data-testid="paid-pro-visible-document-shell-empty"]')).toBeNull();
    expect(shell?.textContent || "").toContain("CANONICAL_SERVER_SNAPSHOT_MARKER");
    expect(shell?.textContent || "").not.toMatch(/Confirming your server-locked agreement/i);
    expect(shell?.textContent || "").not.toMatch(/Review text and Prepare stay locked/i);
    expect(
      resolvePaidProVisibleShellRenderBranch({
        hasSoT: true,
        sotLen: corpus.length,
        htmlLen: 0,
        canonicalPlainLen: resolution.plain.length,
        canonicalPlainSource: resolution.source,
        paidProFirstReviewActive: true,
      }),
    ).toEqual({
      branch: "canonical_plain_forced",
      reason: "paid_pro_first_review_display_authority",
    });
    unmount();
  });

  it("2 — primary pre-signer CTA remains Add signer details", async () => {
    const corpus = buildAcceptedCanonicalDocument().trim();
    await seedAcceptedCanonical(corpus);
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_document_text",
    });
    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });
    expect(painted.plain.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

    // Pre-signer first-review primary CTA on the review card stays "Add signer details".
    render(
      <SimpleProFinalReviewScreen
        agreementHtml=""
        canonicalPaidProReview
        paidReviewPlain={painted.plain}
        signaturePrimaryLabel="Add signer details"
        onSendForSignature={() => undefined}
        onSendForReview={() => undefined}
        onCopyAgreement={() => undefined}
        onExportAgreement={() => undefined}
      />,
    );
    const actions = screen.getByTestId("simple-pro-final-review-actions");
    expect(actions.textContent).toContain("Add signer details");
    expect(actions.textContent).not.toMatch(/Prepare for signing/i);

    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(sticky.phase).toBe("signer_details_required");
    expect(mapPaidProStickyCtaToPrimaryCta(sticky).action).toBe("complete_recipient_details");
  });

  it("3 — same canonical hash through review→signer setup; authority read does not re-persist", async () => {
    const corpus = buildAcceptedCanonicalDocument("HASH_STABLE_MARKER").trim();
    const sha = await seedAcceptedCanonical(corpus);
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_document_text",
      agreementGenerationId: "gen_hash_stable",
    });
    const reviewPlain = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });
    const signerSetupPlain = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
    });
    expect(hashPaidProCorpus(reviewPlain.plain)).toBe(hashPaidProCorpus(corpus));
    expect(hashPaidProCorpus(signerSetupPlain.plain)).toBe(hashPaidProCorpus(reviewPlain.plain));
    expect(reviewPlain.plain).toContain("HASH_STABLE_MARKER");
    // Session authority stays the single stored snapshot (no second corpus write / overwrite).
    const stored = readVerifiedCommercialDisplayCorpus(AGREEMENT_ID);
    expect(stored?.corpusSha256).toBe(sha);
    expect(stored?.corpusPlain).toBe(corpus);
    expect(stored?.snapshotId).toBe(SNAPSHOT_ID);
  });

  it("4 — stale displayContext agreementId cannot overwrite valid active-session canonical", async () => {
    const corpus = buildAcceptedCanonicalDocument("ACTIVE_SESSION_CANONICAL").trim();
    await seedAcceptedCanonical(corpus, AGREEMENT_ID);
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_document_text",
      agreementGenerationId: "gen_active_session",
      reviewSessionId: "gen_active_session",
    });

    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: STALE_AGREEMENT_ID,
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      pickerPlain: "STALE_FALLBACK_PREVIEW_MUST_NOT_PAINT",
      pickerSource: "live_generated_preview",
    });
    expect(painted.plain).toBe(corpus);
    expect(painted.plain).toContain("ACTIVE_SESSION_CANONICAL");
    expect(painted.plain).not.toContain("STALE_FALLBACK_PREVIEW_MUST_NOT_PAINT");
    expect(painted.source).toBe("verified_server_canonical_review_snapshot");

    const { container, unmount } = render(
      <PaidProVisibleDocumentShell
        html="<p>stale html fallback</p>"
        displayContext={{
          agreementId: STALE_AGREEMENT_ID,
          paidProActive: true,
          premiumCheckoutCompleted: true,
          premiumPaidDocumentSurface: true,
          pickerPlain: "STALE_FALLBACK_PREVIEW_MUST_NOT_PAINT",
          pickerSource: "live_generated_preview",
        }}
      />,
    );
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(shell?.textContent || "").toContain("ACTIVE_SESSION_CANONICAL");
    expect(shell?.textContent || "").not.toContain("stale html fallback");
    expect(shell?.textContent || "").not.toContain("STALE_FALLBACK_PREVIEW_MUST_NOT_PAINT");
    unmount();
  });
});
