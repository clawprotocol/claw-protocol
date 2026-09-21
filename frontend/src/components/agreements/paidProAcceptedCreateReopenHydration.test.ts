/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { setOrgId } from "../../launch/orgContext";
import {
  createResumeRenderKey,
  evaluateCreateResumeSnapshotAuthority,
  resolvePaidCreateResumeCorpus,
  shouldPromoteCreateResumeToReviewChrome,
} from "./paidCreateResumeHydration";
import { resolveValidatedPaidProReviewCorpus } from "./paidProReviewAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { selectVerifiedPaidReviewPaper } from "./paidProVerifiedReviewPaper";

const ORG = "user-silver-mesa-create-reopen";
const AGREEMENT_ID = "ag-silver-mesa-notice";
const OTHER_AGREEMENT_ID = "ag-other-four-party";
const ORIGINAL_NOTICE = "olivia.hart@silvermesaanalytics.com";
const ACCEPTED_NOTICE = "notices@silvermesaanalytics.com";
const ORIGINAL_SNAPSHOT_ID = "crs-silver-mesa-original";
const ACCEPTED_SNAPSHOT_ID = "crs-silver-mesa-accepted";

function silverMesaPaper(noticeEmail: string): string {
  return `${"Joint AI software rollout. Ironclad Systems Group LLC is the Sponsor. Harborline Data Solutions Inc. is the Vendor. Northwind Automation Partners LLC is the Integrator. Silver Mesa Analytics LP is the Analyst. Notices to Silver Mesa Email: "}${noticeEmail}. Fee $187,500. Term 24 months. Texas law. Austin ZIP 78701. `.repeat(
    18,
  ).trim();
}

describe("accepted Silver Mesa create-resume hydration", () => {
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

  it("does not promote review chrome from corpus length alone", () => {
    const original = silverMesaPaper(ORIGINAL_NOTICE);
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: AGREEMENT_ID,
        verifiedPaperLength: original.length,
        currentStage: "INPUT",
      }),
    ).toBe(false);
  });

  it("keeps original notice before accept and paints accepted notice after async GET", async () => {
    const original = silverMesaPaper(ORIGINAL_NOTICE);
    const accepted = silverMesaPaper(ACCEPTED_NOTICE);
    const originalDigest = await sha256CorpusDigest(original);
    const acceptedDigest = await sha256CorpusDigest(accepted);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: ORIGINAL_SNAPSHOT_ID,
      corpusSha256: originalDigest,
      corpusLength: original.length,
      status: "accepted",
      orgId: ORG,
      corpusPlain: original,
    });
    expect(selectVerifiedPaidReviewPaper({ agreementId: AGREEMENT_ID })?.plain).toContain(ORIGINAL_NOTICE);
    expect(selectVerifiedPaidReviewPaper({ agreementId: AGREEMENT_ID })?.plain).not.toContain(ACCEPTED_NOTICE);

    const beforeKey = createResumeRenderKey({
      agreementId: AGREEMENT_ID,
      snapshotId: ORIGINAL_SNAPSHOT_ID,
      digest: originalDigest,
    });
    const resolved = await resolvePaidCreateResumeCorpus({
      agreementId: AGREEMENT_ID,
      draftPipelineCorpus: original,
      hydrateSnapshot: async () => ({
        ok: true,
        snapshot: {
          agreement_id: AGREEMENT_ID,
          snapshot_id: ACCEPTED_SNAPSHOT_ID,
          corpus_plain: accepted,
          corpus_sha256: acceptedDigest,
          corpus_length: accepted.length,
          status: "accepted",
        },
      }),
    });
    expect(resolved.source).toBe("verified_snapshot");
    expect(resolved.snapshotId).toBe(ACCEPTED_SNAPSHOT_ID);
    expect(resolved.digest).toBe(acceptedDigest);
    expect(resolved.corpus).toContain(ACCEPTED_NOTICE);
    expect(resolved.corpus).not.toContain(`Email: ${ORIGINAL_NOTICE}`);
    expect(resolved.renderKey).not.toBe(beforeKey);
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: AGREEMENT_ID,
        verifiedPaperLength: resolved.corpus.length,
        currentStage: "INPUT",
        snapshotStatus: "accepted",
        snapshotId: resolved.snapshotId,
        digest: resolved.digest,
        corpusPlain: resolved.corpus,
      }),
    ).toBe(true);
  });

  it("isolates accepted snapshot authority to the requested agreement id", async () => {
    const accepted = silverMesaPaper(ACCEPTED_NOTICE);
    const acceptedDigest = await sha256CorpusDigest(accepted);
    const resolved = await resolvePaidCreateResumeCorpus({
      agreementId: AGREEMENT_ID,
      draftPipelineCorpus: accepted,
      hydrateSnapshot: async () => ({
        ok: true,
        snapshot: {
          agreement_id: OTHER_AGREEMENT_ID,
          snapshot_id: ACCEPTED_SNAPSHOT_ID,
          corpus_plain: accepted,
          corpus_sha256: acceptedDigest,
          corpus_length: accepted.length,
          status: "accepted",
        },
      }),
    });
    expect(resolved.hydrateCode).toBe("agreement_id_mismatch");
    expect(resolved.source).toBe("none");
    expect(resolved.corpus).toBe("");
    expect(
      evaluateCreateResumeSnapshotAuthority({
        requestedAgreementId: AGREEMENT_ID,
        snapshot: {
          agreement_id: OTHER_AGREEMENT_ID,
          snapshot_id: ACCEPTED_SNAPSHOT_ID,
          corpus_plain: accepted,
          corpus_sha256: acceptedDigest,
          corpus_length: accepted.length,
          status: "accepted",
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects pending, superseded, and digest-mismatched GET paper even when long", async () => {
    const accepted = silverMesaPaper(ACCEPTED_NOTICE);
    const acceptedDigest = await sha256CorpusDigest(accepted);
    const pending = await resolvePaidCreateResumeCorpus({
      agreementId: AGREEMENT_ID,
      draftPipelineCorpus: accepted,
      hydrateSnapshot: async () => ({
        ok: true,
        snapshot: {
          agreement_id: AGREEMENT_ID,
          snapshot_id: ACCEPTED_SNAPSHOT_ID,
          corpus_plain: accepted,
          corpus_sha256: acceptedDigest,
          corpus_length: accepted.length,
          status: "pending",
        },
      }),
    });
    expect(pending.hydrateCode).toBe("rejected_pending");
    expect(pending.source).toBe("none");

    const superseded = await resolvePaidCreateResumeCorpus({
      agreementId: AGREEMENT_ID,
      draftPipelineCorpus: accepted,
      hydrateSnapshot: async () => ({
        ok: true,
        snapshot: {
          agreement_id: AGREEMENT_ID,
          snapshot_id: ACCEPTED_SNAPSHOT_ID,
          corpus_plain: accepted,
          corpus_sha256: acceptedDigest,
          corpus_length: accepted.length,
          status: "superseded",
        },
      }),
    });
    expect(superseded.hydrateCode).toBe("rejected_superseded");
    expect(superseded.source).toBe("none");

    const mismatched = await resolvePaidCreateResumeCorpus({
      agreementId: AGREEMENT_ID,
      draftPipelineCorpus: accepted,
      expectedDigest: "c".repeat(64),
      hydrateSnapshot: async () => ({
        ok: true,
        snapshot: {
          agreement_id: AGREEMENT_ID,
          snapshot_id: ACCEPTED_SNAPSHOT_ID,
          corpus_plain: accepted,
          corpus_sha256: acceptedDigest,
          corpus_length: accepted.length,
          status: "accepted",
        },
      }),
    });
    expect(mismatched.hydrateCode).toBe("digest_mismatch");
    expect(mismatched.source).toBe("none");
  });

  it("prefers the agreement-bound accepted snapshot over stale session SoT after reload", async () => {
    const original = silverMesaPaper(ORIGINAL_NOTICE);
    const accepted = silverMesaPaper(ACCEPTED_NOTICE);
    const acceptedDigest = await sha256CorpusDigest(accepted);
    const intakeText = [
      "Four-party white-label AI workflow software and infrastructure rollout under Texas law.",
      "Ironclad Systems Group LLC is the Sponsor. Harborline Data Solutions Inc. is the Vendor.",
      "Northwind Automation Partners LLC is the Integrator. Silver Mesa Analytics LP is the Analyst.",
    ].join(" ");
    const draft = {
      id: AGREEMENT_ID,
      title: "Joint AI Software and Infrastructure Rollout Agreement",
      jurisdiction: "TX",
      parties: [
        { id: "p1", name: "Ironclad Systems Group LLC", role: "owner", email: "ethan.cole@ironcladsg.com" },
        { id: "p2", name: "Harborline Data Solutions Inc.", role: "reviewer", email: "maya.bennett@harborlinedata.com" },
        { id: "p3", name: "Northwind Automation Partners LLC", role: "reviewer", email: "lucas.reed@northwindap.io" },
        { id: "p4", name: "Silver Mesa Analytics LP", role: "reviewer", email: ORIGINAL_NOTICE },
      ],
      purpose: original,
      payment_terms: "$187,500",
      duration: "24 months",
    };
    establishPaidProSourceOfTruth({
      text: original,
      source: "server_full_draft",
      draft: draft as never,
      intakeText,
      allowShorterOverwrite: true,
    });
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: ACCEPTED_SNAPSHOT_ID,
      corpusSha256: acceptedDigest,
      corpusLength: accepted.length,
      status: "accepted",
      orgId: ORG,
      corpusPlain: accepted,
    });
    const validated = resolveValidatedPaidProReviewCorpus({ agreementId: AGREEMENT_ID });
    expect(validated.plain).toContain(ACCEPTED_NOTICE);
    expect(validated.plain).not.toContain(`Email: ${ORIGINAL_NOTICE}`);
    expect(validated.source).toBe("verified_server_canonical_review_snapshot");
  });
});
