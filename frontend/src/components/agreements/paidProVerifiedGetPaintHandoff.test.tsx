/** @vitest-environment jsdom */
/**
 * Adversarial handoff: after verified GET corpus is stored and SoT is rematerialized,
 * the visible shell must paint that exact corpus (J4 blank-surface regression).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  clearDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import {
  PaidProVisibleDocumentShell,
  resetPaidProVisibleDocumentShellLogsForTests,
} from "./paidProVisibleDocumentShell";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { clearPremiumCompletionSnapshot } from "./premiumCompletionStorage";

const AGREEMENT_ID = "ag_j4_paint_handoff";
const SNAPSHOT_ID = "crs_j4_paint_handoff";

function buildCorpus(): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(80);
  return [
    "MULTI-PARTY PROFESSIONAL SERVICES AGREEMENT",
    "This Agreement is entered into by and between Redwood Biologics, Inc., Summit AI Consulting LLC, Blue Harbor Systems LLC, and Iron Gate Security LLC.",
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting and implementation services.",
    "VERIFIED_GET_PAINT_MARKER",
    "8. GENERAL PROVISIONS",
    "9. MISCELLANEOUS",
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Redwood Biologics, Inc.",
    "LEAD PROVIDER:",
    "Summit AI Consulting LLC",
    "IMPLEMENTATION PARTNER:",
    "Blue Harbor Systems LLC",
    "CYBERSECURITY AUDITOR:",
    "Iron Gate Security LLC",
  ].join("\n\n");
}

describe("verified GET → visible shell paint handoff", () => {
  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearPremiumCompletionSnapshot();
    clearDisplayReviewSnapshotAuthority();
    resetPaidProVisibleDocumentShellLogsForTests();
  });

  it("paints verified GET corpus when hydrate SoT matches; blank surface fails", async () => {
    const corpus = buildCorpus().trim();
    const sha = await sha256CorpusDigest(corpus);
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_draft",
    });
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: SNAPSHOT_ID,
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "pending",
      corpusPlain: corpus,
    });

    const { container, unmount } = render(
      <PaidProVisibleDocumentShell
        html=""
        displayContext={{
          agreementId: AGREEMENT_ID,
          paidProActive: true,
          premiumCheckoutCompleted: true,
          premiumPaidDocumentSurface: true,
        }}
      />,
    );
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shell).toBeTruthy();
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    const paintLen = Number(shell?.getAttribute("data-claw-paint-plain-len") || 0);
    expect(paintLen).toBeGreaterThanOrEqual(1001);
    expect(paintLen).toBeGreaterThan(0);
    const text = shell?.textContent || "";
    expect(text).toContain("VERIFIED_GET_PAINT_MARKER");
    expect(text).toMatch(/Redwood Biologics/i);
    expect(text).toMatch(/Summit AI Consulting/i);
    expect(text).toMatch(/Blue Harbor Systems/i);
    expect(text).toMatch(/Iron Gate Security/i);
    unmount();
  });

  it("paints verified GET corpus even when displayContext agreementId lags (P0 race)", async () => {
    const corpus = buildCorpus().trim();
    const sha = await sha256CorpusDigest(corpus);
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_draft",
    });
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: SNAPSHOT_ID,
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "pending",
      corpusPlain: corpus,
    });

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
    expect(Number(shell?.getAttribute("data-claw-paint-plain-len") || 0)).toBeGreaterThanOrEqual(1001);
    expect(shell?.textContent || "").toContain("VERIFIED_GET_PAINT_MARKER");
    expect(shell?.textContent || "").not.toMatch(/Confirming your server-locked agreement/i);
    unmount();
  });

  it("paints accepted SoT immediately when verified GET corpus is not stored yet", async () => {
    const corpus = buildCorpus().trim();
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_draft",
    });

    const { container, unmount } = render(
      <PaidProVisibleDocumentShell
        html=""
        displayContext={{
          agreementId: "",
          paidProActive: true,
          premiumCheckoutCompleted: true,
          premiumPaidDocumentSurface: true,
          acceptedCanonicalPlain: corpus,
        }}
      />,
    );
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(shell?.textContent || "").toContain("VERIFIED_GET_PAINT_MARKER");
    expect(shell?.textContent || "").not.toMatch(/Confirming your server-locked agreement/i);
    unmount();
  });
});
