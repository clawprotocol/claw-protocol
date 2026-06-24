/**
 * TEST427 — fresh Genesis Dog production fixtures (no TEST423–426 entity contamination).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import type { Test423Scenario } from "./paidProTest423Fixtures";

/** Entities from prior test suites — must not appear in TEST427 corpora. */
export const TEST427_FORBIDDEN_ENTITY_MARKERS = [
  "RED MESA",
  "BLUE CANYON",
  "HARBOR PEAK",
  "MUTUAL CONSULTING",
  "VENDOR NORTHWIND",
  "IRONCLAD SYSTEMS",
  "NORTHWIND SUPPLY",
  "NORTHWIND AUTOMATION",
  "SUMMIT RIDGE ANALYTICS",
  "COASTAL HARBOR PARTNERS",
  "CASCADE MERIDIAN",
  "PRAIRIE NOVA",
  "BRIDGELINE IMPLEMENTATION",
  "ATLAS COMMERCE",
  "SENTINEL COMPLIANCE",
  "HARBORLINE DATA",
  "SILVER MESA ANALYTICS",
  "VERTEXGRID",
] as const;

export type Test427Category =
  | "consulting"
  | "vendor"
  | "revenue_share"
  | "joint_venture"
  | "coordinator_only"
  | "metadata_stress"
  | "recovery";

export type Test427RecoveryMode =
  | "structural_rejection"
  | "freeze_rejection"
  | "stale_accepted"
  | "degraded_handoff"
  | "corrupted_metadata";

export type Test427Scenario = Test423Scenario & {
  category: Test427Category;
  label: string;
  recoveryMode?: Test427RecoveryMode;
};

type PartyBundle = {
  parties: readonly string[];
  signers: readonly string[];
  titles: readonly string[];
  emails: readonly string[];
  addresses: readonly string[];
};

function partyBundle(
  parties: readonly string[],
  signers: readonly string[],
  titles: readonly string[],
  emails: readonly string[],
  addresses: readonly string[] = parties.map(() => ""),
): PartyBundle {
  return { parties, signers, titles, emails, addresses };
}

function intakeSignerLines(bundle: PartyBundle): string[] {
  return bundle.parties.map((party, i) => {
    const parts = [
      bundle.signers[i],
      bundle.titles[i],
      bundle.emails[i],
      bundle.addresses[i],
    ].filter((p) => p && p.trim());
    return `${party} signer: ${parts.join(", ")}.`;
  });
}

function buildIntake(
  preamble: string,
  bundle: PartyBundle,
  closing: string,
): string {
  return [preamble, "", ...intakeSignerLines(bundle), closing].join("\n");
}

function draftShape(
  title: string,
  jurisdiction: string,
  bundle: PartyBundle,
  purpose: string,
  payment: string,
  duration: string,
  family?: string,
): ParsedDraftShape {
  return {
    title,
    jurisdiction,
    agreement_family: (family ?? "services_agreement") as never,
    parties: bundle.parties.map((name, i) => ({
      name,
      role: `Party ${i + 1}`,
      email: bundle.emails[i] ?? "",
    })) as never,
    purpose,
    payment_terms: payment,
    duration,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
  };
}

function scenario(
  id: string,
  category: Test427Category,
  label: string,
  expectedN: number,
  intakeText: string,
  draft: ParsedDraftShape,
  bundle: PartyBundle,
  extras: Partial<Test427Scenario> = {},
): Test427Scenario {
  return {
    id,
    category,
    label,
    expectedN,
    intakeText,
    draft,
    parties: bundle.parties,
    signerNames: bundle.signers,
    signerTitles: bundle.titles,
    emails: bundle.emails,
    addresses: bundle.addresses,
    ...extras,
  };
}

// ——— Category A: Consulting ———

const A2 = partyBundle(
  ["Velox Analytics Partners LLC", "Granite Trail Transport Inc"],
  ["Nina Ortiz", "Marcus Hale"],
  ["Managing Partner", "VP Operations"],
  ["nina.ortiz@veloxanalytics.example.com", "marcus.hale@granitetrail.example.com"],
  ["88 Circuit Row, Denver, CO 80202", "220 Freight Way, Memphis, TN 38103"],
);

const A3 = partyBundle(
  ["BrightPath Human Capital LLC", "Willow Creek Clinic Professional Corporation", "Oakmont Staffing Inc"],
  ["Priya Shah", "Dr. Elena Voss", "Jordan Pike"],
  ["Principal Consultant", "Chief Administrator", "Director of Talent"],
  [
    "priya@brightpathhc.example.com",
    "elena.voss@willowcreekclinic.example.com",
    "jordan@oakmontstaffing.example.com",
  ],
);

const A4 = partyBundle(
  [
    "Cipher Ridge Security LLC",
    "Titan Alloy Foundry Inc",
    "VoltEdge Controls LLC",
    "Granite Trail Transport Inc",
  ],
  ["Sasha Quinn", "Diego Ramos", "Imani Brooks", "Marcus Hale"],
  ["CEO", "Plant Manager", "CTO", "VP Operations"],
  [
    "sasha@cipherridge.example.com",
    "diego@titanalloy.example.com",
    "imani@voltedge.example.com",
    "marcus.hale@granitetrail.example.com",
  ],
);

const A5 = partyBundle(
  [
    "Sparkline Media Co LLC",
    "Harbor Spoon Restaurants LLC",
    "Coastal Buzz Marketing LP",
    "PlateCraft Franchise Group Inc",
    "Summit Table Hospitality LLC",
  ],
  ["Leo Tanaka", "Rachel Kim", "Owen Marsh", "Felicia Dunn", "Hector Solis"],
  ["Creative Director", "Brand President", "Marketing Lead", "Franchise COO", "Hospitality CEO"],
  [
    "leo@sparklinemedia.example.com",
    "rachel@harborspoon.example.com",
    "owen@coastalbuzz.example.com",
    "felicia@platecraft.example.com",
    "hector@summittable.example.com",
  ],
);

// ——— Category B: Vendor chains ———

const B3 = partyBundle(
  ["Orion Boutique Holdings LLC", "Keystone Prime Contractors LP", "Silverline Field Services Inc"],
  ["Ava Sterling", "Caleb Nguyen", "Morgan Weiss"],
  ["Retail COO", "General Contractor", "Service Director"],
  [
    "ava@orionboutique.example.com",
    "caleb@keystoneprime.example.com",
    "morgan@silverlinefield.example.com",
  ],
);

const B4 = partyBundle(
  [
    "Dawnbreak Retail Collective LLC",
    "Atlas Ridge Build Partners LLC",
    "Cobalt Subcontract Alliance LP",
    "Evergreen Warranty Services Inc",
  ],
  ["Tessa Monroe", "Grant Holloway", "Ivy Chen", "Noah Patel"],
  ["Procurement VP", "Prime Contractor", "Subcontract Lead", "Support Manager"],
  [
    "tessa@dawnbreakretail.example.com",
    "grant@atlasridgebuild.example.com",
    "ivy@cobaltsubcontract.example.com",
    "noah@evergreenwarranty.example.com",
  ],
);

const B5 = partyBundle(
  [
    "Lumen Commerce Corp",
    "NexGen Software License LLC",
    "Bridgeport Integration Group Inc",
    "Dataloom Analytics Partners LP",
    "Sentinel Tier Support LLC",
  ],
  ["Zara Lindqvist", "Ethan Cole", "Maya Bennett", "Lucas Reed", "Olivia Hart"],
  ["Commerce Director", "License Manager", "Integration Lead", "Analytics VP", "Support Director"],
  [
    "zara@lumencommerce.example.com",
    "ethan@nexgenlicense.example.com",
    "maya@bridgeportintegration.example.com",
    "lucas@dataloomanalytics.example.com",
    "olivia@sentineltier.example.com",
  ],
);

// ——— Category C: Revenue share ———

const C3 = partyBundle(
  ["CreatorWave Studios LLC", "StreamForge Distribution Inc", "BuzzChannel Promo LLC"],
  ["Adrian Vale", "Maya Bennett", "Lucas Reed"],
  ["Founder", "Distribution Head", "Promotions Lead"],
  [
    "adrian@creatorwave.example.com",
    "maya@streamforge.example.com",
    "lucas@buzzchannel.example.com",
  ],
);

const C4 = partyBundle(
  [
    "IndiePulse Creators LLC",
    "WideReach Syndicate LP",
    "Amplifi Marketing Partners Inc",
    "Insight Ledger Analytics LLC",
  ],
  ["Ethan Cole", "Olivia Hart", "Priya Shah", "Jordan Pike"],
  ["Creator Rep", "Syndicate Manager", "Marketing Partner", "Analytics Partner"],
  [
    "ethan@indiepulse.example.com",
    "olivia@widereachsyndicate.example.com",
    "priya@amplifimarketing.example.com",
    "jordan@insightledger.example.com",
  ],
);

const C5 = partyBundle(
  [
    "NovaCast Media LLC",
    "OrbitShare Network Inc",
    "SignalBoost Partners LP",
    "MetricSpring Analytics LLC",
    "RightsVault Licensing Group Inc",
  ],
  ["Nina Ortiz", "Marcus Hale", "Sasha Quinn", "Diego Ramos", "Imani Brooks"],
  ["Creator", "Distribution", "Marketing", "Analytics", "Licensing"],
  [
    "nina@novacastmedia.example.com",
    "marcus@orbitshare.example.com",
    "sasha@signalboost.example.com",
    "diego@metricspring.example.com",
    "imani@rightsvault.example.com",
  ],
);

// ——— Category D: Joint venture ———

const D4 = partyBundle(
  [
    "Copper Ridge Land Holdings LLC",
    "Eastgate Development Partners LP",
    "Skyline Capital REIT Inc",
    "Harborstone Property Management LLC",
  ],
  ["Leo Tanaka", "Rachel Kim", "Owen Marsh", "Felicia Dunn"],
  ["Managing Member", "Development Partner", "Capital Partner", "Property Manager"],
  [
    "leo@copperridgeholdings.example.com",
    "rachel@eastgatedev.example.com",
    "owen@skylinecapitalreit.example.com",
    "felicia@harborstonepm.example.com",
  ],
);

const D5 = partyBundle(
  [
    "CloudKite Software LLC",
    "VelocityStack Dev Inc",
    "Nexus Capital Ventures LP",
    "ScaleForge Ops LLC",
    "Alliance Bridge Partners Inc",
  ],
  ["Hector Solis", "Ava Sterling", "Caleb Nguyen", "Morgan Weiss", "Tessa Monroe"],
  ["CEO", "CTO", "Managing Partner", "Ops Director", "Alliance President"],
  [
    "hector@cloudkite.example.com",
    "ava@velocitystack.example.com",
    "caleb@nexuscapitalventures.example.com",
    "morgan@scaleforgeops.example.com",
    "tessa@alliancebridge.example.com",
  ],
);

// ——— Category E: Coordinator (same party bundles as consulting/JV) ———

const COORD_PREAMBLE =
  "I'm coordinating this agreement and am not signing as a party. Coordinator Paige Orchestrator, paige.orchestrator@coord.example.com.";

// ——— Category F: Metadata stress (partial slots) ———

function partialEmails(bundle: PartyBundle, filledIndices: number[]): string[] {
  return bundle.parties.map((_, i) =>
    filledIndices.includes(i) ? bundle.emails[i]! : "",
  );
}

function partialSigners(bundle: PartyBundle, filledIndices: number[]): string[] {
  return bundle.parties.map((_, i) =>
    filledIndices.includes(i) ? bundle.signers[i]! : "",
  );
}

function partialTitles(bundle: PartyBundle, filledIndices: number[]): string[] {
  return bundle.parties.map((_, i) =>
    filledIndices.includes(i) ? bundle.titles[i]! : "",
  );
}

// ——— Scenario assembly ———

export const TEST427_SCENARIOS: Test427Scenario[] = [
  // A — Consulting
  scenario(
    "a_consulting_2p_tech_logistics",
    "consulting",
    "tech consultant ↔ logistics",
    2,
    buildIntake(
      "Technology consulting agreement between Velox Analytics Partners LLC and Granite Trail Transport Inc for warehouse routing analytics and driver workflow optimization.",
      A2,
      "Illinois law. Term 9 months. Fees $68,000 milestone payments.",
    ),
    draftShape(
      "Technology Consulting Agreement",
      "Illinois",
      A2,
      "Warehouse routing analytics and driver workflow optimization.",
      "$68,000 milestone payments",
      "9 months",
      "consulting_agreement",
    ),
    A2,
  ),
  scenario(
    "a_consulting_3p_hr_healthcare",
    "consulting",
    "HR consultant ↔ healthcare practice",
    3,
    buildIntake(
      "Tripartite HR consulting agreement among BrightPath Human Capital LLC, Willow Creek Clinic Professional Corporation, and Oakmont Staffing Inc for clinic staffing compliance and onboarding playbooks.",
      {
        ...A3,
        parties: [
          "BrightPath Human Capital LLC",
          "Willow Creek Clinic Professional Corporation",
          "Oakmont Staffing Inc",
        ],
      },
      "California law. Term twelve months.",
    ),
    draftShape(
      "HR Consulting Services Agreement",
      "California",
      {
        ...A3,
        parties: [
          "BrightPath Human Capital LLC",
          "Willow Creek Clinic Professional Corporation",
          "Oakmont Staffing Inc",
        ],
      },
      "Staffing compliance and onboarding.",
      "monthly retainer",
      "12 months",
    ),
    {
      ...A3,
      parties: [
        "BrightPath Human Capital LLC",
        "Willow Creek Clinic Professional Corporation",
        "Oakmont Staffing Inc",
      ],
    },
  ),
  scenario(
    "a_consulting_4p_cyber_manufacturer",
    "consulting",
    "cybersecurity ↔ manufacturer",
    4,
    buildIntake(
      "Quadrilateral consulting agreement among Cipher Ridge Security LLC, Titan Alloy Foundry Inc, VoltEdge Controls LLC, and Granite Trail Transport Inc for OT security assessments and plant control hardening.",
      A4,
      "Ohio law. Term eighteen months. Fees $210,000.",
    ),
    draftShape("Cybersecurity Consulting Agreement", "Ohio", A4, "OT security and control hardening.", "$210,000", "18 months"),
    A4,
  ),
  scenario(
    "a_consulting_5p_marketing_restaurant",
    "consulting",
    "marketing ↔ restaurant chain",
    5,
    buildIntake(
      "Five-party marketing and brand consulting agreement among Sparkline Media Co LLC, Harbor Spoon Restaurants LLC, Coastal Buzz Marketing LP, PlateCraft Franchise Group Inc, and Summit Table Hospitality LLC for multi-location campaign rollout.",
      A5,
      "New York law. Term twenty-four months.",
    ),
    draftShape("Marketing Consulting Agreement", "New York", A5, "Multi-location campaign rollout.", "revenue-tied fees", "24 months"),
    A5,
  ),

  // B — Vendor chains
  scenario(
    "b_vendor_3p_prime_sub",
    "vendor",
    "client + prime + subcontractor",
    3,
    buildIntake(
      "Vendor services chain: Orion Boutique Holdings LLC engages Keystone Prime Contractors LP and Silverline Field Services Inc for boutique remodel and ongoing field maintenance.",
      B3,
      "Texas law. Term fourteen months.",
    ),
    draftShape("Vendor Services Agreement", "Texas", B3, "Remodel and field maintenance.", "milestone invoices", "14 months"),
    B3,
  ),
  scenario(
    "b_vendor_4p_implementation_support",
    "vendor",
    "client + prime + sub + support",
    4,
    buildIntake(
      "Dawnbreak Retail Collective LLC, Atlas Ridge Build Partners LLC, Cobalt Subcontract Alliance LP, and Evergreen Warranty Services Inc will deliver store buildouts with warranty support.",
      B4,
      "Georgia law. Term sixteen months.",
    ),
    draftShape("Implementation Vendor Agreement", "Georgia", B4, "Store buildouts with warranty.", "progress payments", "16 months"),
    B4,
  ),
  scenario(
    "b_vendor_5p_software_chain",
    "vendor",
    "software + integration + analytics + support",
    5,
    buildIntake(
      "Five-party vendor chain: Lumen Commerce Corp, NexGen Software License LLC, Bridgeport Integration Group Inc, Dataloom Analytics Partners LP, and Sentinel Tier Support LLC for commerce platform rollout.",
      B5,
      "Delaware law. Term twenty months.",
    ),
    draftShape("Commerce Platform Vendor Agreement", "Delaware", B5, "Commerce platform rollout.", "$320,000", "20 months"),
    B5,
  ),

  // C — Revenue share
  scenario(
    "c_revshare_3p_creator_dist_promo",
    "revenue_share",
    "creator + distribution + promo",
    3,
    buildIntake(
      "Revenue share agreement among CreatorWave Studios LLC, StreamForge Distribution Inc, and BuzzChannel Promo LLC for digital content monetization.",
      C3,
      "California law. Term thirty-six months.",
    ),
    draftShape("Revenue Share Agreement", "California", C3, "Digital content monetization.", "net revenue split", "36 months"),
    C3,
  ),
  scenario(
    "c_revshare_4p_syndicate",
    "revenue_share",
    "creator + syndicate + marketing + analytics",
    4,
    buildIntake(
      "Revenue share among IndiePulse Creators LLC, WideReach Syndicate LP, Amplifi Marketing Partners Inc, and Insight Ledger Analytics LLC.",
      C4,
      "Nevada law. Term twenty-four months.",
    ),
    draftShape("Content Revenue Share Agreement", "Nevada", C4, "Content syndication revenue.", "tiered split", "24 months"),
    C4,
  ),
  scenario(
    "c_revshare_5p_full_stack",
    "revenue_share",
    "creator + distribution + marketing + analytics + licensing",
    5,
    buildIntake(
      "Five-party revenue share among NovaCast Media LLC, OrbitShare Network Inc, SignalBoost Partners LP, MetricSpring Analytics LLC, and RightsVault Licensing Group Inc.",
      C5,
      "Delaware law. Term thirty months.",
    ),
    draftShape("Multi-Party Revenue Share Agreement", "Delaware", C5, "Media revenue pooling.", "pooled net receipts", "30 months"),
    C5,
  ),

  // D — Joint venture
  scenario(
    "d_jv_4p_real_estate",
    "joint_venture",
    "real estate JV",
    4,
    buildIntake(
      "Real estate joint venture among Copper Ridge Land Holdings LLC, Eastgate Development Partners LP, Skyline Capital REIT Inc, and Harborstone Property Management LLC for mixed-use redevelopment.",
      D4,
      "Colorado law. Term sixty months.",
    ),
    draftShape("Real Estate Joint Venture Agreement", "Colorado", D4, "Mixed-use redevelopment.", "capital contributions", "60 months"),
    D4,
  ),
  scenario(
    "d_jv_5p_saas_partnership",
    "joint_venture",
    "SaaS partnership JV",
    5,
    buildIntake(
      "SaaS partnership joint venture among CloudKite Software LLC, VelocityStack Dev Inc, Nexus Capital Ventures LP, ScaleForge Ops LLC, and Alliance Bridge Partners Inc.",
      D5,
      "Washington law. Term forty-eight months.",
    ),
    draftShape("SaaS Joint Venture Agreement", "Washington", D5, "SaaS product partnership.", "equity and revenue pool", "48 months"),
    D5,
  ),

  // E — Coordinator only
  scenario(
    "e_coordinator_4p",
    "coordinator_only",
    "coordinator 4-party",
    4,
    [COORD_PREAMBLE, buildIntake(
      "Four-party services agreement among Cipher Ridge Security LLC, Titan Alloy Foundry Inc, VoltEdge Controls LLC, and Granite Trail Transport Inc.",
      A4,
      "Ohio law. Term twelve months.",
    )].join("\n"),
    draftShape("Coordinated Services Agreement", "Ohio", A4, "Coordinated multi-party services.", "fixed fee", "12 months"),
    A4,
    { coordinatorOnly: true },
  ),
  scenario(
    "e_coordinator_5p",
    "coordinator_only",
    "coordinator 5-party",
    5,
    [COORD_PREAMBLE, buildIntake(
      "Five-party SaaS joint venture among CloudKite Software LLC, VelocityStack Dev Inc, Nexus Capital Ventures LP, ScaleForge Ops LLC, and Alliance Bridge Partners Inc.",
      D5,
      "Washington law. Term thirty-six months.",
    )].join("\n"),
    draftShape("Coordinated JV Agreement", "Washington", D5, "Coordinated JV rollout.", "capital schedule", "36 months"),
    D5,
    { coordinatorOnly: true },
  ),

  // F — Metadata stress
  scenario(
    "f_metadata_2p_missing_email",
    "metadata_stress",
    "missing signer email",
    2,
    buildIntake(
      "Consulting agreement between Velox Analytics Partners LLC and Granite Trail Transport Inc.",
      { ...A2, emails: partialEmails(A2, [0]) },
      "Illinois law. Term 6 months.",
    ),
    draftShape("Consulting Agreement", "Illinois", A2, "Analytics consulting.", "$45,000", "6 months"),
    { ...A2, emails: partialEmails(A2, [0]) },
    { requireNoticeStanzas: false },
  ),
  scenario(
    "f_metadata_3p_partial_title",
    "metadata_stress",
    "missing signer title",
    3,
    buildIntake(
      "HR consulting among BrightPath Human Capital LLC, Willow Creek Clinic Professional Corporation, and Oakmont Staffing Inc.",
      {
        ...A3,
        titles: partialTitles(A3, [0, 2]),
      },
      "California law. Term nine months.",
    ),
    draftShape(
      "HR Consulting Agreement",
      "California",
      A3,
      "HR advisory.",
      "monthly",
      "9 months",
    ),
    { ...A3, titles: partialTitles(A3, [0, 2]) },
    { requireNoticeStanzas: false },
  ),
  scenario(
    "f_metadata_5p_partial_name",
    "metadata_stress",
    "missing signer name",
    5,
    buildIntake(
      "Revenue share among NovaCast Media LLC, OrbitShare Network Inc, SignalBoost Partners LP, MetricSpring Analytics LLC, and RightsVault Licensing Group Inc.",
      { ...C5, signers: partialSigners(C5, [1, 3]) },
      "Delaware law. Term 24 months.",
    ),
    draftShape("Revenue Share Agreement", "Delaware", C5, "Revenue pooling.", "net split", "24 months"),
    { ...C5, signers: partialSigners(C5, [1, 3]) },
    { requireNoticeStanzas: false },
  ),

  // G — Recovery (full workflow after recovery)
  scenario(
    "g_recovery_2p_consulting",
    "recovery",
    "2p consulting recovery",
    2,
    buildIntake(
      "Consulting agreement between Velox Analytics Partners LLC and Granite Trail Transport Inc for fleet telemetry dashboards.",
      A2,
      "Illinois law. Term eight months.",
    ),
    draftShape("Consulting Agreement", "Illinois", A2, "Fleet telemetry dashboards.", "$52,000", "8 months"),
    A2,
    { recoveryMode: "structural_rejection" },
  ),
  scenario(
    "g_recovery_3p_vendor",
    "recovery",
    "3p vendor recovery",
    3,
    buildIntake(
      "Vendor chain among Orion Boutique Holdings LLC, Keystone Prime Contractors LP, and Silverline Field Services Inc.",
      B3,
      "Texas law. Term ten months.",
    ),
    draftShape("Vendor Agreement", "Texas", B3, "Vendor chain services.", "invoices", "10 months"),
    B3,
    { recoveryMode: "stale_accepted" },
  ),
  scenario(
    "g_recovery_4p_revshare",
    "recovery",
    "4p revenue share recovery",
    4,
    buildIntake(
      "Revenue share among IndiePulse Creators LLC, WideReach Syndicate LP, Amplifi Marketing Partners Inc, and Insight Ledger Analytics LLC.",
      C4,
      "Nevada law. Term eighteen months.",
    ),
    draftShape("Revenue Share Agreement", "Nevada", C4, "Content revenue.", "tiered split", "18 months"),
    C4,
    { recoveryMode: "freeze_rejection" },
  ),
  scenario(
    "g_recovery_5p_jv",
    "recovery",
    "5p joint venture recovery",
    5,
    buildIntake(
      "Joint venture among CloudKite Software LLC, VelocityStack Dev Inc, Nexus Capital Ventures LP, ScaleForge Ops LLC, and Alliance Bridge Partners Inc.",
      D5,
      "Washington law. Term forty months.",
    ),
    draftShape("Joint Venture Agreement", "Washington", D5, "Product JV.", "capital pool", "40 months"),
    D5,
    { recoveryMode: "structural_rejection" },
  ),
];

export function buildTest427Corpus(scenario: Test427Scenario): string {
  return buildNPartyPaidProServerCorpus({
    parties: scenario.parties,
    intakeText: scenario.intakeText,
    draft: scenario.draft,
    title: scenario.draft.title,
    minLen: Math.max(5200, scenario.expectedN * 900),
  });
}

export function scenarioAuthorityParties427(scenario: Test427Scenario) {
  return scenario.parties.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail: scenario.emails[partyIndex] ?? "",
    signerName: scenario.signerNames[partyIndex] ?? "",
    signerTitle: scenario.signerTitles[partyIndex] ?? "",
    partyAddress: scenario.addresses[partyIndex] ?? "",
  }));
}
