/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  holdNextCommercialReviewSnapshotPrepare,
  readDisplayReviewSnapshotAuthority,
  releaseCommercialReviewSnapshotPrepareHoldForTests,
  sha256CorpusDigest,
  storeDisplayReviewSnapshotAuthority,
} from "../../agreement/canonicalReviewSnapshotApi";
import { setOrgId } from "../../launch/orgContext";
import {
  beginPaidProRevisionOperation,
  clearPaidProRevisionOperationsForTests,
  setPaidProLiveRevisionView,
} from "./paidProRevisionOperation";
import {
  applyOwnerApprovedRevisionCallerDisplay,
  commitPaidProUserApprovedRevisionCorpus,
  resolveOwnerApprovedRevisionCallerOutcome,
} from "./paidProUserApprovedRevisionCommit";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";

function paddedCorpus(paymentLine: string, marker: string): string {
  const fees = [
    "CONSULTING SERVICES AGREEMENT",
    "This Agreement is entered into by Harbor Peak Analytics LLC and Ironvale Manufacturing Inc.",
    "3. Fees and Payment",
    `Client will pay Consultant a fixed fee of $48,000. ${paymentLine}`,
    "4. Term",
    "Twelve months.",
    marker,
  ].join("\n");
  return `${fees}\n${"Operative commercial paragraph. ".repeat(40)}`.trim();
}

const CORPUS_A = paddedCorpus("Consultant will invoice the fixed fee monthly.", "PAPER-A");
const CORPUS_B = paddedCorpus("Consultant will invoice the fixed fee weekly.", "PAPER-B");
const CORPUS_A_V2 = paddedCorpus(
  "Consultant will invoice the fixed fee once on October 1, 2026. Payment is due net 60.",
  "PAPER-A-V2",
);

const OP_A = {
  userId: "owner-a",
  organizationId: "org-a",
  agreementId: "agr-a",
  revisionId: "rev-a1",
  requestId: "req-a1",
};

const OP_B = {
  userId: "owner-a",
  organizationId: "org-a",
  agreementId: "agr-b",
  revisionId: "rev-b1",
  requestId: "req-b1",
};

const OP_A_V2 = {
  ...OP_A,
  revisionId: "rev-a2",
  requestId: "req-a2",
};

function snapshotEnvelope(agreementId: string, corpus: string, snapshotId: string, digest: string) {
  return {
    snapshot_id: snapshotId,
    agreement_id: agreementId,
    corpus_plain: corpus,
    corpus_sha256: digest,
    corpus_length: corpus.length,
    status: "pending",
    schema_version: "claw.canonical_review_snapshot/v1",
  };
}

async function stubSnapshotFetch(args: {
  holdAgreementId?: string;
  posts: string[];
}): Promise<void> {
  const digestA = await sha256CorpusDigest(CORPUS_A);
  const digestB = await sha256CorpusDigest(CORPUS_B);
  const digestAv2 = await sha256CorpusDigest(CORPUS_A_V2);
  const lastPosted = new Map<string, { corpus: string; digest: string }>();
  lastPosted.set("agr-a", { corpus: CORPUS_A, digest: digestA });
  lastPosted.set("agr-b", { corpus: CORPUS_B, digest: digestB });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      const agreementId = (url.match(/\/agreements\/([^/]+)\/canonical-review-snapshot/) || [])[1] || "";
      if (!url.includes("/canonical-review-snapshot")) {
        throw new Error(`unexpected fetch ${method} ${url}`);
      }
      if (method === "POST") {
        args.posts.push(url);
        const posted = JSON.parse(String(init?.body || "{}")) as { corpus_plain?: string };
        const corpus = String(posted.corpus_plain || "").trim();
        const digest =
          corpus === CORPUS_A_V2 ? digestAv2 : corpus === CORPUS_B ? digestB : digestA;
        if (corpus) lastPosted.set(agreementId, { corpus, digest });
      }
      const posted = lastPosted.get(agreementId) || { corpus: CORPUS_A, digest: digestA };
      const snapshotId = `${agreementId}-${posted.digest.slice(0, 8)}`;
      const body = {
        snapshot: snapshotEnvelope(agreementId, posted.corpus, snapshotId, posted.digest),
        status: "pending",
        registry_version: 1,
      };
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as Response;
    }),
  );
}

afterEach(() => {
  releaseCommercialReviewSnapshotPrepareHoldForTests();
  clearPaidProRevisionOperationsForTests();
  clearPaidProSourceOfTruth();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("production paid revision commit isolation", () => {
  it("delayed A prepare does not repaint B or write B after a switch", async () => {
    setOrgId("org-a");
    setPaidProLiveRevisionView(OP_B);
    storeDisplayReviewSnapshotAuthority({
      agreementId: "agr-b",
      snapshotId: "crs-b-original",
      corpusSha256: "b".repeat(64),
      corpusLength: CORPUS_B.length,
      status: "pending",
    });
    const paints: string[] = [];
    const posts: string[] = [];
    await stubSnapshotFetch({ posts });
    const hold = holdNextCommercialReviewSnapshotPrepare();
    beginPaidProRevisionOperation(OP_A);
    const pending = commitPaidProUserApprovedRevisionCorpus({
      text: CORPUS_A,
      reason: "payment_clarification_answer",
      operation: OP_A,
      generationSessionId: "gen-a",
      applyDisplayMutations: (stable) => paints.push(stable),
    });
    setPaidProLiveRevisionView(OP_B);
    hold.release();
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.displayed).toBe(false);
    expect(paints).toEqual([]);
    expect(getPaidProSourceOfTruthText()).not.toContain("PAPER-A");
    expect(readDisplayReviewSnapshotAuthority("agr-b")?.snapshotId).toBe("crs-b-original");
    expect(posts.some((url) => url.includes("/agreements/agr-b/"))).toBe(false);
    expect(posts.some((url) => url.includes("/agreements/agr-a/"))).toBe(true);
    expect(result.code).toBe("display_identity_changed");
  });

  it("production caller must not paint when persist succeeded with displayed:false", () => {
    const paints: string[] = [];
    const painted = applyOwnerApprovedRevisionCallerDisplay({
      result: { ok: true, corpus: CORPUS_A, displayed: false, code: "display_identity_changed" },
      captured: OP_A,
      live: OP_A,
      activeRequestId: OP_A.requestId,
      paint: (corpus) => paints.push(corpus),
    });
    expect(painted).toBe(false);
    expect(paints).toEqual([]);
    expect(resolveOwnerApprovedRevisionCallerOutcome({
      ok: true,
      corpus: CORPUS_A,
      displayed: false,
      code: "display_identity_changed",
    })).toEqual({
      applied: true,
      corpus: CORPUS_A,
      paint: false,
      code: "display_identity_changed",
    });
  });

  it("production caller paints only when persist displayed and live identity still matches", () => {
    const paints: string[] = [];
    expect(
      applyOwnerApprovedRevisionCallerDisplay({
        result: { ok: true, corpus: CORPUS_A, displayed: true },
        captured: OP_A,
        live: OP_A_V2,
        activeRequestId: OP_A.requestId,
        paint: (corpus) => paints.push(corpus),
      }),
    ).toBe(false);
    expect(
      applyOwnerApprovedRevisionCallerDisplay({
        result: { ok: true, corpus: CORPUS_A, displayed: true },
        captured: OP_A,
        live: OP_A,
        activeRequestId: "req-other",
        paint: (corpus) => paints.push(corpus),
      }),
    ).toBe(false);
    expect(
      applyOwnerApprovedRevisionCallerDisplay({
        result: { ok: true, corpus: CORPUS_A, displayed: true },
        captured: OP_A,
        live: OP_A,
        activeRequestId: OP_A.requestId,
        paint: (corpus) => paints.push(corpus),
      }),
    ).toBe(true);
    expect(paints).toEqual([CORPUS_A]);
  });

  it("AgreementBuilderIntake Apply caller carries the persist/display result and does not override it", () => {
    const intake = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "AgreementBuilderIntake.tsx"),
      "utf8",
    );
    expect(intake).toContain("resolveOwnerApprovedRevisionCallerOutcome");
    expect(intake).toContain("applyOwnerApprovedRevisionCallerDisplay");
    expect(intake).toContain("committed.displayed");
    expect(intake).not.toMatch(/setAgreementDocumentText\(painted\)/);
  });

  it("org switch aborts persist before a write with the wrong org headers", async () => {
    setOrgId("org-a");
    setPaidProLiveRevisionView(OP_A);
    const paints: string[] = [];
    const posts: string[] = [];
    await stubSnapshotFetch({ posts });
    const hold = holdNextCommercialReviewSnapshotPrepare();
    beginPaidProRevisionOperation(OP_A);
    const pending = commitPaidProUserApprovedRevisionCorpus({
      text: CORPUS_A,
      reason: "payment_clarification_answer",
      operation: OP_A,
      generationSessionId: "gen-a",
      applyDisplayMutations: (stable) => paints.push(stable),
    });
    setOrgId("org-b");
    setPaidProLiveRevisionView({ ...OP_A, organizationId: "org-b" });
    hold.release();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.displayed).toBe(false);
    expect(paints).toEqual([]);
    expect(posts).toEqual([]);
    expect(getPaidProSourceOfTruthText()).not.toContain("PAPER-A");
  });

  it("a superseded request does not overwrite newer paper", async () => {
    setOrgId("org-a");
    setPaidProLiveRevisionView(OP_A);
    const paints: string[] = [];
    const posts: string[] = [];
    await stubSnapshotFetch({ posts });
    const hold = holdNextCommercialReviewSnapshotPrepare();
    beginPaidProRevisionOperation(OP_A);
    const stale = commitPaidProUserApprovedRevisionCorpus({
      text: CORPUS_A,
      reason: "payment_clarification_answer",
      operation: OP_A,
      generationSessionId: "gen-a",
      applyDisplayMutations: (stable) => paints.push(stable),
    });
    beginPaidProRevisionOperation(OP_A_V2);
    setPaidProLiveRevisionView(OP_A_V2);
    const newer = await commitPaidProUserApprovedRevisionCorpus({
      text: CORPUS_A_V2,
      reason: "payment_clarification_answer",
      operation: OP_A_V2,
      generationSessionId: "gen-a2",
      applyDisplayMutations: (stable) => paints.push(stable),
    });
    expect(newer.ok).toBe(true);
    expect(newer.displayed).toBe(true);
    hold.release();
    const staleResult = await stale;
    expect(staleResult.ok).toBe(false);
    expect(staleResult.displayed).toBe(false);
    expect(paints.filter((text) => text.includes("PAPER-A") && !text.includes("PAPER-A-V2"))).toEqual([]);
    expect(paints.some((text) => text.includes("PAPER-A-V2"))).toBe(true);
  });
});
