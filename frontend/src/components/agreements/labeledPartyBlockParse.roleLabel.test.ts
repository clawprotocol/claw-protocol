import { describe, expect, it } from "vitest";
import {
  resolveStarterGatePartyLegalEntities,
  roleLabelPartyLegalEntities,
} from "./labeledPartyBlockParse";

const TEST375_INTAKE = `Client:
Blue Canyon Analytics LLC

Service Provider:
Harbor Peak Automation LLC

Simple consulting and implementation services.
12 month term.
Monthly payment.
Texas law.`;

describe("roleLabelPartyLegalEntities", () => {
  it("parses Client/Service Provider stacked entity lines", () => {
    const entities = roleLabelPartyLegalEntities(TEST375_INTAKE);
    expect(entities).toEqual([
      "Blue Canyon Analytics LLC",
      "Harbor Peak Automation LLC",
    ]);
  });

  it("parses inline role-label entity on one line", () => {
    const entities = roleLabelPartyLegalEntities(
      "Client: Acme LLC\nService Provider: Beta Corp\nScope: support.",
    );
    expect(entities).toEqual(["Acme LLC", "Beta Corp"]);
  });

  it("resolveStarterGatePartyLegalEntities prefers Party N blocks when present", () => {
    const intake = `Party 1
Legal Entity: Alpha LLC

Party 2
Legal Entity: Beta Corp`;
    expect(resolveStarterGatePartyLegalEntities(intake)).toEqual(["Alpha LLC", "Beta Corp"]);
  });
});
