/**
 * Bounded release-scope qualification campaign.
 *
 * Fixed requirements: two to four legal parties, four maximum, U.S. law.
 * Expected customer facts and party-specific responsibilities are defined
 * here before any three- or four-party output is evaluated.
 *
 * Reuses existing Harbor/SaaS quality-eval intakes and existing TEST490 /
 * TEST477 / TEST487 fixtures. This is not a replacement runner.
 */
import {
  TEST477_THREE_PARTY,
  type Test477PartyFixture,
} from "../components/agreements/paidProTest477Fixtures";
import {
  TEST487_COASTAL,
  TEST487_FOUR_PARTY,
  TEST487_LUMEN,
  TEST487_PRODUCTION_INTAKE,
  TEST487_THALASSA,
  TEST487_VANGUARD,
  type Test487PartyFixture,
} from "../components/agreements/paidProTest487ProductionValidationFixtures";
import {
  TEST490_NOVAPATH,
  TEST490_STONEBRIDGE,
  TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
} from "../components/agreements/paidProTest490Fixtures";
import {
  CORE_PAID_JOURNEY_EXPECTED_FACTS,
  CORE_PAID_JOURNEY_FILLED_INTAKE,
  CORE_PAID_JOURNEY_SPARSE_INTAKE,
} from "./corePaidJourneyAcceptanceMatrix";
import { PHASE4C1_SPARSE_SAAS } from "./phase4c1QuickIntakeCoverage";

export const RELEASE_SCOPE_CASE_IDS = ["consulting", "saas", "three_party", "four_party"] as const;

export type ReleaseScopeCaseId = (typeof RELEASE_SCOPE_CASE_IDS)[number];

export type ReleaseScopePartyResponsibility = {
  legalEntity: string;
  role: string;
  responsibility: string;
  economics: string;
  signerName?: string;
  signerTitle?: string;
  email?: string;
};

export type ReleaseScopeSample = {
  id: ReleaseScopeCaseId;
  partyCount: 2 | 3 | 4;
  family: string;
  governingLaw: string;
  filledIntake: string;
  sparseIntake: string | null;
  parties: readonly ReleaseScopePartyResponsibility[];
  sharedFacts: readonly string[];
  forbiddenParties: readonly string[];
  forbiddenJurisdictions: readonly string[];
  authorizedClarificationIfAsked: readonly string[];
};

export const RELEASE_SCOPE_SAAS_FILLED_INTAKE =
  "Draft a 12-month SaaS subscription agreement between Orion Harbor LLC (Provider) and Northwind Retail Inc. (Customer). Scope: hosted platform access and standard onboarding, hosted platform only, no professional services. Fee $48,000 annually, net 30. Governing law New York. Provider signer Avery Cole, avery@orionharbor.test. Customer signer Casey Reed, casey@northwind.test.";

export const RELEASE_SCOPE_SAAS_SPARSE_INTAKE = PHASE4C1_SPARSE_SAAS;

function threePartySignerLine(party: Test477PartyFixture): string {
  return `${party.legalEntity} signer: ${party.signerName}, ${party.signerTitle}, ${party.email}, ${party.address}.`;
}

/** TEST490 commercial meaning plus existing TEST477 signer/email facts. */
export const RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE = [
  TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
  "",
  "Signers:",
  ...TEST477_THREE_PARTY.map(threePartySignerLine),
].join("\n");

export const RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE = TEST487_PRODUCTION_INTAKE;

export const RELEASE_SCOPE_SAMPLES: readonly ReleaseScopeSample[] = [
  {
    id: "consulting",
    partyCount: 2,
    family: "consulting_agreement",
    governingLaw: "Delaware",
    filledIntake: CORE_PAID_JOURNEY_FILLED_INTAKE,
    sparseIntake: CORE_PAID_JOURNEY_SPARSE_INTAKE,
    parties: [
      {
        legalEntity: "Harbor Peak Analytics LLC",
        role: "Consultant",
        responsibility: "AI workflow implementation",
        economics: "$48,000 fixed fee",
        signerName: "Maya Chen",
        email: "maya.chen@harborpeak.test",
      },
      {
        legalEntity: "Ironvale Manufacturing Inc.",
        role: "Client",
        responsibility: "receives implemented AI workflow; owns deliverables after payment",
        economics: "pays $48,000",
        signerName: "Jordan Hale",
        email: "jordan.hale@ironvale.test",
      },
    ],
    sharedFacts: [
      CORE_PAID_JOURNEY_EXPECTED_FACTS.scope,
      CORE_PAID_JOURNEY_EXPECTED_FACTS.economics,
      CORE_PAID_JOURNEY_EXPECTED_FACTS.duration,
      CORE_PAID_JOURNEY_EXPECTED_FACTS.startDate,
      CORE_PAID_JOURNEY_EXPECTED_FACTS.governingLaw,
      CORE_PAID_JOURNEY_EXPECTED_FACTS.ipConsultant,
      CORE_PAID_JOURNEY_EXPECTED_FACTS.ipClient,
    ],
    forbiddenParties: ["Orion Labs", "Contoso Retail", "Acme Corp", "Party A", "Party B"],
    forbiddenJurisdictions: ["New York", "Oklahoma", "Massachusetts"],
    authorizedClarificationIfAsked: [
      "The agreement effective date is the same as the October 1, 2026 service start.",
      "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
    ],
  },
  {
    id: "saas",
    partyCount: 2,
    family: "saas_msa",
    governingLaw: "New York",
    filledIntake: RELEASE_SCOPE_SAAS_FILLED_INTAKE,
    sparseIntake: RELEASE_SCOPE_SAAS_SPARSE_INTAKE,
    parties: [
      {
        legalEntity: "Orion Harbor LLC",
        role: "Provider",
        responsibility: "hosted platform access and standard onboarding only; no professional services",
        economics: "$48,000 annually, net 30",
        signerName: "Avery Cole",
        email: "avery@orionharbor.test",
      },
      {
        legalEntity: "Northwind Retail Inc.",
        role: "Customer",
        responsibility: "subscribes to hosted access only",
        economics: "pays $48,000 annually, net 30",
        signerName: "Casey Reed",
        email: "casey@northwind.test",
      },
    ],
    sharedFacts: ["hosted platform only", "no professional services", "$48,000", "net 30", "twelve months", "New York"],
    forbiddenParties: ["Orion Labs", "Contoso Retail", "Harbor Peak Analytics LLC", "Ironvale Manufacturing Inc."],
    forbiddenJurisdictions: ["Delaware", "Oklahoma", "Massachusetts"],
    authorizedClarificationIfAsked: [],
  },
  {
    id: "three_party",
    partyCount: 3,
    family: "ip_license_royalty",
    governingLaw: "Oklahoma",
    filledIntake: RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE,
    sparseIntake: null,
    parties: TEST477_THREE_PARTY.map((party): ReleaseScopePartyResponsibility => {
      if (party.legalEntity === TEST490_STONEBRIDGE) {
        return {
          legalEntity: party.legalEntity,
          role: "Content owner / licensor",
          responsibility:
            "owns the original wellness training videos and written course materials; grants NovaPath the right to adapt and host; keeps ownership of the original content",
          economics: "45% of customer subscription revenue",
          signerName: party.signerName,
          signerTitle: party.signerTitle,
          email: party.email,
        };
      }
      if (party.legalEntity === TEST490_NOVAPATH) {
        return {
          legalEntity: party.legalEntity,
          role: "Platform adapter / host",
          responsibility:
            "adapts the materials into an online training platform and hosts them; owns the platform code and improvements it creates",
          economics: "35% of customer subscription revenue",
          signerName: party.signerName,
          signerTitle: party.signerTitle,
          email: party.email,
        };
      }
      return {
        legalEntity: party.legalEntity,
        role: "Distributor",
        responsibility:
          "markets and sells subscriptions to business customers; handles sales, customer contracts, billing, and account management",
        economics: "20% of customer subscription revenue",
        signerName: party.signerName,
        signerTitle: party.signerTitle,
        email: party.email,
      };
    }),
    sharedFacts: [
      "three legal parties",
      "coordinator is not a party",
      "45% / 35% / 20% subscription revenue split",
      "Oklahoma governing law",
    ],
    forbiddenParties: [
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc.",
      "Orion Harbor LLC",
      "Northwind Retail Inc.",
      "Lumen Bioinformatics Inc.",
      "North Star Manufacturing LLC",
      "Jane Coordinator",
    ],
    forbiddenJurisdictions: ["Delaware", "New York", "Massachusetts"],
    authorizedClarificationIfAsked: [
      "Do not invent an Effective Date, milestones, or extra parties. The coordinator is not a party.",
    ],
  },
  {
    id: "four_party",
    partyCount: 4,
    family: "precision_medicine_platform",
    governingLaw: "Massachusetts",
    filledIntake: RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE,
    sparseIntake: null,
    parties: TEST487_FOUR_PARTY.map((party: Test487PartyFixture): ReleaseScopePartyResponsibility => {
      const economicsByEntity: Record<string, string> = {
        [TEST487_LUMEN]: "$250,000 upon execution, $400,000 upon platform alpha delivery, $350,000 upon validation report acceptance",
        [TEST487_THALASSA]: "$180,000 upon data pipeline readiness, $220,000 upon production cutover",
        [TEST487_COASTAL]: "$150,000 upon analytics module delivery, $175,000 upon user acceptance testing completion",
        [TEST487_VANGUARD]: "$95,000 upon regulatory gap assessment, $105,000 upon audit readiness certification",
      };
      const responsibilityByEntity: Record<string, string> = {
        [TEST487_LUMEN]: "jointly develop, validate, and operate the regulated precision medicine analytics platform as Platform Developer",
        [TEST487_THALASSA]: "provide data infrastructure, including data pipeline readiness and production cutover",
        [TEST487_COASTAL]: "deliver analytics modules and complete user acceptance testing",
        [TEST487_VANGUARD]: "perform regulatory gap assessment and audit readiness certification",
      };
      return {
        legalEntity: party.legalEntity,
        role: party.role,
        responsibility: responsibilityByEntity[party.legalEntity] || party.role,
        economics: economicsByEntity[party.legalEntity] || "",
        signerName: party.signerName,
        signerTitle: party.signerTitle,
        email: party.email,
      };
    }),
    sharedFacts: [
      "four legal parties",
      "24 months with two optional 12-month renewals",
      "total project value $1,925,000",
      "Massachusetts governing law",
      "distinct mailing and notice addresses",
    ],
    forbiddenParties: [
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc.",
      "Orion Harbor LLC",
      "Northwind Retail Inc.",
      "Stonebridge Wellness LLC",
      "North Star Manufacturing LLC",
      "Red Mesa Logistics LLC",
    ],
    forbiddenJurisdictions: ["Delaware", "New York", "Oklahoma"],
    authorizedClarificationIfAsked: [
      "Do not invent an Effective Date or substitute another state's governing law. Keep each party's milestone amounts.",
    ],
  },
];

/**
 * TEST DATA — synthetic customer answer, not part of the original four-party intake.
 * Names one existing party as payer. Does not add a fifth legal party.
 */
export const RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA =
  "TEST DATA (synthetic customer answer; not part of the original intake): Lumen Bioinformatics Inc. pays each listed milestone amount to the named recipient. Do not add a fifth legal party.";

export function releaseScopeSample(id: ReleaseScopeCaseId): ReleaseScopeSample {
  const sample = RELEASE_SCOPE_SAMPLES.find((row) => row.id === id);
  if (!sample) throw new Error(`unknown_release_scope_sample:${id}`);
  return sample;
}

export function selectReleaseScopeCaseIds(caseId: string | undefined): readonly ReleaseScopeCaseId[] {
  if (!caseId || caseId === "all") return ["consulting", "saas"];
  if (caseId === "release_scope") return RELEASE_SCOPE_CASE_IDS;
  if ((RELEASE_SCOPE_CASE_IDS as readonly string[]).includes(caseId)) {
    return [caseId as ReleaseScopeCaseId];
  }
  throw new Error(`unknown_quality_eval_case:${caseId}`);
}

export function assertReleaseScopeFactsComplete(samples: readonly ReleaseScopeSample[] = RELEASE_SCOPE_SAMPLES): void {
  const seen = new Set<string>();
  if (samples.length !== 4) throw new Error("release_scope_requires_four_samples");
  for (const sample of samples) {
    if (seen.has(sample.id)) throw new Error(`duplicate_release_scope_sample:${sample.id}`);
    seen.add(sample.id);
    if (sample.parties.length !== sample.partyCount) {
      throw new Error(`party_count_mismatch:${sample.id}`);
    }
    if (sample.partyCount < 2 || sample.partyCount > 4) {
      throw new Error(`party_count_outside_release_scope:${sample.id}`);
    }
    if (!sample.governingLaw.trim()) throw new Error(`missing_governing_law:${sample.id}`);
    if (!sample.filledIntake.trim()) throw new Error(`missing_filled_intake:${sample.id}`);
    for (const party of sample.parties) {
      if (!party.legalEntity.trim()) throw new Error(`missing_legal_entity:${sample.id}`);
      if (!party.role.trim()) throw new Error(`missing_role:${sample.id}`);
      if (!party.responsibility.trim()) throw new Error(`missing_responsibility:${sample.id}`);
      if (!party.economics.trim()) throw new Error(`missing_party_economics:${sample.id}`);
      if (!sample.filledIntake.includes(party.legalEntity)) {
        throw new Error(`intake_missing_party:${sample.id}:${party.legalEntity}`);
      }
    }
    if (!sample.filledIntake.includes(sample.governingLaw)) {
      throw new Error(`intake_missing_governing_law:${sample.id}`);
    }
  }
  for (const id of RELEASE_SCOPE_CASE_IDS) {
    if (!seen.has(id)) throw new Error(`missing_release_scope_sample:${id}`);
  }
}
