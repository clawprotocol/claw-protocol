import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerApiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/ownerApiClient", () => ({ ownerApiFetch: ownerApiFetchMock }));

import {
  fetchLayoutAnalysis,
  fetchOwnerDocumentContent,
  postFieldReviewOpen,
  putReviewManifest,
} from "./documentLayoutApi";

describe("document layout owner API calls", () => {
  beforeEach(() => ownerApiFetchMock.mockReset());

  it("routes analysis reads and field-review writes through owner authentication", async () => {
    ownerApiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, analysis_id: "analysis_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, analysis_id: "analysis_1" }), { status: 200 }));

    await fetchLayoutAnalysis("analysis_1");
    await postFieldReviewOpen("analysis_1");
    await putReviewManifest("analysis_1", [{ action: "confirm", candidate_id: "candidate_1" }]);

    expect(ownerApiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/v1/document-layout/analysis/analysis_1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(ownerApiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/v1/document-layout/analysis/analysis_1/field-review/open",
      expect.objectContaining({ method: "POST" }),
    );
    expect(ownerApiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/v1/document-layout/analysis/analysis_1/review-manifest",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("loads protected document bytes through the same owner boundary", async () => {
    ownerApiFetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );

    const blob = await fetchOwnerDocumentContent("doc_1");
    expect(blob.type).toBe("application/pdf");
    expect(ownerApiFetchMock).toHaveBeenCalledWith(
      "/v1/documents/doc_1/content",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
