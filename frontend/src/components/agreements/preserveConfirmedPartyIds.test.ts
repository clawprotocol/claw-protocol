import { describe, expect, it } from "vitest";
import { partiesPayloadPreservingIds } from "./preserveConfirmedPartyIds";

describe("partiesPayloadPreservingIds", () => {
  it("reuses existing ids by legal name when the persist payload omitted them", () => {
    const payload = partiesPayloadPreservingIds(
      [
        { name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Pat Harbor" },
        { name: "Ironvale Manufacturing Inc.", role: "Client", signerName: "Sam Ironvale" },
        { name: "Alex Rivera", role: "Advisor", signerName: "Alex Rivera" },
      ],
      [
        { id: "harbor-id", name: "Harbor Peak Analytics LLC" },
        { id: "ironvale-id", name: "Ironvale Manufacturing Inc" },
        { id: "alex-id", name: "Alex Rivera" },
      ],
    );
    expect(payload.map((row) => row.id)).toEqual(["harbor-id", "ironvale-id", "alex-id"]);
    expect(payload[0]?.signerName).toBe("Pat Harbor");
  });

  it("keeps an incoming id over a later name match", () => {
    const payload = partiesPayloadPreservingIds(
      [{ id: "kept-id", name: "Alex Rivera", role: "Advisor" }],
      [{ id: "other-id", name: "Alex Rivera" }],
    );
    expect(payload[0]?.id).toBe("kept-id");
  });
});
