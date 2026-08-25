import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeAgreementDraftFromApi } from "./agreementDraftNormalize";
import {
  readFullyExecutedSnapshotFromDraft,
  resolveVs01FullyExecutedSignedCorpus,
} from "../vs01/vs01FullyExecutedSignedSnapshot";

const CORPUS = [
  "Consulting Services Agreement",
  "",
  "This Agreement is entered into by Redwood Biologics Inc, Summit AI Consulting LLC,",
  "Blue Harbor Systems LLC, and Iron Gate Security LLC.",
  "",
  "IN WITNESS WHEREOF, the Parties have executed this Agreement.",
  "",
  "Redwood Biologics Inc",
  "By: Ava Chen",
  "Name: Ava Chen",
  "Title: Chief Science Officer",
  "",
  "Summit AI Consulting LLC",
  "By: Noah Patel",
  "Name: Noah Patel",
  "Title: Managing Partner",
  "",
  "Blue Harbor Systems LLC",
  "By: Maya Brooks",
  "Name: Maya Brooks",
  "Title: Integration Director",
  "",
  "Iron Gate Security LLC",
  "By: Luis Ortega",
  "Name: Luis Ortega",
  "Title: Security Auditor",
].join("\n");

const SNAPSHOT = {
  v: 1,
  corpus_plain: CORPUS,
  corpus_hash: createHash("sha256").update(CORPUS, "utf8").digest("hex"),
  saved_at: "2026-08-25T17:54:12.395210Z",
  signer_role_ids: [
    "vs01r:ag_gtm_four_:i0:party_0",
    "vs01r:ag_gtm_four_:i1:party_1",
    "vs01r:ag_gtm_four_:i2:party_2",
    "vs01r:ag_gtm_four_:i3:party_3",
  ],
};

describe("normalizeAgreementDraftFromApi — executed snapshot authority", () => {
  it("preserves vs01 fully_executed_snapshot for owner signed-artifact retrieval", () => {
    const raw = {
      id: "ag_gtm_four_party",
      title: "Consulting Services Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Redwood Biologics Inc", role: "owner" },
        { name: "Summit AI Consulting LLC", role: "counterparty" },
      ],
      vs01_signing_packet_v1: {
        document_id: "doc_ag_gtm_four_party",
        packet_state: "active",
        portable: { v: 1, ignored_chrome: true },
        fully_executed_snapshot: SNAPSHOT,
      },
    };

    const normalized = normalizeAgreementDraftFromApi(raw, {
      fallbackAgreementId: "ag_gtm_four_party",
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.id).toBe("ag_gtm_four_party");
    expect(normalized!.vs01_signing_packet_v1?.fully_executed_snapshot?.corpus_plain).toBe(CORPUS);
    expect(normalized!.vs01_signing_packet_v1?.fully_executed_snapshot?.corpus_hash).toBe(
      SNAPSHOT.corpus_hash,
    );
    expect(normalized!.vs01_signing_packet_v1?.fully_executed_snapshot?.saved_at).toBe(
      SNAPSHOT.saved_at,
    );
    expect(normalized!.vs01_signing_packet_v1?.fully_executed_snapshot?.signer_role_ids).toEqual(
      SNAPSHOT.signer_role_ids,
    );
    expect(
      (normalized!.vs01_signing_packet_v1 as { portable?: unknown } | undefined)?.portable,
    ).toBeUndefined();

    const snap = readFullyExecutedSnapshotFromDraft(normalized);
    expect(snap?.corpusPlain).toBe(CORPUS);
    const resolved = resolveVs01FullyExecutedSignedCorpus(normalized);
    expect(resolved?.source).toBe("fully_executed_snapshot");
    expect(resolved?.text).toBe(CORPUS);
  });

  it("normalizes an ordinary agreement without a signing packet", () => {
    const raw = {
      id: "ag_plain",
      title: "NDA",
      jurisdiction: "Delaware",
      parties: [{ name: "Acme LLC", role: "owner" }],
      purpose: "Confidentiality",
    };
    const normalized = normalizeAgreementDraftFromApi(raw, { fallbackAgreementId: "ag_plain" });
    expect(normalized).not.toBeNull();
    expect(normalized!.id).toBe("ag_plain");
    expect(normalized!.title).toBe("NDA");
    expect(normalized!.vs01_signing_packet_v1).toBeUndefined();
    expect(resolveVs01FullyExecutedSignedCorpus(normalized)).toBeNull();
  });
});
