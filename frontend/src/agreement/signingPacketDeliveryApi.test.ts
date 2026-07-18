import { describe, expect, it } from "vitest";
import {
  normalizeSigningPacketDeliveryStatus,
  signingPacketDeliveryClaimsSent,
  signingPacketDeliveryUserMessage,
} from "./signingPacketDeliveryApi";

describe("signingPacketDeliveryApi", () => {
  it("normalizes owner delivery projection without tokens", () => {
    const normalized = normalizeSigningPacketDeliveryStatus({
      ok: true,
      aggregate_status: "delivery_disabled",
      recipients: [
        {
          signer_record_id: "signer:party-1:0",
          party_id: "party-1",
          signer_name: "Signer One",
          state: "prepared",
          delivery_identity: "aid:av_1:rev:signer:party-1:0",
          failure_code: null,
        },
      ],
      authority: {
        document_id: "doc_1",
        accepted_version_id: "av_1",
        accepted_corpus_sha256: "a".repeat(64),
        packet_revision: "rev",
        frozen_authority_material_hash: "b".repeat(64),
        locked_version_id: "av_1",
      },
    });
    expect(normalized?.aggregate_status).toBe("delivery_disabled");
    expect(normalized?.recipients[0]?.signer_record_id).toBe("signer:party-1:0");
  });

  it("rejects payloads that expose token material", () => {
    expect(
      normalizeSigningPacketDeliveryStatus({
        ok: true,
        aggregate_status: "delivered",
        recipients: [{ token: "secret", signer_record_id: "s1", delivery_identity: "id" }],
        authority: null,
      }),
    ).toBeNull();
  });

  it("uses truthful UX copy for disabled delivery", () => {
    const message = signingPacketDeliveryUserMessage({
      ok: true,
      aggregate_status: "delivery_disabled",
      recipients: [],
      authority: null,
    });
    expect(message).toContain("not enabled");
    expect(signingPacketDeliveryClaimsSent({
      ok: true,
      aggregate_status: "delivery_disabled",
      recipients: [],
      authority: null,
    })).toBe(false);
  });

  it("claims sent only for delivered aggregates", () => {
    expect(
      signingPacketDeliveryClaimsSent({
        ok: true,
        aggregate_status: "delivered",
        recipients: [],
        authority: null,
      }),
    ).toBe(true);
    expect(
      signingPacketDeliveryClaimsSent({
        ok: true,
        aggregate_status: "partially_delivered",
        recipients: [],
        authority: null,
      }),
    ).toBe(false);
  });
});
