import { TEST403_PRODUCTION_QUAD_PARTY_INTAKE } from "./paidProTest403Fixtures";
import { TEST396_QUAD_PARTY_INTAKE } from "./paidProTest396Fixtures";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

/** Production QA — quad-party mutual services with inline entity signer clauses (TEST412). */
export const TEST412_PRODUCTION_QUAD_PARTY_INTAKE = [
  TEST403_PRODUCTION_QUAD_PARTY_INTAKE,
  "",
  "Red Mesa Logistics LLC signer: Joe Doe, CEO, cryptocurated21+1@gmail.com, 12 Sample St., Sample, MS 20934.",
  "Blue Canyon Analytics LLC signer: Mary Jay, COO, cryptocurated21+2@gmail.com, 49 Picture P., Parma, IL 40302.",
  "Harbor Peak Automation LLC signer: Hen Park, CFO, cryptocurated21+3@gmail.com, 98 Ute Way, Provo, UT 92828.",
  "Iron Vale Systems Inc. signer: Ira Vale, CTO, cryptocurated21+4@gmail.com, 87 Yahoo Way, Center, CT 10923.",
].join("\n");

export const TEST412_PARTY_EMAILS = {
  red: "cryptocurated21+1@gmail.com",
  blue: "cryptocurated21+2@gmail.com",
  harbor: "cryptocurated21+3@gmail.com",
  iron: "cryptocurated21+4@gmail.com",
} as const;

export const TEST412_SIGNER_NAMES = ["Joe Doe", "Mary Jay", "Hen Park", "Ira Vale"] as const;
export const TEST412_SIGNER_TITLES = ["CEO", "COO", "CFO", "CTO"] as const;

export const TEST412_LEGAL_ENTITIES = [RED, BLUE, HARBOR, IRON] as const;

export function test412Draft(): ParsedDraftShape {
  return {
    title: "Mutual Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client" } as never,
      { name: BLUE, role: "Service Provider" } as never,
    ],
    purpose: "Warehouse automation and reporting platform.",
    payment_terms: "$185,000; $75,000 initial; remainder monthly over six months",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 185000, cadence: "monthly", valid: true },
  };
}

export const TEST412_TWO_PARTY_INTAKE = [
  "Consulting agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "Signer for Blue Canyon Analytics LLC is Sarah Mitchell, CEO, sarah@bluecanyon.example.com, 100 Main St.",
  "Signer for Iron Vale Systems Inc. is Michael Torres, President, michael@ironvale.example.com.",
].join(" ");

export const TEST412_THREE_PARTY_INTAKE = [
  "Tripartite services agreement.",
  "Party 1 signer is Alice One, CEO, alice@client.example.com, 1 Client Way.",
  "Party 2 signer is Bob Two, COO, bob@provider.example.com.",
  "Party 3 signer is Carol Three, CFO, carol@analytics.example.com.",
  "Party 1: Red Mesa Logistics LLC",
  "Party 2: Harbor Peak Automation LLC",
  "Party 3: Blue Canyon Analytics LLC",
].join("\n");

export const TEST412_COORDINATOR_ONLY_INTAKE = [
  "Two-party NDA between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
  "Coordinator: Jane Coordinator, jane@coordinator.example.com — not signing as a party.",
  "Signer for Red Mesa Logistics LLC is Alex Client, CEO, alex@redmesa.example.com.",
  "Signer for Harbor Peak Automation LLC is Blake Vendor, President, blake@harbor.example.com.",
].join(" ");

export const TEST412_REVENUE_SHARE_INTAKE = TEST396_QUAD_PARTY_INTAKE;
