/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  formatSigningDateDisplayFromIso,
  stampWitnessBlockPartySignature,
  stampWitnessBlockPartySigningDate,
} from "./vs01WitnessBlockSigningDate";

const WITNESS_TAIL = `
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: __________________________
Name: Rosa Lee
Title: CEO
Date: _____________________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: __________________________
Name: Harry Dent
Title: COO
Date: _____________________________`;

describe("vs01WitnessBlockSigningDate", () => {
  it("formats ISO date with long month name", () => {
    expect(formatSigningDateDisplayFromIso("2026-06-07", "en-US")).toMatch(/June 7, 2026/);
  });

  it("stamps four entity legal-name witness blocks on long corpora", () => {
    const parties = [
      "Evergreen Outdoor Brands LLC",
      "Atlas Supply Partners LLC",
      "Horizon Retail Group LLC",
      "Bright Peak Marketing LLC",
    ];
    const witnessTail = [
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      ...parties.flatMap((entity) => [
        `${entity}:`,
        "By: ______________________________",
        "Date: ______________________________",
        "",
      ]),
    ].join("\n");
    const corpus = `${"x".repeat(12000)}\n\n${witnessTail}`;
    let text = corpus;
    for (let i = 0; i < 4; i += 1) {
      const sig = stampWitnessBlockPartySignature(text, i, `Signer ${i + 1}`, parties);
      expect(sig.stamped).toBe(true);
      text = sig.text;
      const dated = stampWitnessBlockPartySigningDate(text, i, `2026-06-${15 + i}`, parties);
      expect(dated.stamped).toBe(true);
      text = dated.text;
    }
    expect(text).toMatch(/Signer 1/);
    expect(text).toMatch(/Signer 4/);
  });

  it("stamps only the signing party date line", () => {
    const corpus = `x`.repeat(1600) + WITNESS_TAIL;
    const first = stampWitnessBlockPartySigningDate(corpus, 0, "2026-06-07");
    expect(first.stamped).toBe(true);
    expect(first.text).toMatch(/CLIENT:[\s\S]*Date: June 7, 2026/);
    expect(first.text).toMatch(/SERVICE PROVIDER:[\s\S]*Date: _+/);

    const second = stampWitnessBlockPartySigningDate(first.text, 1, "2026-06-08");
    expect(second.stamped).toBe(true);
    expect(second.text).toMatch(/Date: June 7, 2026/);
    expect(second.text).toMatch(/SERVICE PROVIDER:[\s\S]*Date: June 8, 2026/);
  });
});
