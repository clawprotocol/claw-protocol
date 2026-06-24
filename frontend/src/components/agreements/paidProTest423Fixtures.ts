import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";

export const TEST423_IRONCLAD_JV_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.

Main people involved:

* Ethan Cole — CEO at Ironclad — ethan.cole@ironcladsg.com
* Maya Bennett — CTO at Harborline — maya.bennett@harborlinedata.com
* Lucas Reed — Managing Partner at Northwind — lucas.reed@northwindap.io
* Olivia Hart — Ops Director at Silver Mesa — olivia.hart@silvermesaanalytics.com
* Adrian Vale — President at VertexGrid — adrian.vale@vertexgridtech.com

The deal should cover white-label AI workflow software, API integrations, onboarding and migration help, analytics dashboards, monitoring, support, and ongoing maintenance.

Total contract value is $187,500 paid over 6 milestone payments tied to deployment stages and launch targets.

Initial term should be 24 months with automatic yearly renewal unless someone gives 45 days notice.

Use Texas law.

Please include normal enterprise protections like confidentiality, cybersecurity/data protection obligations, IP ownership, liability limits, indemnification, uptime/SLA expectations, dispute resolution, non-solicitation/non-circumvention, audit rights, force majeure, termination rights, and electronic signatures.`;

export type Test423Scenario = {
  id: string;
  expectedN: number;
  intakeText: string;
  draft: ParsedDraftShape;
  parties: readonly string[];
  signerNames: readonly string[];
  signerTitles: readonly string[];
  emails: readonly string[];
  addresses: readonly string[];
  requireNoticeStanzas?: boolean;
  coordinatorOnly?: boolean;
};

export const TEST423_CONSULTING_PARTIES = [
  "Summit Ridge Analytics LLC",
  "Coastal Harbor Partners LP",
  "Cascade Meridian Systems Inc.",
  "Prairie Nova Ventures LLC",
] as const;

export const TEST423_CONSULTING_SIGNERS = ["Alex Kim", "Bri Chen", "Carlos Ortiz", "Dana Wells"] as const;
export const TEST423_CONSULTING_TITLES = ["CEO", "COO", "CFO", "CTO"] as const;
export const TEST423_CONSULTING_EMAILS = [
  "alex.kim@summitridge.example.com",
  "bri.chen@coastalharbor.example.com",
  "carlos.ortiz@cascademeridian.example.com",
  "dana.wells@prairienova.example.com",
] as const;
export const TEST423_CONSULTING_ADDRESSES = [
  "100 Summit Way, Denver, CO 80202",
  "200 Harbor Blvd, Austin, TX 78701",
  "300 Cascade Dr, Seattle, WA 98101",
  "400 Prairie Ln, Omaha, NE 68102",
] as const;

export const TEST423_CONSULTING_INTAKE = [
  `Create a mutual consulting and implementation agreement among ${TEST423_CONSULTING_PARTIES.join(", ")}.`,
  "Scope includes workflow automation, analytics dashboards, employee training, and cybersecurity support.",
  "Total fees $142,500 with milestone payments. Term twelve months. Delaware law governs.",
  "",
  `${TEST423_CONSULTING_PARTIES[0]} signer: ${TEST423_CONSULTING_SIGNERS[0]}, ${TEST423_CONSULTING_TITLES[0]}, ${TEST423_CONSULTING_EMAILS[0]}, ${TEST423_CONSULTING_ADDRESSES[0]}.`,
  `${TEST423_CONSULTING_PARTIES[1]} signer: ${TEST423_CONSULTING_SIGNERS[1]}, ${TEST423_CONSULTING_TITLES[1]}, ${TEST423_CONSULTING_EMAILS[1]}, ${TEST423_CONSULTING_ADDRESSES[1]}.`,
  `${TEST423_CONSULTING_PARTIES[2]} signer: ${TEST423_CONSULTING_SIGNERS[2]}, ${TEST423_CONSULTING_TITLES[2]}, ${TEST423_CONSULTING_EMAILS[2]}, ${TEST423_CONSULTING_ADDRESSES[2]}.`,
  `${TEST423_CONSULTING_PARTIES[3]} signer: ${TEST423_CONSULTING_SIGNERS[3]}, ${TEST423_CONSULTING_TITLES[3]}, ${TEST423_CONSULTING_EMAILS[3]}, ${TEST423_CONSULTING_ADDRESSES[3]}.`,
].join("\n");

export function test423ConsultingDraft(): ParsedDraftShape {
  return {
    title: "Mutual Consulting and Implementation Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: TEST423_CONSULTING_PARTIES.map((name, i) => ({
      name,
      role: `Party ${i + 1}`,
      email: TEST423_CONSULTING_EMAILS[i],
    })) as never,
    purpose: "Workflow automation, analytics, training, and cybersecurity support.",
    payment_terms: "$142,500 milestone payments",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 142500, cadence: "milestone", valid: true },
  };
}

export const TEST423_VENDOR_PARTIES = [
  "Northwind Supply Co LLC",
  "BridgeLine Implementation Partners LLC",
  "Atlas Commerce Group Inc.",
  "Sentinel Compliance Auditors LLC",
] as const;

export const TEST423_VENDOR_SIGNERS = ["Evan Price", "Fiona Grant", "Gabe Holt", "Hannah Irwin"] as const;
export const TEST423_VENDOR_EMAILS = [
  "evan@northwindsupply.example.com",
  "fiona@bridgeline.example.com",
  "gabe@atlascommerce.example.com",
  "hannah@sentinelcompliance.example.com",
] as const;

export const TEST423_VENDOR_INTAKE = [
  `Vendor ${TEST423_VENDOR_PARTIES[0]}, subcontractor ${TEST423_VENDOR_PARTIES[1]}, customer ${TEST423_VENDOR_PARTIES[2]}, and compliance auditor ${TEST423_VENDOR_PARTIES[3]} need a services and audit agreement.`,
  "Northwind supplies materials; BridgeLine implements integrations; Atlas Commerce receives deliverables; Sentinel audits compliance.",
  "Contract value $98,000. Illinois law. Term eighteen months.",
  "",
  `${TEST423_VENDOR_PARTIES[0]} signer: ${TEST423_VENDOR_SIGNERS[0]}, President, ${TEST423_VENDOR_EMAILS[0]}.`,
  `${TEST423_VENDOR_PARTIES[1]} signer: ${TEST423_VENDOR_SIGNERS[1]}, Managing Partner, ${TEST423_VENDOR_EMAILS[1]}.`,
  `${TEST423_VENDOR_PARTIES[2]} signer: ${TEST423_VENDOR_SIGNERS[2]}, CEO, ${TEST423_VENDOR_EMAILS[2]}.`,
  `${TEST423_VENDOR_PARTIES[3]} signer: ${TEST423_VENDOR_SIGNERS[3]}, Director, ${TEST423_VENDOR_EMAILS[3]}.`,
].join("\n");

export function test423VendorDraft(): ParsedDraftShape {
  return {
    title: "Vendor Subcontractor Customer Services Agreement",
    jurisdiction: "Illinois",
    parties: TEST423_VENDOR_PARTIES.map((name, i) => ({
      name,
      role: `Party ${i + 1}`,
      email: TEST423_VENDOR_EMAILS[i],
    })) as never,
    purpose: "Supply, implementation, commerce deliverables, and compliance audit.",
    payment_terms: "$98,000",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 98000, cadence: "milestone", valid: true },
  };
}

export const TEST423_JV_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;

export const TEST423_JV_SIGNERS = [
  "Ethan Cole",
  "Maya Bennett",
  "Lucas Reed",
  "Olivia Hart",
  "Adrian Vale",
] as const;

export const TEST423_JV_EMAILS = [
  "ethan.cole@ironcladsg.com",
  "maya.bennett@harborlinedata.com",
  "lucas.reed@northwindap.io",
  "olivia.hart@silvermesaanalytics.com",
  "adrian.vale@vertexgridtech.com",
] as const;

export function test423JvDraft(): ParsedDraftShape {
  return {
    title: "Joint AI Infrastructure Rollout Agreement",
    jurisdiction: "Texas",
    parties: TEST423_JV_PARTIES.map((name, i) => ({
      name,
      role: `Party ${i + 1}`,
      email: TEST423_JV_EMAILS[i],
    })) as never,
    purpose: "Joint AI software and infrastructure rollout.",
    payment_terms: "$187,500 milestone payments",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 187500, cadence: "milestone", valid: true },
  };
}

export const TEST423_REV_PARTIES = [
  "Redwood Peak Ventures LLC",
  "Atlas Harbor Technologies Inc.",
  "Meridian Workforce Group LLC",
  "Prairie Signal Holdings LP",
  "NovaGrid Systems LLC",
] as const;

export const TEST423_REV_SIGNERS = [
  "Ethan Cole",
  "Maya Bennett",
  "Lucas Reed",
  "Olivia Hart",
  "Adrian Vale",
] as const;

export const TEST423_REV_EMAILS = [
  "ethan@redwoodpeak.example.com",
  "maya@atlasharbor.example.com",
  "lucas@meridianworkforce.example.com",
  "olivia@prairiesignal.example.com",
  "adrian@novagrid.example.com",
] as const;

export const TEST423_REV_INTAKE = [
  `Create a revenue-share and licensing agreement among ${TEST423_REV_PARTIES.join(", ")}.`,
  "Scope includes white-label software licensing, API integrations, implementation services, and revenue reconciliation.",
  "Total consideration $124,750. Delaware law governs. Term twenty-four months.",
  "",
  ...TEST423_REV_PARTIES.map(
    (party, i) =>
      `${party} signer: ${TEST423_REV_SIGNERS[i]}, Authorized Signatory, ${TEST423_REV_EMAILS[i]}.`,
  ),
].join("\n");

export function test423RevDraft(): ParsedDraftShape {
  return {
    title: "Revenue Share and Licensing Agreement",
    jurisdiction: "Delaware",
    parties: TEST423_REV_PARTIES.map((name, i) => ({
      name,
      role: `Party ${i + 1}`,
      email: TEST423_REV_EMAILS[i],
    })) as never,
    purpose: "Revenue share, licensing, and implementation.",
    payment_terms: "$124,750",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 124750, cadence: "milestone", valid: true },
  };
}

export const TEST423_TWO_PARTIES = [
  "Lakeside Advisory Group LLC",
  "Mountain View Consulting Inc.",
] as const;

export const TEST423_TWO_INTAKE = [
  `Agreement between ${TEST423_TWO_PARTIES[0]} and ${TEST423_TWO_PARTIES[1]} for consulting services.`,
  "Fees $45,000. Colorado law. Term six months.",
  `${TEST423_TWO_PARTIES[0]} signer: Ian Lake, CEO, ian@lakeside.example.com.`,
  `${TEST423_TWO_PARTIES[1]} signer: Jenna View, President, jenna@mountainview.example.com.`,
].join("\n");

export function test423TwoPartyDraft(): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Colorado",
    parties: TEST423_TWO_PARTIES.map((name, i) => ({
      name,
      role: i === 0 ? "Client" : "Service Provider",
      email: i === 0 ? "ian@lakeside.example.com" : "jenna@mountainview.example.com",
    })) as never,
    purpose: "Consulting services.",
    payment_terms: "$45,000",
    duration: "6 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 45000, cadence: "lump_sum", valid: true },
  };
}

export function buildTest423Corpus(scenario: Test423Scenario): string {
  return buildNPartyPaidProServerCorpus({
    parties: scenario.parties,
    intakeText: scenario.intakeText,
    draft: scenario.draft,
    title: scenario.draft.title,
    minLen: 5200,
  });
}

export const TEST423_SCENARIOS: Test423Scenario[] = [
  {
    id: "four_party_consulting",
    expectedN: 4,
    intakeText: TEST423_CONSULTING_INTAKE,
    draft: test423ConsultingDraft(),
    parties: TEST423_CONSULTING_PARTIES,
    signerNames: TEST423_CONSULTING_SIGNERS,
    signerTitles: TEST423_CONSULTING_TITLES,
    emails: TEST423_CONSULTING_EMAILS,
    addresses: TEST423_CONSULTING_ADDRESSES,
  },
  {
    id: "four_party_vendor_chain",
    expectedN: 4,
    intakeText: TEST423_VENDOR_INTAKE,
    draft: test423VendorDraft(),
    parties: TEST423_VENDOR_PARTIES,
    signerNames: TEST423_VENDOR_SIGNERS,
    signerTitles: ["President", "Managing Partner", "CEO", "Director"],
    emails: TEST423_VENDOR_EMAILS,
    addresses: ["", "", "", ""],
  },
  {
    id: "five_party_joint_venture",
    expectedN: 5,
    intakeText: TEST423_IRONCLAD_JV_INTAKE,
    draft: test423JvDraft(),
    parties: TEST423_JV_PARTIES,
    signerNames: TEST423_JV_SIGNERS,
    signerTitles: ["CEO", "CTO", "Managing Partner", "Ops Director", "President"],
    emails: TEST423_JV_EMAILS,
    addresses: ["", "", "", "", ""],
  },
  {
    id: "five_party_revenue_share",
    expectedN: 5,
    intakeText: TEST423_REV_INTAKE,
    draft: test423RevDraft(),
    parties: TEST423_REV_PARTIES,
    signerNames: TEST423_REV_SIGNERS,
    signerTitles: ["Authorized Signatory", "Authorized Signatory", "Authorized Signatory", "Authorized Signatory", "Authorized Signatory"],
    emails: TEST423_REV_EMAILS,
    addresses: ["", "", "", "", ""],
  },
  {
    id: "coordinator_only_four_party",
    expectedN: 4,
    intakeText: [
      "I'm coordinating this agreement and am not signing as a party.",
      TEST423_CONSULTING_INTAKE,
    ].join("\n"),
    draft: test423ConsultingDraft(),
    parties: TEST423_CONSULTING_PARTIES,
    signerNames: TEST423_CONSULTING_SIGNERS,
    signerTitles: TEST423_CONSULTING_TITLES,
    emails: TEST423_CONSULTING_EMAILS,
    addresses: TEST423_CONSULTING_ADDRESSES,
    coordinatorOnly: true,
  },
  {
    id: "partial_metadata_four_party",
    expectedN: 4,
    intakeText: [
      `Agreement among ${TEST423_CONSULTING_PARTIES.join(", ")}.`,
      `${TEST423_CONSULTING_PARTIES[0]} signer: ${TEST423_CONSULTING_SIGNERS[0]}, CEO.`,
      `${TEST423_CONSULTING_PARTIES[1]} signer: ${TEST423_CONSULTING_SIGNERS[1]}, COO, ${TEST423_CONSULTING_EMAILS[1]}.`,
      `${TEST423_CONSULTING_PARTIES[2]} signer: ${TEST423_CONSULTING_SIGNERS[2]}, CFO.`,
      `${TEST423_CONSULTING_PARTIES[3]} signer: ${TEST423_CONSULTING_SIGNERS[3]}, CTO.`,
      "Oklahoma law. Term twelve months.",
    ].join("\n"),
    draft: test423ConsultingDraft(),
    parties: TEST423_CONSULTING_PARTIES,
    signerNames: TEST423_CONSULTING_SIGNERS,
    signerTitles: TEST423_CONSULTING_TITLES,
    emails: ["", TEST423_CONSULTING_EMAILS[1], "", ""],
    addresses: ["", "", "", ""],
    requireNoticeStanzas: false,
  },
];
