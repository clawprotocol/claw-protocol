import { describe, expect, it, vi } from "vitest";
import {
  adaptRecipientSessionPacketProjection,
} from "./recipientSessionPacketAdapter";
import {
  fetchRecipientSessionPacket,
  parseRecipientSessionPacketProjection,
  type RecipientSessionPacketProjection,
} from "./recipientSessionPacketApi";

const SAMPLE: RecipientSessionPacketProjection = {
  ok: true,
  v: 1,
  document_label: "Mutual NDA",
  accepted_version_id: "av_test",
  accepted_corpus_sha256: "abc123",
  packet_revision: "rev1",
  signer_record_id: "signer:party_a:0",
  signer_role_id: "vs01r:test:i0:party_a",
  party_id: "party_a",
  signer_display_name: "Jane Signer",
  signer_title: "Authorized Signer",
  corpus_plain: "MUTUAL NDA AGREEMENT\n\n" + "Operative term. ".repeat(120),
  corpus_hash: "hash123",
  fields: [
    {
      id: "f1",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.05,
      autoInitials: false,
    },
  ],
  page_count: 10,
  witness_page_index: 9,
  initials_policy: { enabled: false, bodyPagesOnly: true },
  readiness: "ready_for_signing",
};

function asBody(value: RecipientSessionPacketProjection): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

describe("parseRecipientSessionPacketProjection", () => {
  it("parses valid projection payloads", () => {
    const parsed = parseRecipientSessionPacketProjection(asBody(SAMPLE));
    expect(parsed?.signer_role_id).toBe(SAMPLE.signer_role_id);
    expect(parsed?.fields).toHaveLength(1);
  });

  it("rejects missing ok", () => {
    const rest = { ...SAMPLE } as Record<string, unknown>;
    delete rest.ok;
    expect(parseRecipientSessionPacketProjection(rest)).toBeNull();
  });

  it("rejects ok false", () => {
    expect(
      parseRecipientSessionPacketProjection(asBody({ ...SAMPLE, ok: false })),
    ).toBeNull();
  });

  it("rejects non-boolean ok", () => {
    expect(
      parseRecipientSessionPacketProjection(
        asBody({ ...SAMPLE, ok: "true" as unknown as true }),
      ),
    ).toBeNull();
  });

  it("rejects missing signer_role_id", () => {
    const rest = { ...SAMPLE } as Record<string, unknown>;
    delete rest.signer_role_id;
    expect(parseRecipientSessionPacketProjection(rest)).toBeNull();
  });

  it("rejects empty corpus_plain", () => {
    expect(
      parseRecipientSessionPacketProjection(
        asBody({ ...SAMPLE, corpus_plain: "   " }),
      ),
    ).toBeNull();
  });

  it("rejects invalid readiness", () => {
    expect(
      parseRecipientSessionPacketProjection(
        asBody({ ...SAMPLE, readiness: "session_established" as "ready_for_review" }),
      ),
    ).toBeNull();
  });

  it("rejects duplicate field ids", () => {
    expect(
      parseRecipientSessionPacketProjection(
        asBody({
          ...SAMPLE,
          fields: [SAMPLE.fields[0]!, { ...SAMPLE.fields[0]!, id: "f1" }],
        }),
      ),
    ).toBeNull();
  });

  it("rejects unsupported field types", () => {
    expect(
      parseRecipientSessionPacketProjection(
        asBody({
          ...SAMPLE,
          fields: [{ ...SAMPLE.fields[0]!, type: "checkbox" as "signature" }],
        }),
      ),
    ).toBeNull();
  });

  it("rejects non-finite coordinates", () => {
    expect(
      parseRecipientSessionPacketProjection(
        asBody({
          ...SAMPLE,
          fields: [{ ...SAMPLE.fields[0]!, x: Number.NaN }],
        }),
      ),
    ).toBeNull();
  });

  it("rejects page indices outside page_count", () => {
    expect(
      parseRecipientSessionPacketProjection(
        asBody({
          ...SAMPLE,
          fields: [{ ...SAMPLE.fields[0]!, page: 99 }],
        }),
      ),
    ).toBeNull();
  });

  it("rejects malformed initials_policy", () => {
    expect(
      parseRecipientSessionPacketProjection(
        asBody({
          ...SAMPLE,
          initials_policy: { enabled: "yes", bodyPagesOnly: true } as unknown as {
            enabled: boolean;
            bodyPagesOnly: boolean;
          },
        }),
      ),
    ).toBeNull();
  });
});

describe("fetchRecipientSessionPacket", () => {
  it("uses cache no-store and rejects malformed 200 responses without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, v: 1, readiness: "ready_for_review" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRecipientSessionPacket();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("malformed");
      expect(result.code).toBe("packet_parse_failed");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recipient/session/packet",
      expect.objectContaining({ cache: "no-store", credentials: "include" }),
    );
    expect(() => adaptRecipientSessionPacketProjection(SAMPLE)).not.toThrow();

    vi.unstubAllGlobals();
  });
});

describe("recipientSessionPacketAdapter", () => {
  it("maps projection fields to locked signer role assignments", () => {
    const adapted = adaptRecipientSessionPacketProjection(SAMPLE);
    expect(adapted).not.toBeNull();
    expect(adapted!.fields.every((f) => f.assignedSignerRoleId === SAMPLE.signer_role_id)).toBe(true);
    expect(adapted!.model.pages.length).toBeGreaterThan(0);
  });

  it("never throws when given a validated projection", () => {
    expect(() => adaptRecipientSessionPacketProjection(SAMPLE)).not.toThrow();
  });
});
