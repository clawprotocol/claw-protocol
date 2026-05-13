import { describe, expect, it } from "vitest";
import {
  preCleanBetweenTailForMultiPartySplit,
  stripPartyRoleAnnotations,
  truncatePartyClauseTailAtLabeledFields,
} from "./partyRoleAnnotations";

describe("truncatePartyClauseTailAtLabeledFields", () => {
  it("stops before Property: so address commas never become party delimiters", () => {
    const s =
      "Apex LLC, Beta Inc, and Gamma LLC Property: 10 Oak Ave, Austin, TX 78701, Unit 2. Purchase price: $1.";
    expect(truncatePartyClauseTailAtLabeledFields(s)).toBe("Apex LLC, Beta Inc, and Gamma LLC");
  });

  it("stops before Premises: and Rent:", () => {
    expect(truncatePartyClauseTailAtLabeledFields("Landlord LLC and Tenant LLC Premises: Apt 4B")).toBe(
      "Landlord LLC and Tenant LLC",
    );
    expect(truncatePartyClauseTailAtLabeledFields("A and B Rent: $500")).toBe("A and B");
  });
});

describe("preCleanBetweenTailForMultiPartySplit", () => {
  it("normalizes Trustee-of-Trust capacity before comma splitting", () => {
    const tail =
      "Apex Sellers LLC (seller), John Smith, Trustee of the Stone Family Trust (buyer), and First County Escrow as escrow agent";
    const cleaned = preCleanBetweenTailForMultiPartySplit(tail);
    expect(cleaned).not.toMatch(/Trustee of the Stone Family Trust/i);
    expect(cleaned).toMatch(/John Smith/i);
    expect(cleaned).toMatch(/First County Escrow/i);
  });
});

describe("stripPartyRoleAnnotations", () => {
  it("strips individually and as guarantor", () => {
    expect(stripPartyRoleAnnotations("Jamie Chen individually and as guarantor").name).toBe("Jamie Chen");
  });

  it("preserves d/b/a trade name in the party string", () => {
    expect(stripPartyRoleAnnotations("ABC LLC d/b/a Rocket Labs").name).toMatch(/ABC LLC d\/b\/a Rocket Labs/i);
  });

  it("strips as escrow agent", () => {
    expect(stripPartyRoleAnnotations("First County Escrow Services as escrow agent").name).toMatch(
      /First County Escrow Services/i,
    );
  });

  it("strips witness / notary parentheticals without dropping the party", () => {
    expect(stripPartyRoleAnnotations("Jane Doe (witness)").name).toBe("Jane Doe");
    expect(stripPartyRoleAnnotations("Alex Kim (notary public)").name).toBe("Alex Kim");
  });
});
