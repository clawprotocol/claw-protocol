/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import {
  longestDraftPipelineCorpus,
  resolvePaidCreateResumeCorpus,
  selectPaidCreateResumeCorpus,
  shouldAttemptCanonicalSnapshotOnCreateResume,
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

describe("paid create resume hydration", () => {
  it("always attempts canonical snapshot GET, even when draft pipeline fields are short", () => {
    expect(shouldAttemptCanonicalSnapshotOnCreateResume("")).toBe(true);
    expect(shouldAttemptCanonicalSnapshotOnCreateResume("short")).toBe(true);
    expect(shouldAttemptCanonicalSnapshotOnCreateResume(STALE_MONTHLY)).toBe(true);
  });

  it("hydrates and paints the latest snapshot when draft pipeline fields are short", async () => {
    const hydrateSnapshot = vi.fn(async () => ({
      ok: true as const,
      snapshot: {
        agreement_id: "agr-saved",
        corpus_plain: LATEST,
        snapshot_id: "snap-latest",
        corpus_sha256: "aa".repeat(32),
      },
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
        snapshot: { agreement_id: "agr-saved", corpus_plain: LATEST, snapshot_id: "snap-2" },
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
        snapshot: { agreement_id: "agr-other", corpus_plain: LATEST, snapshot_id: "snap-x" },
      }),
    });
    expect(resolved.hydrateCode).toBe("agreement_id_mismatch");
    expect(resolved.source).toBe("draft_pipeline");
    expect(resolved.corpus).toBe(STALE_MONTHLY);
  });

  it("keeps the longest draft pipeline candidate when selecting fallback paper", () => {
    expect(longestDraftPipelineCorpus(["aa", "bbbb", "ccc"])).toBe("bbbb");
    expect(selectPaidCreateResumeCorpus({ verifiedSnapshotCorpus: "", draftPipelineCorpus: STALE_MONTHLY }).source).toBe(
      "draft_pipeline",
    );
  });
});
