import { describe, expect, it } from "vitest";
import {
  overlayAuthorizedSignerIdentity,
  remountBundleToLockedVersion,
  signPaperAuthorityClosed,
} from "./recipientSigningLockedVersion";
import type { AgreementDraft } from "./agreementTypes";
import type { AgreementVersionBundle } from "./agreementVersionStore";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function bundle(id = "local-vid"): AgreementVersionBundle {
  return {
    agreementId: "ag-1",
    currentVersionId: id,
    versions: [
      {
        id,
        created_at: "2026-09-01T00:00:00.000Z",
        created_by: "owner",
        instruction: "Original draft",
        snapshot: {} as never,
        rendered_html: "<p>old</p>",
      },
    ],
  };
}

describe("recipient signing locked version", () => {
  it("remounts a local version onto the server lock id without inventing a second corpus", () => {
    const next = remountBundleToLockedVersion(bundle(), "lv-server", "<p>frozen</p>");
    expect(next.currentVersionId).toBe("lv-server");
    expect(next.versions).toHaveLength(1);
    expect(next.versions[0]?.id).toBe("lv-server");
    expect(next.versions[0]?.rendered_html).toBe("<p>frozen</p>");
  });

  it("fails closed on missing meta, version mismatch, or snapshot-digest disagreement", () => {
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: null,
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: { snapshotId: "crs-1", lockedVersionId: "lv-other", corpusSha256: SHA_A, corpusLength: 10, participantId: "p1", status: "accepted" },
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: { snapshotId: "crs-1", lockedVersionId: "lv-1", corpusSha256: SHA_A, corpusLength: 10, participantId: "p1", status: "accepted" },
        snapSha: SHA_B,
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: { snapshotId: "crs-1", lockedVersionId: "lv-1", corpusSha256: SHA_A, corpusLength: 10, participantId: "p1", status: "accepted" },
        lockSha: SHA_A,
        snapSha: SHA_A,
        acceptedSnapshotId: "crs-1",
        acceptedSnapshotDigest: SHA_A,
      }),
    ).toBe(false);
  });

  it("fails closed on incomplete lock snapshot binding, and keeps pre-cutover locks open", () => {
    const meta = {
      snapshotId: "crs-1",
      lockedVersionId: "lv-1",
      corpusSha256: SHA_A,
      corpusLength: 10,
      participantId: "p1",
      status: "accepted",
    };
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta,
        snapSha: SHA_A,
        acceptedSnapshotId: "crs-1",
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta,
        lockSha: SHA_B,
        snapSha: SHA_A,
      }),
    ).toBe(false);
  });

  it("fails closed when lock-bound snapshot id or digest disagrees with the rendered body", () => {
    const meta = {
      snapshotId: "crs-1",
      lockedVersionId: "lv-1",
      corpusSha256: SHA_A,
      corpusLength: 10,
      participantId: "p1",
      status: "accepted",
    };
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta,
        snapSha: SHA_A,
        acceptedSnapshotId: "crs-other",
        acceptedSnapshotDigest: SHA_A,
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta,
        snapSha: SHA_B,
        acceptedSnapshotId: "crs-1",
        acceptedSnapshotDigest: SHA_A,
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta,
        snapSha: SHA_A,
        acceptedSnapshotId: "crs-1",
        acceptedSnapshotDigest: SHA_A,
      }),
    ).toBe(false);
  });

  it("keeps a matching lock version open when lock and review-snapshot use different encodings", () => {
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: { snapshotId: "crs-1", lockedVersionId: "lv-1", corpusSha256: SHA_A, corpusLength: 10, participantId: "p1", status: "accepted" },
        lockSha: SHA_B,
        snapSha: SHA_A,
        acceptedSnapshotId: "crs-1",
        acceptedSnapshotDigest: SHA_A,
      }),
    ).toBe(false);
  });

  it("overlays token-authorized signer identity without inventing parties", () => {
    const draft = {
      id: "ag-1",
      parties: [
        { id: "p0", name: "Orion Labs LLC", role: "signer" },
        { id: "p1", name: "Contoso Retail Inc", role: "signer" },
      ],
    } as AgreementDraft;
    const next = overlayAuthorizedSignerIdentity(draft, {
      parties: [
        { id: "p0", name: "Orion Labs LLC", signerName: "Alex Rivera", signerTitle: "CEO" },
        { id: "p1", name: "Contoso Retail Inc", signerName: "Jordan Blake", signer_title: "General Counsel" },
      ],
    });
    expect(next.parties[0]?.signerName).toBe("Alex Rivera");
    expect(next.parties[0]?.signerTitle).toBe("CEO");
    expect(next.parties[1]?.signerName).toBe("Jordan Blake");
    expect(next.parties[1]?.signerTitle).toBe("General Counsel");
    expect(next.parties).toHaveLength(2);
  });
});
