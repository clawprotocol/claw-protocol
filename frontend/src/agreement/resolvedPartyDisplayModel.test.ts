import { describe, expect, it } from "vitest";
import { buildResolvedPartyDisplayModel } from "./resolvedPartyDisplayModel";

describe("resolvedPartyDisplayModel (test38)", () => {
  it("prefers entity legal name over representative signer for party 0 display", () => {
    const slots = buildResolvedPartyDisplayModel({
      parties: [
        { name: "Acme LLC", role: "owner", email: "anthem@acme.com" },
        { name: "Joe Smith", role: "signer", email: "joe@example.com" },
      ],
      recipientEmails: ["anthem@acme.com", "joe@example.com"],
      recipientSignerNames: ["Anthem Blanchard", "Joe Smith"],
      recipientDisplayNames: ["Acme LLC", "Joe Smith"],
    });
    expect(slots[0]?.displayName).toBe("Acme LLC");
    expect(slots[0]?.source).not.toBe("signer");
    expect(slots[1]?.displayName).toBe("Joe Smith");
  });
});
