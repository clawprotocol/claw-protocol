import { describe, expect, it } from "vitest";
import {
  formatLegalPartyList,
  formatLegalPartyPreamble,
  joinOxfordComma,
  type PartyEntry,
} from "./formatLegalPartyList";

describe("joinOxfordComma", () => {
  it("empty → empty string", () => {
    expect(joinOxfordComma([])).toBe("");
  });

  it("1 item → bare name", () => {
    expect(joinOxfordComma(["Alice"])).toBe("Alice");
  });

  it("2 items → A and B", () => {
    expect(joinOxfordComma(["Alice", "Bob"])).toBe("Alice and Bob");
  });

  it("3 items → Oxford comma", () => {
    expect(joinOxfordComma(["Alice", "Bob", "Carol"])).toBe("Alice, Bob, and Carol");
  });

  it("4 items → Oxford comma", () => {
    expect(joinOxfordComma(["A", "B", "C", "D"])).toBe("A, B, C, and D");
  });

  it("5 items → Oxford comma", () => {
    expect(joinOxfordComma(["A", "B", "C", "D", "E"])).toBe("A, B, C, D, and E");
  });
});

describe("formatLegalPartyList", () => {
  it("2 parties, all generic roles → simple A and B", () => {
    const parties: PartyEntry[] = [
      { name: "Anthem Blanchard", role: "party" },
      { name: "Sarah Collins", role: "party" },
    ];
    expect(formatLegalPartyList(parties)).toBe("Anthem Blanchard and Sarah Collins");
  });

  it("3 parties, all generic roles → Oxford comma with collectively", () => {
    const parties: PartyEntry[] = [
      { name: "Anthem Blanchard", role: "party" },
      { name: "Sarah Collins", role: "party" },
      { name: "Michael Reed", role: "party" },
    ];
    expect(formatLegalPartyList(parties)).toBe(
      'Anthem Blanchard, Sarah Collins, and Michael Reed (collectively, the "Parties")',
    );
  });

  it("4 parties, all generic roles → Oxford comma with collectively", () => {
    const parties: PartyEntry[] = [
      { name: "Anthem Blanchard", role: "party" },
      { name: "Sarah Collins", role: "party" },
      { name: "Michael Reed", role: "party" },
      { name: "Jamie Chen", role: "party" },
    ];
    expect(formatLegalPartyList(parties)).toBe(
      'Anthem Blanchard, Sarah Collins, Michael Reed, and Jamie Chen (collectively, the "Parties")',
    );
  });

  it("2 parties with distinct roles → role labels", () => {
    const parties: PartyEntry[] = [
      { name: "Acme Corp", role: "Client" },
      { name: "DevShop LLC", role: "Consultant" },
    ];
    expect(formatLegalPartyList(parties)).toBe(
      'Acme Corp ("Client") and DevShop LLC ("Consultant")',
    );
  });

  it("2 parties same non-generic role → collectively", () => {
    const parties: PartyEntry[] = [
      { name: "Alice Jones", role: "Developer" },
      { name: "Bob Smith", role: "Developer" },
    ];
    expect(formatLegalPartyList(parties)).toBe(
      'Alice Jones and Bob Smith (collectively, the "Developers")',
    );
  });

  it("mixed roles: 1 company + 3 developers → grouped", () => {
    const parties: PartyEntry[] = [
      { name: "Anthem Blanchard", role: "Company" },
      { name: "Sarah Collins", role: "Developer" },
      { name: "Michael Reed", role: "Developer" },
      { name: "Jamie Chen", role: "Developer" },
    ];
    const result = formatLegalPartyList(parties);
    expect(result).toBe(
      'Anthem Blanchard ("Company") and Sarah Collins, Michael Reed, and Jamie Chen (collectively, the "Developers")',
    );
  });

  it("no repeated role suffixes — same role not labelled individually", () => {
    const parties: PartyEntry[] = [
      { name: "Michael Reed", role: "Client" },
      { name: "Jamie Chen", role: "Client" },
    ];
    const result = formatLegalPartyList(parties);
    expect(result).not.toContain('"Client") and');
    expect(result).not.toContain('"Client") and Jamie Chen ("Client")');
    expect(result).toContain('collectively, the "Clients"');
  });

  it("no repeated 'and' in output", () => {
    const parties: PartyEntry[] = [
      { name: "A", role: "party" },
      { name: "B", role: "party" },
      { name: "C", role: "party" },
      { name: "D", role: "party" },
    ];
    const result = formatLegalPartyList(parties);
    const andCount = (result.match(/\band\b/g) || []).length;
    expect(andCount).toBe(1);
  });

  it("single party with role", () => {
    const parties: PartyEntry[] = [{ name: "Acme Corp", role: "Vendor" }];
    expect(formatLegalPartyList(parties)).toBe('Acme Corp ("Vendor")');
  });

  it("single party generic role → bare name", () => {
    const parties: PartyEntry[] = [{ name: "Acme Corp", role: "party" }];
    expect(formatLegalPartyList(parties)).toBe("Acme Corp");
  });

  it("empty parties → empty string", () => {
    expect(formatLegalPartyList([])).toBe("");
  });

  it("filters out empty names", () => {
    const parties: PartyEntry[] = [
      { name: "Alice", role: "party" },
      { name: "", role: "party" },
      { name: "Bob", role: "party" },
    ];
    expect(formatLegalPartyList(parties)).toBe("Alice and Bob");
  });
});

describe("formatLegalPartyPreamble", () => {
  it("2 parties → entered into by and between with collectively", () => {
    const parties: PartyEntry[] = [
      { name: "Acme Corp", role: "Client" },
      { name: "DevShop LLC", role: "Consultant" },
    ];
    const result = formatLegalPartyPreamble(parties);
    expect(result).toContain("entered into by and between");
    expect(result).toContain("Acme Corp");
    expect(result).toContain("DevShop LLC");
    expect(result).toContain("Client");
    expect(result).toContain("Consultant");
    expect(result).toContain("collectively");
  });

  it("4 parties → preamble with all names and collectively", () => {
    const parties: PartyEntry[] = [
      { name: "A", role: "party" },
      { name: "B", role: "party" },
      { name: "C", role: "party" },
      { name: "D", role: "party" },
    ];
    const result = formatLegalPartyPreamble(parties);
    expect(result).toContain("entered into by and between");
    expect(result).toContain("A, B, C, and D");
    expect(result).toContain("collectively");
  });

  it("empty → fallback", () => {
    const result = formatLegalPartyPreamble([]);
    expect(result).toContain("parties identified above");
  });
});
