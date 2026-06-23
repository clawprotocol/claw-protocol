import { TEST412_COORDINATOR_ONLY_INTAKE, TEST412_LEGAL_ENTITIES, TEST412_PRODUCTION_QUAD_PARTY_INTAKE, TEST412_REVENUE_SHARE_INTAKE, TEST412_THREE_PARTY_INTAKE, TEST412_TWO_PARTY_INTAKE, TEST412_PARTY_EMAILS, TEST412_SIGNER_NAMES, TEST412_SIGNER_TITLES, test412Draft } from "./paidProTest412Fixtures";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const TEST414_TWO_PARTY_INTAKE = TEST412_TWO_PARTY_INTAKE;
export const TEST414_THREE_PARTY_INTAKE = TEST412_THREE_PARTY_INTAKE;
export const TEST414_COORDINATOR_ONLY_INTAKE = TEST412_COORDINATOR_ONLY_INTAKE;
export const TEST414_REVENUE_SHARE_INTAKE = TEST412_REVENUE_SHARE_INTAKE;
export const TEST414_PRODUCTION_QUAD_PARTY_INTAKE = TEST412_PRODUCTION_QUAD_PARTY_INTAKE;
export const TEST414_LEGAL_ENTITIES = TEST412_LEGAL_ENTITIES;
export const TEST414_PARTY_EMAILS = TEST412_PARTY_EMAILS;
export const TEST414_SIGNER_NAMES = TEST412_SIGNER_NAMES;
export const TEST414_SIGNER_TITLES = TEST412_SIGNER_TITLES;

export function test414Draft(): ParsedDraftShape {
  return test412Draft();
}

export function test414DraftWithPhantomFifthParty(): ParsedDraftShape {
  return {
    ...test412Draft(),
    parties: [
      { name: TEST414_LEGAL_ENTITIES[0], role: "Client" } as never,
      { name: TEST414_LEGAL_ENTITIES[1], role: "Service Provider" } as never,
      { name: TEST414_LEGAL_ENTITIES[2], role: "Party 3" } as never,
      { name: TEST414_LEGAL_ENTITIES[3], role: "Party 4" } as never,
      { name: "Coordinator Contact", role: "Coordinator" } as never,
    ],
  };
}

/** Simulates signer-setup UI with blank extra legal names but populated signer rows (TEST406 pattern). */
export function test414LiveUiWithSignerDerivedEntityPollution() {
  return {
    partyCount: 4,
    recipient1Name: TEST414_LEGAL_ENTITIES[0],
    recipient2Name: TEST414_LEGAL_ENTITIES[1],
    recipient1Email: TEST414_PARTY_EMAILS.red,
    recipient2Email: TEST414_PARTY_EMAILS.blue,
    extraPartyReviewEmails: [TEST414_PARTY_EMAILS.harbor, TEST414_PARTY_EMAILS.iron],
    extraPartyLegalNames: [TEST414_SIGNER_NAMES[1], TEST414_SIGNER_NAMES[2]],
    partySignerNames: [...TEST414_SIGNER_NAMES],
    partySignerTitles: [...TEST414_SIGNER_TITLES],
    partyAddresses: [
      "12 Sample St., Sample, MS 20934",
      "49 Picture P., Parma, IL 40302",
      "98 Ute Way, Provo, UT 92828",
      "87 Yahoo Way, Center, CT 10923",
    ],
  };
}

export const TEST414_PARTIAL_METADATA_INTAKE = [
  TEST414_PRODUCTION_QUAD_PARTY_INTAKE.split("\n").slice(0, 6).join("\n"),
  "Red Mesa Logistics LLC signer: Joe Doe, CEO.",
  "Blue Canyon Analytics LLC signer: Mary Jay, COO.",
].join("\n");
