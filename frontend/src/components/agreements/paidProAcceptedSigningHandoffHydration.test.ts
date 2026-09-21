/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeAcceptedReviewSnapshotRef,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { setOrgId } from "../../launch/orgContext";
import { shouldPromoteCreateResumeToReviewChrome } from "./paidCreateResumeHydration";
import {
  canEnablePaidCommercialActions,
  hasVerifiedPaidReviewAuthority,
} from "./paidProFirstReviewAuthoritySelection";
import {
  shouldBlockPaidSessionFinalReviewSendForCorpus,
  isLeftoverReviewPacketSendDisableReason,
} from "./paidProPaidSessionLanding";
import { resolveValidatedPaidProReviewCorpus } from "./paidProReviewAuthority";
import { evaluatePaidProSigningHandoffReadiness } from "./paidProSigningHandoffAuthority";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  selectVerifiedPaidReviewPaper,
  sha256MatchesVerifiedPaper,
} from "./paidProVerifiedReviewPaper";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "user-silver-mesa-signing-handoff";
const AGREEMENT_ID = "ag-silver-mesa-accepted";
const SNAPSHOT_ID = "crs-silver-mesa-accepted";

function silverMesaAcceptedPaper(): string {
  return `${"Joint AI software rollout. Ironclad Systems Group LLC is the Sponsor. Harborline Data Solutions Inc. is the Vendor. Northwind Automation Partners LLC is the Integrator. Silver Mesa Analytics LP is the Analyst. Notices to Silver Mesa: notices@silvermesaanalytics.com. Fee $187,500. Term 24 months. Texas law. Austin ZIP 78701. ".repeat(18)}IN WITNESS WHEREOF, the Parties execute this Agreement.\n\nIronclad Systems Group LLC\nBy: ______________________\nName: Ethan Cole\n\nHarborline Data Solutions Inc.\nBy: ______________________\nName: Maya Bennett\n\nNorthwind Automation Partners LLC\nBy: ______________________\nName: Lucas Reed\n\nSilver Mesa Analytics LP\nBy: ______________________\nName: Olivia Hart`.trim();
}

async function seedAcceptedSnapshot(paper: string): Promise<{ sha: string; paper: string }> {
  const sha = await sha256CorpusDigest(paper);
  setOrgId(ORG);
  storeVerifiedCommercialDisplayCorpus({
    agreementId: AGREEMENT_ID,
    snapshotId: SNAPSHOT_ID,
    corpusSha256: sha,
    corpusLength: paper.length,
    status: "accepted",
    orgId: ORG,
    corpusPlain: paper,
  });
  storeAcceptedReviewSnapshotRef({
    agreementId: AGREEMENT_ID,
    snapshotId: SNAPSHOT_ID,
    corpusSha256: sha,
    corpusLength: paper.length,
    orgId: ORG,
  });
  return { sha, paper };
}

describe("accepted snapshot hydrates signing-readiness without bypassing gates", () => {
  beforeEach(() => {
    setOrgId(ORG);
    clearPaidProSourceOfTruth();
    clearAcceptedReviewSnapshotRef();
    clearDisplayReviewSnapshotAuthority();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAcceptedReviewSnapshotRef();
    clearDisplayReviewSnapshotAuthority();
  });

  it("unblocks Prepare for signing when agreement-bound verified paper is visible", async () => {
    const { paper } = await seedAcceptedSnapshot(silverMesaAcceptedPaper());
    expect(paper.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(hasVerifiedPaidReviewAuthority(AGREEMENT_ID)).toBe(true);
    expect(
      shouldBlockPaidSessionFinalReviewSendForCorpus({
        corpusBlocked: true,
        paidSessionFinalReviewDecisionReady: true,
        visibleFinalReviewCorpusLen: paper.length,
        hasVerifiedPaidReviewAuthority: canEnablePaidCommercialActions({
          agreementId: AGREEMENT_ID,
        }),
      }),
    ).toBe(false);
  });

  it("still reports corpus unavailable without verified authority even when display is long", () => {
    expect(
      shouldBlockPaidSessionFinalReviewSendForCorpus({
        corpusBlocked: true,
        paidSessionFinalReviewDecisionReady: true,
        visibleFinalReviewCorpusLen: 10405,
        hasVerifiedPaidReviewAuthority: false,
      }),
    ).toBe(true);
  });

  it("fails closed for missing corpus, mismatched digest, and incomplete signer mapping", async () => {
    const { paper, sha } = await seedAcceptedSnapshot(silverMesaAcceptedPaper());
    expect(selectVerifiedPaidReviewPaper({ agreementId: AGREEMENT_ID })?.plain).toBe(paper);
    expect(
      selectVerifiedPaidReviewPaper({
        agreementId: AGREEMENT_ID,
        expectedSha256: "a".repeat(64),
      }),
    ).toBeNull();
    expect(await sha256MatchesVerifiedPaper(`${paper} mutated`, {
      plain: paper,
      source: "verified_server_canonical_review_snapshot",
      orgId: ORG,
      agreementId: AGREEMENT_ID,
      corpusSha256: sha,
      corpusLength: paper.length,
    })).toBe(false);

    const incomplete = evaluatePaidProSigningHandoffReadiness({
      draftParties: [
        {
          name: "Ironclad Systems Group LLC",
          role: "Sponsor",
          email: "",
          signerName: "Ethan Cole",
        },
        {
          name: "Harborline Data Solutions Inc.",
          role: "Vendor",
          email: "maya.bennett@harborlinedata.com",
          signerName: "Maya Bennett",
        },
      ],
      requiredPartyCount: 2,
    });
    expect(incomplete.ok).toBe(false);
    expect(incomplete.reason).toBe("recipient_rows_incomplete");
  });

  it("keeps genuinely stale review-link disable on the customer send button", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const sendDisabledBlock = intake.slice(
      intake.indexOf("<SimpleProFinalReviewScreen"),
      intake.indexOf("</SimpleProFinalReviewScreen"),
    );
    expect(sendDisabledBlock).toContain("guidedPacketSendBlocked");
    expect(sendDisabledBlock).toContain("Agreement changed after links were created. Create new links for this version.");
    expect(
      isLeftoverReviewPacketSendDisableReason(
        "Agreement changed after links were created. Create new links for this version.",
      ),
    ).toBe(true);
  });

  it("hydrates the accepted Silver Mesa snapshot into review chrome and validated corpus after reopen", async () => {
    const { paper, sha } = await seedAcceptedSnapshot(silverMesaAcceptedPaper());
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: AGREEMENT_ID,
        verifiedPaperLength: paper.length,
        currentStage: "INPUT",
        snapshotStatus: "accepted",
        snapshotId: SNAPSHOT_ID,
        digest: sha,
        corpusPlain: paper,
      }),
    ).toBe(true);
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: AGREEMENT_ID,
        verifiedPaperLength: paper.length,
        currentStage: "INPUT",
      }),
    ).toBe(false);
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: AGREEMENT_ID,
        verifiedPaperLength: 0,
        currentStage: "INPUT",
        snapshotStatus: "accepted",
        snapshotId: SNAPSHOT_ID,
        digest: sha,
      }),
    ).toBe(false);

    const validated = resolveValidatedPaidProReviewCorpus({ agreementId: AGREEMENT_ID });
    expect(validated.len).toBe(paper.length);
    expect(validated.plain).toBe(paper);
    const verified = selectVerifiedPaidReviewPaper({
      agreementId: AGREEMENT_ID,
      expectedSha256: sha,
      expectedLength: paper.length,
    });
    expect(verified?.plain).toBe(paper);
    expect(verified?.corpusSha256).toBe(sha);
  });

  it("uses persisted party count for two, three, and four legal parties rather than a hardcoded minimum of three", () => {
    const two = evaluatePaidProSigningHandoffReadiness({
      draftParties: [
        {
          name: "Harbor Peak Analytics LLC",
          role: "Consultant",
          email: "pat.harbor@harbor.test",
          signerName: "Pat Harbor",
        },
        {
          name: "Ironvale Manufacturing Inc.",
          role: "Client",
          email: "sam.ironvale@ironvale.test",
          signerName: "Sam Ironvale",
        },
      ],
      requiredPartyCount: 2,
    });
    expect(two.ok).toBe(true);
    expect(two.recipients).toHaveLength(2);

    const three = evaluatePaidProSigningHandoffReadiness({
      draftParties: [
        ...two.recipients.map((row) => ({
          name: row.partyLegalName,
          email: row.email,
          signerName: row.signerName,
        })),
        {
          name: "Alex Rivera",
          role: "Advisor",
          email: "alex.rivera@advisor.test",
          signerName: "Alex Rivera",
        },
      ],
      requiredPartyCount: 3,
    });
    expect(three.ok).toBe(true);
    expect(three.recipients).toHaveLength(3);

    const four = evaluatePaidProSigningHandoffReadiness({
      draftParties: [
        {
          name: "Ironclad Systems Group LLC",
          role: "Sponsor",
          email: "ethan.cole@ironcladsg.com",
          signerName: "Ethan Cole",
        },
        {
          name: "Harborline Data Solutions Inc.",
          role: "Vendor",
          email: "maya.bennett@harborlinedata.com",
          signerName: "Maya Bennett",
        },
        {
          name: "Northwind Automation Partners LLC",
          role: "Integrator",
          email: "lucas.reed@northwindap.io",
          signerName: "Lucas Reed",
        },
        {
          name: "Silver Mesa Analytics LP",
          role: "Analyst",
          email: "olivia.hart@silvermesaanalytics.com",
          signerName: "Olivia Hart",
        },
      ],
      requiredPartyCount: 4,
    });
    expect(four.ok).toBe(true);
    expect(four.recipients).toHaveLength(4);
  });
});
