/**
 * Production-path real-DOM regression for the staging blank first-review race.
 *
 * Tree under test matches AgreementBuilderIntake's forced first-review composition:
 *   resolvePaidProDocumentBodyRouter → PaidProDocumentBodyForcedRoute → PaidProVisibleDocumentShell
 * plus the review-card signer CTA (SimpleProFinalReviewScreen) Intake mounts alongside.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
} from "../../agreement/canonicalReviewSnapshotApi";
import {
  PaidProDocumentBodyForcedRoute,
  resolvePaidProDocumentBodyRouter,
  resetPaidProDocumentBodyRouterLogsForTests,
} from "./paidProDocumentBodyRouter";
import { resetPaidProTest310DisplaySourceLogsForTests } from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProReviewSessionAuthorityForTests,
  resolvePaidProReviewSessionAuthorityPersistPlain,
} from "./paidProReviewSessionAuthority";
import {
  isPaidProReviewBodyVisiblyPaintReady,
  persistWorkspaceAgreementAfterReviewReady,
} from "./paidProReviewReadyWorkspacePersist";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resetPaidProVisibleDocumentShellLogsForTests } from "./paidProVisibleDocumentShell";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";

const DISTINCTIVE =
  "The Service Provider shall deliver agreement-drafting software for one thousand dollars per month.";

function buildAcceptedServerCorpus(): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(90);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    'This Agreement is between Acme Test Co ("Client") and LawDog Demo LLC ("Service Provider").',
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting and implementation services.",
    DISTINCTIVE,
    "8. GENERAL PROVISIONS",
    "9. MISCELLANEOUS",
    "10. INDEPENDENT CONTRACTOR AND ACCESS",
    "11. WARRANTIES AND COMPLIANCE",
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Acme Test Co",
    "SERVICE PROVIDER:",
    "LawDog Demo LLC",
  ].join("\n\n");
}

/**
 * Mirrors AgreementBuilderIntake forced first-review document + signer CTA composition
 * (PaidProDocumentBodyForcedRoute embedded inside the white review card).
 */
function IntakeForcedFirstReviewTree(props: {
  displayContext: {
    agreementId: string;
    paidProActive: boolean;
    premiumCheckoutCompleted: boolean;
    premiumPaidDocumentSurface: boolean;
    acceptedCanonicalPlain: string;
    pickerPlain?: string;
    pickerSource?: string;
  };
  paidReviewPlain: string;
}) {
  const router = resolvePaidProDocumentBodyRouter();
  return (
    <div data-testid="intake-forced-first-review-tree">
      <div className="w-full max-w-[850px] rounded-sm border border-stone-200/90 bg-[#faf7f0]">
        <div className="px-6 py-4">
          <PaidProDocumentBodyForcedRoute
            embedded
            router={router}
            html=""
            displayContext={props.displayContext}
          />
        </div>
      </div>
      <SimpleProFinalReviewScreen
        agreementHtml=""
        canonicalPaidProReview
        paidReviewPlain={props.paidReviewPlain}
        signaturePrimaryLabel="Add signer details"
        onSendForSignature={() => undefined}
        onSendForReview={() => undefined}
        onCopyAgreement={() => undefined}
        onExportAgreement={() => undefined}
      />
    </div>
  );
}

describe("paidPro first-review real-DOM race (Intake → Router → Shell)", () => {
  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
    clearDisplayReviewSnapshotAuthority();
    clearAcceptedReviewSnapshotRef();
    resetPaidProVisibleDocumentShellLogsForTests();
    resetPaidProDocumentBodyRouterLogsForTests();
    resetPaidProTest310DisplaySourceLogsForTests();
    vi.restoreAllMocks();
  });

  it("wires the ForcedRoute shell path inside AgreementBuilderIntake", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("PaidProDocumentBodyForcedRoute");
    expect(intake).toContain("resolvePaidProDocumentBodyRouter");
    expect(intake).toContain("paidProFirstReviewDisplayContext");
    expect(intake).toContain("acceptedCanonicalPlain:");
    expect(intake).toContain("persistWorkspaceAgreementAfterReviewReady");
  });

  it("paints accepted SoT before agreementId/GET; blocks persist until paint-ready; same hash on persist", async () => {
    // Persistence must not fire while the visible body is empty / not paint-ready.
    let draftPosts = 0;
    const blocked = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      skipFreeStarterCreateSubmit: true,
      ensurePersist: async () => {
        draftPosts += 1;
        return "should_not_create";
      },
    });
    expect(blocked.ok).toBe(false);
    expect(draftPosts).toBe(0);
    expect(isPaidProReviewBodyVisiblyPaintReady().ready).toBe(false);

    // Race reproduction: accepted immutable server corpus / SoT, no agreementId, no verified GET.
    establishPaidProSourceOfTruth({
      text: buildAcceptedServerCorpus(),
      source: "server_full_document_text",
      agreementGenerationId: "gen_real_dom_race",
      reviewSessionId: "gen_real_dom_race",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const frozen = getPaidProSourceOfTruthText().trim();
    const expectedHash = hashPaidProCorpus(frozen);
    expect(frozen).toContain(DISTINCTIVE);

    const displayContext = {
      agreementId: "",
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      acceptedCanonicalPlain: frozen,
      pickerPlain: "STALE_STARTER_PREVIEW_MUST_NOT_PAINT",
      pickerSource: "live_generated_preview",
    };

    const { container, rerender } = render(
      <IntakeForcedFirstReviewTree displayContext={displayContext} paidReviewPlain={frozen} />,
    );

    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shell).toBeTruthy();
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(container.querySelector('[data-testid="paid-pro-visible-document-shell-empty"]')).toBeNull();
    expect(shell?.textContent || "").toContain(DISTINCTIVE);
    expect(shell?.textContent || "").not.toMatch(/Confirming your server-locked agreement/i);
    expect(shell?.getAttribute("data-claw-paint-plain-hash")).toBe(expectedHash);
    expect(shell?.getAttribute("data-claw-review-authority-hash")).toBe(expectedHash);

    expect(screen.getByTestId("simple-pro-final-review-actions").textContent).toContain(
      "Add signer details",
    );

    expect(isPaidProReviewBodyVisiblyPaintReady({ persistCorpusPlain: frozen }).ready).toBe(true);

    const persistedPlain = resolvePaidProReviewSessionAuthorityPersistPlain() || frozen;
    const persistOutcome = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      skipFreeStarterCreateSubmit: true,
      persistCorpusPlain: persistedPlain,
      ensurePersist: async () => {
        draftPosts += 1;
        return "ag_real_dom_race";
      },
    });
    expect(persistOutcome).toEqual({
      ok: true,
      agreementId: "ag_real_dom_race",
      created: true,
    });
    expect(draftPosts).toBe(1);
    const renderedHash = shell?.getAttribute("data-claw-paint-plain-hash");
    expect(renderedHash).toBe(expectedHash);
    expect(hashPaidProCorpus(persistedPlain)).toBe(renderedHash);

    // Delayed agreementId / still-absent verified GET must not blank or replace the corpus.
    rerender(
      <IntakeForcedFirstReviewTree
        displayContext={{ ...displayContext, agreementId: "ag_real_dom_race" }}
        paidReviewPlain={frozen}
      />,
    );
    const shellAfter = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shellAfter?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(shellAfter?.textContent || "").toContain(DISTINCTIVE);
    expect(shellAfter?.textContent || "").not.toMatch(/Confirming your server-locked agreement/i);
    expect(shellAfter?.getAttribute("data-claw-paint-plain-hash")).toBe(expectedHash);
  });
});
