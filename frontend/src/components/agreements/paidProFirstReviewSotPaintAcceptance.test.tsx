/** @vitest-environment jsdom */
/**
 * Staging P0 acceptance: first-review ForcedRoute → VisibleDocumentShell tree must paint
 * accepted canonical SoT immediately when review begins before/while draft persist returns
 * an agreement id — matching the staging order that left test310-display-source source:none.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  readVerifiedCommercialDisplayCorpus,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import {
  PaidProDocumentBodyForcedRoute,
  resolvePaidProDocumentBodyRouter,
  resetPaidProDocumentBodyRouterLogsForTests,
} from "./paidProDocumentBodyRouter";
import {
  resolvePaidProFirstReviewVisibleDisplayPlain,
  resetPaidProTest310DisplaySourceLogsForTests,
} from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resetPaidProVisibleDocumentShellLogsForTests } from "./paidProVisibleDocumentShell";
import { mapPaidProStickyCtaToPrimaryCta, resolvePaidProStickyCta } from "./paidProStickyCta";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";

const AGREEMENT_ID = "4be31704-9bf4-45d2-8841-413944b8476b";
const CANONICAL_MARKER = "STAGING_CANONICAL_HASH_11790_DF2A8996";

function buildCanonicalServerDocument(): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(90);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is entered into as of the Effective Date by and between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting and implementation services.",
    CANONICAL_MARKER,
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

describe("first-review ForcedRoute SoT paint acceptance (staging order)", () => {
  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearDisplayReviewSnapshotAuthority();
    clearAcceptedReviewSnapshotRef();
    resetPaidProVisibleDocumentShellLogsForTests();
    resetPaidProDocumentBodyRouterLogsForTests();
    resetPaidProTest310DisplaySourceLogsForTests();
    vi.restoreAllMocks();
  });

  it("paints exact canonical body when SoT accepted and review starts before agreementId persist", () => {
    const corpus = buildCanonicalServerDocument().trim();
    // 1) Canonical server snapshot accepted (SoT freeze) — no verified GET, no agreementId yet.
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_document_text",
      agreementGenerationId: "gen_staging_p0",
      reviewSessionId: "gen_staging_p0",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    // Freeze may normalize whitespace/structure; paint must match post-freeze SoT exactly.
    const frozen = getPaidProSourceOfTruthText().trim();
    const expectedHash = hashPaidProCorpus(frozen);
    expect(frozen.length).toBeGreaterThan(1000);
    expect(frozen).toContain(CANONICAL_MARKER);

    // 2) Review phase begins with empty agreementId (persist in flight).
    const displayContextBeforePersist = {
      agreementId: "",
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      acceptedCanonicalPlain: frozen,
      pickerPlain: "STALE_STARTER_PREVIEW_MUST_NOT_PAINT",
      pickerSource: "live_generated_preview",
    };
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain(displayContextBeforePersist);
    expect(resolution.source).toBe("review_session_authority");
    expect(resolution.plain).toBe(frozen);
    expect(resolution.plain).not.toContain("STALE_STARTER_PREVIEW_MUST_NOT_PAINT");
    expect(hashPaidProCorpus(resolution.plain)).toBe(expectedHash);

    const router = resolvePaidProDocumentBodyRouter();
    expect(router.forced).toBe(true);
    expect(router.hasSoT).toBe(true);

    const { container, rerender, unmount } = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        displayContext={displayContextBeforePersist}
      />,
    );

    // 3–4) Visible document is exact canonical; never server-locked blank branch.
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(container.querySelector('[data-testid="paid-pro-visible-document-shell-empty"]')).toBeNull();
    expect(shell?.textContent || "").toContain(CANONICAL_MARKER);
    expect(shell?.textContent || "").not.toMatch(/Confirming your server-locked agreement/i);
    expect(shell?.textContent || "").not.toMatch(/paid_pro_awaiting_display_authority/i);
    expect(shell?.getAttribute("data-claw-review-authority-hash")).toBe(expectedHash);
    expect(shell?.getAttribute("data-claw-paint-plain-hash")).toBe(expectedHash);

    // Persist returns agreement id — still exactly one canonical body / hash.
    const displayContextAfterPersist = {
      ...displayContextBeforePersist,
      agreementId: AGREEMENT_ID,
    };
    rerender(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={resolvePaidProDocumentBodyRouter()}
        html="<p>weaker stale html</p>"
        displayContext={displayContextAfterPersist}
      />,
    );
    const shellAfter = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shellAfter?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(shellAfter?.textContent || "").toContain(CANONICAL_MARKER);
    expect(shellAfter?.textContent || "").not.toContain("weaker stale html");
    expect(shellAfter?.getAttribute("data-claw-paint-plain-hash")).toBe(expectedHash);
    expect(readVerifiedCommercialDisplayCorpus(AGREEMENT_ID)).toBeNull();

    // 5) Signer CTA remains Add signer details.
    cleanup();
    render(
      <SimpleProFinalReviewScreen
        agreementHtml=""
        canonicalPaidProReview
        paidReviewPlain={frozen}
        signaturePrimaryLabel="Add signer details"
        onSendForSignature={() => undefined}
        onSendForReview={() => undefined}
        onCopyAgreement={() => undefined}
        onExportAgreement={() => undefined}
      />,
    );
    expect(screen.getByTestId("simple-pro-final-review-actions").textContent).toContain(
      "Add signer details",
    );
    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(mapPaidProStickyCtaToPrimaryCta(sticky).action).toBe("complete_recipient_details");
    unmount();
  });

  it("diverging verified GET must not replace immutable review-session authority", async () => {
    const sot = buildCanonicalServerDocument().trim();
    establishPaidProSourceOfTruth({
      text: sot,
      source: "server_full_document_text",
    });
    const frozen = getPaidProSourceOfTruthText().trim();
    const getCorpus = `${frozen}\n\nVERIFIED_GET_WINS_MARKER`;
    const sha = await sha256CorpusDigest(getCorpus);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_get_wins",
      corpusSha256: sha,
      corpusLength: getCorpus.length,
      status: "pending",
      corpusPlain: getCorpus,
    });
    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      paidProActive: true,
      premiumPaidDocumentSurface: true,
      acceptedCanonicalPlain: frozen,
    });
    // One-authority: accepted SoT hash paints; competing longer GET candidate is ignored.
    expect(painted.source).toBe("review_session_authority");
    expect(painted.plain).toBe(frozen);
    expect(painted.plain).not.toContain("VERIFIED_GET_WINS_MARKER");
    expect(hashPaidProCorpus(painted.plain)).toBe(hashPaidProCorpus(frozen));
  });

  it("matching verified GET may paint when hash equals review-session authority", async () => {
    const sot = buildCanonicalServerDocument().trim();
    establishPaidProSourceOfTruth({
      text: sot,
      source: "server_full_document_text",
    });
    const frozen = getPaidProSourceOfTruthText().trim();
    const sha = await sha256CorpusDigest(frozen);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_get_match",
      corpusSha256: sha,
      corpusLength: frozen.length,
      status: "pending",
      corpusPlain: frozen,
    });
    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      paidProActive: true,
      premiumPaidDocumentSurface: true,
      acceptedCanonicalPlain: frozen,
    });
    expect(painted.source).toBe("verified_server_canonical_review_snapshot");
    expect(painted.plain).toBe(frozen);
  });
});
