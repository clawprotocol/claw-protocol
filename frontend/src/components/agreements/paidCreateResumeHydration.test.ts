/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import {
  createResumeRenderKey,
  evaluateCreateResumeSnapshotAuthority,
  longestDraftPipelineCorpus,
  resolvePaidCreateResumeCorpus,
  resolvePaidCreateResumeDisplayPhase,
  selectExistingPaidReviewPlainForPreview,
  selectPaidCreateResumeCorpus,
  shouldAttemptCanonicalSnapshotOnCreateResume,
  shouldPromoteCreateResumeToReviewChrome,
  shouldReuseCreateResumeHydration,
} from "./paidCreateResumeHydration";

const LATEST = [
  "CONSULTING SERVICES AGREEMENT",
  "Harbor Peak Analytics LLC",
  "3. Fees and Payment",
  "Client will pay Consultant a fixed fee of $48,000. Consultant will invoice the fixed fee once on October 1, 2026. Payment is due net 60.",
  "4. Term",
  "Twelve months starting October 1, 2026.",
  "x".repeat(PAID_PRO_AUTHORITY_MIN_LEN),
].join("\n");

const STALE_MONTHLY = [
  "CONSULTING SERVICES AGREEMENT",
  "Harbor Peak Analytics LLC",
  "3. Fees and Payment",
  "Client will pay Consultant a fixed fee of $48,000. Consultant will invoice the fixed fee monthly.",
  "4. Term",
  "Twelve months starting October 1, 2026.",
  "y".repeat(PAID_PRO_AUTHORITY_MIN_LEN),
].join("\n");

const ACCEPTED_DIGEST = "aa".repeat(32);
const OTHER_DIGEST = "bb".repeat(32);

function acceptedSnapshot(overrides?: Record<string, unknown>) {
  return {
    agreement_id: "agr-saved",
    corpus_plain: LATEST,
    snapshot_id: "snap-latest",
    corpus_sha256: ACCEPTED_DIGEST,
    corpus_length: LATEST.length,
    status: "accepted",
    ...overrides,
  };
}

describe("paid create resume hydration", () => {
  it("always attempts canonical snapshot GET, even when draft pipeline fields are short", () => {
    expect(shouldAttemptCanonicalSnapshotOnCreateResume("")).toBe(true);
    expect(shouldAttemptCanonicalSnapshotOnCreateResume("short")).toBe(true);
    expect(shouldAttemptCanonicalSnapshotOnCreateResume(STALE_MONTHLY)).toBe(true);
  });

  it("hydrates and paints the latest accepted snapshot when draft pipeline fields are short", async () => {
    const hydrateSnapshot = vi.fn(async () => ({
      ok: true as const,
      snapshot: acceptedSnapshot(),
    }));
    const resolved = await resolvePaidCreateResumeCorpus({
      agreementId: "agr-saved",
      draftPipelineCorpus: "short draft",
      hydrateSnapshot,
    });
    expect(hydrateSnapshot).toHaveBeenCalledWith({ agreementId: "agr-saved" });
    expect(resolved.hydrateAttempted).toBe(true);
    expect(resolved.source).toBe("verified_snapshot");
    expect(resolved.snapshotId).toBe("snap-latest");
    expect(resolved.status).toBe("accepted");
    expect(resolved.corpus).toMatch(/October 1, 2026/);
    expect(resolved.corpus).toMatch(/net 60/);
    expect(resolved.corpus).not.toMatch(/monthly/i);
  });

  it("prefers verified snapshot paper over a long stale draft pipeline body", async () => {
    const resolved = await resolvePaidCreateResumeCorpus({
      agreementId: "agr-saved",
      draftPipelineCorpus: STALE_MONTHLY,
      hydrateSnapshot: async () => ({
        ok: true,
        snapshot: acceptedSnapshot({ snapshot_id: "snap-2" }),
      }),
    });
    expect(resolved.source).toBe("verified_snapshot");
    expect(resolved.corpus).toMatch(/once on October 1, 2026/);
    expect(resolved.corpus).not.toMatch(/invoice the fixed fee monthly/i);
  });

  it("does not invent paper when snapshot GET fails and draft fields are insufficient", async () => {
    const resolved = await resolvePaidCreateResumeCorpus({
      agreementId: "agr-saved",
      draftPipelineCorpus: "too short",
      hydrateSnapshot: async () => ({ ok: false, code: "snapshot_unavailable" }),
    });
    expect(resolved.hydrateAttempted).toBe(true);
    expect(resolved.hydrateCode).toBe("snapshot_unavailable");
    expect(resolved.source).toBe("none");
    expect(resolved.corpus).toBe("");
  });

  it("does not paint a snapshot returned for a different agreement", async () => {
    const resolved = await resolvePaidCreateResumeCorpus({
      agreementId: "agr-saved",
      draftPipelineCorpus: STALE_MONTHLY,
      hydrateSnapshot: async () => ({
        ok: true,
        snapshot: acceptedSnapshot({ agreement_id: "agr-other" }),
      }),
    });
    expect(resolved.hydrateCode).toBe("agreement_id_mismatch");
    expect(resolved.source).toBe("none");
    expect(resolved.corpus).toBe("");
  });

  it("keeps the longest draft pipeline candidate when selecting fallback paper", () => {
    expect(longestDraftPipelineCorpus(["aa", "bbbb", "ccc"])).toBe("bbbb");
    expect(selectPaidCreateResumeCorpus({ verifiedSnapshotCorpus: "", draftPipelineCorpus: STALE_MONTHLY }).source).toBe(
      "draft_pipeline",
    );
  });

  it("promotes create resume off intake only when accepted snapshot identity matches this agreement", () => {
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: "agr-saved",
        verifiedPaperLength: LATEST.length,
        currentStage: "INPUT",
        snapshotStatus: "accepted",
        snapshotId: "snap-latest",
        digest: ACCEPTED_DIGEST,
      }),
    ).toBe(true);
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: "agr-saved",
        verifiedPaperLength: LATEST.length,
        currentStage: "DRAFT",
        snapshotStatus: "accepted",
        snapshotId: "snap-latest",
        digest: ACCEPTED_DIGEST,
      }),
    ).toBe(false);
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: "",
        verifiedPaperLength: LATEST.length,
        currentStage: "INPUT",
        snapshotStatus: "accepted",
        snapshotId: "snap-latest",
        digest: ACCEPTED_DIGEST,
      }),
    ).toBe(false);
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: "agr-saved",
        verifiedPaperLength: LATEST.length,
        currentStage: "INPUT",
      }),
    ).toBe(false);
    expect(
      shouldPromoteCreateResumeToReviewChrome({
        agreementId: "agr-saved",
        verifiedPaperLength: 0,
        currentStage: "INPUT",
        snapshotStatus: "accepted",
        snapshotId: "snap-latest",
        digest: ACCEPTED_DIGEST,
      }),
    ).toBe(false);
  });

  it("keeps review chrome when snapshot paper exists even if draft pipeline fields are empty", () => {
    expect(
      resolvePaidCreateResumeDisplayPhase({
        signerSetupResume: false,
        snapshotOrPipelineCorpus: LATEST,
        draftKeepsReview: false,
      }),
    ).toBe("review");
    expect(
      resolvePaidCreateResumeDisplayPhase({
        signerSetupResume: false,
        snapshotOrPipelineCorpus: "",
        draftKeepsReview: false,
      }),
    ).toBe("intake");
    expect(
      resolvePaidCreateResumeDisplayPhase({
        signerSetupResume: true,
        snapshotOrPipelineCorpus: "",
        draftKeepsReview: false,
      }),
    ).toBe("review");
  });

  it("rejects pending, superseded, and digest-mismatched GET authority", () => {
    expect(
      evaluateCreateResumeSnapshotAuthority({
        requestedAgreementId: "agr-saved",
        snapshot: acceptedSnapshot({ status: "pending" }),
      }).ok,
    ).toBe(false);
    expect(
      evaluateCreateResumeSnapshotAuthority({
        requestedAgreementId: "agr-saved",
        snapshot: acceptedSnapshot({ status: "superseded" }),
      }).ok,
    ).toBe(false);
    expect(
      evaluateCreateResumeSnapshotAuthority({
        requestedAgreementId: "agr-saved",
        snapshot: acceptedSnapshot(),
        expectedDigest: OTHER_DIGEST,
      }).ok,
    ).toBe(false);
  });

  it("reuses committed accepted bytes for preview instead of an empty rebuild", () => {
    expect(
      selectExistingPaidReviewPlainForPreview({
        verifiedSnapshotCorpus: LATEST,
        draftPipelineCorpus: STALE_MONTHLY,
      }),
    ).toEqual({ corpus: LATEST, source: "verified_snapshot" });
    expect(
      selectExistingPaidReviewPlainForPreview({
        verifiedSnapshotCorpus: "",
        draftPipelineCorpus: LATEST,
      }),
    ).toEqual({ corpus: LATEST, source: "draft_pipeline" });
    expect(
      selectExistingPaidReviewPlainForPreview({
        verifiedSnapshotCorpus: "",
        draftPipelineCorpus: "short",
        hydratedCorpus: LATEST,
      }),
    ).toEqual({ corpus: LATEST, source: "hydrated_ref" });
    expect(
      selectExistingPaidReviewPlainForPreview({
        verifiedSnapshotCorpus: "",
        draftPipelineCorpus: "",
        hydratedCorpus: "",
      }).source,
    ).toBe("none");
  });

  it("reuses in-mount hydration only for the same agreement id", () => {
    expect(shouldReuseCreateResumeHydration({ agreementId: "agr-saved", hydratedAgreementId: "agr-saved" })).toBe(
      true,
    );
    expect(shouldReuseCreateResumeHydration({ agreementId: "agr-saved", hydratedAgreementId: "agr-other" })).toBe(
      false,
    );
    expect(shouldReuseCreateResumeHydration({ agreementId: "agr-saved", hydratedAgreementId: "" })).toBe(false);
  });

  it("changes the resume render key when async GET returns a newer accepted snapshot", async () => {
    const before = createResumeRenderKey({
      agreementId: "agr-saved",
      snapshotId: "snap-original",
      digest: OTHER_DIGEST,
    });
    const resolved = await resolvePaidCreateResumeCorpus({
      agreementId: "agr-saved",
      draftPipelineCorpus: STALE_MONTHLY,
      hydrateSnapshot: async () => ({ ok: true, snapshot: acceptedSnapshot() }),
    });
    expect(resolved.renderKey).toBeTruthy();
    expect(resolved.renderKey).not.toBe(before);
    expect(resolved.snapshotId).toBe("snap-latest");
    expect(resolved.digest).toBe(ACCEPTED_DIGEST);
  });
});
