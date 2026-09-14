import { describe, expect, it } from "vitest";
import {
  canonicalSnapshotCreatePath,
  formatObservedJsonFailure,
  isCanonicalSnapshotCreatePost,
  isCanonicalSnapshotCreateUrl,
  parseObservedJsonPayload,
  readOptionalAlertFromCount,
  snapshotFieldsFromObservedPayload,
} from "./corePaidJourneySnapshotObserve";

const AGREEMENT = "453d7ba8-d4d2-43ce-b5bb-163801832b41";

describe("C4 snapshot observation", () => {
  it("binds Apply to the exact snapshot-create path, not sibling snapshot operations", () => {
    const create = `http://127.0.0.1:4188${canonicalSnapshotCreatePath(AGREEMENT)}`;
    expect(isCanonicalSnapshotCreateUrl(create, AGREEMENT)).toBe(true);
    expect(isCanonicalSnapshotCreatePost({ url: create, method: "POST", agreementId: AGREEMENT })).toBe(true);
    expect(
      isCanonicalSnapshotCreateUrl(`${create}/accept`, AGREEMENT),
      "substring /canonical-review-snapshot also matches /accept",
    ).toBe(false);
    expect(isCanonicalSnapshotCreateUrl(`${create}/migrate-legacy`, AGREEMENT)).toBe(false);
    expect(isCanonicalSnapshotCreatePost({ url: create, method: "GET", agreementId: AGREEMENT })).toBe(false);
    expect(
      isCanonicalSnapshotCreateUrl(create, "dfad3eeb-0b3d-47a6-845c-6d057e7ea565"),
    ).toBe(false);
  });

  it("preserves the original parse failure instead of substituting {}", () => {
    const parsed = parseObservedJsonPayload({
      raw: "<html>timeout</html>",
      endpoint: canonicalSnapshotCreatePath(AGREEMENT),
      method: "POST",
      status: 200,
      stage: "response_payload+12ms",
      elapsedMs: 12,
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected parse failure");
    expect(parsed.error.kind).toBe("parse_failed");
    expect(parsed.error.status).toBe(200);
    expect(parsed.error.method).toBe("POST");
    expect(parsed.error.stage).toContain("response_payload");
    expect(formatObservedJsonFailure(parsed.error)).toMatch(/parse_failed/);
    expect(formatObservedJsonFailure(parsed.error)).not.toMatch(/Received string: ""/);
  });

  it("treats an absent success-path alert as empty without waiting", () => {
    expect(readOptionalAlertFromCount(0, null)).toBe("");
    expect(readOptionalAlertFromCount(0, "Could not apply")).toBe("");
    expect(readOptionalAlertFromCount(1, "  Could not apply  ")).toBe("Could not apply");
  });

  it("reads snapshot identity from the observed payload without inventing corpus", () => {
    const fields = snapshotFieldsFromObservedPayload({
      snapshot: {
        agreement_id: AGREEMENT,
        snapshot_id: "crs_11ee01559569452c991cfedbf3ec23d9",
        corpus_sha256: "A".repeat(64),
        corpus_plain: "Consultant will invoice the fixed fee monthly.",
        corpus_length: 44,
      },
    });
    expect(fields.snapshotId).toBe("crs_11ee01559569452c991cfedbf3ec23d9");
    expect(fields.digest).toBe("a".repeat(64));
    expect(fields.corpus).toMatch(/monthly/);
  });
});
