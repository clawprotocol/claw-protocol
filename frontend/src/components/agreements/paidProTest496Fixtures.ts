export const TEST496_COORDINATOR_EMAIL = "paige.orchestrator@coord.example.com";
export const TEST496_COORDINATOR_NAME = "Paige Orchestrator";

export const TEST496_NON_COORDINATING_TWO_PARTY_INTAKE = `
Agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for workflow automation consulting.
$5,000/month for 12 months. Oklahoma law.
`.trim();

export {
  TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE as TEST496_THREE_PARTY_COORDINATING_INTAKE,
  TEST490_STONEBRIDGE,
  TEST490_NOVAPATH,
  TEST490_CLEARSPRING,
  TEST490_FOUR_PARTY_INTAKE as TEST496_FOUR_PARTY_COORDINATING_INTAKE,
} from "./paidProTest490Fixtures";

export const TEST496_THREE_PARTY_LEGAL = [
  "Stonebridge Wellness LLC",
  "NovaPath Learning Inc.",
  "ClearSpring Distribution LLC",
] as const;

export const TEST496_FOUR_PARTY_LEGAL = [
  "Red Mesa Logistics LLC",
  "Blue Canyon Analytics LLC",
  "Harbor Peak Automation LLC",
  "Iron Vale Implementation Partners LLC",
] as const;

export function test496ThreePartyDraft(creatorCoordinatorOnly: boolean) {
  return {
    title: "Tripartite IP License",
    jurisdiction: "Oklahoma",
    creator_coordinator_only: creatorCoordinatorOnly,
    parties: TEST496_THREE_PARTY_LEGAL.map((name, i) => ({
      id: `party_${i}`,
      name,
      role: creatorCoordinatorOnly ? "party" : i === 0 ? "owner" : "party",
      email: i === 0 ? TEST496_COORDINATOR_EMAIL : `${i}@example.test`,
    })),
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
  };
}

export function test496RecipientSetup(args: {
  creatorCoordinatorOnly: boolean;
  partyCount: 3 | 4;
  legalNames: readonly string[];
}) {
  const emails = [
    "cryptocurated21+s@gmail.com",
    "cryptocurated21+nova@gmail.com",
    "cryptocurated21+cs@gmail.com",
    "cryptocurated21+4@gmail.com",
  ];
  return {
    creatorCoordinatorOnly: args.creatorCoordinatorOnly,
    signerSetupUiPartyCount: args.partyCount,
    recipient1Name: args.legalNames[0] ?? "",
    recipient2Name: args.legalNames[1] ?? "",
    recipientPartyLegalNames: args.legalNames.slice(2).map(String),
    recipient1Email: emails[0]!,
    recipient2Email: emails[1]!,
    recipientPartyEmails: emails.slice(0, args.partyCount),
    recipientPartySignerNames: args.legalNames.map((_, i) => `Signer ${i + 1}`),
    recipientPartySignerTitles: args.legalNames.map(() => "Authorized Signer"),
  };
}
