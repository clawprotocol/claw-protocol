import {
  CEDAR_RIDGE,
  MERIDIAN,
  NORTHSTAR,
  BLUE_HARBOR,
  TEST468_PARTY_ADDRESSES,
  TEST468_PARTY_EMAILS,
  TEST468_SIGNER_NAMES,
  TEST468_SIGNER_TITLES,
} from "./paidProTest468Fixtures";
import { TEST490_CLEARSPRING, TEST490_NOVAPATH, TEST490_STONEBRIDGE } from "./paidProTest490Fixtures";
import {
  TEST412_LEGAL_ENTITIES,
  TEST412_PARTY_EMAILS,
  TEST412_SIGNER_NAMES,
  TEST412_SIGNER_TITLES,
} from "./paidProTest412Fixtures";

export type Test477PartyFixture = {
  legalEntity: string;
  signerName: string;
  signerTitle: string;
  email: string;
  address: string;
};

function buildRepresentativeIntakeBlock(party: Test477PartyFixture, index: number): string {
  return [
    `Party ${index + 1}`,
    `• Legal entity / party name: ${party.legalEntity}`,
    `• Representative (human signer): ${party.signerName}`,
    `• Title: ${party.signerTitle}`,
    `• Email: ${party.email}`,
    `• Physical address: ${party.address}`,
  ].join("\n");
}

export function buildTest477RepresentativeIntake(parties: readonly Test477PartyFixture[], preamble = ""): string {
  const blocks = parties.map((party, i) => buildRepresentativeIntakeBlock(party, i));
  return [preamble.trim(), ...blocks].filter(Boolean).join("\n\n");
}

export const TEST477_ONE_PARTY: Test477PartyFixture = {
  legalEntity: "Summit Ridge Consulting LLC",
  signerName: "Jordan Ellis",
  signerTitle: "Managing Member",
  email: "cryptocurated21+1p@gmail.com",
  address: "100 Market St., Denver, CO 80202",
};

export const TEST477_TWO_PARTY: Test477PartyFixture[] = [
  {
    legalEntity: "Red Mesa Logistics LLC",
    signerName: "Joe Doe",
    signerTitle: "CEO",
    email: "cryptocurated21+2p@gmail.com",
    address: "12 Sample St., Sample, MS 20934",
  },
  {
    legalEntity: "Harbor Peak Automation LLC",
    signerName: "Mary Jay",
    signerTitle: "COO",
    email: "cryptocurated21+2p2@gmail.com",
    address: "49 Picture P., Parma, IL 40302",
  },
];

export const TEST477_THREE_PARTY: Test477PartyFixture[] = [
  {
    legalEntity: TEST490_STONEBRIDGE,
    signerName: "Sandra Wells",
    signerTitle: "Managing Member",
    email: "cryptocurated21+s@gmail.com",
    address: "710 Meadow Birch Rd., Norman, OK 73069",
  },
  {
    legalEntity: TEST490_NOVAPATH,
    signerName: "Caleb Price",
    signerTitle: "Chief Product Officer",
    email: "cryptocurated21+nova@gmail.com",
    address: "2841 Foundry Ave., Raleigh, NC 27601",
  },
  {
    legalEntity: TEST490_CLEARSPRING,
    signerName: "Maya Coleman",
    signerTitle: "President",
    email: "cryptocurated21+cs@gmail.com",
    address: "903 Harbor Mill Dr., Tampa, FL 33602",
  },
];

export const TEST477_FOUR_PARTY: Test477PartyFixture[] = [
  {
    legalEntity: CEDAR_RIDGE,
    signerName: TEST468_SIGNER_NAMES[0]!,
    signerTitle: TEST468_SIGNER_TITLES[0]!,
    email: TEST468_PARTY_EMAILS.cedar,
    address: TEST468_PARTY_ADDRESSES.cedar,
  },
  {
    legalEntity: NORTHSTAR,
    signerName: TEST468_SIGNER_NAMES[1]!,
    signerTitle: TEST468_SIGNER_TITLES[1]!,
    email: TEST468_PARTY_EMAILS.northstar,
    address: TEST468_PARTY_ADDRESSES.northstar,
  },
  {
    legalEntity: BLUE_HARBOR,
    signerName: TEST468_SIGNER_NAMES[2]!,
    signerTitle: TEST468_SIGNER_TITLES[2]!,
    email: TEST468_PARTY_EMAILS.harbor,
    address: TEST468_PARTY_ADDRESSES.harbor,
  },
  {
    legalEntity: MERIDIAN,
    signerName: TEST468_SIGNER_NAMES[3]!,
    signerTitle: TEST468_SIGNER_TITLES[3]!,
    email: TEST468_PARTY_EMAILS.meridian,
    address: TEST468_PARTY_ADDRESSES.meridian,
  },
];

export const TEST477_ONE_PARTY_INTAKE = buildTest477RepresentativeIntake(
  [TEST477_ONE_PARTY],
  "Draft a one-party consulting services agreement.",
);

export const TEST477_TWO_PARTY_INTAKE = buildTest477RepresentativeIntake(
  TEST477_TWO_PARTY,
  "Draft a two-party consulting services agreement.",
);

export const TEST477_THREE_PARTY_INTAKE = buildTest477RepresentativeIntake(
  TEST477_THREE_PARTY,
  "Draft a three-party IP license and royalty agreement.",
);

export const TEST477_FOUR_PARTY_INTAKE = buildTest477RepresentativeIntake(
  TEST477_FOUR_PARTY,
  "Draft a four-party AI healthcare analytics platform agreement.",
);

/** Entity-heading blocks without Party N headers (alternate TEST477 intake shape). */
export const TEST477_FOUR_PARTY_ENTITY_HEADER_INTAKE = [
  "Draft a four-party AI healthcare analytics platform agreement.",
  "",
  CEDAR_RIDGE,
  "Representative: Laura Benton",
  "Title: Executive Director",
  `Email: ${TEST468_PARTY_EMAILS.cedar}`,
  `Physical address: ${TEST468_PARTY_ADDRESSES.cedar}`,
  "",
  NORTHSTAR,
  "Representative: Marcus Vale",
  "Title: Chief Executive Officer",
  `Email: ${TEST468_PARTY_EMAILS.northstar}`,
  `Physical address: ${TEST468_PARTY_ADDRESSES.northstar}`,
  "",
  BLUE_HARBOR,
  "Representative: Priya Raman",
  "Title: Chief Technology Officer",
  `Email: ${TEST468_PARTY_EMAILS.harbor}`,
  `Physical address: ${TEST468_PARTY_ADDRESSES.harbor}`,
  "",
  MERIDIAN,
  "Representative: Daniel Price",
  "Title: Managing Director",
  `Email: ${TEST468_PARTY_EMAILS.meridian}`,
  `Physical address: ${TEST468_PARTY_ADDRESSES.meridian}`,
].join("\n");

export const TEST477_FOUR_PARTY_LEGAL_ENTITIES = TEST477_FOUR_PARTY.map((p) => p.legalEntity);
export const TEST477_THREE_PARTY_LEGAL_ENTITIES = TEST477_THREE_PARTY.map((p) => p.legalEntity);
export const TEST477_TWO_PARTY_LEGAL_ENTITIES = TEST477_TWO_PARTY.map((p) => p.legalEntity);
export const TEST477_ONE_PARTY_LEGAL_ENTITIES = [TEST477_ONE_PARTY.legalEntity];

/** Legacy entity-signer clause format — must remain compatible (TEST412). */
export { TEST412_LEGAL_ENTITIES, TEST412_SIGNER_NAMES, TEST412_SIGNER_TITLES, TEST412_PARTY_EMAILS };
