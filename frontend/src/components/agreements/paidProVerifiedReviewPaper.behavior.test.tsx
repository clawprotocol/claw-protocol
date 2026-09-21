/** @vitest-environment jsdom */
/**
 * Phase 4A.1 — verified paid-review paper must reach the document article.
 * Matching org / agreement / SHA-256 / length paints; any mismatch stays closed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeAcceptedReviewSnapshotRef,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { setOrgId } from "../../launch/orgContext";
import { SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE } from "../../launch/simpleProduct/simpleCreatePaidProReviewShell";
import {
  PaidProDocumentBodyForcedRoute,
  resetPaidProDocumentBodyRouterLogsForTests,
  resolvePaidProDocumentBodyRouter,
} from "./paidProDocumentBodyRouter";
import { resetPaidProVisibleDocumentShellLogsForTests } from "./paidProVisibleDocumentShell";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearPaidProReviewSessionAuthorityForTests } from "./paidProReviewSessionAuthority";
import { clearPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import {
  canEnablePaidReviewCommercialActions,
  canPresentCompletedPaidReview,
  COMPLETED_PAID_REVIEW_HEADING,
  selectVerifiedPaidReviewPaper,
  sha256MatchesVerifiedPaper,
} from "./paidProVerifiedReviewPaper";

const ORG_A = "user-phase4a-paid-owner";
const ORG_B = "user-phase4a-other-org";
const AGREEMENT_ID = "ag-phase4a-batch5-saas";
const SNAPSHOT_ID = "crs-ag-phase4a-batch5-saas";

function buildVerified1636Corpus(): string {
  const core = [
    "SAAS SUBSCRIPTION AGREEMENT",
    'This Agreement is entered into by and between Orion Labs LLC ("Provider") and Contoso Retail Inc ("Customer").',
    "",
    "1. Scope",
    "Provider will supply the hosted SaaS platform and related onboarding described in the order form.",
    "",
    "2. Fees",
    "Customer will pay $180,000 annual subscription fees.",
    "",
    "3. Term",
    "The initial term is twelve months and renews unless terminated on thirty days' notice.",
    "",
    "4. Confidentiality and intellectual property",
    "Each party will protect confidential information. Customer owns its data. Provider owns the platform.",
    "",
    "5. Governing law",
    "This Agreement is governed by the laws of New York.",
    "",
    "6. Notices",
    "Notices to Orion Labs LLC and Contoso Retail Inc must be in writing.",
    "",
    "IN WITNESS WHEREOF, the parties execute this Agreement.",
    "Orion Labs LLC",
    "Contoso Retail Inc",
    "",
    "7. Limitation of liability",
    "Except for confidentiality breaches and infringement indemnity, neither party's aggregate liability exceeds the fees paid in the twelve months before the claim.",
    "",
    "8. Data protection",
    "Provider will process Customer data only to perform this Agreement and will maintain commercially reasonable administrative, technical, and physical safeguards.",
    "",
    "9. Termination",
    "Either party may terminate for material breach that remains uncured thirty days after written notice.",
    "",
    "10. Entire agreement",
    "This Agreement, including the order form, is the entire agreement and supersedes prior discussions relating to the SaaS subscription.",
  ].join("\n");
  if (core.length === 1636) return core;
  const pad =
    " The parties acknowledge these additional commercial terms remain part of the operative agreement.";
  let out = core;
  while (out.length < 1636) {
    const next = out + pad;
    if (next.length > 1636) {
      out += pad.slice(0, 1636 - out.length);
      break;
    }
    out = next;
  }
  return out.slice(0, 1636);
}

const VERIFIED_CORPUS = buildVerified1636Corpus();

async function seedVerifiedPaper(args?: {
  orgId?: string;
  agreementId?: string;
  corpus?: string;
  sha?: string;
  length?: number;
  accepted?: boolean;
}): Promise<{ sha: string; corpus: string }> {
  const orgId = args?.orgId ?? ORG_A;
  const agreementId = args?.agreementId ?? AGREEMENT_ID;
  const corpus = (args?.corpus ?? VERIFIED_CORPUS).trim();
  const sha = args?.sha ?? (await sha256CorpusDigest(corpus));
  setOrgId(orgId);
  storeVerifiedCommercialDisplayCorpus({
    agreementId,
    snapshotId: SNAPSHOT_ID,
    corpusSha256: sha,
    corpusLength: args?.length ?? corpus.length,
    status: args?.accepted === false ? "pending" : "accepted",
    orgId,
    corpusPlain: corpus,
  });
  if (args?.accepted !== false) {
    storeAcceptedReviewSnapshotRef({
      agreementId,
      snapshotId: SNAPSHOT_ID,
      corpusSha256: sha,
      corpusLength: args?.length ?? corpus.length,
      orgId,
    });
  }
  return { sha, corpus };
}

function renderForcedReview(agreementId = AGREEMENT_ID) {
  const router = resolvePaidProDocumentBodyRouter();
  return render(
    <PaidProDocumentBodyForcedRoute
      router={
        router.forced
          ? router
          : {
              hasSoT: false,
              sotLen: VERIFIED_CORPUS.length,
              branch: "paid_pro_visible_shell_forced",
              reason: "canonical_review_corpus_len_meets_threshold",
              forced: true,
            }
      }
      html=""
      displayContext={{
        agreementId,
        paidProActive: true,
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: false,
      }}
    />,
  );
}

describe("Phase 4A.1 verified paid-review paper paint", () => {
  beforeEach(() => {
    setOrgId(ORG_A);
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
    clearPremiumCompletionSnapshot();
    clearAcceptedReviewSnapshotRef();
    clearDisplayReviewSnapshotAuthority();
    resetPaidProVisibleDocumentShellLogsForTests();
    resetPaidProDocumentBodyRouterLogsForTests();
  });

  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
    clearPremiumCompletionSnapshot();
    clearAcceptedReviewSnapshotRef();
    clearDisplayReviewSnapshotAuthority();
    setOrgId(ORG_A);
  });

  it("paints a verified 1,636-character corpus in the document article with matching hash and length", async () => {
    expect(VERIFIED_CORPUS.length).toBe(1636);
    expect(VERIFIED_CORPUS).toContain("SAAS SUBSCRIPTION AGREEMENT");
    const { sha, corpus } = await seedVerifiedPaper();
    const verified = selectVerifiedPaidReviewPaper({
      orgId: ORG_A,
      agreementId: AGREEMENT_ID,
      expectedSha256: sha,
      expectedLength: 1636,
    });
    expect(verified?.plain.length).toBe(1636);
    expect(verified?.corpusSha256).toBe(sha);
    expect(verified?.corpusLength).toBe(1636);

    const { container } = renderForcedReview();
    const article = container.querySelector('[data-testid="premium-agreement-readonly-article"]');
    expect(article).toBeTruthy();
    const articleText = (article?.textContent || "").trim();
    expect(articleText).toContain("SAAS SUBSCRIPTION AGREEMENT");
    expect(articleText).toContain("Orion Labs LLC");
    expect(Number(article?.getAttribute("data-claw-review-corpus-len") || 0)).toBe(1636);
    expect(await sha256MatchesVerifiedPaper(corpus, verified!)).toBe(true);
    expect(
      canPresentCompletedPaidReview({
        reviewHeading: SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE,
        articlePlain: corpus,
        verified,
      }),
    ).toBe(true);
    expect(
      canEnablePaidReviewCommercialActions({
        articlePlain: corpus,
        verified,
        requireAcceptedPrepare: true,
      }),
    ).toBe(true);
  });

  it("mismatched org, agreement id, hash, length, or missing snapshot produces no paper and no commercial actions", async () => {
    const { sha } = await seedVerifiedPaper();

    expect(
      selectVerifiedPaidReviewPaper({
        orgId: ORG_B,
        agreementId: AGREEMENT_ID,
        expectedSha256: sha,
        expectedLength: 1636,
      }),
    ).toBeNull();

    setOrgId(ORG_B);
    expect(selectVerifiedPaidReviewPaper({ agreementId: AGREEMENT_ID })).toBeNull();
    const wrongOrg = renderForcedReview();
    expect(wrongOrg.container.querySelector('[data-testid="premium-agreement-readonly-article"]')).toBeNull();
    expect(
      wrongOrg.container.querySelector('[data-testid="paid-pro-visible-document-shell-empty"]'),
    ).toBeTruthy();
    expect(
      canEnablePaidReviewCommercialActions({
        articlePlain: VERIFIED_CORPUS,
        requireAcceptedPrepare: true,
      }),
    ).toBe(false);
    wrongOrg.unmount();
    setOrgId(ORG_A);

    expect(
      selectVerifiedPaidReviewPaper({
        orgId: ORG_A,
        agreementId: "ag-phase4a-other",
        expectedSha256: sha,
        expectedLength: 1636,
      }),
    ).toBeNull();

    expect(
      selectVerifiedPaidReviewPaper({
        orgId: ORG_A,
        agreementId: AGREEMENT_ID,
        expectedSha256: "a".repeat(64),
        expectedLength: 1636,
      }),
    ).toBeNull();

    expect(
      selectVerifiedPaidReviewPaper({
        orgId: ORG_A,
        agreementId: AGREEMENT_ID,
        expectedSha256: sha,
        expectedLength: 1600,
      }),
    ).toBeNull();

    clearDisplayReviewSnapshotAuthority();
    clearAcceptedReviewSnapshotRef();
    expect(selectVerifiedPaidReviewPaper({ agreementId: AGREEMENT_ID })).toBeNull();
    const missing = renderForcedReview();
    expect(missing.container.querySelector('[data-testid="premium-agreement-readonly-article"]')).toBeNull();
    expect(
      canPresentCompletedPaidReview({
        reviewHeading: COMPLETED_PAID_REVIEW_HEADING,
        articlePlain: "",
      }),
    ).toBe(false);
    expect(canEnablePaidReviewCommercialActions({ articlePlain: VERIFIED_CORPUS })).toBe(false);
    missing.unmount();
  });

  it("Review your agreement draft cannot represent a completed review while the article is empty", async () => {
    expect(SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE).toBe(COMPLETED_PAID_REVIEW_HEADING);
    await seedVerifiedPaper();
    const verified = selectVerifiedPaidReviewPaper({ agreementId: AGREEMENT_ID });
    expect(verified).toBeTruthy();
    expect(
      canPresentCompletedPaidReview({
        reviewHeading: COMPLETED_PAID_REVIEW_HEADING,
        articlePlain: "",
        verified,
      }),
    ).toBe(false);
    expect(
      canEnablePaidReviewCommercialActions({
        articlePlain: "",
        verified,
      }),
    ).toBe(false);
  });
});
