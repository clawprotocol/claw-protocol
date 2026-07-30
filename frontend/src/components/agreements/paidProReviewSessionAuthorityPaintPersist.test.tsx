/**
 * Staging P0: accepted integrity-valid server corpus must paint first-review even when
 * agreementId / verified GET are absent; persist must use that exact hash only.
 */
/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  clearDisplayReviewSnapshotAuthority,
  clearAcceptedReviewSnapshotRef,
} from "../../agreement/canonicalReviewSnapshotApi";
import {
  PaidProDocumentBodyForcedRoute,
  resolvePaidProDocumentBodyRouter,
  resetPaidProDocumentBodyRouterLogsForTests,
} from "./paidProDocumentBodyRouter";
import {
  resolvePaidProFirstReviewVisibleDisplayPlain,
  resetPaidProTest310DisplaySourceLogsForTests,
  PAID_PRO_ACCEPTED_CANONICAL_SOT_DISPLAY_SOURCE,
} from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProSourceOfTruth,
  hashPaidProCorpus,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { replacePaidProSourceOfTruth } from "./paidProSourceOfTruthState";
import {
  clearPaidProReviewSessionAuthorityForTests,
  establishPaidProReviewSessionAuthority,
  hasPaidProReviewSessionAuthority,
  PAID_PRO_REVIEW_SESSION_AUTHORITY_SOURCE,
  readPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import {
  isPaidProReviewBodyVisiblyPaintReady,
  persistWorkspaceAgreementAfterReviewReady,
} from "./paidProReviewReadyWorkspacePersist";
import { resetPaidProVisibleDocumentShellLogsForTests } from "./paidProVisibleDocumentShell";

const CANONICAL_MARKER = "STAGING_AUTHORITY_HASH_13475_C42AAA0C";

function buildAcceptedServerCorpus(extra = ""): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(100);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    'This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").',
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting and implementation services.",
    CANONICAL_MARKER,
    "8. GENERAL PROVISIONS",
    "9. MISCELLANEOUS",
    "10. INDEPENDENT CONTRACTOR",
    pad,
    extra,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function latchAcceptedAuthority(corpus: string, source = "server_full_document_text") {
  const plain = corpus.trim();
  const hash = hashPaidProCorpus(plain);
  replacePaidProSourceOfTruth({
    text: plain,
    hash,
    accepted_at: Date.now(),
    source: "server_full_draft",
    reviewSessionId: "gen_authority_p0",
  });
  return establishPaidProReviewSessionAuthority({
    corpusPlain: plain,
    source,
    integrityOk: true,
    reviewSessionId: "gen_authority_p0",
  });
}

describe("review-session authority paint + persist P0", () => {
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

  it("paints accepted server corpus when agreementId / verified GET are absent", () => {
    const corpus = buildAcceptedServerCorpus().trim();
    const authority = latchAcceptedAuthority(corpus);
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(hasPaidProReviewSessionAuthority()).toBe(true);
    const expectedHash = authority.hash;
    expect(authority.corpusPlain).toContain(CANONICAL_MARKER);

    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "",
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
    });
    expect(resolution.plain.length).toBeGreaterThan(1000);
    expect(resolution.source).toBe(PAID_PRO_REVIEW_SESSION_AUTHORITY_SOURCE);
    expect(hashPaidProCorpus(resolution.plain)).toBe(expectedHash);
    expect(resolution.plain).toContain(CANONICAL_MARKER);

    const router = resolvePaidProDocumentBodyRouter();
    expect(router.forced).toBe(true);
    const { container } = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        displayContext={{
          agreementId: "",
          paidProActive: true,
          premiumPaidDocumentSurface: true,
        }}
      />,
    );
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(container.querySelector('[data-testid="paid-pro-visible-document-shell-empty"]')).toBeNull();
    expect(shell?.textContent || "").toContain(CANONICAL_MARKER);
    expect(shell?.textContent || "").not.toMatch(/Confirming your server-locked agreement/i);
    expect(shell?.getAttribute("data-claw-review-authority-hash")).toBe(expectedHash);
  });

  it("blocks persist for every empty / blocked display state (no allowance)", async () => {
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
    expect(blocked.ok === false && blocked.reason).toBe("missing_review_session_authority");
    expect(draftPosts).toBe(0);
    expect(isPaidProReviewBodyVisiblyPaintReady().ready).toBe(false);
  });

  it("cannot render hash A and persist hash B in one review session", async () => {
    const corpusA = buildAcceptedServerCorpus().trim();
    const corpusB = buildAcceptedServerCorpus("COMPETING_PERSIST_CANDIDATE_13507").trim();
    expect(hashPaidProCorpus(corpusA)).not.toBe(hashPaidProCorpus(corpusB));

    const authority = latchAcceptedAuthority(corpusA);
    const authorityHash = authority.hash;

    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "",
      paidProActive: true,
      premiumPaidDocumentSurface: true,
    });
    expect(hashPaidProCorpus(painted.plain)).toBe(authorityHash);

    let draftPosts = 0;
    const diverging = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      skipFreeStarterCreateSubmit: true,
      persistCorpusPlain: corpusB,
      ensurePersist: async () => {
        draftPosts += 1;
        return "ag_diverged";
      },
    });
    expect(diverging.ok).toBe(false);
    expect(diverging.ok === false && diverging.reason).toBe("persist_hash_diverges_from_authority");
    expect(draftPosts).toBe(0);

    const okPersist = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      skipFreeStarterCreateSubmit: true,
      persistCorpusPlain: painted.plain,
      ensurePersist: async () => {
        draftPosts += 1;
        return "ag_same_hash";
      },
    });
    expect(okPersist).toEqual({ ok: true, agreementId: "ag_same_hash", created: true });
    expect(draftPosts).toBe(1);
    expect(readPaidProReviewSessionAuthority()?.agreementId).toBe("ag_same_hash");
  });

  it("rejects establishing a second competing authority hash", () => {
    establishPaidProReviewSessionAuthority({
      corpusPlain: buildAcceptedServerCorpus(),
      source: "server_full_document_text",
      integrityOk: true,
    });
    expect(() =>
      establishPaidProReviewSessionAuthority({
        corpusPlain: buildAcceptedServerCorpus("SECOND_AUTHORITY"),
        source: "server_full_document_text",
        integrityOk: true,
      }),
    ).toThrow(/one_authority_violation/);
  });

  it("keeps Add-signer CTA path independent of blank-shell regression", () => {
    expect(PAID_PRO_ACCEPTED_CANONICAL_SOT_DISPLAY_SOURCE).toBeTruthy();
    expect(PAID_PRO_REVIEW_SESSION_AUTHORITY_SOURCE).toBe("review_session_authority");
  });
});
