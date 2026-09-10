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

  it("fails closed on missing meta, version mismatch, or hash mismatch", () => {
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: null,
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: { lockedVersionId: "lv-other", corpusSha256: SHA_A, corpusLength: 10 },
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: { lockedVersionId: "lv-1", corpusSha256: SHA_A, corpusLength: 10 },
        lockSha: SHA_A,
        snapSha: SHA_B,
      }),
    ).toBe(true);
    expect(
      signPaperAuthorityClosed({
        tokenLockedVersionId: "lv-1",
        meta: { lockedVersionId: "lv-1", corpusSha256: SHA_A, corpusLength: 10 },
        lockSha: SHA_A,
        snapSha: SHA_A,
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
