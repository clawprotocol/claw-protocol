import { describe, expect, it } from "vitest";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";

describe("buildLiveDraftPreview parties extraction", () => {
  it("preserves full multi-word entity names in between X and Y", () => {
    const text = "Services agreement between Anthem Blanchard and Peaceful Journey LLC for lawn care.";
    const live = buildLiveDraftPreview(text);
    expect(live.partiesLine).toContain("Anthem Blanchard");
    expect(live.partiesLine).toContain("Peaceful Journey LLC");
    expect(live.partiesLine).not.toMatch(/\bpeace\b/i);
    expect(live.partiesUncertain).toBeFalsy();
  });

  it("handles two-word first party and LLC second party", () => {
    const text = "NDA between Jane Q Public and Acme Holdings LLC.";
    const live = buildLiveDraftPreview(text);
    expect(live.partiesLine).toContain("Jane Q Public");
    expect(live.partiesLine).toContain("Acme Holdings LLC");
  });

  it("does not truncate on period inside Dr. style names when between clause is clean", () => {
    const text = "Contract between Dr. Smith and Jane Doe.";
    const live = buildLiveDraftPreview(text);
    expect(live.partiesLine).toBeTruthy();
    expect(live.partiesLine).toContain("Dr. Smith");
    expect(live.partiesLine).toContain("Jane Doe");
  });

  it("normalizes messy location tails into clean party names", () => {
    const text =
      "Services between Peaceful Journey LLC in Oklahoma LLC and Anthem Blanchard in Oklahoma resident for lawn care.";
    const live = buildLiveDraftPreview(text);
    expect(live.partiesStructured?.party_1).toContain("Peaceful Journey LLC");
    expect(live.partiesStructured?.party_1).not.toMatch(/\bOklahoma\b/i);
    expect(live.partiesStructured?.party_2).toContain("Anthem Blanchard");
    expect(live.partiesStructured?.party_2).not.toMatch(/\bresident\b/i);
    expect(live.partiesLine).toContain("Peaceful Journey LLC");
    expect(live.partiesLine).toContain("Anthem Blanchard");
  });

  it("parses Parties: line with comma-separated names", () => {
    const text = "Parties: Peaceful Journey LLC in Oklahoma, Anthem Blanchard\nScope: mowing.";
    const live = buildLiveDraftPreview(text);
    expect(live.partiesStructured?.party_1).toMatch(/Peaceful Journey LLC/i);
    expect(live.partiesStructured?.party_2).toMatch(/Anthem Blanchard/i);
  });
});

describe("buildLiveDraftPreview payment schedule wording", () => {
  it("maps weekly/monthly mentions to plain paid copy", () => {
    expect(buildLiveDraftPreview("Fee is $100 weekly.").scheduleLine).toBe("Paid weekly");
    expect(buildLiveDraftPreview("Retainer monthly.").scheduleLine).toBe("Paid monthly");
  });

  it("uses payment schedule not set when schedule is explicitly unset", () => {
    expect(buildLiveDraftPreview("Payment schedule TBD.").scheduleLine).toBe("Payment schedule not set");
    expect(buildLiveDraftPreview("Payment schedule is not set.").scheduleLine).toBe("Payment schedule not set");
  });

  it("formats weekday hints without cadence jargon", () => {
    expect(buildLiveDraftPreview("Work every Monday.").scheduleLine).toContain("Paid weekly");
    expect(buildLiveDraftPreview("Work every Monday.").scheduleLine).not.toMatch(/cadence|Recurring/i);
  });
});
