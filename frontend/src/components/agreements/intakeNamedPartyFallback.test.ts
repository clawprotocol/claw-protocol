import { describe, expect, it } from "vitest";
import { tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";

describe("tryInferNamedPartiesFromIntake", () => {
  it("infers person and company from employment-style phrasing", () => {
    const raw =
      "Create an employment agreement for John Smith in Acme LLC for $20 an hour starting next Monday in California.";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].name).toContain("John Smith");
    expect(out![1].name).toMatch(/Acme LLC/i);
  });
});
